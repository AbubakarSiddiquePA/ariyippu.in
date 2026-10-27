import {photoStorage} from './photo-storage.mjs';
export class DeletionError extends Error{constructor(message,status=409){super(message);this.status=status;}}
const coverPattern=/^\/media\/[a-f0-9-]+\.(jpg|png|webp)$/;
function checkVersion(input){if(typeof input.id!=='string'||!input.id||!Number.isSafeInteger(input.version)||input.version<1)throw new DeletionError('Choose a saved article and reload its latest version.',400);}
export async function finishPhotoDeletion(env,cover){
 const job=await env.DB.prepare('SELECT state FROM media_deletions WHERE cover=?').bind(cover).first();if(!job||job.state==='done')return {photoDeleted:!!job,cleanupPending:false};
 const used=await env.DB.prepare("SELECT id FROM articles WHERE json_extract(data,'$.cover')=? LIMIT 1").bind(cover).first();if(used)return {photoDeleted:false,cleanupPending:true,error:'A saved article still uses this photo. Storage deletion was stopped.'};
 try{const storage=photoStorage(env);if(!storage)throw Error('Photo storage is not connected.');await storage.delete(cover.slice(7));await env.DB.prepare("UPDATE media_deletions SET state='done',last_error=NULL WHERE cover=?").bind(cover).run();return {photoDeleted:true,cleanupPending:false};}
 catch{await env.DB.prepare('UPDATE media_deletions SET last_error=? WHERE cover=?').bind('Storage deletion could not complete. Retry cleanup.',cover).run();return {photoDeleted:false,cleanupPending:true,error:'The photo is detached, but storage deletion is still pending. Use Retry photo cleanup.'};}
}
async function queueUnreferencedPhoto(env,cover){
 if(!coverPattern.test(cover||''))return {photoDeleted:false,cleanupPending:false};
 await env.DB.prepare("INSERT INTO media_deletions(cover,state,created_at) SELECT ?,'pending',? WHERE NOT EXISTS(SELECT 1 FROM articles WHERE json_extract(data,'$.cover')=?) ON CONFLICT(cover) DO NOTHING").bind(cover,new Date().toISOString(),cover).run();
 const job=await env.DB.prepare('SELECT state FROM media_deletions WHERE cover=?').bind(cover).first();if(!job)return {photoDeleted:false,cleanupPending:false,photoShared:true};return finishPhotoDeletion(env,cover);
}
export async function deleteArticle(env,input){
 checkVersion(input);const row=await env.DB.prepare('SELECT data,version FROM articles WHERE id=?').bind(input.id).first();
 if(!row){const deleted=await env.DB.prepare('SELECT id FROM deleted_articles WHERE id=?').bind(input.id).first();if(deleted)return {deleted:true,alreadyDeleted:true};throw new DeletionError('Article not found.',404);}
 if(row.version!==input.version)throw new DeletionError('This article changed in another window. Reload it before deleting.');const a=JSON.parse(row.data);
 // D1 batch is transactional. A tombstone stops an old open editor recreating a deleted article.
 const statements=[
 env.DB.prepare('INSERT OR IGNORE INTO deleted_articles(id,deleted_at) SELECT id,? FROM articles WHERE id=? AND version=?').bind(new Date().toISOString(),input.id,input.version),
 env.DB.prepare('DELETE FROM articles WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM deleted_articles WHERE id=?)').bind(input.id,input.version,input.id)
 ];
 if(coverPattern.test(a.cover||''))statements.push(env.DB.prepare("INSERT INTO media_deletions(cover,state,created_at) SELECT ?,'pending',? WHERE EXISTS(SELECT 1 FROM deleted_articles WHERE id=?) AND NOT EXISTS(SELECT 1 FROM articles WHERE json_extract(data,'$.cover')=?) ON CONFLICT(cover) DO NOTHING").bind(a.cover,new Date().toISOString(),input.id,a.cover));
 const result=await env.DB.batch(statements);
 if(!result[1].meta.changes)throw new DeletionError('The article changed before deletion. Reload it and try again.');
 return {deleted:true,...await queueUnreferencedPhoto(env,a.cover)};
}
export async function deletePhoto(env,input){
 if(!coverPattern.test(input.cover||''))throw new DeletionError('Choose a valid uploaded photo.',400);
 let row;if(input.id){checkVersion(input);row=await env.DB.prepare('SELECT data,version FROM articles WHERE id=?').bind(input.id).first();if(!row)throw new DeletionError('Article not found. Reload the article list.',404);if(row.version!==input.version)throw new DeletionError('This article changed in another window. Reload it before deleting its photo.');}
 const storedCover=row?JSON.parse(row.data).cover:'';
 const other=await env.DB.prepare("SELECT id FROM articles WHERE json_extract(data,'$.cover')=? AND id<>? LIMIT 1").bind(input.cover,input.id||'').first();if(other)throw new DeletionError('Another draft or published article uses this photo. Use Remove from this article to keep the shared photo safe.');
 if(storedCover===input.cover){
 const now=new Date().toISOString();const result=await env.DB.batch([
 env.DB.prepare("INSERT INTO media_deletions(cover,state,created_at) SELECT ?,'pending',? WHERE EXISTS(SELECT 1 FROM articles WHERE id=? AND version=? AND json_extract(data,'$.cover')=?) AND NOT EXISTS(SELECT 1 FROM articles WHERE json_extract(data,'$.cover')=? AND id<>?) ON CONFLICT(cover) DO NOTHING").bind(input.cover,now,input.id,input.version,input.cover,input.cover,input.id),
 env.DB.prepare("UPDATE articles SET data=json_set(data,'$.cover',''),version=version+1,updated_at=? WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM media_deletions WHERE cover=? AND state='pending')").bind(now,input.id,input.version,input.cover)
 ]);if(!result[1].meta.changes)throw new DeletionError('The photo could not be detached. Reload the article and try again.');
 return {detached:true,version:input.version+1,...await finishPhotoDeletion(env,input.cover)};
 }
 const result=await queueUnreferencedPhoto(env,input.cover);if(result.photoShared)throw new DeletionError('A saved article still uses this photo. Remove it from that article first.');return {detached:true,...result};
}
export async function retryPhotoCleanup(env){const rows=(await env.DB.prepare("SELECT cover FROM media_deletions WHERE state='pending' ORDER BY created_at LIMIT 20").all()).results;for(const row of rows)await finishPhotoDeletion(env,row.cover);return {pending:(await env.DB.prepare("SELECT COUNT(*) AS count FROM media_deletions WHERE state='pending'").first()).count};}

const validKey=key=>/^[a-f0-9-]+\.(jpg|png|webp)$/.test(key);
export function imagekitConfigured(env){return /^https:\/\/ik\.imagekit\.io\/[A-Za-z0-9_-]+\/?$/.test(env.IMAGEKIT_URL_ENDPOINT||'')&&!!env.IMAGEKIT_PRIVATE_KEY;}
export async function signedImageUrl(url,endpoint,secret,expiry=Math.floor(Date.now()/1000)+300){
 const prefix=endpoint.replace(/\/$/,'')+'/';if(!url.startsWith(prefix)||url.includes('?')||url.includes('#'))throw Error('Invalid ImageKit image address.');const relative=url.slice(prefix.length);const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']);const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(relative+expiry))),v=>v.toString(16).padStart(2,'0')).join('');return url+'?ik-t='+expiry+'&ik-s='+signature;
}
export function photoStorage(env,request=fetch){
 if(env.PHOTO_PROVIDER!=='imagekit')return env.PHOTOS;
 const db=env.DB;
 function check(){if(!imagekitConfigured(env))throw Error('ImageKit is not connected yet. Configure its URL endpoint and private key.');}
 const headers=()=>({Authorization:'Basic '+btoa(env.IMAGEKIT_PRIVATE_KEY+':')});
 const row=key=>db.prepare('SELECT * FROM media_assets WHERE storage_key=?').bind(key).first();
 return {
 async head(key){if(!validKey(key))throw Error('Invalid photo key.');const asset=await row(key);return asset?{size:asset.bytes}:env.PHOTOS?env.PHOTOS.head(key):null;},
 async put(key,data,options){check();if(!validKey(key))throw Error('Invalid photo key.');const type=options.httpMetadata.contentType;const form=new FormData();form.set('file',new Blob([data],{type}),key);form.set('fileName',key);form.set('folder','/ariyippu/articles');form.set('useUniqueFileName','false');form.set('isPrivateFile','true');form.set('overwriteFile','true');form.set('overwriteTags','false');
 const r=await request('https://upload.imagekit.io/api/v1/files/upload',{method:'POST',headers:headers(),body:form,signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error(r.status===403||r.status===429?'ImageKit rejected the upload or its free limit was reached. Check your ImageKit dashboard.':'Photo upload could not complete. Check the ImageKit connection.');
 const asset=await r.json();if(typeof asset.fileId!=='string'||!asset.fileId||typeof asset.url!=='string'||!asset.url.startsWith(env.IMAGEKIT_URL_ENDPOINT.replace(/\/$/,'')+'/'))throw Error('ImageKit returned an unexpected photo address.');
 await db.prepare('INSERT INTO media_assets(storage_key,file_id,url,bytes,content_type,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(storage_key) DO UPDATE SET file_id=excluded.file_id,url=excluded.url,bytes=excluded.bytes,content_type=excluded.content_type').bind(key,asset.fileId,asset.url,data.byteLength,type,new Date().toISOString()).run();
 },
 async get(key){check();const asset=await row(key);if(!asset)return env.PHOTOS?env.PHOTOS.get(key):null;const url=await signedImageUrl(asset.url,env.IMAGEKIT_URL_ENDPOINT,env.IMAGEKIT_PRIVATE_KEY);const r=await request(url,{signal:AbortSignal.timeout(20000),redirect:'manual'});if(r.status===404)return null;if(!r.ok)throw Error('Photo delivery is unavailable. Check ImageKit usage and connection.');return {body:r.body,httpMetadata:{contentType:asset.content_type}};},
 async delete(key){check();const asset=await row(key);if(!asset){if(env.PHOTOS)await env.PHOTOS.delete(key);return;}const r=await request('https://api.imagekit.io/v1/files/'+encodeURIComponent(asset.file_id),{method:'DELETE',headers:headers(),signal:AbortSignal.timeout(20000)});if(!r.ok&&r.status!==404)throw Error('ImageKit photo deletion could not complete.');await db.prepare('DELETE FROM media_assets WHERE storage_key=?').bind(key).run();}
 };
}

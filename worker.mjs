import {photoStorage} from './photo-storage.mjs';
import {passwordConfigured,passwordLogin,passwordLogout,passwordSessionEmail} from './password-auth.mjs';
import {authConfigured,authPage,privateHeaders} from './auth-pages.mjs';
import {deleteArticle,deletePhoto,retryPhotoCleanup} from './deletion.mjs';
import {esc,renderArticle} from './public/assets/article-render.js';
import {translateText,validTranslationInput} from './translation.mjs';
export {esc,renderArticle};
const keyCache=new Map();
export async function authenticatedEmail(req,env,ctx){
 if(env.AUTH_MODE==='password')return passwordSessionEmail(req,env);
 if(ctx.access)return (await ctx.access.getIdentity())?.email;
 if(!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD||!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN))return null;
 try{const token=req.headers.get('Cf-Access-Jwt-Assertion');if(!token)return null;const parts=token.split('.');if(parts.length!==3)return null;const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));const head=JSON.parse(new TextDecoder().decode(decode(parts[0]))),claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));if(head.alg!=='RS256'||!head.kid)return null;const now=Date.now()/1000;if(claims.iss!==env.ACCESS_TEAM_DOMAIN||!Number.isFinite(claims.exp)||claims.exp<=now||claims.nbf&&claims.nbf>now||!(Array.isArray(claims.aud)?claims.aud:[claims.aud]).includes(env.ACCESS_AUD))return null;
 let cached=keyCache.get(env.ACCESS_TEAM_DOMAIN);if(!cached||cached.until<Date.now()){const r=await fetch(env.ACCESS_TEAM_DOMAIN+'/cdn-cgi/access/certs');if(!r.ok)return null;cached={keys:(await r.json()).keys,until:Date.now()+300000};keyCache.set(env.ACCESS_TEAM_DOMAIN,cached)}const jwk=cached.keys.find(k=>k.kid===head.kid);if(!jwk)return null;const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))return null;return claims.email;
 }catch{return null;}
}
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export function validate(a){
 if(!a||(!a.en?.title?.trim()&&!a.ml?.title?.trim()))throw Error('Add a heading in English or Malayalam.');
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug)||a.slug.length>100)throw Error('Use a short URL containing lowercase letters, numbers and hyphens.');
 for(const lang of ['en','ml']){const x=a[lang]||{};for(const k of ['title','subtitle','description','caption'])if(typeof(x[k]??'')!=='string'||(x[k]||'').length>10000)throw Error('Text is too long.');if(!Array.isArray(x.blocks)||x.blocks.length>60)throw Error('Maximum 60 content blocks.');for(const b of x.blocks){if(!['paragraph','heading','table'].includes(b.type))throw Error('Unsupported content block.');if(b.type==='table'){if(!Array.isArray(b.rows)||b.rows.length>50||b.rows.some(r=>!Array.isArray(r)||r.length>10||r.some(c=>typeof c!=='string'||c.length>2000)))throw Error('Tables allow up to 50 rows and 10 columns.');}else if(typeof b.text!=='string'||b.text.length>20000)throw Error('Invalid block text.');}}
 if(a.cover&&!/^\/media\/[a-f0-9-]+\.(jpg|png|webp)$/.test(a.cover))throw Error('Upload a valid cover photo.');
 return {...a,status:a.status==='published'?'published':'draft'};
}
export default {async fetch(req,env,ctx){
 const u=new URL(req.url),p=u.pathname;
 try{
 if(p==='/api/admin/login'&&req.method==='POST')return passwordLogin(req,env);
 if(p==='/api/admin/logout'&&req.method==='POST')return passwordLogout(req,env);
 if(p==='/admin-login')return new Response(authPage({password:env.AUTH_MODE==='password'}),{headers:{...privateHeaders,'content-type':'text/html; charset=utf-8'}});
 const admin=p==='/admin'||p.startsWith('/admin/')||p.startsWith('/api/admin/');
 if(admin){
 const identity={email:await authenticatedEmail(req,env,ctx)};
 if(!identity.email){const configured=env.AUTH_MODE==='password'?passwordConfigured(env):authConfigured(env);if(p.startsWith('/api/'))return json({error:configured?'Your session has expired. Sign in again.':'Admin authentication setup is incomplete.',code:configured?'AUTH_REQUIRED':'AUTH_SETUP_REQUIRED'},configured?401:503);return new Response(authPage({kind:configured?'login':'setup',password:env.AUTH_MODE==='password'}),{status:configured?401:503,headers:{...privateHeaders,'content-type':'text/html; charset=utf-8'}});}
 if(identity.email.toLowerCase()!==(env.ADMIN_EMAIL||'').toLowerCase()){if(p.startsWith('/api/'))return json({error:'This account is not allowed.',code:'ACCESS_DENIED'},403);return new Response(authPage({kind:'denied',password:env.AUTH_MODE==='password'}),{status:403,headers:{...privateHeaders,'content-type':'text/html; charset=utf-8'}});}
 if(!['GET','HEAD'].includes(req.method)&&req.headers.get('origin')!==u.origin)return json({error:'Invalid request origin.'},403);
 if(p==='/api/admin/session')return json({email:identity.email,translationProvider:env.TRANSLATION_PROVIDER||'mymemory',localPreview:false,authMode:env.AUTH_MODE||'access'});
 if(p==='/admin'||p.startsWith('/admin/')){const response=await env.ASSETS.fetch(new Request(new URL('/admin/',u),req));const headers=new Headers(response.headers);for(const [key,value] of Object.entries(privateHeaders))headers.set(key,value);return new Response(response.body,{status:response.status,headers});}
 }
 if(p.startsWith('/api/')&&!env.DB)return json({error:'The article database has not been connected.'},503);
 if(['/api/admin/delete-article','/api/admin/delete-photo'].includes(p)&&req.method==='POST'){
 const raw=await req.text();if(raw.length>2000)return json({error:'Invalid deletion request.'},400);const input=JSON.parse(raw);
 try{return json(await (p.endsWith('delete-article')?deleteArticle:deletePhoto)(env,input));}catch(e){return json({error:e.message},e.status||500);}
 }
 if(p==='/api/admin/cleanup'&&req.method==='GET')return json({pending:(await env.DB.prepare("SELECT COUNT(*) AS count FROM media_deletions WHERE state='pending'").first()).count});
 if(p==='/api/admin/cleanup'&&req.method==='POST')return json(await retryPhotoCleanup(env));
 if(p==='/api/admin/translate'&&req.method==='POST'){
 const raw=await req.text();if(raw.length>20000)return json({error:'Translation text is too long.'},413);
 const input=JSON.parse(raw);if(!validTranslationInput(input))return json({error:'Choose different source/target languages and up to 12,000 characters.'},400);
 try{return json({text:await translateText(input,env)});}catch(e){return json({error:e.message},502);}
 }
 if(p==='/api/admin/upload'&&req.method==='POST'){
 const storage=photoStorage(env);if(!storage)return json({error:'Photo storage has not been connected.'},503);
 const declared=Number(req.headers.get('content-length')||0);if(declared>5242880)return json({error:'Photo must be under 5 MB.'},413);
 const data=await req.arrayBuffer();if(data.byteLength>5242880)return json({error:'Photo must be under 5 MB.'},413);
 const b=new Uint8Array(data);const ext=b[0]===255&&b[1]===216&&b[2]===255?'jpg':b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71?'png':String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP'?'webp':null;
 if(!ext)return json({error:'Choose a JPEG, PNG or WebP photo.'},400);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');const key=hash+'.'+ext;const existing=await storage.head(key);if(await env.DB.prepare("SELECT state FROM media_deletions WHERE cover=? AND state='pending'").bind('/media/'+key).first())return json({error:'This photo is awaiting deletion. Retry photo cleanup before uploading it again.'},409);if(!existing)await storage.put(key,data,{httpMetadata:{contentType:{jpg:'image/jpeg',png:'image/png',webp:'image/webp'}[ext]}});await env.DB.prepare("DELETE FROM media_deletions WHERE cover=? AND state='done'").bind('/media/'+key).run();return json({url:'/media/'+key,bytes:data.byteLength,reused:!!existing});
 }
 if(p==='/api/admin/articles'&&req.method==='GET')return json((await env.DB.prepare('SELECT id,slug,status,updated_at,data,version FROM articles ORDER BY updated_at DESC').all()).results.map(r=>({...JSON.parse(r.data),id:r.id,status:r.status,version:r.version,publishedAt:JSON.parse(r.data).publishedAt||(r.status==='published'?r.updated_at:null),publicationDateEstimated:!!(JSON.parse(r.data).publicationDateEstimated||(!JSON.parse(r.data).publishedAt&&r.status==='published'))})));
 if(p==='/api/admin/articles'&&req.method==='POST'){
 if(Number(req.headers.get('content-length')||0)>250000)return json({error:'Article is too large.'},413);
 const raw=await req.text();if(raw.length>250000)return json({error:'Article is too large.'},413);const a=validate(JSON.parse(raw));const id=a.id||crypto.randomUUID(),now=new Date().toISOString();
 if(await env.DB.prepare('SELECT id FROM deleted_articles WHERE id=?').bind(id).first())return json({error:'This article was permanently deleted. Start a new article instead.'},409);if(a.cover&&await env.DB.prepare('SELECT state FROM media_deletions WHERE cover=?').bind(a.cover).first())return json({error:'This photo was deleted or is awaiting deletion. Upload it again before saving.'},409);const old=await env.DB.prepare('SELECT version,data,status,updated_at FROM articles WHERE id=?').bind(id).first();if(old&&old.version!==a.version)return json({error:'This article changed in another window. Reload it before saving.'},409);
 const previous=old?JSON.parse(old.data):{};a.publishedAt=previous.publishedAt||(old?.status==='published'?old.updated_at:null)||(a.status==='published'?now:null);a.publicationDateEstimated=!!(previous.publicationDateEstimated||(!previous.publishedAt&&old?.status==='published'));
 const version=(old?.version||0)+1;
 try{if(old){const r=await env.DB.prepare('UPDATE articles SET slug=?,status=?,data=?,updated_at=?,version=? WHERE id=? AND version=? AND NOT EXISTS(SELECT 1 FROM media_deletions WHERE cover=?) AND NOT EXISTS(SELECT 1 FROM deleted_articles WHERE id=?)').bind(a.slug,a.status,JSON.stringify(a),now,version,id,old.version,a.cover||'',id).run();if(!r.meta.changes)return json({error:'Article changed. Reload before saving.'},409);}else {const inserted=await env.DB.prepare('INSERT INTO articles(id,slug,status,data,updated_at,version) SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM deleted_articles WHERE id=?) AND NOT EXISTS(SELECT 1 FROM media_deletions WHERE cover=?)').bind(id,a.slug,a.status,JSON.stringify(a),now,version,id,a.cover||'').run();if(!inserted.meta.changes)return json({error:'This article or photo was deleted. Reload before saving.'},409);}}catch{return json({error:'This article URL is already in use.'},409);}return json({id,version,status:a.status,publishedAt:a.publishedAt,publicationDateEstimated:a.publicationDateEstimated});
 }
 if(p==='/api/articles')return json((await env.DB.prepare("SELECT slug,data FROM articles WHERE status='published' ORDER BY updated_at DESC").all()).results.map(r=>{const a=JSON.parse(r.data);return {slug:r.slug,en:{title:(a.en.title||a.ml?.title),description:(a.en.description||a.ml?.description)},ml:{title:a.ml?.title,description:a.ml?.description},cover:a.cover};}));
 if(p.startsWith('/media/')||p.startsWith('/api/admin/photo/')){const key=p.startsWith('/media/')?p.slice(7):p.slice(17);if(!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(key))return new Response('Not found',{status:404});const used=await env.DB.prepare("SELECT id FROM articles WHERE status='published' AND json_extract(data,'$.cover')=? LIMIT 1").bind('/media/'+key).first();if(!used&&!admin){const i={email:await authenticatedEmail(req,env,ctx)};if(i?.email?.toLowerCase()!==env.ADMIN_EMAIL?.toLowerCase())return new Response('Not found',{status:404});}const storage=photoStorage(env);if(!storage)return new Response('Photo storage unavailable',{status:503});const o=await storage.get(key);if(!o)return new Response('Not found',{status:404});return new Response(o.body,{headers:{'content-type':o.httpMetadata.contentType,'cache-control':'private, no-store','x-content-type-options':'nosniff'}});}
 if(p.startsWith('/read/')){const row=await env.DB.prepare("SELECT data,updated_at FROM articles WHERE slug=? AND status='published'").bind(p.slice(6)).first();if(!row)return new Response('Article not found',{status:404});const a=JSON.parse(row.data);if(!a.publishedAt){a.publishedAt=row.updated_at;a.publicationDateEstimated=true;}const lang=u.searchParams.get('lang')==='ml'?'ml':'en';return new Response(`<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc((a[lang]?.title?a[lang]:(a.en?.title?a.en:a.ml)).title)} | Ariyippu</title><meta name="description" content="${esc((a[lang]?.title?a[lang]:(a.en?.title?a.en:a.ml)).description)}"><link rel="canonical" href="https://ariyippu.in/read/${esc(a.slug)}"><link rel="stylesheet" href="/assets/article.css"><link rel="stylesheet" href="/assets/article-share.css?v=1"><script defer src="/assets/article-share.js?v=3"></script><header><a href="/">Ariyippu</a><nav><a href="/articles">All articles</a> <a href="?lang=${lang==='en'?'ml':'en'}">${lang==='en'?'Malayalam':'English'}</a></nav></header><main>${renderArticle(a,lang)}</main><footer>Ariyippu &middot; Everything local</footer></html>`,{headers:{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'; img-src 'self'; style-src 'self'; frame-ancestors 'none'",'x-content-type-options':'nosniff'}});}
 if(p.startsWith('/api/'))return json({error:'Not found'},404);
 return env.ASSETS.fetch(req);
 }catch(e){return json({error:e.message||'Unable to process request.'},400);}
}};

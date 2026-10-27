const encoder=new TextEncoder();
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
export async function digest(text){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(text)));}
export function passwordConfigured(env){return !!env.DB&&typeof env.ADMIN_EMAIL==='string'&&/^pbkdf2-sha256\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(env.ADMIN_PASSWORD_HASH||'');}
export async function hashPassword(password){if(typeof password!=='string'||password.length<6||password.length>256)throw Error('Use a password of 6 to 256 characters.');const salt=hex(crypto.getRandomValues(new Uint8Array(16)));const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);const result=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:100000},key,256);return 'pbkdf2-sha256$100000$'+salt+'$'+hex(result);}
async function verify(password,record){const [,iterations,salt,expected]=record.split('$');const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);const actual=hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:Number(iterations)},key,256));let difference=actual.length^expected.length;for(let i=0;i<actual.length;i++)difference|=actual.charCodeAt(i)^expected.charCodeAt(i);return difference===0;}
function cookieName(req){return new URL(req.url).protocol==='https:'?'__Host-ariyippu_admin':'ariyippu_admin_local';}
function tokenFrom(req){const name=cookieName(req);const parts=(req.headers.get('cookie')||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));if(parts.length!==1)return null;const value=parts[0].slice(name.length+1);return /^[a-f0-9]{64}$/.test(value)?value:null;}
function cookie(req,token,maxAge){return cookieName(req)+'='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+maxAge+(new URL(req.url).protocol==='https:'?'; Secure':'');}
const response=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store',...headers}});
function secureTransport(req){const u=new URL(req.url);return u.protocol==='https:'||['localhost','127.0.0.1','[::1]'].includes(u.hostname);}
export async function passwordSessionEmail(req,env){
 if(!passwordConfigured(env)||!secureTransport(req))return null;const token=tokenFrom(req);if(!token)return null;
 const record=await env.DB.prepare('SELECT email,expires_at,credential_version FROM admin_sessions WHERE token_hash=?').bind(await digest(token)).first();if(!record||record.expires_at<=Date.now()||record.credential_version!==await digest(env.ADMIN_PASSWORD_HASH)||record.email!==env.ADMIN_EMAIL.toLowerCase())return null;return record.email;
}
export async function passwordLogin(req,env){
 if(!secureTransport(req))return response({error:'Use HTTPS to sign in.'},400);
 if(req.headers.get('origin')!==new URL(req.url).origin)return response({error:'Invalid request origin.'},403);
 if(!passwordConfigured(env))return response({error:'The admin password and database must be configured before signing in.'},503);
 const raw=await req.text();if(raw.length>4096)return response({error:'Invalid login details.'},400);let input;try{input=JSON.parse(raw)}catch{return response({error:'Invalid login details.'},400)}
 if(typeof input.email!=='string'||typeof input.password!=='string'||input.email.length>254||input.password.length>256||!input.password)return response({error:'Email or password is incorrect.'},401);
 const now=Date.now();const ip=req.headers.get('CF-Connecting-IP')||'local';const keys=['ip:'+await digest(ip),'global'];
 for(const key of keys){const row=await env.DB.prepare('SELECT attempts,expires_at FROM admin_login_limits WHERE limit_key=?').bind(key).first();if(row&&row.expires_at>now&&row.attempts>=(key==='global'?200:10))return response({error:'Too many sign-in attempts. Please try again in 15 minutes.'},429,{'retry-after':'900'});}
 // Count attempts before verification so parallel requests cannot avoid the limit.
 for(const key of keys)await env.DB.prepare('INSERT INTO admin_login_limits(limit_key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(limit_key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END').bind(key,now+900000,now,now).run();
 const valid=await verify(input.password,env.ADMIN_PASSWORD_HASH);if(!valid||input.email.trim().toLowerCase()!==env.ADMIN_EMAIL.toLowerCase())return response({error:'Email or password is incorrect.'},401);
 const token=hex(crypto.getRandomValues(new Uint8Array(32)));const old=tokenFrom(req);if(old)await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await digest(old)).run();
 await env.DB.batch([env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at<=?').bind(now),env.DB.prepare('DELETE FROM admin_login_limits WHERE expires_at<=?').bind(now),env.DB.prepare('DELETE FROM admin_login_limits WHERE limit_key=?').bind(keys[0]),env.DB.prepare('INSERT INTO admin_sessions(token_hash,email,expires_at,credential_version) VALUES(?,?,?,?)').bind(await digest(token),env.ADMIN_EMAIL.toLowerCase(),now+28800000,await digest(env.ADMIN_PASSWORD_HASH))]);
 return response({success:true},200,{'set-cookie':cookie(req,token,28800)});
}
export async function passwordLogout(req,env){
 if(req.headers.get('origin')!==new URL(req.url).origin)return response({error:'Invalid request origin.'},403);
 if(!env.DB)return response({error:'The session database is unavailable. Please retry sign-out.'},503);
 const token=tokenFrom(req);if(token)await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await digest(token)).run();
 return response({success:true},200,{'set-cookie':cookie(req,'',0)});
}

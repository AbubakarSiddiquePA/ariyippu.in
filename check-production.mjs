import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(new URL('./wrangler.jsonc',import.meta.url),'utf8'));
const checks=[
 [config.vars?.PHOTO_PROVIDER==='imagekit'&&/^https:\/\/ik\.imagekit\.io\/[A-Za-z0-9_-]+\/?$/.test(config.vars?.IMAGEKIT_URL_ENDPOINT||''),'Set the ImageKit URL endpoint before deploying photo uploads.'],
 [!config.vars?.IMAGEKIT_PRIVATE_KEY&&config.secrets?.required?.includes('IMAGEKIT_PRIVATE_KEY'),'Keep the ImageKit private key in a required Cloudflare Secret.'],
 [config.name==='crimson-salad-f0e5','Keep the expected production Worker name.'],
 [config.vars?.AUTH_MODE==='password','Use AUTH_MODE=password for the new login.'],
 [config.vars?.ADMIN_EMAIL==='abubakarsiddiqueworkdev@gmail.com','Verify the approved admin email.'],
 [/^[a-f0-9-]{36}$/i.test(config.d1_databases?.[0]?.database_id||''),'Replace the D1 database ID.'],
 [!config.vars?.LOCAL_PREVIEW&&!config.access?.dev,'Do not deploy simulated login settings.'],
 [!config.vars?.ADMIN_PASSWORD_HASH&&!config.vars?.ADMIN_PASSWORD,'Keep password values out of wrangler.jsonc; use a Cloudflare Secret.'],
 [config.secrets?.required?.includes('ADMIN_PASSWORD_HASH'),'Declare the required ADMIN_PASSWORD_HASH secret.'],
 [config.workers_dev===false&&config.preview_urls===false,'Keep alternate public preview hosts disabled.']
];
const failures=checks.filter(([ok])=>!ok);if(failures.length){console.error('Deployment blocked: production setup is incomplete.');for(const [,message]of failures)console.error('- '+message);process.exitCode=1;}else console.log('Production configuration checks passed. Configure the live password hash secret and database migrations before deploying.');

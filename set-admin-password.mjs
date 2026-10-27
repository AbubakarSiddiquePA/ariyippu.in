import {hashPassword} from './password-auth.mjs';
import {randomInt} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
function hidden(prompt){return new Promise((resolve,reject)=>{if(!process.stdin.isTTY)return reject(Error('Run this command in an interactive terminal, or use --generate-local.'));process.stdout.write(prompt);let text='';process.stdin.setRawMode(true);process.stdin.resume();const listener=data=>{for(const ch of data.toString()){if(ch==='\u0003'){finish();reject(Error('Cancelled'));return;}if(ch==='\r'||ch==='\n'){finish();resolve(text);return;}if(ch==='\u007f'||ch==='\b'){if(text){text=text.slice(0,-1);process.stdout.write('\b \b');}}else if(ch>=' '){text+=ch;process.stdout.write('*');}}};function finish(){process.stdin.removeListener('data',listener);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');}process.stdin.on('data',listener);});}
const varsPath=resolve('.dev.vars'),hashPath=resolve('.admin-password-hash.txt'),loginPath=resolve('.local-admin-login.txt');
const generated=process.argv.includes('--generate-local');let previous=existsSync(varsPath)?readFileSync(varsPath,'utf8'):'';
if(generated&&previous.includes('ADMIN_PASSWORD_HASH='))throw Error('A local password is already set. Run without --generate-local to replace it deliberately.');
const password=generated?Array.from({length:24},()=>randomInt(0,10)).join(''):await hidden('New admin password (numbers only, at least 6 digits): ');
if(!generated&&password!==await hidden('Confirm password: '))throw Error('Passwords do not match. Nothing changed.');
if(!/^\d{6,256}$/.test(password))throw Error('Use numbers only, with at least 6 digits. Nothing changed.');
const hash=await hashPassword(password);previous=previous.replace(/^ADMIN_PASSWORD_HASH=.*(?:\r?\n|$)/gm,'');writeFileSync(varsPath,previous.trimEnd()+'\nADMIN_PASSWORD_HASH="'+hash+'"\n',{mode:0o600});writeFileSync(hashPath,hash+'\n',{mode:0o600});
if(generated)writeFileSync(loginPath,'LOCAL ADMIN LOGIN\nEmail: abubakarsiddiqueworkdev@gmail.com\nPassword: '+password+'\n\nPrivate local credential. Do not upload, commit or share this file. Set your own password before production using node set-admin-password.mjs.\n',{mode:0o600});else if(existsSync(loginPath))writeFileSync(loginPath,'The password was replaced. Use the password you just entered.\n',{mode:0o600});
console.log('Local password hash saved to .dev.vars.');console.log('For production, store the contents of .admin-password-hash.txt as the Cloudflare Secret ADMIN_PASSWORD_HASH. Never upload these private files as website assets.');if(generated)console.log('Open '+loginPath+' to read your temporary local login.');

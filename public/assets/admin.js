import {optimiseCover,formatBytes} from '/assets/image-optimise.js';
import {renderArticle,blankLanguage} from '/assets/article-render.js?v=2';
const $=s=>document.querySelector(s),labels={en:'English',ml:'Malayalam'},backupKey='ariyippu-editor-backup-v2';
const fresh=()=>({slug:'',en:blankLanguage(),ml:blankLanguage(),cover:'',status:'draft',translations:{}});
let authLocked=false,sessionCheckTimer;
let article=fresh(),lang='en',previewLang='en',dirty=false,busy=false,translating=false,uploading=false,rows=[],backupTimer,previewFrame,translationUndo=null;
const clone=x=>structuredClone(x);
function fingerprint(x){let n=2166136261;for(const c of JSON.stringify(x)){n^=c.codePointAt(0);n=Math.imul(n,16777619)}return (n>>>0).toString(16);}
function message(text,error=false){$('#status').textContent=text;$('#status').dataset.error=String(error);}
async function api(path,options={}){
 if(authLocked&&path!=='session')throw Error('Sign in again before making changes.');
 const headers=new Headers(options.headers);headers.set('Accept','application/json');headers.set('X-Requested-With','XMLHttpRequest');
 const response=await fetch('/api/admin/'+path,{...options,headers,credentials:'same-origin',redirect:'manual',cache:'no-store',signal:options.signal||AbortSignal.timeout(60000)});
 if(response.type==='opaqueredirect'||response.status===401||response.status===403){showSessionLock(response.status===403?'Your account does not have admin access. Sign in with the approved email.':'Your session has expired. Sign in again to continue.');throw Error('Sign in again to continue. Your unsaved text has been preserved.');}
 const type=response.headers.get('content-type')||'';if(!type.includes('application/json')){showSessionLock('Your sign-in session needs to be renewed.');throw Error('Sign in again to continue.');}
 let data;try{data=await response.json();}catch{throw Error('The server returned an unreadable response. Please try again.');}if(authLocked&&path!=='session')throw Error('You are signed out. Sign in again to continue.');if(data.code==='AUTH_SETUP_REQUIRED')showSessionLock(data.error);if(!response.ok)throw Error(data.error||'Request failed (HTTP '+response.status+')');return data;
}
function markDirty(){dirty=true;$('#draftState').textContent='Unsaved changes';clearTimeout(backupTimer);backupTimer=setTimeout(()=>{try{localStorage.setItem(backupKey,JSON.stringify({article,time:Date.now()}));$('#draftState').textContent='Unsaved changes / backed up on this browser';}catch{$('#draftState').textContent='Unsaved changes / browser backup unavailable';}},600);}
function initialisePreview(){const frame=$('#preview');if(frame.contentDocument?.querySelector('#articleBody'))return frame.contentDocument;const doc=frame.contentDocument;if(!doc)return null;doc.open();doc.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="'+location.origin+'/assets/article.css?v=2"></head><body><main id="articleBody"></main></body></html>');doc.close();return doc;}
function preview(){if(authLocked)return;cancelAnimationFrame(previewFrame);previewFrame=requestAnimationFrame(()=>{try{const doc=initialisePreview();if(!doc)return;doc.documentElement.lang=previewLang;const scroll=$('#preview').contentWindow.scrollY;const view={...article,cover:(article.cover||'').replace('/media/','/api/admin/photo/')};doc.querySelector('#articleBody').innerHTML=renderArticle(view,previewLang,{preview:true});$('#preview').style.width=$('#size').value;$('#preview').contentWindow.scrollTo(0,scroll);document.querySelectorAll('[data-preview-lang]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.previewLang===previewLang)));$('#editPreviewLanguage').textContent='Edit '+labels[previewLang];const meta=article.translations?.[previewLang];$('#previewStatus').textContent='Previewing '+labels[previewLang]+(meta?' / machine translation - review before publishing':'');const text=[article[lang].title,article[lang].subtitle,article[lang].description,...article[lang].blocks.flatMap(b=>b.type==='table'?b.rows.flat():b.text)].join(' ');const words=text.trim()?text.trim().split(/\s+/u).length:0;$('#wordCount').textContent=words+' words / '+Math.max(1,Math.ceil(words/200))+' min read';}catch(e){message('Preview could not update: '+e.message,true);}});}
function capture(){for(const k of ['title','subtitle','description','caption'])article[lang][k]=$('#'+k).value;article.slug=$('#slug').value;markDirty();previewLang=lang;preview();}
function normalise(a){return {...fresh(),...a,en:{...blankLanguage(),...a.en},ml:{...blankLanguage(),...a.ml},translations:a.translations||{}};}
function display(){for(const k of ['title','subtitle','description','caption']){$('#'+k).value=article[lang][k]||'';$('#'+k).lang=lang;}$('#slug').value=article.slug;document.querySelectorAll('[data-lang]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lang===lang)));$('#editHint').textContent='Editing '+labels[lang]+'. Changes appear instantly in the preview.';$('#translate').textContent='Translate '+labels[lang]+' to '+labels[lang==='en'?'ml':'en'];$('#save').textContent=article.status==='published'?'Save changes':'Save draft';$('#publish').textContent=article.status==='published'?'Update live':'Publish';$('#unpublish').hidden=article.status!=='published';$('#publicLink').hidden=article.status!=='published';$('#publicLink').href='/read/'+article.slug+(previewLang==='ml'?'?lang=ml':'');$('#coverInfo').textContent=article.cover?'Cover photo ready. See it in the preview.':'No cover photo selected.';$('#removePhoto').hidden=!article.cover;$('#deletePhoto').hidden=!article.cover;$('#deleteArticleZone').hidden=!article.id;$('#draftState').textContent=dirty?'Unsaved changes':article.id?(article.status==='published'?'Published':'Draft saved'):'New draft';blocks();preview();}
function updateBusy(){document.querySelectorAll('#save,#publish,#unpublish,#new,#photo,#removePhoto,#deletePhoto,#deleteArticle,#retryCleanup,#translate,[data-preview-lang],[data-lang]').forEach(b=>b.disabled=authLocked||busy||translating||uploading);$('#translate').textContent=translating?'Translating...':'Translate '+labels[lang]+' to '+labels[lang==='en'?'ml':'en'];$('#undoTranslation').disabled=translating||busy;}
function blocks(){const wrap=$('#blocks');wrap.replaceChildren();if(!article[lang].blocks.length){const hint=document.createElement('p');hint.className='hint';hint.textContent='Start with a paragraph, add a heading, or include a table below.';wrap.append(hint);}article[lang].blocks.forEach((b,i)=>{const el=document.createElement('div');el.className='block';const nav=document.createElement('nav');const title=document.createElement('strong');title.textContent=(i+1)+'. '+(b.type==='table'?'Table':b.type==='heading'?'Heading':'Paragraph');nav.append(title);for(const [text,action,disabled]of [['Up',()=>{[article[lang].blocks[i-1],article[lang].blocks[i]]=[b,article[lang].blocks[i-1]]},i===0],['Down',()=>{[article[lang].blocks[i+1],article[lang].blocks[i]]=[b,article[lang].blocks[i+1]]},i===article[lang].blocks.length-1],['Remove',()=>{if((b.text||b.rows?.flat().join('')).trim()&&!confirm('Remove this content block?'))return;article[lang].blocks.splice(i,1)},false]]){const btn=document.createElement('button');btn.type='button';btn.textContent=text;btn.disabled=disabled;btn.setAttribute('aria-label',text+' block '+(i+1));btn.onclick=()=>{action();markDirty();blocks();preview()};nav.append(btn);}el.append(nav);if(b.type==='table'){const hint=document.createElement('p');hint.className='hint';hint.textContent='One row per line. Separate columns with |. First row = table heading. Example: Item | Price';el.append(hint);}const input=document.createElement('textarea');input.rows=b.type==='heading'?2:5;input.lang=lang;input.setAttribute('aria-label',b.type+' content '+(i+1));input.placeholder=b.type==='heading'?'Write a section heading...':b.type==='table'?'Item | Price\nExample | 100':'Start writing your story...';input.value=b.type==='table'?b.rows.map(r=>r.join(' | ')).join('\n'):b.text;input.oninput=()=>{if(b.type==='table')b.rows=input.value.split('\n').map(r=>r.split('|').map(c=>c.trim()));else b.text=input.value;markDirty();previewLang=lang;preview()};el.append(input);wrap.append(el);});}
let currentSection='dashboard';
function navigate(section){
 currentSection=section;document.body.dataset.adminSection=section;
 for(const [name,id] of [['dashboard','dashboardView'],['articles','articlesView'],['editor','editorView']])$('#'+id).hidden=name!==section;
 document.querySelectorAll('[data-section]').forEach(b=>b.setAttribute('aria-current',b.dataset.section===section?'page':'false'));
 $('#moduleMenu').setAttribute('aria-expanded','false');document.body.classList.remove('module-menu-open');
 $('#mobileViewSwitch').hidden=authLocked||section!=='editor';
 if(section==='editor'&&typeof setMobileView==='function')setMobileView('edit');
 window.scrollTo({top:0,behavior:'instant'});
}
function openArticle(a){if(busy||translating||uploading)return;if(dirty&&!confirm('Leave these unsaved edits? They are backed up on this browser.'))return;article=normalise(a);dirty=false;lang=article.en.title?'en':'ml';previewLang=lang;translationUndo=null;$('#undoTranslation').hidden=true;display();renderList();navigate('editor');message(a.status==='published'?'Published article. Save changes to update the live version.':'Draft loaded. It is only visible to you.');}
function articleCard(a){const card=document.createElement('article');card.className='library-card';
 const badge=document.createElement('span');badge.className='article-badge '+a.status;badge.textContent=a.status==='published'?'Published':'Draft';card.append(badge);
 const title=document.createElement('h3');title.textContent=a.en?.title||a.ml?.title||'Untitled article';card.append(title);
 const meta=document.createElement('p');meta.className='hint';meta.textContent=[a.en?.title?'English':'',a.ml?.title?'Malayalam':''].filter(Boolean).join(' / ')||'New story';card.append(meta);
 if(a.publishedAt){const date=document.createElement('p');date.className='hint';date.textContent='Published '+new Date(a.publishedAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'});card.append(date);}
 const actions=document.createElement('div');actions.className='card-actions';const edit=document.createElement('button');edit.textContent=a.status==='published'?'Edit article':'Continue writing';edit.onclick=()=>openArticle(a);actions.append(edit);
 if(a.status==='published'){const link=document.createElement('a');link.href='/read/'+encodeURIComponent(a.slug);link.target='_blank';link.rel='noopener';link.textContent='View live ?';actions.append(link);}card.append(actions);return card;}
function fillCards(target,items,empty){target.replaceChildren();for(const a of items)target.append(articleCard(a));if(!items.length){const box=document.createElement('div');box.className='library-empty';box.textContent=empty;target.append(box);}}
function renderList(){const q=$('#articleSearch').value.trim().toLocaleLowerCase(),filter=$('#articleFilter').value;
 const matches=rows.filter(a=>(a.en?.title+' '+a.ml?.title+' '+a.status).toLocaleLowerCase().includes(q)&&(filter==='all'||a.status===filter));
 fillCards($('#list'),matches,rows.length?'No articles match. Try another title or status.':'No articles yet. Create your first story when you are ready.');
 fillCards($('#recentList'),rows.slice(0,4),'Your first story starts here. Choose Create article to get started.');
 $('#resultCount').textContent=matches.length+' article'+(matches.length===1?'':'s');$('#totalCount').textContent=rows.length;$('#navCount').textContent=rows.length;
 $('#publishedCount').textContent=rows.filter(a=>a.status==='published').length;$('#draftCount').textContent=rows.filter(a=>a.status!=='published').length;
}
document.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>navigate(b.dataset.section));
$('#articleFilter').onchange=renderList;
document.querySelectorAll('[data-stat]').forEach(b=>b.onclick=()=>{$('#articleFilter').value=b.dataset.stat;$('#articleSearch').value='';renderList();navigate('articles');});
$('#moduleMenu').onclick=()=>{const open=$('#moduleMenu').getAttribute('aria-expanded')!=='true';$('#moduleMenu').setAttribute('aria-expanded',String(open));document.body.classList.toggle('module-menu-open',open);};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#moduleMenu').setAttribute('aria-expanded','false');document.body.classList.remove('module-menu-open');}});
document.addEventListener('click',e=>{if(!e.target.closest('#moduleNav, #moduleMenu')){$('#moduleMenu').setAttribute('aria-expanded','false');document.body.classList.remove('module-menu-open');}});
async function cleanupStatus(){try{const result=await api('cleanup');$('#cleanupNotice').hidden=!result.pending;}catch{}}
async function list(){rows=await api('articles');renderList();await cleanupStatus();}
function hasContent(x){return !!(x.title?.trim()||x.description?.trim()||x.subtitle?.trim()||x.caption?.trim()||x.blocks?.some(b=>b.text?.trim()||b.rows?.flat().some(c=>c.trim())));}
async function translate(target,force=false){if(translating||busy||uploading)return;const source=lang;if(source===target){previewLang=target;preview();return;}const from=clone(article[source]);if(!hasContent(from)){message('Write something in '+labels[source]+' first.',true);return;}
 const existing=article[target],meta=article.translations?.[target],sourceHash=fingerprint(from);if(!force&&hasContent(existing)){if(meta&&meta.source===source&&meta.sourceHash!==sourceHash&&meta.targetHash===fingerprint(existing)){}else{previewLang=target;preview();message('Showing your existing '+labels[target]+' version. Use Translate to replace it with a fresh translation.');return;}}
 if(force&&hasContent(existing)&&!confirm('Replace the '+labels[target]+' version with a new translation? You can undo this after translating.'))return;
 translating=true;updateBusy();const before=clone(existing),targetHash=fingerprint(existing),jobs=[];const translated=blankLanguage();for(const key of ['title','subtitle','description','caption'])if(from[key])jobs.push({text:from[key],set:v=>translated[key]=v});translated.blocks=from.blocks.map(b=>b.type==='table'?{type:'table',rows:b.rows.map(row=>row.map(cell=>cell))}:{...b});from.blocks.forEach((b,i)=>{if(b.type==='table')b.rows.forEach((row,r)=>row.forEach((cell,c)=>{if(cell.trim())jobs.push({text:cell,set:v=>translated.blocks[i].rows[r][c]=v})}));else if(b.text.trim())jobs.push({text:b.text,set:v=>translated.blocks[i].text=v});});
 try{const cache=new Map();let done=0;for(const job of jobs){message('Translating to '+labels[target]+'... '+done+' of '+jobs.length+' sections. Your original stays unchanged.');let result;if(/^[\s\d\p{P}\p{S}]+$/u.test(job.text))result=job.text;else if(cache.has(job.text))result=cache.get(job.text);else{const r=await api('translate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source,target,text:job.text})});result=r.text;cache.set(job.text,result);}job.set(result);done++;}
 if(fingerprint(article[source])!==sourceHash||fingerprint(article[target])!==targetHash)throw Error('The article changed while translating. No translation was applied. Click Translate again when you finish editing.');translationUndo={target,content:before,meta:clone(article.translations?.[target]||null)};article[target]=translated;article.translations={...article.translations,[target]:{source,sourceHash,targetHash:fingerprint(translated)}};markDirty();previewLang=target;$('#undoTranslation').hidden=false;preview();message('Translated to '+labels[target]+'. Review it in the preview, then choose Edit '+labels[target]+' to refine the wording. Save when ready.');
 }catch(e){message(e.name==='TimeoutError'?'Translation took too long. Your original and existing translation are unchanged. Try a shorter paragraph or retry.':'Translation was not applied. '+e.message,true);}finally{translating=false;updateBusy();}}
async function save(status){if(busy||translating||uploading)return;const en=article.en.title.trim(),ml=article.ml.title.trim();if(!en&&!ml){message('Add a heading in English or Malayalam before saving.',true);$('#title').focus();return;}if(!article.slug){article.slug=(en||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100)||'article-'+Date.now().toString(36);$('#slug').value=article.slug;}if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug)){message('The article URL can contain lowercase English letters, numbers and hyphens.',true);$('.settings').open=true;$('#slug').focus();return;}if(status==='published'&&!confirm(article.status==='published'?'Update this live article?':'Publish this article on Ariyippu?'))return;if(status==='draft'&&article.status==='published'&&!confirm('Take this article offline and return it to draft?'))return;const sent=clone(article),sentHash=fingerprint(article);busy=true;updateBusy();message('Saving your article...');try{const saved=await api('articles',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...sent,status})});const changedWhileSaving=fingerprint(article)!==sentHash;Object.assign(article,saved);dirty=changedWhileSaving;clearTimeout(backupTimer);if(changedWhileSaving)markDirty();else{try{localStorage.removeItem(backupKey)}catch{}}$('#recovery').hidden=true;display();message(changedWhileSaving?'Saved the previous version. You have newer unsaved edits; save again when ready.':status==='published'?'Published successfully. Your article is now live.':'Draft saved. This article is not public.');try{await list()}catch{message('Article saved, but the article list could not refresh. Your save was successful.');}}catch(e){message(e.message,true)}finally{busy=false;updateBusy();}}
for(const k of ['title','subtitle','description','caption','slug'])$('#'+k).addEventListener('input',capture);
document.querySelectorAll('[data-lang]').forEach(b=>b.onclick=()=>{lang=b.dataset.lang;previewLang=lang;display()});document.querySelectorAll('[data-preview-lang]').forEach(b=>b.onclick=()=>{const target=b.dataset.previewLang;if(target===lang){previewLang=target;preview();}else translate(target)});
document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{if(article[lang].blocks.length>=60){message('You can add up to 60 blocks.',true);return;}article[lang].blocks.push(b.dataset.add==='table'?{type:'table',rows:[['Item','Details'],['','']]}:{type:b.dataset.add,text:''});markDirty();previewLang=lang;blocks();preview();$('#blocks .block:last-child textarea').focus();});
$('#size').onchange=preview;$('#save').onclick=()=>save(article.status);$('#publish').onclick=()=>save('published');$('#unpublish').onclick=()=>save('draft');$('#translate').onclick=()=>translate(lang==='en'?'ml':'en',true);$('#editPreviewLanguage').onclick=()=>{lang=previewLang;display();$('#title').focus()};$('#articleSearch').oninput=renderList;
$('#undoTranslation').onclick=()=>{if(!translationUndo)return;const t=translationUndo;if(!confirm('Undo the last translation? Any edits to that version since translating will be replaced.'))return;article[t.target]=t.content;if(t.meta)article.translations[t.target]=t.meta;else delete article.translations[t.target];translationUndo=null;$('#undoTranslation').hidden=true;markDirty();display();message('Translation undone. Your previous wording has been restored.');};
$('#new').onclick=()=>{if(dirty&&!confirm('Start a new article? Unsaved edits will be replaced.'))return;clearTimeout(backupTimer);article=fresh();lang=previewLang='en';dirty=false;translationUndo=null;$('#undoTranslation').hidden=true;localStorage.removeItem(backupKey);$('#recovery').hidden=true;display();renderList();navigate('editor');message('New draft. Write in English or Malayalam.');$('#title').focus()};
document.querySelectorAll('[data-create]').forEach(b=>b.onclick=()=>$('#new').click());
$('#removePhoto').onclick=()=>{article.cover='';markDirty();display()};$('#photo').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>5242880){message('Photo must be under 5 MB.',true);e.target.value='';return;}uploading=true;updateBusy();message('Optimising your photo...');try{const prepared=await optimiseCover(file);message('Uploading '+formatBytes(prepared.uploadedBytes)+' photo...');const r=await api('upload',{method:'POST',headers:{'content-type':prepared.file.type},body:prepared.file});article.cover=r.url;markDirty();display();message('Photo ready: '+formatBytes(prepared.originalBytes)+' original / '+formatBytes(prepared.uploadedBytes)+' stored'+(r.reused?' (existing copy reused)':'')+'. Save your article to keep this change.');}catch(e){message(e.message,true)}finally{uploading=false;updateBusy();e.target.value='';}};

$('#deletePhoto').onclick=async()=>{
 if(busy||translating||uploading||!article.cover)return;
 if(!confirm('Permanently delete this photo from storage? It will be removed immediately from this saved article and cannot be undone. Other unsaved text edits will stay here. Shared photos are protected.'))return;
 busy=true;updateBusy();message('Deleting photo from storage...');
 try{const result=await api('delete-photo',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cover:article.cover,id:article.id,version:article.version})});article.cover='';if(result.version)article.version=result.version;markDirty();display();message(result.cleanupPending?result.error:'Photo permanently deleted from storage. Other unsaved edits have been kept.',!!result.cleanupPending);await list();}
 catch(e){message(e.message,true);}finally{busy=false;updateBusy();}
};
$('#deleteArticle').onclick=async()=>{
 if(busy||translating||uploading||!article.id)return;
 if(!confirm('Permanently delete this entire article in English and Malayalam? Its unused cover photo will also be deleted from storage. This cannot be undone.'))return;
 busy=true;updateBusy();message('Deleting article...');
 try{const result=await api('delete-article',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:article.id,version:article.version})});clearTimeout(backupTimer);try{localStorage.removeItem(backupKey)}catch{}article=fresh();lang=previewLang='en';dirty=false;translationUndo=null;$('#undoTranslation').hidden=true;$('#recovery').hidden=true;display();await list();message(result.cleanupPending?'Article deleted. '+result.error:result.alreadyDeleted?'This article was already deleted. Check Retry photo cleanup for any pending storage removals.':result.photoShared?'Article deleted. Its photo was kept because another saved article uses it.':'Article permanently deleted. Its unused cover photo has also been removed from storage.',!!result.cleanupPending);}
 catch(e){message(e.message,true);}finally{busy=false;updateBusy();}
};
$('#retryCleanup').onclick=async()=>{if(busy)return;busy=true;updateBusy();message('Retrying pending storage deletions...');try{const result=await api('cleanup',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});$('#cleanupNotice').hidden=!result.pending;message(result.pending?'Some deletions are still pending. Check the photo storage connection and try again.':'All pending photo deletions completed.',!!result.pending);}catch(e){message(e.message,true);}finally{busy=false;updateBusy();}};

window.addEventListener('beforeunload',e=>{if(dirty||translating||uploading){e.preventDefault();e.returnValue='';}});$('#preview').addEventListener('load',preview);
$('#restore').onclick=()=>{try{const backup=JSON.parse(localStorage.getItem(backupKey));article=normalise(backup.article);lang=article.en.title?'en':'ml';previewLang=lang;markDirty();display();$('#recovery').hidden=true;message('Browser backup restored. Save it to the server when ready.');}catch{message('The browser backup could not be restored.',true);}};$('#dismissRestore').onclick=()=>{localStorage.removeItem(backupKey);$('#recovery').hidden=true;};

// Mobile workspace tabs keep each view's page scroll independently.
const mobileLayout=matchMedia('(max-width: 850px)');
let mobileView='edit';const mobileScroll={edit:0,preview:0};
function setMobileView(next){
 if(!['edit','preview'].includes(next))return;
 if(mobileLayout.matches){mobileScroll[mobileView]=window.scrollY;if(document.activeElement instanceof HTMLElement)document.activeElement.blur();}
 mobileView=next;document.body.dataset.mobileView=next;
 document.querySelectorAll('[data-mobile-view]').forEach(button=>{const active=button.dataset.mobileView===next;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;});
 preview();
 if(mobileLayout.matches)requestAnimationFrame(()=>window.scrollTo({top:mobileScroll[next],behavior:'instant'}));
}
$('#mobileViewSwitch').addEventListener('click',event=>{const button=event.target.closest('[data-mobile-view]');if(button)setMobileView(button.dataset.mobileView);});
$('#mobileViewSwitch').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'edit':event.key==='End'?'preview':mobileView==='edit'?'preview':'edit';setMobileView(next);document.querySelector('[data-mobile-view="'+next+'"]').focus({preventScroll:true});});
$('#editPreviewLanguage').addEventListener('click',()=>{if(mobileLayout.matches)setMobileView('edit');});
mobileLayout.addEventListener('change',()=>{if(!mobileLayout.matches)window.scrollTo({top:0,behavior:'instant'});preview();});
document.body.dataset.mobileView='edit';


function showSessionLock(reason){
 authLocked=true;clearTimeout(backupTimer);cancelAnimationFrame(previewFrame);
 if(dirty){try{localStorage.setItem(backupKey,JSON.stringify({article,time:Date.now()}));}catch{}}
 $('#studio').hidden=true;$('#mobileViewSwitch').hidden=true;$('#sessionLock').hidden=false;$('#sessionLockMessage').textContent=reason;$('#account').textContent='Sign-in required';updateBusy();
}
function clearPrivateState(){
 clearTimeout(backupTimer);cancelAnimationFrame(previewFrame);dirty=false;article=fresh();rows=[];translationUndo=null;
 try{localStorage.removeItem(backupKey);}catch{}
 for(const id of ['title','subtitle','description','caption','slug','photo'])$('#'+id).value='';
 $('#blocks').replaceChildren();$('#list').replaceChildren();$('#recentList').replaceChildren();$('#preview').srcdoc='';
}
async function resumeSession(){
 if(localStorage.getItem('ariyippu-admin-signed-out')==='true'){showSessionLock('You have signed out. Use Sign in again first, then return here.');return;}
 try{const session=await api('session');if(localStorage.getItem('ariyippu-admin-signed-out')==='true'){showSessionLock('You have signed out. Sign in again to continue.');return;}authLocked=false;$('#locked').textContent='';$('#sessionLock').hidden=true;$('#studio').hidden=false;$('#mobileViewSwitch').hidden=currentSection!=='editor';$('#account').textContent=session.email;
 document.querySelector('.private-label').textContent='Private workspace';
 if(session.translationProvider==='cloudflare')$('#translationNote').textContent='Choose the other preview language to translate automatically using Cloudflare AI. Review the wording before publishing.';
 display();updateBusy();try{const backup=JSON.parse(localStorage.getItem(backupKey));$('#recovery').hidden=!backup?.article;}catch{}try{await list();}catch(e){message(e.message,true);}
 }catch(e){showSessionLock(e.message);}
}
$('#resumeSession').onclick=resumeSession;
$('#sessionSignIn').addEventListener('click',()=>{try{localStorage.removeItem('ariyippu-admin-signed-out');}catch{}});
$('#adminSignOut').addEventListener('click',async event=>{
 event.preventDefault();
 if(busy||uploading||translating){message('Please wait for the current operation to finish before signing out.',true);return;}
 if(dirty&&!confirm('Sign out and discard unsaved changes? The browser backup will also be cleared. Saved articles are kept.'))return;
 busy=true;updateBusy();
 try{await api('logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});authLocked=true;clearPrivateState();try{localStorage.setItem('ariyippu-admin-signed-out','true');}catch{}showSessionLock('You have signed out. Your server session and private browser data have been cleared.');location.replace('/admin-login');}
 catch(e){message('Sign-out could not be confirmed. Please retry. '+e.message,true);}
 finally{busy=false;updateBusy();}
});
window.addEventListener('storage',event=>{if(event.key==='ariyippu-admin-signed-out'&&event.newValue==='true'){authLocked=true;clearPrivateState();showSessionLock('You signed out in another tab. Sign in again to continue.');}});
window.addEventListener('pageshow',event=>{if(event.persisted){if(localStorage.getItem('ariyippu-admin-signed-out')==='true'){authLocked=true;clearPrivateState();showSessionLock('You have signed out. Sign in again to continue.');}else{showSessionLock('Checking your session...');resumeSession();}}});
async function checkSession(){if(document.hidden||authLocked)return;try{await api('session');}catch(e){if(!authLocked)message('Unable to check your session. Your edits are still here.',true);}}
window.addEventListener('focus',checkSession);sessionCheckTimer=setInterval(checkSession,60000);
$('#restore').addEventListener('click',()=>navigate('editor'));
navigate('dashboard');
await resumeSession();

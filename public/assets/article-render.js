export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const blankLanguage=()=>({title:'',subtitle:'',description:'',caption:'',blocks:[]});
export const validCover=value=>typeof value==='string'&&/^\/(?:media\/|api\/admin\/photo\/)[a-f0-9-]+\.(?:jpg|png|webp)$/.test(value);
export function readingMinutes(x){const text=[x.title,x.subtitle,x.description,...(x.blocks||[]).flatMap(b=>b.type==='table'?b.rows.flat():b.text)].filter(Boolean).join(' ');return Math.max(1,Math.ceil(text.trim().split(/\s+/u).length/200));}
export function publicationDate(a,lang='en'){
 if(!a.publishedAt)return '';
 const date=new Date(a.publishedAt);if(!Number.isFinite(date.getTime()))return '';
 const locale=lang==='ml'?'ml-IN':'en-IN';
 const day=new Intl.DateTimeFormat(locale,{timeZone:'Asia/Kolkata',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(date);
 const time=new Intl.DateTimeFormat(locale,{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit',hour12:true}).format(date);
 const label=a.publicationDateEstimated?(lang==='ml'?'\u0d24\u0d40\u0d2f\u0d24\u0d3f':'Date'):(lang==='ml'?'\u0d2a\u0d4d\u0d30\u0d38\u0d3f\u0d26\u0d4d\u0d27\u0d40\u0d15\u0d30\u0d3f\u0d1a\u0d4d\u0d1a\u0d24\u0d4d':'Published');
 return `<div class="article-published"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg><span>${label} <time datetime="${esc(date.toISOString())}">${esc(day)} &middot; ${esc(time)} IST</time></span></div>`;
}
export function renderArticle(a,lang='en',{preview=false}={}){
 const requested=a[lang]||blankLanguage();
 const x=preview||requested.title?requested:(a[lang==='en'?'ml':'en']||blankLanguage());
 const hasCover=validCover(a.cover),minutes=readingMinutes(x);
 const photo=hasCover?`<figure class="article-cover"><img src="${esc(a.cover)}" alt="${esc(x.caption||x.title)}" fetchpriority="high" decoding="async">${x.caption?`<figcaption>${esc(x.caption)}</figcaption>`:''}</figure>`:'';
 const meta=lang==='ml'?`${minutes} \u0d2e\u0d3f\u0d28\u0d3f\u0d31\u0d4d\u0d31\u0d4d \u0d35\u0d3e\u0d2f\u0d28`:`${minutes} min read`;
 return `<article class="reading-article ${hasCover?'article--photo':'article--text'}"><div class="article-intro"><p class="eyebrow">ARIYIPPU / ARTICLES</p><h1>${esc(x.title)||(preview?'Your article heading':'')}</h1>${x.subtitle?`<p class="subtitle">${esc(x.subtitle)}</p>`:''}<div class="article-meta"><span>Ariyippu</span><span aria-hidden="true">&middot;</span><span>${meta}</span></div>${x.description?`<p class="description">${esc(x.description)}</p>`:''}</div>${photo}${publicationDate(a,lang)}<div class="article-content">${(x.blocks||[]).map(b=>b.type==='table'?`<div class="table-wrap"><table>${b.rows.map((r,i)=>`<tr>${r.map(c=>`<${i?'td':'th'}>${esc(c)}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</table></div>`:b.type==='heading'?`<h2>${esc(b.text)}</h2>`:`<p class="paragraph">${esc(b.text)}</p>`).join('')}${preview&&!x.blocks?.length?'<p class="preview-placeholder">Add a paragraph or table to see your story take shape here.</p>':''}</div></article>`;
}

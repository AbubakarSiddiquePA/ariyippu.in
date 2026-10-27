const encoder=new TextEncoder();
export function splitTranslationText(text,maxBytes=450){
 const parts=[];let chunk='';
 // Split on word boundaries, then on codepoints for a very long word. Never split a UTF-8 character.
 for(const word of text.match(/\s+|\S+/gu)||[]){if(encoder.encode(chunk+word).length<=maxBytes){chunk+=word;continue;}if(chunk){parts.push(chunk);chunk='';}if(encoder.encode(word).length<=maxBytes){chunk=word;continue;}for(const ch of word){if(encoder.encode(chunk+ch).length>maxBytes){parts.push(chunk);chunk='';}chunk+=ch;}}
 if(chunk)parts.push(chunk);return parts;
}
export function validTranslationInput(v){return v&&['en','ml'].includes(v.source)&&['en','ml'].includes(v.target)&&v.source!==v.target&&typeof v.text==='string'&&v.text.trim().length>0&&v.text.length<=12000;}
export async function translateText(input,env,fetcher=fetch){
 if(!validTranslationInput(input))throw Error('Choose English or Malayalam and provide up to 12,000 characters.');
 const {text,source,target}=input;
 if(/^[\s\d\p{P}\p{S}]+$/u.test(text)||/^https?:\/\/\S+$/.test(text))return text;
 const provider=env.TRANSLATION_PROVIDER||'mymemory';
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(provider+'|'+source+'|'+target+'|'+text))),x=>x.toString(16).padStart(2,'0')).join('');
 if(env.DB){const cached=await env.DB.prepare('SELECT translated FROM translation_cache WHERE cache_key=?').bind(hash).first();if(cached)return cached.translated;}
 const translated=[];
 async function requestTranslation(url){
  for(let attempt=0;attempt<2;attempt++){
   let response;
   try{response=await fetcher(url.toString(),{signal:AbortSignal.timeout(20000),redirect:'manual',headers:{Accept:'application/json'}});}
   catch(error){if(attempt===0)continue;throw Error(error.name==='TimeoutError'||error.name==='AbortError'?'Translation timed out. Your original text is safe. Please try again.':'Could not connect to the translation service. Your original text is safe. Please try again.');}
   if((response.status===502||response.status===503||response.status===504)&&attempt===0)continue;
   if(response.status===429)throw Error('The translation service has reached its request limit. Your original text is safe. Please try again later.');
   if(!response.ok)throw Error('The translation service returned an error (HTTP '+response.status+'). Your original text is safe. Please try again later.');
   let result;try{result=await response.json();}catch{if(attempt===0)continue;throw Error('The translation service returned an unreadable response. Your original text is safe. Please try again.');}
   if(Number(result.responseStatus)!==200||result.quotaFinished){
    if(result.quotaFinished||[403,429].includes(Number(result.responseStatus)))throw Error('The free translation limit has been reached. Your original text is safe. Please try again after the limit resets.');
    throw Error('The translation service could not translate this text. Your original text is safe. Please try a shorter paragraph.');
   }
   return result.responseData?.translatedText;
  }
 }

 for(const part of splitTranslationText(text)){
 if(!part.trim()){translated.push(part);continue;}
 let value;
 if(provider==='cloudflare'){
 if(!env.AI)throw Error('Connect a Cloudflare AI binding to enable this translation provider.');
 const result=await env.AI.run('@cf/meta/m2m100-1.2b',{text:part.trim(),source_lang:source,target_lang:target});value=result.translated_text;
 }else{
 const url=new URL('https://api.mymemory.translated.net/get');url.searchParams.set('q',part.trim());url.searchParams.set('langpair',source+'|'+target);
 value=await requestTranslation(url);
 }
 if(typeof value!=='string'||!value.trim())throw Error('No translation was returned. Your original text has been kept.');
 // The renderer escapes all translated text; keep entities as returned rather than interpreting markup.
 translated.push((part.match(/^\s*/u)?.[0]||'')+value.trim()+(part.match(/\s*$/u)?.[0]||''));
 }
 const result=translated.join('');if(env.DB)await env.DB.prepare('INSERT OR REPLACE INTO translation_cache(cache_key,translated) VALUES(?,?)').bind(hash,result).run();return result;
}

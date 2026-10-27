// Photo optimisation runs in the browser. Only the resulting file is uploaded.
export async function optimiseCover(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPEG, PNG or WebP photo.');
 if(file.size>5*1024*1024)throw Error('Photo must be under 5 MB.');
 const bitmap=await createImageBitmap(file);try{
 if(bitmap.width*bitmap.height>40000000)throw Error('This photo is too large to process. Choose a smaller image.');
 const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const context=canvas.getContext('2d');if(!context)throw Error('Your browser could not prepare this photo.');context.drawImage(bitmap,0,0,canvas.width,canvas.height);
 const encode=quality=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Your browser could not compress this photo.')),'image/webp',quality));
 let result=await encode(.82);for(const quality of [.72,.62,.52]){if(result.size<=500*1024)break;result=await encode(quality);}
 if(result.type!=='image/webp')throw Error('Your browser does not support WebP photo optimisation. Try a current browser.');
 // Keep a tiny, already-optimised original if encoding would make it bigger.
 const resized=scale<1;if(!resized&&file.size<=result.size)return {file,originalBytes:file.size,uploadedBytes:file.size,width:bitmap.width,height:bitmap.height,optimised:false};
 return {file:new File([result],file.name.replace(/\.[^.]+$/,'')+'.webp',{type:'image/webp'}),originalBytes:file.size,uploadedBytes:result.size,width:canvas.width,height:canvas.height,optimised:true};
 }finally{bitmap.close();}
}
export const formatBytes=bytes=>bytes>=1048576?(bytes/1048576).toFixed(1)+' MB':Math.max(1,Math.round(bytes/1024))+' KB';

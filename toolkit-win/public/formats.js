import {FORMAT_OPTIONS,formatExtension} from './format-options.js';
const $=id=>document.getElementById(id),states={};let activeJob;
for(const kind of Object.keys(FORMAT_OPTIONS))states[kind]={message:'Choose a local file to convert.'};
function update(){
 for(const [kind,options]of Object.entries(FORMAT_OPTIONS)){
  for(const part of ['file','format','name'])$(`format-${kind}-${part}`).disabled=Boolean(activeJob);
  $(`format-${kind}-convert`).disabled=Boolean(activeJob)||!$(`format-${kind}-file`).files.length;
  $(`format-${kind}-cancel`).hidden=!activeJob;
  $(`format-${kind}-status`).textContent=activeJob&&activeJob.kind!==kind?`${FORMAT_OPTIONS[activeJob.kind].title} is converting. Wait or cancel the current conversion.`:states[kind].message;
 }
}
function outputName(kind){
 const original=$(`format-${kind}-file`).files[0]?.name||'file';
 return original.replace(/\.[^.]+$/,'')+'-converted.'+formatExtension(kind,$(`format-${kind}-format`).value);
}
for(const [kind,options]of Object.entries(FORMAT_OPTIONS)){
 const file=$(`format-${kind}-file`),format=$(`format-${kind}-format`),name=$(`format-${kind}-name`);
 file.accept=options.accept;
 for(const [value,label]of options.formats){const option=document.createElement('option');option.value=value;option.textContent=label;format.append(option);}
 file.addEventListener('change',()=>{
  name.value=outputName(kind);
  states[kind].message=file.files[0]?`Ready: ${file.files[0].name} · ${(file.files[0].size/1048576).toFixed(2)} MB`:'Choose a local file to convert.';update();
 });
 format.addEventListener('change',()=>{name.value=name.value.replace(/\.[^.]+$/,'')+'.'+formatExtension(kind,format.value);});
 $(`format-${kind}-cancel`).addEventListener('click',()=>activeJob?.controller.abort());
 $(`format-${kind}-convert`).addEventListener('click',async()=>{
  const input=file.files[0];if(!input||activeJob)return;
  if(input.size>options.limit*1024*1024){states[kind].message=`Choose a ${kind} file up to ${options.limit} MB.`;update();return;}
  const view=history.state?.toolkitView;if(!view){states[kind].message='The toolkit is still connecting. Try again shortly.';update();return;}
  const target=format.value,controller=new AbortController();activeJob={kind,controller};states[kind].message=`Converting ${input.name} to ${target.toUpperCase()}…`;update();
  try{
   const response=await fetch(`/api/formats/convert?kind=${kind}&format=${target}`,{method:'POST',headers:{'X-Toolkit-View':view,'Content-Type':'application/octet-stream'},body:input,signal:controller.signal});
   if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'Conversion failed.');}
   let filename=name.value.trim().replace(/[\\/]/g,'_')||outputName(kind);
   const extension=formatExtension(kind,target);
   if(!filename.toLowerCase().endsWith('.'+extension))filename+='.'+extension;
   if(filename.toLowerCase()===input.name.toLowerCase())filename=outputName(kind);
   const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
   states[kind].message=`Downloaded ${filename}. Original file unchanged.`;
  }catch(error){states[kind].message=error.name==='AbortError'?'Cancelled.':error.message;}
  finally{activeJob=null;update();}
 });
}
update();

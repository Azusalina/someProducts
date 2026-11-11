const $=id=>document.getElementById(id);
let busy=false,controller,generation=0,paintVersion=0,blobUrl,library,loading,pdf,rendering,pageNumber=1;
const source=()=>$('office-file').files[0];
const extension=()=>source()?.name.split('.').pop().toLowerCase();
const spreadsheet=()=>['xls','xlsx'].includes(extension());
function status(message){$('office-status').textContent=message;}
function name(){
  const fallback=(source()?.name.replace(/\.[^.]+$/,'')||'converted')+'.pdf';
  let result=$('office-name').value.trim().replace(/[\\/\x00-\x1f\x7f]/g,'_').slice(0,180)||fallback;
  if(!/\.pdf$/i.test(result))result+='.pdf';
  return result;
}
function update(){
  $('office-file').disabled=busy;$('office-name').disabled=busy;$('office-layout').disabled=busy;
  $('office-convert').disabled=busy||!source();$('office-save').disabled=busy||!blobUrl;
  $('office-cancel').hidden=!busy;$('office-layout-controls').hidden=!spreadsheet();
  $('office-layout-note').hidden=!spreadsheet()||$('office-layout').value!=='single';
  $('office-previous').disabled=!pdf||pageNumber<=1;
  $('office-next').disabled=!pdf||pageNumber>=pdf.numPages;
}
function clearPreview(){
  paintVersion++;rendering?.cancel();rendering=null;
  loading?.destroy().catch(()=>{});loading=null;pdf=null;
  if(blobUrl)URL.revokeObjectURL(blobUrl);blobUrl=null;
  $('office-canvas').replaceChildren();$('office-pagination').hidden=true;$('office-open').hidden=true;
  $('office-page').textContent='';update();
}
async function paint(version=generation){
  const document=pdf;if(!document)return;
  const turn=++paintVersion,number=pageNumber;
  rendering?.cancel();
  const page=await document.getPage(number);
  if(version!==generation||turn!==paintVersion)return;
  const width=Math.max(200,$('office-canvas').clientWidth-24),natural=page.getViewport({scale:1});
  const viewport=page.getViewport({scale:Math.min(2,width/natural.width)}),ratio=Math.min(2,devicePixelRatio||1);
  const canvas=window.document.createElement('canvas');
  canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);
  canvas.style.width=`${viewport.width}px`;canvas.style.height=`${viewport.height}px`;
  canvas.setAttribute('aria-label',`PDF page ${number} of ${document.numPages}`);
  const task=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0]});rendering=task;
  try{await task.promise;}catch(error){if(error.name==='RenderingCancelledException')return;throw error;}
  if(version!==generation||turn!==paintVersion)return;
  $('office-canvas').replaceChildren(canvas);$('office-page').textContent=`Page ${number} of ${document.numPages}`;update();
}
async function preview(blob,version){
  if(!library){library=await import('/lib/pdfjs/pdf.mjs');library.GlobalWorkerOptions.workerSrc='/lib/pdfjs/pdf.worker.mjs';}
  if(version!==generation)return;
  const data=new Uint8Array(await blob.arrayBuffer());
  if(version!==generation)return;
  loading=library.getDocument({data,isEvalSupported:false,useSystemFonts:false,cMapUrl:'/lib/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/lib/pdfjs/standard_fonts/',wasmUrl:'/lib/pdfjs/wasm/'});
  const next=await loading.promise;
  if(version!==generation){await next.destroy();return;}
  pdf=next;pageNumber=1;$('office-pagination').hidden=false;await paint(version);
}
$('office-file').addEventListener('change',()=>{
  generation++;controller?.abort();clearPreview();
  $('office-name').value=(source()?.name.replace(/\.[^.]+$/,'')||'converted')+'.pdf';
  $('office-layout').value='print';status(source()?`Ready: ${source().name}`:'Choose a Word or Excel file.');update();
});
$('office-layout').addEventListener('change',()=>{generation++;clearPreview();status('Layout changed. Convert again to preview.');});
$('office-convert').addEventListener('click',async()=>{
  const file=source();if(!file||busy)return;
  const format=extension();
  if(!['doc','docx','xls','xlsx'].includes(format)){status('Choose a DOC, DOCX, XLS or XLSX file.');return;}
  if(file.size>100*1024*1024){status('Choose an Office file up to 100 MB.');return;}
  const view=history.state?.toolkitView;if(!view){status('The toolkit is still connecting. Try again shortly.');return;}
  const version=++generation;clearPreview();busy=true;controller=new AbortController();update();status('Converting to PDF…');
  try {
    const sheets=spreadsheet()?$('office-layout').value:'print';
    const response=await fetch(`/api/office/convert?extension=${format}&sheets=${sheets}`,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Toolkit-View':view},body:file,signal:controller.signal});
    if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||`Conversion failed (HTTP ${response.status}).`);}
    const blob=await response.blob();if(version!==generation)return;
    blobUrl=URL.createObjectURL(blob);$('office-open').href=blobUrl;$('office-open').hidden=false;
    try{await preview(blob,version);if(version===generation)status(`Ready · ${pdf.numPages} page${pdf.numPages===1?'':'s'}.`);}
    catch(error){if(version===generation)status(`PDF ready. Preview unavailable: ${error.message}. Use Download PDF or Open PDF.`);}
  }catch(error){if(version===generation)status(error.name==='AbortError'?'Cancelled.':error.message);}
  finally{busy=false;update();}
});
$('office-cancel').addEventListener('click',()=>controller?.abort());
$('office-save').addEventListener('click',()=>{
  if(!blobUrl)return;
  const link=document.createElement('a');link.href=blobUrl;link.download=name();document.body.append(link);link.click();link.remove();
});
for(const [id,delta]of [['office-previous',-1],['office-next',1]])$(id).addEventListener('click',()=>{
  if(!pdf)return;pageNumber=Math.max(1,Math.min(pdf.numPages,pageNumber+delta));update();paint().catch(error=>status(error.message));
});
let resizeTimer,lastWidth=0;
new ResizeObserver(()=>{
  const width=$('office-canvas').clientWidth;if(!width||width===lastWidth)return;lastWidth=width;
  clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(pdf&&!$('office-workspace').hidden)paint().catch(()=>{});},100);
}).observe($('office-canvas'));
window.addEventListener('pagehide',()=>controller?.abort());
update();

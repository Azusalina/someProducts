const $=id=>document.getElementById(id);
let markdown='',outputName='converted.md',busy=false,controller;
function update(){
 $('pdfmd-file').disabled=busy;
 $('pdfmd-convert').disabled=busy||!$('pdfmd-file').files.length;
 $('pdfmd-download').disabled=busy||!markdown;
 $('pdfmd-cancel').hidden=!busy;
}
$('pdfmd-file').addEventListener('change',()=>{
 markdown='';$('pdfmd-output').textContent='';$('pdfmd-status').textContent='Ready to convert the selected PDF.';update();
});
$('pdfmd-convert').addEventListener('click',async()=>{
 const file=$('pdfmd-file').files[0];if(!file||busy)return;
 if(file.size>25*1024*1024){$('pdfmd-status').textContent='Choose a PDF up to 25 MB.';return;}
 const view=history.state?.toolkitView;if(!view){$('pdfmd-status').textContent='The toolkit is still connecting. Try again shortly.';return;}
 busy=true;controller=new AbortController();update();$('pdfmd-status').textContent='Converting PDF with MarkItDown…';
 try{
  const response=await fetch('/api/pdfmd/convert',{method:'POST',headers:{'Content-Type':'application/pdf','X-Toolkit-View':view},body:file,signal:controller.signal});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'PDF conversion failed.');
  markdown=data.markdown;outputName=file.name.replace(/\.pdf$/i,'')+'.md';
  $('pdfmd-output').textContent=markdown;
  $('pdfmd-status').textContent=`Converted ${file.name} · ${data.converter} ${data.version}. Review the text, then download ${outputName}.`;
 }catch(error){$('pdfmd-status').textContent=error.name==='AbortError'?'Cancelled.':error.message;}
 finally{busy=false;update();}
});
$('pdfmd-download').addEventListener('click',()=>{
 if(!markdown)return;
 const url=URL.createObjectURL(new Blob([markdown],{type:'text/markdown;charset=utf-8'})),link=document.createElement('a');
 link.href=url;link.download=outputName;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
});
$('pdfmd-cancel').addEventListener('click',()=>controller?.abort());
update();

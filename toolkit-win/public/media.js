const $ = id => document.getElementById(id);
let items=[], busy=false, controller;
function status(text) { $('media-status').textContent=text; }
function selected() { return [...$('media-list').querySelectorAll('input:checked')].map(input=>input.value); }
function update() {
  $('media-scan').disabled=busy;
  $('media-url').disabled=busy;
  $('media-options').disabled=busy;
  $('media-local').disabled=busy;
  $('media-select-all').disabled=busy||!items.length;
  $('media-select-none').disabled=busy||!items.length;
  $('media-download').disabled=busy||!selected().length;
  $('media-convert').disabled=busy||!$('media-local-file').files.length;
  $('media-cancel').hidden=!busy;
}
async function request(url, body, binary=false) {
  const view=history.state?.toolkitView;
  if(!view)throw new Error('The page is still connecting. Try again shortly.');
  const response=await fetch(url,{method:'POST',headers:{'X-Toolkit-View':view,...binary?{}:{'Content-Type':'application/json'}},body:binary?body:JSON.stringify(body),signal:controller.signal});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'Media processing failed.');}
  return response;
}
async function action(message, fn) {
  if(busy)return;
  busy=true;controller=new AbortController();update();status(message);
  try{await fn();}catch(error){status(error.name==='AbortError'?'Cancelled.':error.message);}
  finally{busy=false;update();}
}
function render() {
  $('media-list').replaceChildren();
  for(const item of items) {
    const row=document.createElement('li'),label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');
    input.type='checkbox';input.value=item.id;input.checked=true;input.addEventListener('change',update);
    const duration=Number.isFinite(item.duration)?` · ${Math.floor(item.duration/60)}:${String(Math.floor(item.duration%60)).padStart(2,'0')}`:'';
    text.textContent=`${item.title} · ${item.kind}${duration}`;
    label.append(input,text);row.append(label);$('media-list').append(row);
  }
  update();
}
async function download(response, fallback) {
  const header=response.headers.get('Content-Disposition')||'';
  const encoded=header.match(/filename\*=UTF-8''([^;]+)/i);
  let name=fallback;try{if(encoded)name=decodeURIComponent(encoded[1]);}catch{}
  const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');
  link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
  status(`Downloaded ${name}.`);
}
$('media-scan-form').addEventListener('submit',event=>{
  event.preventDefault();
  action('Finding audio and video items…',async()=>{
    const response=await request('/api/media/scan',{url:$('media-url').value.trim()});
    items=(await response.json()).items;$('media-list-source').textContent=`Results from ${$('media-url').value.trim()}`;render();status(`Found ${items.length} media item${items.length===1?'':'s'}. Select up to 20 to download.`);
  });
});
$('media-select-all').addEventListener('click',()=>{for(const input of $('media-list').querySelectorAll('input'))input.checked=true;update();});
$('media-select-none').addEventListener('click',()=>{for(const input of $('media-list').querySelectorAll('input'))input.checked=false;update();});
$('media-download').addEventListener('click',()=>{
  const ids=selected();
  if(ids.length>20){status('Select at most 20 media items per download.');return;}
  action(`Downloading and extracting ${ids.length} audio file${ids.length===1?'':'s'}…`,async()=>download(await request('/api/media/audio',{ids,format:$('media-format').value}),ids.length>1?'selected-audio.zip':'audio'));
});
$('media-local-file').addEventListener('change',update);
$('media-convert').addEventListener('click',()=>{
  const file=$('media-local-file').files[0];if(!file)return;
  if(file.size>100*1024*1024){status('Choose an audio file up to 100 MB.');return;}
  const format=$('media-local-format').value;
  action(`Converting ${file.name} to ${format.toUpperCase()}…`,async()=>download(await request(`/api/media/convert?format=${format}`,file,true),`converted.${format}`));
});
$('media-cancel').addEventListener('click',()=>controller?.abort());
update();

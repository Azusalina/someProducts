const $ = id => document.getElementById(id);
let items=[], busy=false, controller, urlTask=false, cancellation;
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
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||`Media request failed (HTTP ${response.status}).`);}
  return response;
}
async function action(message, fn) {
  if(busy)return;
  busy=true;controller=new AbortController();update();status(message);
  try{await fn();}catch(error){if(urlTask&&error.name!=='AbortError')$('media-resume').hidden=false;status(error.name==='AbortError'?'Cancelled.':error.message);}
  finally{await cancellation;cancellation=null;urlTask=false;busy=false;update();}
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
async function taskStatus() {
  const response=await fetch('/api/media/status',{headers:{'X-Toolkit-View':history.state?.toolkitView},signal:controller.signal});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||`Status request failed (HTTP ${response.status}).`);
  return data;
}
function wait(ms) {
  return new Promise((resolve,reject)=>{
    const stop=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};
    const timer=setTimeout(()=>{controller.signal.removeEventListener('abort',stop);resolve();},ms);
    controller.signal.addEventListener('abort',stop,{once:true});
    if(controller.signal.aborted)stop();
  });
}
function progressText(job) {
  const p=job.progress;if(!p)return job.message;
  const mib=bytes=>(bytes/1024/1024).toFixed(1)+' MiB';
  let text=job.message+` · ${p.item||1}/${p.total||1}`;
  if(p.stage==='downloading'&&p.downloaded!=null){
    text+=' · '+mib(p.downloaded);
    if(p.bytes>0)text+=` / ${mib(p.bytes)} (${Math.min(100,Math.floor(100*p.downloaded/p.bytes))}%)`;
    if(p.speed>0)text+=' · '+mib(p.speed)+'/s';
  }
  return text;
}
async function followTask(job) {
  let failures=0;
  while(job.state==='working') {
    status(progressText(job));await wait(1000);
    try{job=await taskStatus();failures=0;}
    catch(error){
      if(error.name==='AbortError')throw error;
      if(++failures>=5){$('media-resume').hidden=false;throw new Error('Progress connection interrupted. Use Check progress to reconnect to the running task.');}
      status('Reconnecting to audio task…');await wait(Math.min(8000,1000*2**failures));
    }
  }
  if(job.state==='error'||job.state==='expired')throw new Error(job.message);
  if(job.state!=='ready')throw new Error('No active audio task. Select audio and download again.');
  const link=$('media-result');link.href=job.link;link.download=job.filename;link.hidden=false;
  link.textContent=`Download ${job.filename}`;
  status(`Ready · ${(job.bytes/1024/1024).toFixed(1)} MiB · download link available for 15 minutes.`);
  link.click();
}
$('media-download').addEventListener('click',()=>{
  const ids=selected();
  if(ids.length>20){status('Select at most 20 media items per download.');return;}
  action('Starting audio task…',async()=>{
    urlTask=true;$('media-result').hidden=true;$('media-resume').hidden=true;
    await followTask(await(await request('/api/media/start',{ids,format:$('media-format').value})).json());
  });
});
$('media-resume').addEventListener('click',()=>action('Reconnecting to audio task…',async()=>{
  urlTask=true;$('media-resume').hidden=true;await followTask(await taskStatus());
}));
$('media-local-file').addEventListener('change',update);
$('media-convert').addEventListener('click',()=>{
  const file=$('media-local-file').files[0];if(!file)return;
  if(file.size>100*1024*1024){status('Choose an audio file up to 100 MB.');return;}
  const format=$('media-local-format').value;
  action(`Converting ${file.name} to ${format.toUpperCase()}…`,async()=>download(await request(`/api/media/convert?format=${format}`,file,true),`converted.${format}`));
});
$('media-cancel').addEventListener('click',()=>{
  controller?.abort();
  if(urlTask)cancellation=fetch('/api/media/cancel',{method:'POST',headers:{'X-Toolkit-View':history.state?.toolkitView}})
    .then(response=>{if(!response.ok)throw new Error('Cancel failed. Use Check progress to reconnect.');})
    .catch(error=>{$('media-resume').hidden=false;status(error.message);});
});
update();

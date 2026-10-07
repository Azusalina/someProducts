import {getLanguage,translate,t,dayText,timeText} from './i18n.js';
import {buildTrack,hkDay,geojson,gpx} from './geometry.js';
import {FootprintMap} from './map.js';
const $ = id=>document.getElementById(id), map=new FootprintMap($('map'));
const state={overview:{days:[],devices:[],count:0,notes:{},max_id:0,last_sync:null},day:null,raw:[],sample:false,sampleAll:[],track:buildTrack([]),online:true};
const csrf=document.querySelector('meta[name=track-csrf]').content;
let controller=null,requestNumber=0,frame=0,playing=false,toastTimer=null,setup=null,generating=false,generationDeadline=0,generationStatus=null;
async function api(url,options={}) {
 const response=await fetch(url,{cache:'no-store',...options});
 if(!response.ok)throw new Error(`Request failed: ${response.status}`);
 return response.json();
}
function toast(key){$('toast').textContent=t(key);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
function status(){
 $('sync-dot').className='status-dot'+(!state.online?' error':state.overview.last_sync?' ready':'');
 $('sync-text').textContent=!state.online?t('disconnected'):state.overview.last_sync?`${t('synced')} ${timeText(state.overview.last_sync,true)}`:t('waiting');
 $('setup-result').classList.toggle('ready',Boolean(state.overview.last_sync));
 $('setup-result').textContent=state.overview.last_sync?t('statusReceived',{count:state.overview.count,time:timeText(state.overview.last_sync,true)}):t('firstSync');
}
function overviewForSample(){
 const days=new Map();for(const p of state.sampleAll){const day=hkDay(p.ms);days.set(day,(days.get(day)||0)+1);}
 return {days:[...days].sort(([a],[b])=>b.localeCompare(a)).map(([day,count])=>({day,count})),devices:[{key:'sample',name:'Sample iPhone'}],count:state.sampleAll.length,notes:{}};
}
function navigation(){
 const overview=state.sample?overviewForSample():state.overview;
 $('day-count').textContent=overview.days.length;$('points-count').textContent=overview.count.toLocaleString(getLanguage());
 $('all-days').classList.toggle('active',state.day===null);$('day-list').replaceChildren();
 if(!overview.days.length){const p=document.createElement('p');p.className='no-days';p.textContent=t('noDays');$('day-list').append(p);}
 for(const {day} of overview.days){
  const button=document.createElement('button');button.className='day-button'+(state.day===day?' active':'');button.dataset.day=day;
  const text=document.createElement('span');text.textContent=dayText(day,{year:'numeric'});const weekday=document.createElement('span');weekday.className='day-weekday';weekday.textContent=dayText(day,{weekday:'long',month:undefined,day:undefined});text.append(weekday);
  const dot=document.createElement('span');dot.className='day-dot';dot.setAttribute('aria-hidden','true');button.append(text,dot);button.setAttribute('aria-pressed',String(state.day===day));button.addEventListener('click',()=>selectDay(day));$('day-list').append(button);
 }
 const selected=$('device').value;$('device').replaceChildren();const all=document.createElement('option');all.value='';all.textContent=t('allDevices');$('device').append(all);
 for(const device of overview.devices){const option=document.createElement('option');option.value=device.key;option.textContent=device.name;$('device').append(option);}
 $('device').value=[...$('device').options].some(o=>o.value===selected)?selected:'';
}
function render(){
 const tr=state.track;$('sample-banner').hidden=!state.sample;
 $('view-title').textContent=state.day?dayText(state.day,{year:'numeric'}):t('title');
 $('view-label').textContent=t(state.day?'dayLabel':'atlas');$('view-subtitle').textContent=t(state.day?'daySubtitle':'intro');
 $('distance').textContent=(tr.meters/1000).toFixed(2);$('moving').textContent=tr.seconds>=3600?(tr.seconds/3600).toFixed(1):Math.round(tr.seconds/60);$('moving-unit').textContent=t(tr.seconds>=3600?'hours':'min');
 $('point-stat').textContent=state.raw.length.toLocaleString(getLanguage());$('segment-stat').textContent=tr.segments.length;
 $('quality-note').textContent=state.raw.length?t('quality',{kept:tr.points.length,excluded:tr.excluded,gaps:tr.gaps}):'';
 $('empty-state').hidden=Boolean(tr.points.length);const filtered=Boolean(state.raw.length||state.overview.count||state.sample);
 $('empty-state').querySelector('h2').textContent=t(filtered?'filteredEmpty':'emptyTitle');$('empty-state').querySelector('p').textContent=t(filtered?'filteredText':'emptyText');
 $('empty-connect').hidden=filtered;$('sample-open').hidden=filtered;
 $('replay-button').disabled=tr.points.length<2;$('replay-slider').disabled=tr.points.length<2;$('export-open').disabled=!tr.points.length;
 $('backup').disabled=state.sample||!state.overview.batches;$('note-section').hidden=!state.day;$('save-note').disabled=state.sample;
 replayTime();status();
}
function refreshTrack(){stopReplay();const accuracy=$('accuracy').value;state.track=buildTrack(state.raw,accuracy==='all'?Infinity:Number(accuracy));map.setTrack(state.track,Boolean(state.day));$('replay-slider').value=1000;render();}
async function loadPoints({fit=false}={}) {
 const number=++requestNumber;controller?.abort();controller=new AbortController();stopReplay();$('loading').hidden=false;
 try{
  let points=[];
  if(state.sample){points=state.sampleAll.filter(p=>(!state.day||hkDay(p.ms)===state.day)&&(!$('device').value||p.device_key===$('device').value));}
  else{
   let after=0,more=true;const through=state.overview.max_id;
   while(more){const params=new URLSearchParams({after,through});if(state.day)params.set('day',state.day);if($('device').value)params.set('device',$('device').value);
    const page=await api(`/api/points?${params}`,{signal:controller.signal});points.push(...page.points);more=page.more;after=page.after;}
  }
  if(number!==requestNumber)return;state.raw=points;refreshTrack();navigation();
  if(fit&&points.length)map.fit();
 }catch(error){if(error.name!=='AbortError')toast('error');}
 finally{if(number===requestNumber)$('loading').hidden=true;}
}
async function selectDay(day){state.day=day;$('day-note').value=state.sample?'':state.overview.notes[day]||'';navigation();await loadPoints({fit:Boolean(day)});}
async function poll(first=false){
 try{const overview=await api('/api/overview');const changed=overview.max_id!==state.overview.max_id;state.overview=overview;state.online=true;
  if(!state.sample){navigation();if(first||changed)await loadPoints();}
  status();
 }catch{state.online=false;status();}
}
function replayTime(){const points=state.track.points;const position=Math.min(points.length-1,Math.floor(Number($('replay-slider').value)/1000*Math.max(0,points.length-1)));$('replay-time').textContent=points.length?timeText(points[position].ms,!state.day):'—';}
function stopReplay(){playing=false;cancelAnimationFrame(frame);$('replay-button').textContent='▶';$('replay-button').setAttribute('aria-label',t('play'));}
function startReplay(){
 if(playing){stopReplay();return;}
 if(state.track.points.length<2)return;
 if(Number($('replay-slider').value)>=1000)$('replay-slider').value=0;
 playing=true;$('replay-button').textContent='Ⅱ';$('replay-button').setAttribute('aria-label',t('pause'));
 const started=performance.now(),from=Number($('replay-slider').value),duration=Number($('replay-speed').value)*1000;
 const animate=now=>{const value=Math.min(1000,from+(now-started)/duration*1000);$('replay-slider').value=Math.round(value);map.progress=value/1000;map.draw();replayTime();if(value<1000&&playing)frame=requestAnimationFrame(animate);else stopReplay();};frame=requestAnimationFrame(animate);
}
async function copy(value){try{await navigator.clipboard.writeText(value);toast('copied');}catch{toast('copyFailed');}}
function qr(element,value){const code=window.qrcode(0,'M');code.addData(value);code.make();element.src=code.createDataURL(4,16);}
function setupView(){
 const relay=setup.relay_enabled, ready=!relay||setup.relay_active||setup.relay_mode==='named';
 if((generating||generationStatus==='relayTimeout'||generationStatus==='relayBusy')&&setup.relay_active){generating=false;generationStatus='relayGenerated';}
 else if(generating&&Date.now()>generationDeadline){generating=false;generationStatus='relayTimeout';}
 const busy=generating||setup.relay_generating;
 $('generate-relay').disabled=busy||setup.relay_mode==='named';
 $('generate-relay').dataset.i18n=busy?'relayGenerating':setup.relay_active?'relayRegenerate':'relayGenerate';
 $('generate-relay').textContent=t($('generate-relay').dataset.i18n);
 $('relay-generate-status').textContent=busy?t('relayGenerating'):generationStatus?t(generationStatus):'';
 $('certificate-step').hidden=relay;$('relay-notice').hidden=!relay;
 $('relay-notice').dataset.i18n=setup.relay_active?(setup.relay_mode==='named'?'relayFixed':'relayNotice'):'relayPending';
 $('relay-notice').textContent=t($('relay-notice').dataset.i18n);
 document.querySelector('#setup-dialog [data-i18n=setupIntro]').hidden=relay;
 $('profile-url').textContent=setup.profile;$('receiver-url').textContent=setup.receiver||t('relayPending');
 $('fingerprint').textContent=setup.fingerprint;$('data-dir').textContent=setup.data_dir;
 $('access-token').value=setup.token;
 $('overland-qr').hidden=!ready;$('copy-receiver').disabled=!ready;
 if(ready&&setup.overland_url)qr($('overland-qr'),setup.overland_url);
 qr($('cert-qr'),setup.profile);status();
}
async function connect(){
 try{setup=await api('/api/setup');$('access-token').type='password';$('show-token').textContent=t('show');setupView();$('setup-dialog').showModal();}catch{toast('error');}
}
setInterval(async()=>{if($('setup-dialog').open&&document.visibilityState==='visible'){try{setup=await api('/api/setup');setupView();}catch{}}},5000);
function download(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function exportTrace(format){const note=state.day&&!state.sample?state.overview.notes[state.day]||'':'';
 const text=format==='gpx'?gpx(state.track,note):JSON.stringify(geojson(state.track,note),null,2);
 download(new Blob([text],{type:format==='gpx'?'application/gpx+xml':'application/geo+json'}),`${state.sample?'sample-':''}track-${state.day||'all'}.${format}`);$('export-dialog').close();toast('downloaded');
}
$('theme').value=window.TrackTheme.get();
$('theme').addEventListener('change',()=>window.TrackTheme.set($('theme').value));
window.addEventListener('track-theme-change',()=>map.draw());
$('language').addEventListener('change',()=>{translate($('language').value);if(setup)setupView();navigation();render();map.draw();$('show-token').textContent=t($('access-token').type==='password'?'show':'hide');});
$('all-days').addEventListener('click',()=>selectDay(null));$('device').addEventListener('change',()=>loadPoints({fit:true}));$('accuracy').addEventListener('change',refreshTrack);
$('zoom-in').addEventListener('click',()=>map.zoom(1.5));$('zoom-out').addEventListener('click',()=>map.zoom(1/1.5));$('island-view').addEventListener('click',()=>map.island());$('fit-view').addEventListener('click',()=>{if(!map.fit())toast('noPoints');});
$('replay-button').addEventListener('click',startReplay);$('replay-slider').addEventListener('input',()=>{stopReplay();map.progress=Number($('replay-slider').value)/1000;map.draw();replayTime();});$('replay-speed').addEventListener('change',stopReplay);
$('generate-relay').addEventListener('click',async()=>{
 if(generating)return;
 generating=true;generationStatus=null;generationDeadline=Date.now()+120000;
 $('generate-relay').disabled=true;$('relay-generate-status').textContent=t('relayGenerating');
 try{
  const response=await fetch('/api/relay',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Track-CSRF':csrf},body:JSON.stringify({generate:true})});
  if(!response.ok){const error=await response.json();generationStatus=['relayMissing','relayBusy'].includes(error.code)?error.code:'error';generating=false;}
  setup=await api('/api/setup');setupView();
 }catch{generating=false;generationStatus='error';setupView();}
});
$('connect').addEventListener('click',connect);$('empty-connect').addEventListener('click',connect);
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$ (button.dataset.close).close()));
$('copy-profile').addEventListener('click',()=>copy(setup.profile));$('copy-receiver').addEventListener('click',()=>copy(setup.receiver));$('copy-token').addEventListener('click',()=>copy(setup.token));
$('show-token').addEventListener('click',()=>{const show=$('access-token').type==='password';$('access-token').type=show?'text':'password';$('show-token').textContent=t(show?'hide':'show');});
$('sample-open').addEventListener('click',async()=>{try{const data=await api('/api/sample');state.sample=true;state.sampleAll=data.points;state.day=null;$('device').value='';navigation();await loadPoints({fit:true});}catch{toast('error');}});
$('sample-exit').addEventListener('click',async()=>{state.sample=false;state.day=null;$('device').value='';navigation();await loadPoints();map.island();});
$('export-open').addEventListener('click',()=>$('export-dialog').showModal());$('export-geojson').addEventListener('click',()=>exportTrace('geojson'));$('export-gpx').addEventListener('click',()=>exportTrace('gpx'));
$('backup').addEventListener('click',async()=>{try{const response=await fetch('/api/backup',{cache:'no-store'});if(!response.ok)throw new Error();download(await response.blob(),`track-backup-${hkDay(Date.now())}.sqlite3`);toast('backupDone');}catch{toast('error');}});
$('save-note').addEventListener('click',async()=>{if(state.sample){toast('noteSample');return;}const day=state.day;if(!day)return;try{const text=$('day-note').value;await api('/api/note',{method:'POST',headers:{'Content-Type':'application/json','X-Track-CSRF':csrf},body:JSON.stringify({day,text})});state.overview.notes[day]=text.trim();toast('noteSaved');}catch{toast('error');}});
translate();navigation();render();await poll(true);setInterval(()=>{if(document.visibilityState==='visible')poll();},5000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')poll();else stopReplay();});

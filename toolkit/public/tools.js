import {TOOL_PREFS_KEY,normalizeTools} from './tool-preferences.js';
const tools=[
 ['markdown-tab','Markdown to PDF','markdown'],
 ['pdfmd-tab','PDF to Markdown','pdfmd'],
 ['pdf-pages-tab','PDF pages','pdf'],
 ['photos-tab','Photos to PDF','photos'],
 ['media-tab','URL audio','media'],
 ['omr-tab','OMR scan','omr'],
];
const ids=tools.map(([id])=>id),$=id=>document.getElementById(id);
let active='markdown-tab',preferences;
function load(){try{return normalizeTools(JSON.parse(localStorage.getItem(TOOL_PREFS_KEY)),ids);}catch{return normalizeTools(null,ids);}}
function activate(id){
 const chosen=tools.find(tool=>tool[0]===id);if(!chosen)return;
 const [,title,mode]=chosen;active=id;
 for(const [button,,kind] of tools){
  if(kind!=='markdown')document.body.classList.toggle(`${kind}-mode`,kind===mode);
  const section=$(kind==='pdf'?'pdf-pages-workspace':kind==='markdown'?'markdown-workspace':`${kind}-workspace`);
  section.hidden=kind!==mode;
  $(button).setAttribute('aria-pressed',String(button===id));
 }
 $('tool-title').textContent=title;
}
function renderNav(){
 for(const id of preferences.order){$(id).hidden=preferences.hidden.includes(id);$('tool-buttons').append($(id));}
 if(preferences.hidden.includes(active))activate(preferences.order.find(id=>!preferences.hidden.includes(id)));
}
function persist(){
 preferences=normalizeTools(preferences,ids);
 try{localStorage.setItem(TOOL_PREFS_KEY,JSON.stringify(preferences));$('tools-save-status').textContent='Changes saved in this browser.';}
 catch{$('tools-save-status').textContent='Changes apply to this page; this browser blocked saving preferences.';}
 renderNav();
}
function renderDialog(focus){
 const list=$('tools-list');list.replaceChildren();
 for(const [index,id] of preferences.order.entries()){
  const tool=tools.find(tool=>tool[0]===id),row=document.createElement('li'),label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');
  input.type='checkbox';input.checked=!preferences.hidden.includes(id);input.dataset.control=`show-${id}`;
  input.disabled=input.checked&&preferences.hidden.length===tools.length-1;
  text.textContent=tool[1];label.append(input,text);row.append(label);
  input.addEventListener('change',()=>{
   if(input.checked)preferences.hidden=preferences.hidden.filter(hidden=>hidden!==id);else preferences.hidden.push(id);
   persist();renderDialog(`show-${id}`);
  });
  for(const [title,direction,disabled] of [['earlier',-1,index===0],['later',1,index===tools.length-1]]){
   const button=document.createElement('button');button.type='button';button.textContent=direction===-1?'↑':'↓';
   button.setAttribute('aria-label',`Move ${tool[1]} ${title}`);button.dataset.control=`${title}-${id}`;button.disabled=disabled;
   button.addEventListener('click',()=>{
    [preferences.order[index],preferences.order[index+direction]]=[preferences.order[index+direction],preferences.order[index]];
    persist();renderDialog(`${title}-${id}`);
   });row.append(button);
  }
  list.append(row);
 }
 if(focus)list.querySelector(`[data-control="${focus}"]`)?.focus();
}
for(const [id]of tools)$(id).addEventListener('click',()=>activate(id));
$('tools-customize').addEventListener('click',()=>{renderDialog();$('tools-dialog').showModal();});
$('tools-done').addEventListener('click',()=>$('tools-dialog').close());
$('tools-reset').addEventListener('click',()=>{preferences=normalizeTools(null,ids);persist();renderDialog();});
window.addEventListener('storage',event=>{if(event.key===TOOL_PREFS_KEY||event.key===null){preferences=load();renderNav();if($('tools-dialog').open)renderDialog();}});
preferences=load();renderNav();activate(preferences.order.find(id=>!preferences.hidden.includes(id)));

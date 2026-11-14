const focusLine=document.getElementById('focus-line'),focusYear=document.getElementById('focus-year');
const axisInputs=['x-min','x-max','y-min','y-max'].map(id=>document.getElementById(id));
let viewport=null;
function defaultViewport(){return [minYear,DATA.year+0.9,
  Math.min(0,...forecasts.map(f=>Math.floor(f.PredictionLow/10)*10)),
  Math.max(100,...forecasts.map(f=>Math.ceil(f.PredictionHigh/10)*10))]}
function currentViewport(){return viewport||defaultViewport()}
function syncViewport(){currentViewport().forEach((v,i)=>axisInputs[i].value=Number(v.toFixed(6)))}
function applyViewport(){
  const values=axisInputs.map(input=>input.valueAsNumber);
  const valid=values.every(Number.isFinite)&&[values[1]-values[0],values[3]-values[2]].every(span=>Number.isFinite(span)&&span>=0.1&&span<=1000000);
  document.getElementById('view-error').textContent=valid?'':'Enter finite bounds with an axis span between 0.1 and 1,000,000.';
  axisInputs.forEach(input=>input.setAttribute('aria-invalid',String(!valid)));
  if(valid){viewport=values;render()}
}
axisInputs.forEach(input=>input.addEventListener('change',applyViewport));
for(const series of DATA.series){for(const grade of DATA.grades){
  const option=document.createElement('option');option.value=JSON.stringify([grade,series]);
  option.textContent=`${grade} · ${DATA.labels[series]}`;focusLine.append(option);
}}
for(const year of [...new Set([...observed.map(d=>d.year),DATA.year])].sort((a,b)=>a-b)){
  const option=document.createElement('option');option.value=year;option.textContent=String(year);focusYear.append(option);
}
function changeFocus(){
  if(focusLine.value){
    const [grade]=JSON.parse(focusLine.value);hidden.delete(grade);
    document.querySelectorAll('.grade-button').forEach(button=>button.setAttribute('aria-pressed',String(!hidden.has(button.textContent))));
  }
  // Keep a chosen year visible after a zoom, preserving the current X span.
  if(focusYear.value){const year=Number(focusYear.value),v=currentViewport();
    if(year<v[0]||year>v[1]){const half=(v[1]-v[0])/2;viewport=[year-half,year+half,v[2],v[3]]}
  }
  render();
}
focusLine.addEventListener('change',changeFocus);focusYear.addEventListener('change',changeFocus);
document.getElementById('clear-focus').addEventListener('click',()=>{focusLine.value='';focusYear.value='';render()});
document.getElementById('reset-view').addEventListener('click',()=>{
  viewport=null;document.getElementById('view-error').textContent='';axisInputs.forEach(input=>input.removeAttribute('aria-invalid'));render();
});
function focusOpacity(grade,series,year=null){
  const selected=focusLine.value?JSON.parse(focusLine.value):null;
  if(selected&&(selected[0]!==grade||selected[1]!==series))return 0.12;
  if(focusYear.value&&(year===null||Number(focusYear.value)!==year))return 0.2;
  return 1;
}
function zoomView(factor,axes,anchorX=0.5,anchorY=0.5){
  const v=[...currentViewport()];
  for(const [lo,hi,anchor] of [[0,1,anchorX],[2,3,anchorY]]){
    if((lo===0&&axes==='y')||(lo===2&&axes==='x'))continue;
    const span=v[hi]-v[lo],next=span*factor;
    if(next<0.1||next>1000000)continue;
    const center=v[lo]+span*anchor;v[lo]=center-next*anchor;v[hi]=v[lo]+next;
  }
  viewport=v;render();
}
document.querySelectorAll('[data-zoom]').forEach(button=>button.addEventListener('click',()=>zoomView(Number(button.dataset.zoom),button.dataset.axis)));
svg.addEventListener('wheel',event=>{
  const axes=document.getElementById('wheel-axis').value;if(axes==='off')return;
  const rect=svg.getBoundingClientRect(),px=(event.clientX-rect.left)/rect.width*1120,py=(event.clientY-rect.top)/rect.height*550;
  if(px<65||px>1050||py<35||py>495)return;
  event.preventDefault();zoomView(event.deltaY>0?1.2:1/1.2,axes,(px-65)/985,1-(py-35)/460);
},{passive:false});
svg.addEventListener('click',event=>{
  const node=event.target.closest('[data-year]');
  if(node){
    focusYear.value=node.dataset.year;changeFocus();
    if(node.classList.contains('node')){
      const replacement=[...svg.querySelectorAll('.node')].find(point=>point.dataset.year===node.dataset.year&&point.dataset.grade===node.dataset.grade&&point.dataset.series===node.dataset.series);
      if(replacement)replacement.dispatchEvent(new PointerEvent('pointerenter',{clientX:event.clientX,clientY:event.clientY}));
    }
    return;
  }
  const line=event.target.closest('[data-line]');
  if(line){focusLine.value=line.dataset.line;changeFocus()}
});

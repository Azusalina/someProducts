import {t,timeText} from './i18n.js';
const R=6378137, rad=Math.PI/180;
export const project = p => [R*p.lon*rad, R*Math.log(Math.tan(Math.PI/4+Math.max(-85.0511,Math.min(85.0511,p.lat))*rad/2))];
export class FootprintMap {
 constructor(canvas) {
  this.canvas=canvas;this.context=canvas.getContext('2d');this.segments=[];this.progress=1;this.selected=false;
  this.center=project({lon:114.185,lat:22.253});this.scale=.04;this.width=0;this.height=0;this.pointers=new Map();
  new ResizeObserver(()=>this.resize()).observe(canvas);
  canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();this.zoom(Math.exp(-Math.max(-150,Math.min(150,e.deltaY))*.004),e.clientX-r.left,e.clientY-r.top);},{passive:false});
  canvas.addEventListener('pointerdown',e=>{this.hideTooltip();canvas.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,[e.clientX,e.clientY]);this.gesture=this.getGesture();});
  canvas.addEventListener('pointermove',e=>{
   if(!this.pointers.has(e.pointerId)){this.hover(e);return;}
   this.pointers.set(e.pointerId,[e.clientX,e.clientY]);const next=this.getGesture(),old=this.gesture;
   if(old&&next){this.center[0]-=(next.x-old.x)/this.scale;this.center[1]+=(next.y-old.y)/this.scale;
    if(next.distance&&old.distance){const r=canvas.getBoundingClientRect();this.zoom(next.distance/old.distance,next.x-r.left,next.y-r.top);}
    this.draw();}
   this.gesture=next;
  });
  const end=e=>{this.pointers.delete(e.pointerId);this.gesture=this.getGesture();};
  canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('pointerleave',()=>this.hideTooltip());
  canvas.addEventListener('keydown',e=>{
   if(['+','=','-','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
    e.preventDefault();if(e.key==='+'||e.key==='=')this.zoom(1.5);else if(e.key==='-')this.zoom(1/1.5);
    else{this.center[0]+=(e.key==='ArrowRight'?80:e.key==='ArrowLeft'?-80:0)/this.scale;this.center[1]+=(e.key==='ArrowUp'?80:e.key==='ArrowDown'?-80:0)/this.scale;this.draw();}
   }
  });
 }
 getGesture(){const p=[...this.pointers.values()];if(!p.length)return null;return {x:p.reduce((a,b)=>a+b[0],0)/p.length,y:p.reduce((a,b)=>a+b[1],0)/p.length,distance:p.length>1?Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]):0};}
 resize(){const r=this.canvas.getBoundingClientRect();if(this.initialized&&this.width&&this.height)this.scale*=Math.min(r.width/this.width,r.height/this.height);this.width=r.width;this.height=r.height;const ratio=window.devicePixelRatio||1;this.canvas.width=Math.round(r.width*ratio);this.canvas.height=Math.round(r.height*ratio);this.context.setTransform(ratio,0,0,ratio,0,0);if(!this.initialized){this.island();this.initialized=true;}this.draw();}
 screen(p){const [x,y]=project(p);return [(x-this.center[0])*this.scale+this.width/2,(this.center[1]-y)*this.scale+this.height/2];}
 setTrack(track,selected=false){this.segments=track.segments;this.points=track.points;this.selected=selected;this.progress=1;this.hideTooltip();this.draw();}
 island(){this.fitBounds(project({lon:114.105,lat:22.20}),project({lon:114.27,lat:22.305}));}
 fitBounds(a,b){this.center=[(a[0]+b[0])/2,(a[1]+b[1])/2];this.scale=Math.min((this.width-120)/Math.max(Math.abs(b[0]-a[0]),1000),(this.height-110)/Math.max(Math.abs(b[1]-a[1]),1000));this.scale=Math.max(.000005,Math.min(4,this.scale));this.draw();}
 fit(){if(!this.points?.length)return false;let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const p of this.points){const [x,y]=project(p);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}this.fitBounds([minX,minY],[maxX,maxY]);return true;}
 zoom(factor,x=this.width/2,y=this.height/2){const before=[this.center[0]+(x-this.width/2)/this.scale,this.center[1]-(y-this.height/2)/this.scale];this.scale=Math.max(.000005,Math.min(4,this.scale*factor));this.center=[before[0]-(x-this.width/2)/this.scale,before[1]+(y-this.height/2)/this.scale];this.hideTooltip();this.draw();}
 draw(){if(!this.width)return;const ctx=this.context;ctx.clearRect(0,0,this.width,this.height);const colors=getComputedStyle(document.documentElement),color=name=>colors.getPropertyValue(name).trim();ctx.fillStyle=color('--surface');ctx.fillRect(0,0,this.width,this.height);ctx.lineCap='round';ctx.lineJoin='round';
  const points=this.points||[],cutoff=Math.floor(Math.max(0,Math.min(1,this.progress))*Math.max(0,points.length-1)),latest=points[cutoff];
  for(const segment of this.segments){
   if(segment.length>1){ctx.beginPath();segment.forEach((p,i)=>{const [x,y]=this.screen(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.lineWidth=this.selected?1.7:1.4;ctx.strokeStyle=this.progress<1?color('--trace-pending'):this.selected?color('--trace'):color('--trace-faded');ctx.stroke();}
   if(this.progress<1&&latest){const played=segment.filter(p=>p.ms<=latest.ms);if(played.length>1){ctx.beginPath();played.forEach((p,i)=>{const[x,y]=this.screen(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.lineWidth=2;ctx.strokeStyle=color('--trace');ctx.stroke();}}
   if(segment.length===1){const[x,y]=this.screen(segment[0]);ctx.beginPath();ctx.arc(x,y,2,0,2*Math.PI);ctx.fillStyle='#6c7d73';ctx.fill();}
  }
  if(latest&&points.length){const[x,y]=this.screen(latest);ctx.fillStyle=color('--accent');ctx.beginPath();ctx.arc(x,y,4,0,2*Math.PI);ctx.fill();ctx.strokeStyle=color('--surface');ctx.lineWidth=2;ctx.stroke();}
  // Ground scale compensates for Mercator distortion around Hong Kong.
  const latitude=2*Math.atan(Math.exp(this.center[1]/R))-Math.PI/2,meters=80/this.scale*Math.cos(latitude);
  const nice=[1,2,5].map(n=>n*10**Math.floor(Math.log10(Math.max(1,meters)))).filter(n=>n<=meters).pop()||1;
  const label=document.getElementById('scale-label');label.textContent=nice>=1000?`${nice/1000} km`:`${nice} m`;
  label.parentElement.style.width=`${nice/Math.cos(latitude)*this.scale}px`;
 }
 hideTooltip(){document.getElementById('map-tooltip').hidden=true;}
 hover(e){if(!this.points?.length)return;const r=this.canvas.getBoundingClientRect(),mouse=[e.clientX-r.left,e.clientY-r.top];let nearest=null,best=144;
  for(const p of this.points){const[x,y]=this.screen(p),d=(x-mouse[0])**2+(y-mouse[1])**2;if(d<best){best=d;nearest=p;}}
  const tip=document.getElementById('map-tooltip');if(!nearest){tip.hidden=true;return;}
  tip.textContent=t('pointDetail',{time:timeText(nearest.ms,true),accuracy:nearest.accuracy??t('unknown'),device:nearest.device});tip.hidden=false;tip.style.left=`${Math.min(this.width-245,Math.max(8,mouse[0]+15))}px`;tip.style.top=`${Math.max(8,mouse[1]-40)}px`;
 }
}

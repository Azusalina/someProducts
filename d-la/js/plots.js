import { transform, scale, add, projection, norm, mean, median, regression, histogram, normalPDF, fmt } from './math.js';
export const C={v:'#5282a0',u:'#c77d9e',r:'#47724a',grid:'#d5d7cc',axis:'#9aab98'};
const W=620,H=370,P=42;
const line=(a,b,color,width=1,dash='')=>`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${color}" stroke-width="${width}" ${dash?'stroke-dasharray="'+dash+'"':''}/>`;
const text=(x,y,t,extra='')=>`<text x="${x}" y="${y}" ${extra}>${t}</text>`;
const path=(points,attrs)=>`<path d="M${points.map(p=>p.join(',')).join(' L')}" ${attrs}/>`;
const svg=(body,square=false)=>`<svg viewBox="${square?`${(W-H)/2} 0 ${H} ${H}`:`0 0 ${W} ${H}`}" role="img" aria-label="Live mathematical diagram / 即時數學圖像">${body}</svg>`;
export function plane(extent=6) {
  const S=(H-2*P)/(2*extent),origin=[W/2,H/2];
  const p=([x,y])=>[origin[0]+x*S,origin[1]-y*S];
  const inv=([x,y])=>[(x-origin[0])/S,(origin[1]-y)/S];
  let grid='';const step=extent>12?5:extent>6?2:1;
  for(let i=-Math.floor(extent/step)*step;i<=extent;i+=step) {grid+=line(p([-extent,i]),p([extent,i]),C.grid);grid+=line(p([i,-extent]),p([i,extent]),C.grid);if(i&&i% (step*2)===0) {grid+=text(...add(p([i,0]),[0,16]),fmt(i),'text-anchor="middle"');grid+=text(...add(p([0,i]),[-9,4]),fmt(i),'text-anchor="end"');}}
  grid+=line(p([-extent,0]),p([extent,0]),C.axis,1.4)+line(p([0,-extent]),p([0,extent]),C.axis,1.4);
  grid+=text(...add(p([extent,0]),[9,4]),'x','class="axis-label"')+text(...add(p([0,extent]),[0,-12]),'y','class="axis-label"')+text(...add(p([0,0]),[-13,17]),'0');
  function arrow(v,color,label='',start=[0,0],dash='') {
    const a=p(start),b=p(add(start,v)),dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy);
    let body=line(a,b,color,2.6,dash);
    if(L>1) {const ux=dx/L,uy=dy/L,k=Math.min(10,L*.4);body+=path([b,[b[0]-k*ux+k*.4*uy,b[1]-k*uy-k*.4*ux],[b[0]-k*ux-k*.4*uy,b[1]-k*uy+k*.4*ux]],`fill="${color}"`);}
    if(label)body+=text(b[0]+10,b[1]-9,label,`style="fill:${color};font-weight:bold"`);
    return body;
  }
  function polygon(points,color,opacity=.22) {return `<polygon points="${points.map(x=>p(x).join(',')).join(' ')}" fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-width="1.3"/>`;}
  function handle(v,id,color) {const q=p(v);return `<circle data-drag="${id}" cx="${q[0]}" cy="${q[1]}" r="7" fill="${color}" fill-opacity=".3" stroke="${color}" stroke-width="1.7" style="cursor:grab"/>`;}
  return {p,inv,grid,arrow,polygon,handle};
}
export function vectorPlot(mode,s) {
  const v=s.v.slice(0,2),u=s.u.slice(0,2),r=mode==='span'?add(scale(u,s.c1),scale(v,s.c2)):scale(v,s.scale);
  const extent=s.dragExtent??Math.max(5,Math.ceil(Math.max(...[...v,...u,...r].map(Math.abs))+1));
  const g=plane(extent);let body=g.grid;
  if(mode==='span') {body+=g.polygon([[0,0],scale(u,s.c1),r,scale(v,s.c2)],C.r,.14);body+=g.arrow(u,C.u,'u')+g.arrow(v,C.v,'v')+g.arrow(scale(v,s.c2),C.v,'',scale(u,s.c1),'4 4')+g.arrow(r,C.r,'c₁u + c₂v')+g.handle(u,'u',C.u);}
  else if(mode==='dot') {const proj=projection(v,u);body+=g.arrow(u,C.u,'u')+g.arrow(v,C.v,'v');if(proj){body+=g.arrow(proj,C.r,'proj')+line(g.p(v),g.p(proj),C.r,1.5,'5 4');}body+=g.handle(u,'u',C.u);}
  else body+=g.arrow(v,C.v,'v')+g.arrow(r,C.r,'s·v');
  body+=g.handle(v,'v',C.v);
  return {html:svg(body,true),inv:g.inv,extent};
}
export function matrixPlot(mode,s) {
  const A=s.A.map((x,i)=>s.t*x+((i===0||i===3)?1-s.t:0));
  const v=mode==='eigen'?[2.5*Math.cos(s.angle*Math.PI/180),2.5*Math.sin(s.angle*Math.PI/180)]:s.v.slice(0,2);
  const out=transform(A,v),g=plane(Math.max(5,Math.ceil(Math.max(...out.map(Math.abs))+1)));
  let body=g.grid;
  for(let i=-4;i<=4;i++) {body+=line(g.p(transform(A,[-4,i])),g.p(transform(A,[4,i])),'#98b084',1);body+=line(g.p(transform(A,[i,-4])),g.p(transform(A,[i,4])),'#98b084',1);}
  body+=g.polygon([[0,0],[1,0],[1,1],[0,1]],'#a8a89a',.15)+g.polygon([[0,0],transform(A,[1,0]),transform(A,[1,1]),transform(A,[0,1])],C.r,.24);
  body+=g.arrow([A[0],A[2]],C.v,'Ae₁')+g.arrow([A[1],A[3]],C.u,'Ae₂');
  if(mode!=='determinant')body+=g.arrow(v,'#849181','v');
  if(mode!=='determinant')body+=g.arrow(out,C.r,'Av');
  return {html:svg(body,true),inv:g.inv};
}
export function compositionPlot(s) {
  const theta=s.angle*Math.PI/180,A=[s.sx,0,0,s.sy],B=[Math.cos(theta),-Math.sin(theta),Math.sin(theta),Math.cos(theta)],v=[1,1];
  const ab=transform(A,transform(B,v)),ba=transform(B,transform(A,v)),g=plane(Math.max(5,...[...ab,...ba].map(x=>Math.ceil(Math.abs(x)+1))));
  return {html:svg(g.grid+g.arrow(v,'#849181','v')+g.arrow(ab,C.v,'ABv')+g.arrow(ba,C.u,'BAv'),true),inv:g.inv};
}
export function systemPlot(s) {
  const g=plane(6);let body=g.grid;
  [[s.A[0],s.A[1],s.b[0],C.v],[s.A[2],s.A[3],s.b[1],C.u]].forEach(([a,b,k,color],i)=>{
    if(Math.abs(a)+Math.abs(b)<1e-9){body+=text(45,22+i*17,`Equation ${i+1}: 0 = ${fmt(k)}`,`style="fill:${color}"`);return;}
    const pts=Math.abs(b)>Math.abs(a)?[[-8,(k+8*a)/b],[8,(k-8*a)/b]]:[[(k+8*b)/a,-8],[(k-8*b)/a,8]];
    body+=line(g.p(pts[0]),g.p(pts[1]),color,2.5);
  });
  return {html:svg(body,true),inv:g.inv};
}
function chartFrame(lo,hi,ymax,xlabel='Value',ylabel='Count') {
  if(hi===lo){lo-=.5;hi+=.5;}if(!ymax)ymax=1;
  const x=v=>P+(v-lo)/(hi-lo)*(W-2*P),y=v=>H-P-v/ymax*(H-2*P);
  let body=line([P,P],[P,H-P],C.axis)+line([P,H-P],[W-P,H-P],C.axis);
  for(let i=0;i<=4;i++){const val=lo+(hi-lo)*i/4;body+=text(x(val),H-P+19,fmt(val),'text-anchor="middle"');const yval=ymax*i/4;body+=line([P,y(yval)],[W-P,y(yval)],C.grid)+text(P-8,y(yval)+4,fmt(yval),'text-anchor="end"');}
  body+=text(W/2,H-5,xlabel,'text-anchor="middle"')+text(P,20,ylabel);
  return {x,y,body};
}
export function histogramPlot(xs,{markers=[],density=null,title='Value',bins=20}={}) {
  const hist=histogram(xs,bins), ymax=Math.max(...hist.counts)*1.2||1,g=chartFrame(hist.lo,hist.hi,ymax,title);
  let body=g.body;
  hist.counts.forEach((n,i)=>{const left=g.x(hist.lo+i*hist.width),right=g.x(hist.lo+(i+1)*hist.width);body+=`<rect x="${left+1}" y="${g.y(n)}" width="${Math.max(1,right-left-2)}" height="${H-P-g.y(n)}" fill="${C.r}" opacity=".65"/>`;});
  if(density) {const pts=Array.from({length:180},(_,i)=>{const val=hist.lo+(hist.hi-hist.lo)*i/179;return[g.x(val),g.y(density(val)*xs.length*hist.width)];});body+=path(pts,`fill="none" stroke="${C.u}" stroke-width="2"`);}
  markers.forEach(({value,label,color})=>{body+=line([g.x(value),P],[g.x(value),H-P],color,2,'4 3');body+=text(g.x(value)+5,P+13,label,`style="fill:${color}"`);});
  return {html:svg(body)};
}
export function summaryPlot(xs) {return histogramPlot(xs,{bins:Math.min(15,Math.max(5,Math.ceil(Math.sqrt(xs.length)))),markers:[{value:mean(xs),label:'mean',color:C.v},{value:median(xs),label:'median',color:C.u}]});}
export function normalPlot(s) {
  const lo=Math.min(s.mu-4*s.sigma,s.lower)-.2,hi=Math.max(s.mu+4*s.sigma,s.upper)+.2,g=chartFrame(lo,hi,normalPDF(s.mu,s.mu,s.sigma)*1.2,'x','Density');
  const pts=Array.from({length:250},(_,i)=>{const val=lo+(hi-lo)*i/249;return[g.x(val),g.y(normalPDF(val,s.mu,s.sigma))];});
  const a=Math.min(s.lower,s.upper),b=Math.max(s.lower,s.upper);
  const shade=Array.from({length:150},(_,i)=>{const val=a+(b-a)*i/149;return[g.x(val),g.y(normalPDF(val,s.mu,s.sigma))];});
  let body=g.body+path([[g.x(a),H-P],...shade,[g.x(b),H-P]],`fill="${C.r}" opacity=".3"`)+path(pts,`fill="none" stroke="${C.r}" stroke-width="2.7"`);
  body+=line([g.x(s.mu),P],[g.x(s.mu),H-P],C.u,1.5,'5 4')+text(g.x(s.mu)+5,P+13,'μ',`style="fill:${C.u}"`);
  return {html:svg(body)};
}
export function probabilityPlot(s,pmf) {
  const g=chartFrame(-.7,s.n+.7,Math.max(...pmf)*1.2,'Successes k','Probability');let body=g.body;
  pmf.forEach((p,k)=>{const left=g.x(k-.35),width=g.x(k+.35)-left;body+=`<rect x="${left}" y="${g.y(p)}" width="${width}" height="${H-P-g.y(p)}" fill="${k===s.k?C.u:C.r}" opacity=".75"/>`;if(s.counts?.length&&s.runs){const q=s.counts[k]/s.runs;body+=`<circle cx="${g.x(k)}" cy="${g.y(q)}" r="3.5" fill="${C.v}"/>`;}});
  return {html:svg(body)};
}
export function regressionPlot(points) {
  const fit=regression(points),g=chartFrame(0,10,12,'x','y');let body=g.body;
  if(fit){body+=line([g.x(0),g.y(fit.intercept)],[g.x(10),g.y(fit.intercept+10*fit.slope)],C.r,2.4);points.forEach(([x,y])=>body+=line([g.x(x),g.y(y)],[g.x(x),g.y(fit.intercept+fit.slope*x)],C.u,1.4,'4 3'));}
  points.forEach(([x,y],i)=>body+=`<circle data-drag="point-${i}" cx="${g.x(x)}" cy="${g.y(y)}" r="7" fill="${C.v}" stroke="#efeee5" stroke-width="2" style="cursor:grab"/>`);
  return {html:svg(body),inv:([x,y])=>[(x-P)/(W-2*P)*10,(H-P-y)/(H-2*P)*12]};
}
export function intervalPlot(means,se,mu) {
  const recent=means.slice(-25),lo=Math.min(mu,...recent.map(m=>m-1.96*se))-.1,hi=Math.max(mu,...recent.map(m=>m+1.96*se))+.1;
  const x=v=>20+(v-lo)/(hi-lo)*580;
  let body=line([x(mu),0],[x(mu),90],C.u,1.8,'4 3');
  recent.forEach((m,i)=>body+=line([x(m-1.96*se),4+i*3.2],[x(m+1.96*se),4+i*3.2],Math.abs(m-mu)<=1.96*se?C.r:'#ba7161',2));
  return `<svg viewBox="0 0 620 90" role="img" aria-label="Recent confidence intervals; green covers the true mean, orange misses / 最近的信賴區間">${body}</svg>`;
}

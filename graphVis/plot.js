(function(root){
  'use strict';
  function niceStep(scale) {
    const target=72/scale,power=10**Math.floor(Math.log10(target)),n=target/power;
    return (n<=1?1:n<=2?2:n<=5?5:10)*power;
  }
  function format(value,digits=6) {
    if(!Number.isFinite(value))return '未定义';
    if(Math.abs(value)<1e-12)value=0;
    return Number(value.toPrecision(digits)).toString();
  }
  function sampleCurve(fn,view,width,height,options={}) {
    const step=options.integral?Math.max(5,width/240):2;
    const segments=[];let segment=[], evaluations=0;
    const evalAt=px=>{evaluations++;const x=view.cx+(px-width/2)/view.scale;try{const y=fn(x);return {px,py:height/2-(y-view.cy)*view.scale,x,y};}catch{return {px,py:NaN,x,y:NaN};}};
    const valid=p=>Number.isFinite(p.py)&&Math.abs(p.py)<height*100;
    function emit(p){if(valid(p)){segment.push(p);}else if(segment.length){segments.push(segment);segment=[];}}
    function edge(a,b,depth){
      if(!valid(a)||!valid(b)){emit({py:NaN});emit(b);return;}
      const m=evalAt((a.px+b.px)/2),deviation=Math.abs(m.py-(a.py+b.py)/2);
      if(depth<5&&(deviation>0.8||Math.abs(a.py-b.py)>height/2)) {edge(a,m,depth+1);edge(m,b,depth+1);return;}
      if(!valid(m)||deviation>8||Math.abs(a.py-b.py)>height*1.5){emit({py:NaN});emit(b);return;}
      emit(b);
    }
    let previous=evalAt(0);emit(previous);
    for(let px=step;px<=width+step;px+=step){const next=evalAt(Math.min(px,width));edge(previous,next,0);previous=next;if(px>=width)break;}
    if(segment.length)segments.push(segment);
    return {segments,evaluations};
  }
  // Marching squares: each cell rejects large residuals near poles.
  function contourCell(fn,x,y,dx,dy,toScreen) {
    const coords=[[x,y],[x+dx,y],[x+dx,y+dy],[x,y+dy]],values=coords.map(p=>fn(...p));
    if(!values.every(Number.isFinite))return [];
    const edges=[];
    for(let i=0;i<4;i++){
      const j=(i+1)%4,a=values[i],b=values[j];
      if((a<0)===(b<0)&&a!==0&&b!==0)continue;
      if(a===b)continue;
      const t=a/(a-b),p=[coords[i][0]+(coords[j][0]-coords[i][0])*t,coords[i][1]+(coords[j][1]-coords[i][1])*t];
      const residual=Math.abs(fn(...p)),limit=Math.max(Math.abs(a),Math.abs(b));
      if(Number.isFinite(residual)&&residual<=Math.max(1e-9,limit*0.8))edges.push(toScreen(...p));
    }
    if(edges.length===4){
      // Asymptotic decider for a saddle; avoid crossing unrelated branches.
      const q=values[0]*values[2]-values[1]*values[3];
      return q>=0?[[edges[0],edges[1]],[edges[2],edges[3]]]:[[edges[0],edges[3]],[edges[1],edges[2]]];
    }
    return edges.length===2?[[edges[0],edges[1]]]:[];
  }
  const api={niceStep,format,sampleCurve,contourCell};
  root.GraphPlot=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);

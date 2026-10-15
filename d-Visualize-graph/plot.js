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
    const evalAt=px=>{evaluations++;const x=view.cx+(px-width/2)/view.scale;try{const y=fn(x);return {px,py:height/2-(y-view.cy)*(view.yScale||view.scale),x,y};}catch{return {px,py:NaN,x,y:NaN};}};
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
      if(Number.isFinite(residual)&&residual<=Math.max(1e-9,limit*0.8)){const screen=toScreen(...p);if(!edges.some(q=>Math.hypot(q[0]-screen[0],q[1]-screen[1])<1e-7))edges.push(screen);}
    }
    if(edges.length===4){
      // Asymptotic decider for a saddle; avoid crossing unrelated branches.
      const q=values[0]*values[2]-values[1]*values[3];
      return q>=0?[[edges[0],edges[1]],[edges[2],edges[3]]]:[[edges[0],edges[3]],[edges[1],edges[2]]];
    }
    return edges.length===2?[[edges[0],edges[1]]]:[];
  }
  function sampleDiscrete(fn,view,width,height,support=[-Infinity,Infinity]){
    const a=Math.max(Math.ceil(view.cx-width/(2*view.scale)),Math.ceil(support[0])),b=Math.min(Math.floor(view.cx+width/(2*view.scale)),Math.floor(support[1])),stride=Math.max(1,Math.ceil((b-a+1)/4096)),points=[];
    for(let k=a;k<=b;k+=stride){const y=fn(k);if(Number.isFinite(y))points.push({x:k,y,px:width/2+(k-view.cx)*view.scale,py:height/2-(y-view.cy)*(view.yScale||view.scale)});}
    return {points,stride};
  }
  // Find and deduplicate numerical intersections inside the current viewport.
  function intersections(a,b,view,width,height){
    const sx=view.scale,sy=view.yScale||sx,xmin=view.cx-width/(2*sx),xmax=view.cx+width/(2*sx),ymin=view.cy-height/(2*sy),ymax=view.cy+height/(2*sy),points=[];
    const implicit=e=>['implicit','inequality','segment'].includes(e.kind),vertical=e=>e.kind==='vertical';
    const residual=(e,x,y)=>e.kind==='segment'?((x-e.segment[0][0])*(e.segment[1][1]-e.segment[0][1])-(y-e.segment[0][1])*(e.segment[1][0]-e.segment[0][0]))/Math.max(1,Math.hypot(e.segment[1][0]-e.segment[0][0],e.segment[1][1]-e.segment[0][1])):vertical(e)?x-e.fn(0):implicit(e)?e.fn(x,y):y-e.fn(x);
    const valid=(e,x,y)=>{
      if(e.allowed&&!e.allowed(x,y))return false;if(e.discrete&&Math.abs(x-Math.round(x))>1e-6)return false;
      if(e.segment){const [p,q]=e.segment,dx=q[0]-p[0],dy=q[1]-p[1],t=((x-p[0])*dx+(y-p[1])*dy)/(dx*dx+dy*dy);if(!Number.isFinite(t)||t< -1e-7||t>1+1e-7)return false;}
      return true;
    };
    const add=(x,y)=>{if(![x,y].every(Number.isFinite)||x<xmin-1e-8||x>xmax+1e-8||y<ymin-1e-8||y>ymax+1e-8||!valid(a,x,y)||!valid(b,x,y))return;
      const f=residual(a,x,y),g=residual(b,x,y);if(![f,g].every(Number.isFinite)||Math.max(Math.abs(f),Math.abs(g))>1e-6)return;
      if(!points.some(p=>Math.hypot((p[0]-x)*sx,(p[1]-y)*sy)<.6))points.push([x,y]);
    };
    function roots(fn,lo,hi,point){
      const count=Math.min(2048,Math.max(128,Math.ceil(width/(a.hasIntegral||b.hasIntegral?8:2)))),step=(hi-lo)/count,values=[];
      for(let i=0;i<=count;i++)values.push(fn(lo+i*step));
      let coincident=values.every(v=>Number.isFinite(v)&&Math.abs(v)<1e-10);if(coincident)return values.some((v,i)=>{const [x,y]=point(lo+i*step);return x>=xmin&&x<=xmax&&y>=ymin&&y<=ymax&&valid(a,x,y)&&valid(b,x,y);});
      for(let i=0;i<=count;i++){
        const x=lo+i*step,v=values[i];if(!Number.isFinite(v))continue;if(Math.abs(v)<1e-10)add(...point(x));
        if(i&&Number.isFinite(values[i-1])&&v*values[i-1]<0){let l=x-step,r=x,fl=values[i-1];for(let k=0;k<48;k++){const mid=(l+r)/2,fm=fn(mid);if(!Number.isFinite(fm))break;if(fl*fm<=0)r=mid;else{l=mid;fl=fm;}}add(...point((l+r)/2));}
        if(i>0&&i<count&&Math.abs(v)<=Math.abs(values[i-1])&&Math.abs(v)<=Math.abs(values[i+1])){
          let l=x-step,r=x+step;for(let k=0;k<44;k++){const c=l+(r-l)/3,d=r-(r-l)/3;if(Math.abs(fn(c))<Math.abs(fn(d)))r=d;else l=c;}let t=(l+r)/2;for(let k=0;k<8;k++){const h=step*.001,d=(fn(t+h)-fn(t-h))/(2*h),v=fn(t);if(!Number.isFinite(d)||Math.abs(d)<1e-12)break;const next=t-v/d;if(next<x-step||next>x+step)break;t=next;}if(Math.abs(t)<1e-12)t=0;if(Math.abs(fn(t))<1e-8)add(...point(t));
        }
      }
      return false;
    }
    if(a.discrete||b.discrete){const d=a.discrete?a:b;for(let x=Math.ceil(xmin),i=0;x<=xmax&&i++<20000;x++)add(x,d.fn(x));return {points};}
    if(vertical(a)&&vertical(b))return {points,coincident:Math.abs(a.fn(0)-b.fn(0))<1e-10};
    if(vertical(a)||vertical(b)){const line=vertical(a)?a:b,other=line===a?b:a,x=line.fn(0);if(implicit(other))return {points,coincident:roots(y=>residual(other,x,y),ymin,ymax,y=>[x,y])};add(x,other.fn(x));return {points};}
    if(!implicit(a)||!implicit(b)){const curve=!implicit(a)?a:b,other=curve===a?b:a;return {points,coincident:roots(x=>residual(other,x,curve.fn(x)),xmin,xmax,x=>[x,curve.fn(x)])};}
    if(JSON.stringify(a.ast)===JSON.stringify(b.ast)&&JSON.stringify(a.restriction)===JSON.stringify(b.restriction))return {points,coincident:true};
    // Newton refinement from cells near both contours also catches ordinary tangencies.
    const evaluate=(e,px,py)=>residual(e,view.cx+(px-width/2)/sx,view.cy-(py-height/2)/sy);
    for(let px=0;px<width;px+=16)for(let py=0;py<height;py+=16){
      const near=e=>{const v=[[0,0],[16,0],[0,16],[16,16],[8,8]].map(([dx,dy])=>evaluate(e,px+dx,py+dy));if(!v.every(Number.isFinite))return false;const lo=Math.min(...v),hi=Math.max(...v);return lo<=0&&hi>=0||Math.min(...v.map(Math.abs))<Math.max(1e-9,(hi-lo)*1.5);};
      if(!near(a)||!near(b))continue;let x=px+8,y=py+8;
      for(let k=0;k<30;k++){const f=evaluate(a,x,y),g=evaluate(b,x,y);if(![f,g].every(Number.isFinite))break;if(Math.max(Math.abs(f),Math.abs(g))<1e-10){add(view.cx+(x-width/2)/sx,view.cy-(y-height/2)/sy);break;}
        const h=.1,ax=(evaluate(a,x+h,y)-evaluate(a,x-h,y))/(2*h),ay=(evaluate(a,x,y+h)-evaluate(a,x,y-h))/(2*h),bx=(evaluate(b,x+h,y)-evaluate(b,x-h,y))/(2*h),by=(evaluate(b,x,y+h)-evaluate(b,x,y-h))/(2*h),det=ax*by-ay*bx;if(!Number.isFinite(det)||Math.abs(det)<1e-18)break;
        const dx=(f*by-g*ay)/det,dy=(ax*g-bx*f)/det,scale=Math.max(1,Math.hypot(dx,dy)/32);x-=dx/scale;y-=dy/scale;if(x< -32||x>width+32||y< -32||y>height+32)break;
      }
    }
    points.sort((p,q)=>p[0]-q[0]||p[1]-q[1]);return {points};
  }
  const api={niceStep,format,sampleCurve,contourCell,sampleDiscrete,intersections};
  root.GraphPlot=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);

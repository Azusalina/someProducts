/* Small interactive widgets for individual chapters. Each takes (element, Yupi). */
window.Yupi=window.Yupi||{};
Yupi.widgets=Yupi.widgets||{};

/* ---------- Elasticity: linear demand P = 100 - Q, two prices, arc (midpoint) elasticity and total revenue ---------- */
Yupi.widgets.elast=function(el,Y){
 Y=Y||window.Yupi;
 const W=620,H=380,L=56,R=16,T=16,B=44;
 const x=q=>L+(q/100)*(W-L-R), y=p=>H-B-(p/100)*(H-T-B);
 el.innerHTML=Y.tx(`<p class="lead" style="margin-top:0">Demand is the straight line @@P=100-Q@@. Move the two prices and read the midpoint elasticity @@E_d=\\left|\\dfrac{\\%\\Delta Q}{\\%\\Delta P}\\right|@@ and the change in total revenue @@TR=P\\times Q@@.</p>`)+
  `<svg class="diagram" id="elsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Demand curve with two price points and the total revenue rectangles"></svg>
  <div class="sl">
   <label>Starting price <output id="o_p1">70</output><input type="range" id="r_p1" min="5" max="95" value="70" aria-label="Starting price"></label>
   <label>New price <output id="o_p2">80</output><input type="range" id="r_p2" min="5" max="95" value="80" aria-label="New price"></label>
  </div>
  <div class="readout" id="elout" aria-live="polite"></div>`;
 const svg=el.querySelector("#elsvg"),out=el.querySelector("#elout");
 function draw(){
  const p1=+el.querySelector("#r_p1").value,p2=+el.querySelector("#r_p2").value;
  el.querySelector("#o_p1").textContent=p1;el.querySelector("#o_p2").textContent=p2;
  const q1=100-p1,q2=100-p2,tr1=p1*q1,tr2=p2*q2;
  let g=`<g stroke="var(--line)"><line x1="${L}" y1="${y(0)}" x2="${W-R}" y2="${y(0)}"/><line x1="${L}" y1="${T}" x2="${L}" y2="${y(0)}"/></g>`;
  g+=`<line x1="${x(50)}" y1="${T}" x2="${x(50)}" y2="${y(0)}" stroke="var(--line)" stroke-dasharray="4 5"/><line x1="${L}" y1="${y(50)}" x2="${W-R}" y2="${y(50)}" stroke="var(--line)" stroke-dasharray="4 5"/>`;
  g+=`<text x="${W-R}" y="${y(50)-6}" text-anchor="end" fill="var(--mute)" font-size="11">midpoint (Ed = 1) at P = 50</text><text x="${W-R}" y="${y(80)}" text-anchor="end" fill="var(--mute)" font-size="11">elastic above</text><text x="${W-R}" y="${y(22)}" text-anchor="end" fill="var(--mute)" font-size="11">inelastic below</text>`;
  g+=`<rect x="${x(0)}" y="${y(p1)}" width="${x(q1)-x(0)}" height="${y(0)-y(p1)}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-dasharray="5 4"/>`;
  g+=`<rect x="${x(0)}" y="${y(p2)}" width="${x(q2)-x(0)}" height="${y(0)-y(p2)}" fill="var(--acc)" opacity=".2"/>`;
  g+=`<line x1="${x(0)}" y1="${y(100)}" x2="${x(100)}" y2="${y(0)}" stroke="var(--acc)" stroke-width="3" stroke-linecap="round"/>`;
  g+=`<circle cx="${x(q1)}" cy="${y(p1)}" r="5" fill="var(--ink)"/><circle cx="${x(q2)}" cy="${y(p2)}" r="5" fill="var(--acc)"/>`;
  g+=`<text x="${W-R}" y="${H-10}" text-anchor="end" fill="var(--mute)" font-size="12">Quantity</text><text x="14" y="${T+10}" fill="var(--mute)" font-size="12">Price</text>`;
  svg.innerHTML=g;
  const dP=p2-p1,dQ=q2-q1,mP=(p1+p2)/2,mQ=(q1+q2)/2;
  let rows=[["Starting point","P "+p1+", Q "+q1],["New point","P "+p2+", Q "+q2],["TR before / after",tr1+" / "+tr2]];
  if(dP===0){rows.push(["Midpoint elasticity","Move the two prices apart"]);}
  else{
   const e=Math.abs((dQ/mQ)/(dP/mP));
   const kind=Math.abs(e-1)<0.02?"unitary (about 1)":e>1?"elastic (Ed > 1)":"inelastic (Ed < 1)";
   const dt=tr2-tr1;
   rows.push(["%ΔP","" +(100*dP/mP).toFixed(1)+"%"],["%ΔQ","" +(100*dQ/mQ).toFixed(1)+"%"],["Midpoint Ed",e.toFixed(2)+", "+kind],["Change in TR",(dt>0?"+":"")+dt+(dt>0?" (rises)":dt<0?" (falls)":" (unchanged)")]);
  }
  out.innerHTML=rows.map(r=>`<div>${r[0]}<b>${r[1]}</b></div>`).join("");
 }
 el.addEventListener("input",draw);draw();
};

/* ---------- Externality: MPB = 100 - Q, MPC = 20 + Q, constant marginal external cost or benefit ---------- */
Yupi.widgets.extern=function(el,Y){
 Y=Y||window.Yupi;
 const W=620,H=400,L=56,R=16,T=16,B=44,PX=100,PM=150;
 const x=q=>L+(q/PX)*(W-L-R), y=p=>H-B-(p/PM)*(H-T-B);
 let neg=true;
 el.innerHTML=`<div class="row" role="group" aria-label="Type of externality"><button class="chip" data-t="neg" aria-pressed="true">Negative externality (external cost)</button><button class="chip" data-t="pos" aria-pressed="false">Positive externality (external benefit)</button></div>
  <svg class="diagram" id="exsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Externality diagram"></svg>
  <div class="sl">
   <label><span id="elab">Marginal external cost (MEC)</span> <output id="o_e">20</output><input type="range" id="r_e" min="0" max="40" value="20" aria-label="Marginal external amount"></label>
   <label><span id="plab">Unit tax</span> <output id="o_t">0</output><input type="range" id="r_t" min="0" max="50" value="0" aria-label="Policy amount"></label>
  </div>
  <div class="readout" id="exout" aria-live="polite"></div>`;
 const svg=el.querySelector("#exsvg"),out=el.querySelector("#exout");
 function draw(){
  const e=+el.querySelector("#r_e").value,t=+el.querySelector("#r_t").value;
  el.querySelector("#o_e").textContent=e;el.querySelector("#o_t").textContent=t;
  el.querySelector("#elab").textContent=neg?"Marginal external cost (MEC)":"Marginal external benefit (MEB)";
  el.querySelector("#plab").textContent=neg?"Unit tax":"Unit subsidy";
  /* negative: MPB 100-Q, MPC 20+Q, MSC 20+e+Q.  positive: MPB 100-Q, MSB 100+e-Q, MPC 20+Q */
  const Qm=40,Qe=neg?(80-e)/2:(80+e)/2;
  const Qp=neg?(80-t)/2:(80+t)/2;
  const dwl=(e-t)*(e-t)/4;
  let g=`<g stroke="var(--line)"><line x1="${L}" y1="${y(0)}" x2="${W-R}" y2="${y(0)}"/><line x1="${L}" y1="${T}" x2="${L}" y2="${y(0)}"/></g>`;
  const line=(a,b,c,w,dash)=>`<line x1="${x(0)}" y1="${y(a)}" x2="${x(100)}" y2="${y(a+b*100)}" stroke="${c}" stroke-width="${w}" ${dash?'stroke-dasharray="6 5"':""} stroke-linecap="round"/>`;
  const clip=(a,b)=>{const qmax=b>0?Math.min(100,(PM-a)/b):Math.min(100,a/(-b));return [qmax,a+b*qmax]};
  const seg=(a,b,c,w,dash,label)=>{const [q2,p2]=clip(a,b);return `<line x1="${x(0)}" y1="${y(a)}" x2="${x(q2)}" y2="${y(p2)}" stroke="${c}" stroke-width="${w}" ${dash?'stroke-dasharray="6 5"':""} stroke-linecap="round"/><text x="${x(q2)-4}" y="${y(p2)-7}" text-anchor="end" fill="${c}" font-size="12" font-weight="600">${label}</text>`};
  const triPts=(qa,qb)=>{ /* loss triangle between quantities qa and qb, bounded by MSC/MSB and MPB/MPC */
   const lo=Math.min(qa,qb),hi=Math.max(qa,qb);
   if(neg)return [[lo,100-lo],[lo,20+e+lo],[hi,20+e+hi],[hi,100-hi]];
   return [[lo,100+e-lo],[lo,20+lo],[hi,20+hi],[hi,100+e-hi]];};
  if(neg){
   g+=seg(100,-1,"var(--acc)",3,false,"MPB");g+=seg(20,1,"var(--ink)",3,false,"MPC");g+=seg(20+e,1,"var(--bad)",3,false,"MSC");
   if(t>0)g+=seg(20+t,1,"var(--ink)",2,true,"MPC+tax");
  }else{
   g+=seg(100,-1,"var(--acc)",3,false,"MPB");g+=seg(100+e,-1,"var(--bad)",3,false,"MSB");g+=seg(20,1,"var(--ink)",3,false,"MPC");
   if(t>0)g+=seg(20-t,1,"var(--ink)",2,true,"MPC-subsidy");
  }
  if(Math.abs(Qp-Qe)>0.05){
   const pts=(neg?[[Math.min(Qp,Qe),100-Math.min(Qp,Qe)],[Math.min(Qp,Qe),20+e+Math.min(Qp,Qe)],[Math.max(Qp,Qe),20+e+Math.max(Qp,Qe)],[Math.max(Qp,Qe),100-Math.max(Qp,Qe)]]:
     [[Math.min(Qp,Qe),100+e-Math.min(Qp,Qe)],[Math.min(Qp,Qe),20+Math.min(Qp,Qe)],[Math.max(Qp,Qe),20+Math.max(Qp,Qe)],[Math.max(Qp,Qe),100+e-Math.max(Qp,Qe)]]);
   /* deadweight loss = triangle between Qp and Qe bounded by MSC/MSB and the private curve at the quantity traded; draw simple triangle */
   const lo=Math.min(Qp,Qe),hi=Math.max(Qp,Qe);
   const tri=neg?[[Qe,100-Qe],[Qp,100-Qp],[Qp,20+e+Qp]]:[[Qe,100+e-Qe],[Qp,100+e-Qp],[Qp,20+Qp]];
   g+=`<polygon points="${tri.map(p=>x(p[0]).toFixed(1)+","+y(p[1]).toFixed(1)).join(" ")}" fill="var(--bad)" opacity=".4"/>`;
  }
  g+=`<line x1="${x(Qm)}" y1="${y(0)}" x2="${x(Qm)}" y2="${y(neg?100-Qm:100-Qm)}" stroke="var(--line)" stroke-dasharray="4 5"/>`;
  g+=`<line x1="${x(Qe)}" y1="${y(0)}" x2="${x(Qe)}" y2="${y(neg?20+e+Qe:20+Qe)}" stroke="var(--bad)" stroke-dasharray="4 5"/>`;
  g+=`<g fill="var(--mute)" font-size="11"><text x="${x(Qm)}" y="${y(0)+15}" text-anchor="middle">Q market ${Qm}</text><text x="${x(Qe)}" y="${y(0)+29}" text-anchor="middle" fill="var(--bad)">Q efficient ${Qe.toFixed(0)}</text></g>`;
  g+=`<text x="${W-R}" y="${H-8}" text-anchor="end" fill="var(--mute)" font-size="12">Quantity</text><text x="14" y="${T+10}" fill="var(--mute)" font-size="12">Price, cost, benefit</text>`;
  svg.innerHTML=g;
  const gap=e-t;
  const verdict=Math.abs(gap)<0.01?"Efficient: the policy equals the external amount":gap>0?(neg?"Still overproduced (tax below MEC)":"Still underproduced (subsidy below MEB)"):(neg?"Underproduced (tax above MEC)":"Overproduced (subsidy above MEB)");
  out.innerHTML=[["Market quantity",Qm],["Efficient quantity",Qe.toFixed(1)],["Quantity with the policy",Qp.toFixed(1)],["Deadweight loss",dwl.toFixed(1)],["Verdict",verdict]].map(r=>`<div>${r[0]}<b>${r[1]}</b></div>`).join("");
 }
 el.addEventListener("input",draw);
 el.addEventListener("click",e=>{const b=e.target.closest("[data-t]");if(!b)return;neg=b.dataset.t==="neg";el.querySelectorAll("[data-t]").forEach(z=>z.setAttribute("aria-pressed",z===b));draw()});
 draw();
};

/* ---------- Lorenz curve and Gini: L(x) = x^k ---------- */
Yupi.widgets.lorenz=function(el,Y){
 Y=Y||window.Yupi;
 const S=300,M=34;
 el.innerHTML=Y.tx(`<p class="lead" style="margin-top:0">The Lorenz curve plots the cumulative share of income (vertical) against the cumulative share of households from the poorest (horizontal). Here @@L(x)=x^k@@. Drag @@k@@: the further the curve sags from the 45-degree line, the larger the Gini coefficient @@g=A/(A+B)@@.</p>`)+
  `<svg class="diagram" id="lzsvg" viewBox="0 0 ${S+2*M+170} ${S+2*M}" role="img" aria-label="Lorenz curve"></svg>
  <div class="sl"><label>Inequality parameter k <output id="o_k">2.0</output><input type="range" id="r_k" min="10" max="50" value="20" aria-label="Inequality parameter"></label></div>
  <div class="readout" id="lzout" aria-live="polite"></div>`;
 const svg=el.querySelector("#lzsvg"),out=el.querySelector("#lzout");
 const X=u=>M+u*S,Yv=v=>M+S-v*S;
 function draw(){
  const k=+el.querySelector("#r_k").value/10;el.querySelector("#o_k").textContent=k.toFixed(1);
  let pts=[];for(let i=0;i<=50;i++){const u=i/50;pts.push([u,Math.pow(u,k)])}
  let g=`<polygon points="${X(0)},${Yv(0)} ${pts.map(p=>X(p[0]).toFixed(1)+","+Yv(p[1]).toFixed(1)).join(" ")} ${X(1)},${Yv(1)}" fill="var(--acc)" opacity=".2"/>`;
  g+=`<g stroke="var(--line)"><rect x="${M}" y="${M}" width="${S}" height="${S}" fill="none"/></g>`;
  g+=`<line x1="${X(0)}" y1="${Yv(0)}" x2="${X(1)}" y2="${Yv(1)}" stroke="var(--mute)" stroke-dasharray="6 5"/>`;
  g+=`<polyline points="${pts.map(p=>X(p[0]).toFixed(1)+","+Yv(p[1]).toFixed(1)).join(" ")}" fill="none" stroke="var(--acc)" stroke-width="3"/>`;
  g+=`<text x="${X(.2)}" y="${Yv(.62)}" fill="var(--ink)" font-size="13" font-weight="600">A</text><text x="${X(.72)}" y="${Yv(.28)}" fill="var(--ink)" font-size="13" font-weight="600">B</text>`;
  g+=`<g fill="var(--mute)" font-size="11"><text x="${X(.5)}" y="${M+S+22}" text-anchor="middle">Cumulative % of households (poorest first)</text><text x="${M-6}" y="${M-8}">Cumulative % of income</text><text x="${X(1)+8}" y="${Yv(1)+4}">line of equality</text></g>`;
  svg.innerHTML=g;
  const gini=(k-1)/(k+1);
  const share=p=>(100*Math.pow(p,k)).toFixed(1)+"%";
  out.innerHTML=[["Gini coefficient",gini.toFixed(3)],["Poorest 20% earn",share(.2)],["Poorest 50% earn",share(.5)],["Richest 10% earn",(100*(1-Math.pow(.9,k))).toFixed(1)+"%"]].map(r=>`<div>${r[0]}<b>${r[1]}</b></div>`).join("");
 }
 el.addEventListener("input",draw);draw();
};

/* END OF WIDGETS */

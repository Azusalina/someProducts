/* AS-AD diagram: AD  P = 100 - Y + adShift ; SRAS  P = 20 + Y - srShift ; LRAS vertical at Y = lr. Linear model, units are arbitrary. */
window.Yupi=window.Yupi||{};
Yupi.widgets=Yupi.widgets||{};
Yupi.widgets.asad=function(el,Y){
 Y=Y||window.Yupi;
 const W=620,H=400,L=56,R=16,T=16,B=44,YX=100,PM=140;
 const x=q=>L+(q/YX)*(W-L-R), y=p=>H-B-(p/PM)*(H-T-B);
 const lrY=40;
 el.innerHTML=Y.tx(`<p class="lead" style="margin-top:0">LRAS is vertical at the full-employment output @@Y_f@@. Shift AD (for example a rise in @@C@@, @@I@@, @@G@@ or @@NX@@) and SRAS (for example a change in the cost of production) and read the short-run equilibrium. A gap between @@Y@@ and @@Y_f@@ is the output gap.</p>`)+
  `<svg class="diagram" id="adsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="AS-AD diagram"></svg>
  <div class="sl">
   <label>AD shift <output id="o_ad">0</output><input type="range" id="r_ad" min="-30" max="30" value="0" aria-label="AD shift"></label>
   <label>SRAS shift (right is positive) <output id="o_sr">0</output><input type="range" id="r_sr" min="-30" max="30" value="0" aria-label="SRAS shift"></label>
  </div>
  <div class="readout" id="adout" aria-live="polite"></div>`;
 const svg=el.querySelector("#adsvg"),out=el.querySelector("#adout"),g0=el.querySelector.bind(el);
 function draw(){
  const ad=+g0("#r_ad").value,sr=+g0("#r_sr").value;
  g0("#o_ad").textContent=ad;g0("#o_sr").textContent=sr;
  const a=100+ad,c=20-sr;                 /* AD: P=a-Y, SRAS: P=c+Y */
  const Ye=(a-c)/2,Pe=a-Ye;
  /* long run: output at lrY, price from AD */
  const PLR=a-lrY;
  let s=`<g stroke="var(--line)"><line x1="${L}" y1="${y(0)}" x2="${W-R}" y2="${y(0)}"/><line x1="${L}" y1="${T}" x2="${L}" y2="${y(0)}"/></g>`;
  const line=(p0,slope,col,w,dash,lab)=>{const q2=Math.min(YX,slope>0?(PM-p0)/slope:p0/(-slope));return `<line x1="${x(0)}" y1="${y(p0)}" x2="${x(q2)}" y2="${y(p0+slope*q2)}" stroke="${col}" stroke-width="${w}" ${dash?'stroke-dasharray="6 5"':""} stroke-linecap="round"/><text x="${x(q2)-4}" y="${y(p0+slope*q2)-7}" text-anchor="end" fill="${col}" font-size="12" font-weight="600">${lab}</text>`};
  s+=`<line x1="${x(lrY)}" y1="${y(0)}" x2="${x(lrY)}" y2="${y(PM)}" stroke="var(--mute)" stroke-width="3"/><text x="${x(lrY)+5}" y="${T+12}" fill="var(--mute)" font-size="12" font-weight="600">LRAS</text>`;
  s+=line(100,-1,"var(--line)",2,true,"AD0");s+=line(20,1,"var(--line)",2,true,"SRAS0");
  s+=line(a,-1,"var(--acc)",3,false,"AD");s+=line(c,1,"var(--ink)",3,false,"SRAS");
  s+=`<circle cx="${x(Ye)}" cy="${y(Pe)}" r="5" fill="var(--acc)"/><circle cx="${x(lrY)}" cy="${y(PLR)}" r="5" fill="var(--surface)" stroke="var(--bad)" stroke-width="2"/>`;
  s+=`<g fill="var(--mute)" font-size="11"><text x="${x(Ye)}" y="${y(0)+15}" text-anchor="middle">Y ${Ye.toFixed(0)}</text><text x="${x(lrY)}" y="${y(0)+29}" text-anchor="middle" fill="var(--bad)">Yf ${lrY}</text></g>`;
  s+=`<text x="${W-R}" y="${H-8}" text-anchor="end" fill="var(--mute)" font-size="12">Real output Y</text><text x="14" y="${T+10}" fill="var(--mute)" font-size="12">Price level P</text>`;
  svg.innerHTML=s;
  const gap=Ye-lrY;
  const kind=Math.abs(gap)<0.5?"No gap: equilibrium at full employment":gap<0?"Deflationary gap (unemployment): factor prices fall, SRAS shifts right":"Inflationary gap (overheated): factor prices rise, SRAS shifts left";
  out.innerHTML=[["Short-run price P",Pe.toFixed(1)],["Short-run output Y",Ye.toFixed(1)],["Full-employment Yf",lrY],["Output gap",(gap>0?"+":"")+gap.toFixed(1)],["Long-run price after adjustment",PLR.toFixed(1)],["Reading",kind]].map(r=>`<div>${r[0]}<b>${r[1]}</b></div>`).join("");
 }
 el.addEventListener("input",draw);draw();
};

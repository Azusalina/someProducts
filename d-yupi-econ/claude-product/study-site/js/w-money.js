/* Money market: vertical Ms, downward Md (asset demand). Interest rate n clears the market. Md: n = 12 - 0.1*(M - mdShift). */
window.Yupi=window.Yupi||{};
Yupi.widgets=Yupi.widgets||{};
Yupi.widgets.moneymkt=function(el,Y){
 Y=Y||window.Yupi;
 const W=620,H=360,L=56,R=16,T=16,B=44,MX=200,NX=14;
 const x=m=>L+(m/MX)*(W-L-R), y=n=>H-B-(n/NX)*(H-T-B);
 el.innerHTML=Y.tx(`<p class="lead" style="margin-top:0">Money supply @@M_s@@ is a vertical line set by the central bank and banks. Money demand @@M_d@@ slopes down: a higher nominal interest rate @@n@@ makes people hold less money for asset purposes. The equilibrium @@n@@ sets consumption and investment, hence AD. Move the sliders and read the chain.</p>`)+
  `<svg class="diagram" id="mmsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Money market"></svg>
  <div class="sl">
   <label>Money supply Ms <output id="o_ms">100</output><input type="range" id="r_ms" min="40" max="160" value="100" aria-label="Money supply"></label>
   <label>Money demand shift <output id="o_md">0</output><input type="range" id="r_md" min="-40" max="40" value="0" aria-label="Money demand shift"></label>
  </div>
  <div class="readout" id="mmout" aria-live="polite"></div>`;
 const g0=el.querySelector.bind(el);
 const base=100; /* reference equilibrium money = 100 gives n = 12 - 0.1*(100) + ... below */
 function eq(ms,sh){return Math.max(0,Math.min(NX,12-0.1*(ms-sh)))}
 function draw(){
  const ms=+g0("#r_ms").value,sh=+g0("#r_md").value;
  g0("#o_ms").textContent=ms;g0("#o_md").textContent=sh;
  const n0=eq(100,0),n=eq(ms,sh);
  const mdAt=m=>12-0.1*(m-sh);
  let s=`<g stroke="var(--line)"><line x1="${L}" y1="${y(0)}" x2="${W-R}" y2="${y(0)}"/><line x1="${L}" y1="${T}" x2="${L}" y2="${y(0)}"/></g>`;
  s+=`<line x1="${x(0)}" y1="${y(mdAt(0))}" x2="${x(MX)}" y2="${y(mdAt(MX))}" stroke="var(--line)" stroke-width="2" stroke-dasharray="6 5"/>`;
  s+=`<line x1="${x(100)}" y1="${T}" x2="${x(100)}" y2="${y(0)}" stroke="var(--line)" stroke-width="2" stroke-dasharray="6 5"/>`;
  s+=`<line x1="${x(0)}" y1="${y(12-0.1*(0-sh))}" x2="${x(MX)}" y2="${y(12-0.1*(MX-sh))}" stroke="var(--acc)" stroke-width="3" stroke-linecap="round"/><text x="${x(MX)-4}" y="${y(12-0.1*(MX-sh))-7}" text-anchor="end" fill="var(--acc)" font-size="12" font-weight="600">Md</text>`;
  s+=`<line x1="${x(ms)}" y1="${T}" x2="${x(ms)}" y2="${y(0)}" stroke="var(--ink)" stroke-width="3"/><text x="${x(ms)+5}" y="${T+12}" fill="var(--ink)" font-size="12" font-weight="600">Ms</text>`;
  s+=`<circle cx="${x(ms)}" cy="${y(n)}" r="5" fill="var(--acc)"/><line x1="${L}" y1="${y(n)}" x2="${x(ms)}" y2="${y(n)}" stroke="var(--mute)" stroke-dasharray="4 5"/>`;
  s+=`<g fill="var(--mute)" font-size="11"><text x="${L-6}" y="${y(n)+4}" text-anchor="end">n ${n.toFixed(1)}%</text><text x="${x(ms)}" y="${y(0)+15}" text-anchor="middle">M ${ms}</text><text x="${W-R}" y="${H-8}" text-anchor="end">Quantity of money</text><text x="14" y="${T+10}">Nominal interest rate (%)</text></g>`;
  g0("#mmsvg").innerHTML=s;
  const dn=n-n0;
  const eff=Math.abs(dn)<0.05?"Interest rate unchanged, so no clear change in AD":dn<0?"n falls: C and I rise, AD rises":"n rises: C and I fall, AD falls";
  g0("#mmout").innerHTML=[["Equilibrium n (reference 100, no shift)",n0.toFixed(1)+"%"],["Equilibrium n now",n.toFixed(1)+"%"],["Change in n",(dn>0?"+":"")+dn.toFixed(1)+" points"],["Effect",eff]].map(r=>`<div>${r[0]}<b>${r[1]}</b></div>`).join("");
 }
 el.addEventListener("input",draw);draw();
};

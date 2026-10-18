/* Small open economy: domestic demand P=100-Q, domestic supply P=20+Q, world price Pw (perfectly elastic foreign supply),
   optional tariff t or import quota. Shows imports, tariff revenue / quota rent, surpluses. */
window.Yupi=window.Yupi||{};
Yupi.widgets=Yupi.widgets||{};
Yupi.widgets.trade=function(el,Y){
 Y=Y||window.Yupi;
 const W=620,H=380,L=56,R=16,T=16,B=44,QX=100,PM=110;
 const x=q=>L+(q/QX)*(W-L-R), y=p=>H-B-(p/PM)*(H-T-B);
 let mode="tariff";
 el.innerHTML=Y.tx(`<p class="lead" style="margin-top:0">A small open economy takes the world price @@P_w@@. Domestic demand is @@P=100-Q@@, domestic supply is @@P=20+Q@@. Imports @@=Q_d-Q_s@@. A <b>tariff</b> raises the domestic price by the tariff; a <b>quota</b> fixes the import quantity directly.</p>`)+
  `<div class="row" role="group" aria-label="Trade policy"><button class="chip" data-m="free" aria-pressed="false">Free trade</button><button class="chip" data-m="tariff" aria-pressed="true">Tariff</button><button class="chip" data-m="quota" aria-pressed="false">Quota</button></div>
  <svg class="diagram" id="trsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tariff and quota in a small open economy"></svg>
  <div class="sl">
   <label>World price Pw <output id="o_pw">40</output><input type="range" id="r_pw" min="25" max="55" value="40" aria-label="World price"></label>
   <label id="polwrap"><span id="pollab">Tariff per unit</span> <output id="o_pol">10</output><input type="range" id="r_pol" min="0" max="30" value="10" aria-label="Policy level"></label>
  </div>
  <div class="readout" id="trout" aria-live="polite"></div>`;
 const g0=el.querySelector.bind(el);
 function setPol(){
  const w=g0("#polwrap"),r=g0("#r_pol");
  if(mode==="free"){w.style.display="none";return}
  w.style.display="";
  if(mode==="tariff"){g0("#pollab").textContent="Tariff per unit";r.min=0;r.max=30;r.value=10}
  else{g0("#pollab").textContent="Import quota (units)";r.min=0;r.max=50;r.value=20}
 }
 function draw(){
  const pw=+g0("#r_pw").value,pol=+g0("#r_pol").value;
  g0("#o_pw").textContent=pw;g0("#o_pol").textContent=pol;
  const qs0=pw-20,qd0=100-pw,m0=Math.max(0,qd0-qs0);
  let p=pw,qs=qs0,qd=qd0,m=m0,gov=0,label="No intervention";
  if(mode==="tariff"){p=pw+pol;qs=Math.max(0,p-20);qd=Math.max(0,100-p);m=Math.max(0,qd-qs);if(qs>=qd){m=0;p=Math.min(p,(100+20)/2)}gov=pol*m;label="Tariff revenue"}
  if(mode==="quota"){
   if(pol<m0){m=pol;/* solve Qd - Qs = quota => (100-P)-(P-20)=quota */p=(120-pol)/2;qs=p-20;qd=100-p;gov=(p-pw)*m;label="Quota rent (importers keep it)"}
   else {label="Quota not binding"}
  }
  const cs=(100-p)*qd/2, ps=(p-20)*qs/2;
  const cs0=(100-pw)*qd0/2, ps0=(pw-20)*qs0/2;
  let s=`<g stroke="var(--line)"><line x1="${L}" y1="${y(0)}" x2="${W-R}" y2="${y(0)}"/><line x1="${L}" y1="${T}" x2="${L}" y2="${y(0)}"/></g>`;
  s+=`<line x1="${x(0)}" y1="${y(100)}" x2="${x(90)}" y2="${y(10)}" stroke="var(--acc)" stroke-width="3" stroke-linecap="round"/><text x="${x(90)}" y="${y(10)-8}" text-anchor="end" fill="var(--acc)" font-size="12" font-weight="600">D</text>`;
  s+=`<line x1="${x(0)}" y1="${y(20)}" x2="${x(90)}" y2="${y(110)}" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/><text x="${x(90)-4}" y="${y(110)+14}" text-anchor="end" fill="var(--ink)" font-size="12" font-weight="600">Sd</text>`;
  s+=`<line x1="${x(0)}" y1="${y(pw)}" x2="${W-R}" y2="${y(pw)}" stroke="var(--mute)" stroke-width="2"/><text x="${W-R}" y="${y(pw)+14}" text-anchor="end" fill="var(--mute)" font-size="11">Sf (free trade, price Pw)</text>`;
  if(p!==pw){s+=`<line x1="${x(0)}" y1="${y(p)}" x2="${W-R}" y2="${y(p)}" stroke="var(--bad)" stroke-width="2" stroke-dasharray="6 5"/>`;
   if(gov>0)s+=`<polygon points="${x(qs)},${y(p)} ${x(qd)},${y(p)} ${x(qd)},${y(pw)} ${x(qs)},${y(pw)}" fill="var(--bad)" opacity=".28"/>`}
  s+=`<g fill="var(--mute)" font-size="11"><text x="${x(qs)}" y="${y(0)+15}" text-anchor="middle">Qs ${qs.toFixed(0)}</text><text x="${x(qd)}" y="${y(0)+29}" text-anchor="middle">Qd ${qd.toFixed(0)}</text><text x="${W-R}" y="${H-8}" text-anchor="end">Quantity</text><text x="14" y="${T+10}">Price</text></g>`;
  g0("#trsvg").innerHTML=s;
  const f=n=>n.toFixed(1);
  g0("#trout").innerHTML=[["Domestic price",f(p)],["Domestic output Qs",f(qs)],["Consumption Qd",f(qd)],["Imports Qm",f(m)],[label,f(gov)],["Consumer surplus (vs free trade)",f(cs)+" ("+f(cs-cs0)+")"],["Producer surplus (vs free trade)",f(ps)+" ("+(ps-ps0>=0?"+":"")+f(ps-ps0)+")"]].map(r=>`<div>${r[0]}<b>${r[1]}</b></div>`).join("");
 }
 el.addEventListener("input",draw);
 el.addEventListener("click",e=>{const b=e.target.closest("[data-m]");if(!b)return;mode=b.dataset.m;el.querySelectorAll("[data-m]").forEach(z=>z.setAttribute("aria-pressed",z===b));setPol();draw()});
 setPol();draw();
};

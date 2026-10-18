/* Price-taking firm: MC = m x Q (m slider), price P, total fixed cost TFC. Profit-maximising output where P = MC. */
window.Yupi=window.Yupi||{};
Yupi.widgets=Yupi.widgets||{};
Yupi.widgets.firm=function(el,Y){
 Y=Y||window.Yupi;
 const W=620,H=380,L=56,R=16,T=16,B=44,QX=60,PX=120;
 const x=q=>L+(q/QX)*(W-L-R), y=p=>H-B-(p/PX)*(H-T-B);
 el.innerHTML=Y.tx(`<p class="lead" style="margin-top:0">A price-taker faces @@MR=P@@ and marginal cost @@MC=m\\times Q@@. It produces where @@MR=MC@@. Producer surplus is @@PS=\\sum(P-MC)=TR-TVC@@ and profit is @@PS-TFC@@. Move the sliders and compare with the three cases on the cheat sheet.</p>`)+
  `<svg class="diagram" id="fmsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Marginal cost, price line and producer surplus"></svg>
  <div class="sl">
   <label>Market price P <output id="o_p">60</output><input type="range" id="r_p" min="10" max="110" value="60" aria-label="Market price"></label>
   <label>MC slope m <output id="o_m">2</output><input type="range" id="r_m" min="10" max="40" value="20" aria-label="Marginal cost slope"></label>
   <label>Total fixed cost <output id="o_f">200</output><input type="range" id="r_f" min="0" max="800" step="20" value="200" aria-label="Total fixed cost"></label>
  </div>
  <div class="readout" id="fmout" aria-live="polite"></div>`;
 const svg=el.querySelector("#fmsvg"),out=el.querySelector("#fmout");
 const g0=el.querySelector.bind(el);
 function draw(){
  const p=+g0("#r_p").value,m=+g0("#r_m").value/10,f=+g0("#r_f").value;
  g0("#o_p").textContent=p;g0("#o_m").textContent=m.toFixed(1);g0("#o_f").textContent=f;
  const q=p/m,ps=p*q/2,profit=ps-f;
  const qmax=Math.min(QX,PX/m);
  let s=`<g stroke="var(--line)"><line x1="${L}" y1="${y(0)}" x2="${W-R}" y2="${y(0)}"/><line x1="${L}" y1="${T}" x2="${L}" y2="${y(0)}"/></g>`;
  s+=`<polygon points="${x(0)},${y(p)} ${x(Math.min(q,QX))},${y(p)} ${x(0)},${y(0)}" fill="var(--acc)" opacity=".22"/>`;
  s+=`<line x1="${x(0)}" y1="${y(0)}" x2="${x(qmax)}" y2="${y(m*qmax)}" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/><text x="${x(qmax)-4}" y="${y(m*qmax)-7}" text-anchor="end" fill="var(--ink)" font-size="12" font-weight="600">MC = S</text>`;
  s+=`<line x1="${x(0)}" y1="${y(p)}" x2="${W-R}" y2="${y(p)}" stroke="var(--acc)" stroke-width="3"/><text x="${W-R}" y="${y(p)-7}" text-anchor="end" fill="var(--acc)" font-size="12" font-weight="600">MR = P</text>`;
  if(q<=QX){s+=`<line x1="${x(q)}" y1="${y(0)}" x2="${x(q)}" y2="${y(p)}" stroke="var(--mute)" stroke-dasharray="4 5"/><circle cx="${x(q)}" cy="${y(p)}" r="5" fill="var(--acc)"/><text x="${x(q)}" y="${y(0)+15}" text-anchor="middle" fill="var(--mute)" font-size="11">Q* ${q.toFixed(1)}</text>`}
  s+=`<text x="${W-R}" y="${H-8}" text-anchor="end" fill="var(--mute)" font-size="12">Quantity</text><text x="14" y="${T+10}" fill="var(--mute)" font-size="12">Price, cost</text>`;
  svg.innerHTML=s;
  const fmt=n=>n.toFixed(1);
  out.innerHTML=[["Output Q* (P = MC)",fmt(q)],["Total revenue TR",fmt(p*q)],["Total variable cost",fmt(p*q-ps)],["Producer surplus",fmt(ps)],["Profit",fmt(profit)],["Verdict",profit>=0?"Profit":(ps>0?"Loss, but PS > 0 so still produce":"Loss")]].map(r=>`<div>${r[0]}<b>${r[1]}</b></div>`).join("");
 }
 el.addEventListener("input",draw);draw();
};

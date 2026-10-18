/* Hong Kong style salaries tax: progressive bands then capped at the standard rate on net income. Uses the schedule in HKDSE 2018-I Q.35. */
window.Yupi=window.Yupi||{};
Yupi.widgets=Yupi.widgets||{};
Yupi.widgets.taxcalc=function(el,Y){
 Y=Y||window.Yupi;
 const W=620,H=340,L=56,R=16,T=16,B=44,XMAX=1000;
 const x=v=>L+(v/XMAX)*(W-L-R), y=p=>H-B-(p/16)*(H-T-B);
 el.innerHTML=Y.tx(`<p class="lead" style="margin-top:0">Salaries tax is the <b>lower</b> of the progressive tax and the standard rate times net income: @@\\text{tax}=\\min(\\text{progressive},\\;15\\%\\times\\text{net chargeable income})@@. Net chargeable income is gross income less the allowance. The bands are 2%, 7%, 12% and 17% on successive slices of the band width.</p>`)+
  `<svg class="diagram" id="txsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Average tax rate against gross income"></svg>
  <div class="sl">
   <label>Gross income ($ thousand) <output id="o_g">400</output><input type="range" id="r_g" min="0" max="1000" step="10" value="400" aria-label="Gross income"></label>
   <label>Tax allowance ($ thousand) <output id="o_a">130</output><input type="range" id="r_a" min="0" max="300" step="10" value="130" aria-label="Tax allowance"></label>
   <label>Band width ($ thousand) <output id="o_b">50</output><input type="range" id="r_b" min="20" max="120" step="10" value="50" aria-label="Band width"></label>
   <label>Standard rate (%) <output id="o_s">15</output><input type="range" id="r_s" min="5" max="25" step="1" value="15" aria-label="Standard rate"></label>
  </div>
  <div class="readout" id="txout" aria-live="polite"></div>`;
 const g0=el.querySelector.bind(el);
 const rates=[.02,.07,.12,.17];
 function tax(gross,a,b,s){
  const net=Math.max(0,gross-a);let prog=0,left=net;
  for(let i=0;i<3&&left>0;i++){const sl=Math.min(left,b);prog+=sl*rates[i];left-=sl}
  if(left>0)prog+=left*rates[3];
  return {net,prog,std:net*s,tax:Math.min(prog,net*s)};
 }
 function draw(){
  const gross=+g0("#r_g").value,a=+g0("#r_a").value,b=+g0("#r_b").value,s=+g0("#r_s").value/100;
  g0("#o_g").textContent=gross;g0("#o_a").textContent=a;g0("#o_b").textContent=b;g0("#o_s").textContent=Math.round(s*100);
  let pts="";for(let v=10;v<=XMAX;v+=10){const t=tax(v,a,b,s).tax;pts+=`${x(v).toFixed(1)},${y(100*t/v).toFixed(1)} `}
  const r=tax(gross,a,b,s);const avg=gross>0?100*r.tax/gross:0;
  let sv=`<g stroke="var(--line)"><line x1="${L}" y1="${y(0)}" x2="${W-R}" y2="${y(0)}"/><line x1="${L}" y1="${T}" x2="${L}" y2="${y(0)}"/></g>`;
  sv+=`<polyline points="${pts}" fill="none" stroke="var(--acc)" stroke-width="3"/><circle cx="${x(gross)}" cy="${y(avg)}" r="5" fill="var(--ink)"/>`;
  sv+=`<g fill="var(--mute)" font-size="11"><text x="${W-R}" y="${H-8}" text-anchor="end">Gross income ($ thousand)</text><text x="14" y="${T+10}">Average tax rate (%)</text></g>`;
  g0("#txsvg").innerHTML=sv;
  const f=n=>n.toFixed(1);
  g0("#txout").innerHTML=[["Net chargeable income",f(r.net)],["Progressive tax",f(r.prog)],["Standard-rate tax",f(r.std)],["Tax payable (the lower)",f(r.tax)],["Average tax rate",f(avg)+"%"],["Pays at",r.prog>r.std?"the standard rate":(r.net>0?"the progressive rate":"no tax (outside the tax net)")]].map(z=>`<div>${z[0]}<b>${z[1]}</b></div>`).join("");
 }
 el.addEventListener("input",draw);draw();
};

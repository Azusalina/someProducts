/* Supply and demand diagram (micro0, micro3, micro4, micro6).
   Linear model.  Demand: P = a - Q with a = 100 + demand shift.  Supply: P = c + Q with c = 20 - supply shift.
   opts.modes: subset of none, ceiling, floor, tax, subsidy, quota.  opts.mode: starting mode. */
window.Yupi=window.Yupi||{};
Yupi.widgets=Yupi.widgets||{};
Yupi.widgets.sd=function(el,Y,opts){
 Y=Y||window.Yupi;opts=opts||{};
 const LABEL={none:"No intervention",ceiling:"Price ceiling",floor:"Price floor",tax:"Tax per unit (on sellers)",subsidy:"Subsidy per unit (to sellers)",quota:"Quota (maximum quantity)"};
 const modes=opts.modes||["none"];let mode=opts.mode||modes[0];
 const st={dS:0,sS:0,pol:0,cs:true,ps:true,dwl:true};
 const W=620,H=420,L=56,R=16,T=16,B=48,PX=100,PM=140;
 const x=q=>L+(q/PX)*(W-L-R), y=p=>H-B-(p/PM)*(H-T-B);
 const POLRANGE={ceiling:[0,90,50],floor:[40,130,80],tax:[0,40,10],subsidy:[0,40,10],quota:[10,60,40]};
 const POLLAB={ceiling:"Ceiling price",floor:"Floor price",tax:"Tax per unit",subsidy:"Subsidy per unit",quota:"Quota quantity"};
 el.innerHTML=
  (modes.length>1?`<div class="row" role="group" aria-label="Intervention">${modes.map(m=>`<button class="chip" data-m="${m}" aria-pressed="${m===mode}">${LABEL[m]}</button>`).join("")}</div>`:"")+
  `<svg class="diagram" viewBox="0 0 ${W} ${H}" role="img" aria-label="Supply and demand diagram" id="sdsvg"></svg>
  <div class="sl">
   <label>Demand shift <output id="o_dS">0</output><input type="range" min="-30" max="30" step="1" value="0" id="r_dS" aria-label="Demand shift"></label>
   <label>Supply shift <output id="o_sS">0</output><input type="range" min="-30" max="30" step="1" value="0" id="r_sS" aria-label="Supply shift"></label>
   <label id="polwrap"><span id="pollab">Policy level</span> <output id="o_pol">0</output><input type="range" id="r_pol" aria-label="Policy level"></label>
  </div>
  <div class="row"><label><input type="checkbox" id="c_cs" checked> Consumer surplus</label><label><input type="checkbox" id="c_ps" checked> Producer surplus</label><label><input type="checkbox" id="c_dwl" checked> Deadweight loss</label></div>
  <div class="readout" id="sdout" aria-live="polite"></div>`;
 const svg=el.querySelector("#sdsvg");
 function setPol(){
  const wrap=el.querySelector("#polwrap");
  if(mode==="none"){wrap.style.display="none";return}
  wrap.style.display="";const r=POLRANGE[mode],s=el.querySelector("#r_pol");
  s.min=r[0];s.max=r[1];st.pol=r[2];s.value=r[2];
  el.querySelector("#pollab").textContent=POLLAB[mode];
 }
 function model(){
  const a=100+st.dS,c=20-st.sS;
  const Qe=(a-c)/2,Pe=a-Qe;
  let Q=Qe,Pb=Pe,Ps=Pe,gov=0,note="";
  if(mode==="ceiling"){const p=st.pol;if(p<Pe){const qs=Math.max(0,p-c),qd=Math.max(0,a-p);Q=qs;Pb=p;Ps=p;note="Shortage of "+Math.max(0,qd-qs).toFixed(1)+" units at the ceiling price."}else note="The ceiling is above the equilibrium price, so it does not bind."}
  if(mode==="floor"){const p=st.pol;if(p>Pe){const qd=Math.max(0,a-p),qs=Math.max(0,p-c);Q=qd;Pb=p;Ps=p;note="Surplus of "+Math.max(0,qs-qd).toFixed(1)+" units at the floor price."}else note="The floor is below the equilibrium price, so it does not bind."}
  if(mode==="tax"||mode==="subsidy"){const t=(mode==="tax"?1:-1)*st.pol;Q=Math.max(0,(a-c-t)/2);Pb=a-Q;Ps=Pb-t;gov=t*Q;note=(mode==="tax"?"Buyers bear ":"Buyers gain ")+Math.abs(Pb-Pe).toFixed(1)+" of the "+st.pol+" per unit; sellers "+(mode==="tax"?"bear ":"gain ")+Math.abs(Ps-Pe).toFixed(1)+"."}
  if(mode==="quota"){const q=st.pol;if(q<Qe){Q=q;Pb=a-q;Ps=c+q;note="The quota binds: buyers pay "+Pb.toFixed(1)+" while sellers would accept "+Ps.toFixed(1)+"."}else note="The quota is above the equilibrium quantity, so it does not bind."}
  const CS=(a-Pb)*Q-Q*Q/2, PS=(Ps-c)*Q-Q*Q/2;
  const Wmax=(a-c)*(a-c)/4, Wq=(a-c)*Q-Q*Q;
  return {a,c,Qe,Pe,Q,Pb,Ps,gov,CS,PS,dwl:Math.max(0,Wmax-Wq),note};
 }
 function draw(){
  const m=model();
  const poly=pts=>pts.map(p=>x(p[0]).toFixed(1)+","+y(p[1]).toFixed(1)).join(" ");
  let g=`<g stroke="var(--line)" stroke-width="1"><line x1="${L}" y1="${y(0)}" x2="${W-R}" y2="${y(0)}"/><line x1="${L}" y1="${T}" x2="${L}" y2="${y(0)}"/></g>`;
  g+=`<text x="${W-R}" y="${H-12}" text-anchor="end" fill="var(--mute)" font-size="12">Quantity</text><text x="14" y="${T+10}" fill="var(--mute)" font-size="12">Price</text>`;
  if(st.cs)g+=`<polygon points="${poly([[0,m.a],[m.Q,m.a-m.Q],[m.Q,m.Pb],[0,m.Pb]])}" fill="var(--acc)" opacity=".22"/>`;
  if(st.ps)g+=`<polygon points="${poly([[0,m.Ps],[m.Q,m.Ps],[m.Q,m.c+m.Q],[0,m.c]])}" fill="var(--ink)" opacity=".13"/>`;
  if(st.dwl&&m.dwl>0.01)g+=`<polygon points="${poly([[m.Q,m.a-m.Q],[m.Qe,m.Pe],[m.Q,m.c+m.Q]])}" fill="var(--bad)" opacity=".45"/>`;
  const dq=Math.min(PX,m.a);
  g+=`<line x1="${x(0)}" y1="${y(m.a)}" x2="${x(dq)}" y2="${y(m.a-dq)}" stroke="var(--acc)" stroke-width="3" stroke-linecap="round"/>`;
  const sq=Math.min(PX,PM-m.c);
  g+=`<line x1="${x(0)}" y1="${y(m.c)}" x2="${x(sq)}" y2="${y(m.c+sq)}" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>`;
  g+=`<text x="${x(dq)-4}" y="${y(m.a-dq)-8}" text-anchor="end" fill="var(--acc)" font-size="13" font-weight="600">D</text><text x="${x(sq)-4}" y="${y(m.c+sq)-8}" text-anchor="end" fill="var(--ink)" font-size="13" font-weight="600">S</text>`;
  if(mode==="tax"||mode==="subsidy"){const t=(mode==="tax"?1:-1)*st.pol;const qq=Math.max(0,Math.min(PX,PM-m.c-t));g+=`<line x1="${x(0)}" y1="${y(m.c+t)}" x2="${x(qq)}" y2="${y(m.c+t+qq)}" stroke="var(--ink)" stroke-width="2" stroke-dasharray="6 5"/>`}
  if(mode==="ceiling"||mode==="floor")g+=`<line x1="${x(0)}" y1="${y(st.pol)}" x2="${x(PX)}" y2="${y(st.pol)}" stroke="var(--bad)" stroke-width="2" stroke-dasharray="6 5"/>`;
  if(mode==="quota")g+=`<line x1="${x(st.pol)}" y1="${y(0)}" x2="${x(st.pol)}" y2="${y(PM)}" stroke="var(--bad)" stroke-width="2" stroke-dasharray="6 5"/>`;
  g+=`<circle cx="${x(m.Qe)}" cy="${y(m.Pe)}" r="5" fill="var(--surface)" stroke="var(--ink)" stroke-width="2"/>`;
  if(mode!=="none")g+=`<circle cx="${x(m.Q)}" cy="${y(m.Pb)}" r="5" fill="var(--acc)"/>`;
  g+=`<g fill="var(--mute)" font-size="11"><text x="${x(m.Qe)}" y="${y(0)+16}" text-anchor="middle">Q* ${m.Qe.toFixed(0)}</text><text x="${L-6}" y="${y(m.Pe)+4}" text-anchor="end">P* ${m.Pe.toFixed(0)}</text></g>`;
  svg.innerHTML=g;
  const f=n=>n.toFixed(1);
  el.querySelector("#sdout").innerHTML=[["Free-market P*, Q*",f(m.Pe)+", "+f(m.Qe)],["Quantity traded",f(m.Q)],["Price buyers pay",f(m.Pb)],["Price sellers get",f(m.Ps)],["Consumer surplus",f(m.CS)],["Producer surplus",f(m.PS)],[m.gov>=0?"Government revenue":"Government cost",f(Math.abs(m.gov))],["Deadweight loss",f(m.dwl)]]
   .map(r=>`<div>${r[0]}<b>${r[1]}</b></div>`).join("")+(m.note?`<div style="grid-column:1/-1">${m.note}</div>`:"");
  ["dS","sS","pol"].forEach(k=>{const o=el.querySelector("#o_"+k);if(o)o.textContent=st[k]});
 }
 el.addEventListener("input",e=>{
  const id=e.target.id;
  if(id==="r_dS")st.dS=+e.target.value;
  if(id==="r_sS")st.sS=+e.target.value;
  if(id==="r_pol")st.pol=+e.target.value;
  if(id==="c_cs")st.cs=e.target.checked;
  if(id==="c_ps")st.ps=e.target.checked;
  if(id==="c_dwl")st.dwl=e.target.checked;
  draw();
 });
 el.addEventListener("click",e=>{const b=e.target.closest("[data-m]");if(!b)return;mode=b.dataset.m;el.querySelectorAll("[data-m]").forEach(z=>z.setAttribute("aria-pressed",z===b));setPol();draw()});
 setPol();draw();
};

/* Deposit creation rounds: initial deposit, required reserve ratio, optional cash leakage. */
window.Yupi=window.Yupi||{};
Yupi.widgets=Yupi.widgets||{};
Yupi.widgets.deposit=function(el,Y){
 Y=Y||window.Yupi;
 el.innerHTML=Y.tx(`<p class="lead" style="margin-top:0">A bank receives a new deposit and lends out all its excess reserves; every loan is redeposited (less any cash the public keeps). With no leakage the total deposit creation is the first deposit @@\\times\\dfrac{1}{RRR}@@. Change the numbers and watch each round.</p>`)+
  `<div class="calc">
    <div><label for="dD">First deposit ($)</label><input id="dD" type="number" step="any" value="1000"></div>
    <div><label for="dR">Required reserve ratio (%)</label><input id="dR" type="number" step="any" value="20" min="1" max="100"></div>
    <div><label for="dC">Cash leakage per loan (%)</label><input id="dC" type="number" step="any" value="0" min="0" max="99"></div>
   </div>
   <div class="readout" id="dOut" aria-live="polite"></div>
   <div class="tw"><table id="dTab"></table></div>`;
 const g=id=>el.querySelector(id);
 function run(){
  const D0=parseFloat(g("#dD").value)||0,rrr=(parseFloat(g("#dR").value)||0)/100,leak=(parseFloat(g("#dC").value)||0)/100;
  if(rrr<=0||rrr>1){g("#dOut").innerHTML="<div>Enter a reserve ratio between 1 and 100</div>";g("#dTab").innerHTML="";return}
  let dep=D0,tot=0,totL=0,rows=[];
  for(let i=1;i<=10;i++){
   const req=dep*rrr,exc=dep-req;           /* loan = excess reserves */
   const redep=exc*(1-leak);
   tot+=dep;totL+=exc;
   rows.push([i,dep,req,exc,redep,tot]);
   dep=redep;
  }
  const maxD=D0/rrr,actualRatio=rrr+leak*(1-rrr);
  const finalD=D0/actualRatio,finalL=finalD-D0;
  const f=n=>n.toLocaleString(undefined,{maximumFractionDigits:2});
  g("#dOut").innerHTML=[["Maximum deposits D0 / RRR",f(maxD)],["Maximum bank multiplier",f(1/rrr)],["Actual total deposits (all rounds)",f(finalD)],["Actual loans created",f(finalL)],["Actual multiplier",f(finalD/D0)]].map(r=>`<div>${r[0]}<b>${r[1]}</b></div>`).join("");
  g("#dTab").innerHTML=`<tr><th>Round</th><th>New deposit</th><th>Required reserve</th><th>Excess reserve (lent)</th><th>Redeposited</th><th>Running deposits</th></tr>`+rows.map(r=>`<tr><td>${r[0]}</td>${r.slice(1).map(v=>`<td class="n">${f(v)}</td>`).join("")}</tr>`).join("");
 }
 el.addEventListener("input",run);run();
};

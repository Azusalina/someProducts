/* Exchange rate converter, effect of a currency change on export value, and a balance of payments checker. */
window.Yupi=window.Yupi||{};
Yupi.widgets=Yupi.widgets||{};
Yupi.widgets.fx=function(el,Y){
 Y=Y||window.Yupi;
 el.innerHTML=
  `<h3 style="margin:0 0 6px;font-size:.95rem">Convert at 1 USD = 7.8 HKD</h3>
  <div class="calc"><div><label for="fxA">Amount</label><input id="fxA" type="number" step="any" value="1000"></div>
  <div><label for="fxR">HKD per 1 USD</label><input id="fxR" type="number" step="any" value="7.8"></div></div>
  <div class="readout" id="fxO" aria-live="polite"></div>
  <h3 style="margin:18px 0 6px;font-size:.95rem">Does a depreciation raise export value?</h3>`+
  Y.tx(`<p class="lead" style="margin-top:0">An exporter sells at a fixed price in HKD. Buyers abroad pay in USD, so if the HKD <b>depreciates</b> the USD price they face falls (@@P_{USD}=P_{HKD}/e@@). Whether total export value in HKD (@@P\\times Q@@) rises depends on elasticity. Enter the % change in quantity demanded caused by a 10% fall in the foreign price.</p>`)+
  `<div class="calc"><div><label for="fxP">% fall in the price buyers pay</label><input id="fxP" type="number" step="any" value="10"></div>
  <div><label for="fxQ">% rise in quantity demanded</label><input id="fxQ" type="number" step="any" value="25"></div></div>
  <div class="readout" id="fxE" aria-live="polite"></div>
  <h3 style="margin:18px 0 6px;font-size:.95rem">Balance of payments check</h3>`+
  Y.tx(`<p class="lead" style="margin-top:0">Enter the five items in $ million (a credit is positive, a debit is negative). The balance of payments is @@(1)+(2)+(3)+(4)+(5)@@; the official reserve asset item (6) must offset it so that @@CA+KFA=0@@ in the accounting sense.</p>`)+
  `<div class="calc">
   <div><label for="b1">(1) Visible trade</label><input id="b1" type="number" step="any" value="-120"></div>
   <div><label for="b2">(2) Invisible trade</label><input id="b2" type="number" step="any" value="90"></div>
   <div><label for="b3">(3) Factor income</label><input id="b3" type="number" step="any" value="30"></div>
   <div><label for="b4">(4) Current transfers</label><input id="b4" type="number" step="any" value="-5"></div>
   <div><label for="b5">(5) Capital and financial account</label><input id="b5" type="number" step="any" value="20"></div>
  </div>
  <div class="readout" id="bO" aria-live="polite"></div>`;
 const g=id=>el.querySelector(id),n=id=>parseFloat(g(id).value)||0;
 const f=v=>v.toLocaleString(undefined,{maximumFractionDigits:2});
 function run(){
  const a=n("#fxA"),r=n("#fxR");
  g("#fxO").innerHTML=r?[[`${f(a)} USD in HKD`,f(a*r)],[`${f(a)} HKD in USD`,f(a/r)]].map(x=>`<div>${x[0]}<b>${x[1]}</b></div>`).join(""):"<div>Enter a rate</div>";
  const pd=n("#fxP"),qd=n("#fxQ");
  const e=pd?qd/pd:0,tr=(1+qd/100)*(1-pd/100)-1;
  g("#fxE").innerHTML=[["Elasticity (|%Q / %P|)",f(e)],["Change in total export value",(tr>=0?"+":"")+f(100*tr)+"%"],["Reading",pd&&Math.abs(e-1)<0.001?"Unit elastic: unchanged":e>1?"Elastic: %Q > %P, export value rises":"Inelastic: %Q < %P, export value falls"]].map(x=>`<div>${x[0]}<b>${x[1]}</b></div>`).join("");
  const s=n("#b1")+n("#b2")+n("#b3")+n("#b4")+n("#b5");
  g("#bO").innerHTML=[["BOP balance (1)+...+(5)",(s>0?"+":"")+f(s)],["Reading",s>0?"BOP surplus: official reserves rise (a debit item in the account)":s<0?"BOP deficit: official reserves fall (a credit item)":"Balanced"],["Official reserve item (6)",f(-s)],["Accounting BOP (1) to (6)","0"],["Current account CA = (1)+(2)+(3)+(4)",f(n("#b1")+n("#b2")+n("#b3")+n("#b4"))]].map(x=>`<div>${x[0]}<b>${x[1]}</b></div>`).join("");
 }
 el.addEventListener("input",run);run();
};

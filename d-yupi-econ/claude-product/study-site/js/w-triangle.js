/* Nominal / real / price index triangle plus Fisher gain-loss checker. */
window.Yupi=window.Yupi||{};
Yupi.widgets=Yupi.widgets||{};
Yupi.widgets.triangle=function(el,Y){
 Y=Y||window.Yupi;
 el.innerHTML=Y.tx(`<p class="lead" style="margin-top:0">Enter any two of nominal GDP @@N@@, real GDP @@R@@ and the price index @@P@@ (leave the third blank). Formula: @@N=R\\times P/100@@.</p>`)+
 `<div class="calc"><div><label for="tN">Nominal GDP N</label><input id="tN" type="number" step="any" value="1350"></div><div><label for="tR">Real GDP R</label><input id="tR" type="number" step="any" placeholder="blank"></div><div><label for="tP">Price index P</label><input id="tP" type="number" step="any" value="150"></div></div>
  <div class="readout" id="tOut" aria-live="polite"></div>
  <h3 style="margin:18px 0 6px;font-size:.95rem">Fisher gain and loss</h3>
  <div class="calc"><div><label for="fn">Nominal interest rate (%)</label><input id="fn" type="number" step="any" value="8"></div><div><label for="fe">Expected inflation (%)</label><input id="fe" type="number" step="any" value="3"></div><div><label for="fa">Actual inflation (%)</label><input id="fa" type="number" step="any" value="5"></div></div>
  <div class="readout" id="fOut" aria-live="polite"></div>`;
 const g=id=>el.querySelector(id);
 const num=id=>{const v=g(id).value;return v===""?null:parseFloat(v)};
 function tri(){
  const N=num("#tN"),R=num("#tR"),P=num("#tP");let rows=[];
  const blanks=[N,R,P].filter(v=>v===null).length;
  if(blanks!==1)rows=[["Status","Leave exactly one box blank"]];
  else if(N===null){rows=[["Nominal GDP N",(R*P/100).toFixed(2)]]}
  else if(R===null){rows=[["Real GDP R",(N/P*100).toFixed(2)],["Reading",N>N/P*100?"N > R, so P > 100":N<N/P*100?"N < R, so P < 100":"N = R, so P = 100"]]}
  else {rows=[["Price index P",(N/R*100).toFixed(2)],["Reading",N>R?"N > R, so P > 100":N<R?"N < R, so P < 100":"N = R, so P = 100"]]}
  g("#tOut").innerHTML=rows.map(r=>`<div>${r[0]}<b>${r[1]}</b></div>`).join("");
 }
 function fisher(){
  const n=num("#fn"),e=num("#fe"),a=num("#fa");
  if([n,e,a].some(v=>v===null)){g("#fOut").innerHTML="";return}
  const re=n-e,ra=n-a,d=ra-re;
  const verdict=d>0?"Lender gains, borrower loses (inflation lower than expected)":d<0?"Lender loses, borrower gains (inflation higher than expected)":"No gain or loss";
  g("#fOut").innerHTML=[["Expected real rate",re.toFixed(1)+"%"],["Actual real rate",ra.toFixed(1)+"%"],["Verdict",verdict]].map(r=>`<div>${r[0]}<b>${r[1]}</b></div>`).join("");
 }
 el.addEventListener("input",()=>{tri();fisher()});tri();fisher();
};

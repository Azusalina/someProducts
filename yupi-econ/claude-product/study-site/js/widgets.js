/* Reusable interactive widgets. Each takes (element, Yupi). */
window.Yupi=window.Yupi||{};
Yupi.widgets=Yupi.widgets||{};

/* ---------- Macro 1: GDP / GNI calculator ---------- */
Yupi.widgets.gdpCalc=function(el,Y){Y=Y||window.Yupi;
 const F=[["C","Consumption C",900],["I","Gross fixed capital formation",600],["dI","Change in inventories",0],["G","Government consumption G",300],["X","Exports X (goods and services)",500],["M","Imports M (goods and services)",390],["T","Indirect taxes",0],["Sb","Subsidies",0],["D","Depreciation",30],["NFI","Net factor income from abroad",0]];
 el.innerHTML=Y.tx(`<p class="lead" style="margin-top:0">Type in the components and every measure updates. Formulas follow the notes: @@\\mathrm{GDP}_{\\mathrm{MP}}=C+I+G+(X-M)@@ with @@I=\\text{GDFCF}+\\Delta\\text{inventories}@@.</p>`)+
  `<div class="calc">${F.map(f=>`<div><label for="gc_${f[0]}">${f[1]}</label><input id="gc_${f[0]}" type="number" step="any" data-c="${f[0]}" value="${f[2]}"></div>`).join("")}</div><div class="out" id="gcOut"></div>`;
 const out=el.querySelector("#gcOut");
 function calc(){
  const v={};el.querySelectorAll("[data-c]").forEach(i=>v[i.dataset.c]=parseFloat(i.value)||0);
  const I=v.I+v.dI,gdp=v.C+I+v.G+v.X-v.M,fc=gdp-v.T+v.Sb,ndp=gdp-v.D,gni=gdp+v.NFI,nni=gni-v.D-v.T+v.Sb;
  const f=n=>n.toLocaleString(undefined,{maximumFractionDigits:2});
  out.innerHTML=[["Investment I",I,"\\text{GDFCF}+\\Delta\\text{inv.}"],["GDP at market price",gdp,"C+I+G+(X-M)"],["GDP at factor cost",fc,"\\mathrm{GDP}_{\\mathrm{MP}}-T+Sb"],["Net domestic product",ndp,"\\mathrm{GDP}-D"],["GNI at market price",gni,"\\mathrm{GDP}+\\mathrm{NFI}"],["Net national income at FC",nni,"\\mathrm{GNI}-D-T+Sb"]]
   .map(r=>`<div>${r[0]}<b>${f(r[1])}</b><small>${Y.tx("@@"+r[2]+"@@")}</small></div>`).join("");
 }
 el.addEventListener("input",e=>{if(e.target.matches("[data-c]"))calc()});
 calc();
};

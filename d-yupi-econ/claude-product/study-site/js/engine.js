/* Shared engine for chapter pages.
   A chapter data file calls Yupi.register({...}). See data/macro1.js for the full shape.
   Formulas: write @@ latex @@ (inline) or @@@ latex @@@ (display). Dollar signs stay plain text (money). */
(function(){
"use strict";
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const Y=window.Yupi=window.Yupi||{};
Y.manifest=Y.manifest||[];Y.widgets=Y.widgets||{};

/* ---------- icons (Phosphor, from js/icons.js) ---------- */
function ic(n,cls){const p=(window.YUPI_ICONS||{})[n]||"";return `<svg class="ic${cls?" "+cls:""}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${p}</svg>`}
function hydrateIcons(root){$$("[data-ic]",root||document).forEach(e=>{e.outerHTML=ic(e.dataset.ic)})}
Y.ic=ic;Y.hydrateIcons=hydrateIcons;

/* ---------- text + LaTeX ---------- */
function clean(s){return String(s).replace(/—/g," - ").replace(/–/g,"-").replace(/ · /g,"; ")}
function tx(s){
 s=clean(s);
 return s.replace(/@@@([\s\S]+?)@@@|@@([\s\S]+?)@@/g,(m,d,i)=>{
  const src=(d||i).replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").trim();
  try{return window.katex?katex.renderToString(src,{displayMode:!!d,throwOnError:false,strict:false}):esc(src)}
  catch(e){return `<code>${esc(src)}</code>`}
 });
}
Y.tx=tx;Y.esc=esc;

/* ---------- builder used by data files ---------- */
Y.builder=function(defaults){
 const Q=[];defaults=defaults||{};
 return {Q,
  q(id,s,src,p,pr,stem,o,a,w,x){Q.push(Object.assign({id,s,src,p,pr,stem,o,a,w},x||{}))},
  tb:(h,r)=>({t:{h,r}})};
};

/* ---------- theme ---------- */
(function(){
 let t=null;try{t=localStorage.getItem("yupi.theme")}catch(e){}
 if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;
})();
Y.toggleTheme=function(){
 const cur=document.documentElement.dataset.theme||((window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light");
 const nxt=cur==="dark"?"light":"dark";document.documentElement.dataset.theme=nxt;
 try{localStorage.setItem("yupi.theme",nxt)}catch(e){}
};

/* ---------- reveal on enter (hierarchy only; no scroll listeners) ---------- */
let io=null;
function reveal(root){
 const els=$$(".card:not(.in),.chcard:not(.in)",root||document);
 if(!("IntersectionObserver" in window)||(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)){els.forEach(e=>e.classList.add("in"));return}
 io=io||new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}}),{rootMargin:"0px 0px -6% 0px"});
 els.forEach(e=>{if(!e.classList.contains("reveal")){e.classList.add("reveal")}io.observe(e)});
}
Y.reveal=reveal;

/* ---------- lightbox / scan badges ---------- */
let FILES={},lbz=100;
function imgPath(f,p){const F=FILES[f];return "assets/pages/"+F.pre+(F.pad?String(p).padStart(F.pad,"0"):p)+".jpg"}
function badge(f,p,printed,label){
 const F=FILES[f]||{short:f};
 const pr=printed?` (${F.printedLabel||"printed p."}${printed})`:"";
 return `<button class="src" data-f="${f}" data-p="${p}" data-pr="${esc(printed||"")}" title="Open the original scan">${ic("file-text")}<span>${esc(label||F.short||f)} p.${p}${pr}</span></button>`;
}
function openLB(f,p,pr){
 const F=FILES[f];if(!F)return;
 $("#lbt").textContent=`${F.dir}${F.name}  |  PDF page ${p}${pr?"  ("+pr+")":""}`;
 const box=$("#lbs");box.innerHTML="";lbz=100;
 const im=new Image();im.alt="scan of the original page";im.style.width="100%";
 im.onerror=()=>{box.innerHTML=`<p>Scan not found at <code>${esc(im.getAttribute("src"))}</code>.<br>Open the PDF instead: <code>${esc(F.dir+F.name)}</code>, page ${p}.</p>`};
 im.src=imgPath(f,p);box.appendChild(im);$("#lb").classList.add("on");
}
function zoom(d){lbz=Math.max(50,Math.min(400,lbz+d));const i=$("#lbs img");if(i)i.style.width=lbz+"%"}
Y.badge=badge;

/* ---------- boot ---------- */
Y.register=function(cfg){
 FILES=cfg.files;
 const PFX="yupi."+cfg.id+".";
 const store={get(k,d){try{const v=localStorage.getItem(PFX+k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem(PFX+k,JSON.stringify(v))}catch(e){}}};
 const S={read:store.get("read",{}),ans:store.get("ans",{}),lng:store.get("long",{}),num:store.get("num",{}),zh:store.get("zh",false)};
 const save=()=>{store.set("read",S.read);store.set("ans",S.ans);store.set("long",S.lng);store.set("num",S.num);store.set("zh",S.zh)};
 const LEARN=cfg.learn||[],EX=cfg.ex||[],Q=cfg.q||[],LONG=cfg.long||[],CS=cfg.cs||[],VERIFY=cfg.verify||[];
 const SEC=cfg.sec||{},KEY=cfg.keys||{},QF=cfg.qfile||"pp",AF=cfg.afile||"ans";
 const srcRow=a=>a&&a.length?`<div class="srcs">Source: ${a.map(x=>badge(x[0],x[1],x[2])).join("")}</div>`:"";
 const zhLine=z=>z?`<span class="zh">${esc(z)}</span>`:"";
 const setH=(el,h)=>{el.innerHTML=tx(h)};

 /* header */
 document.title=cfg.title+" | yupi econ";
 $("#title").textContent=cfg.title;setH($("#sub"),cfg.sub||"");
 if(cfg.lead)setH($("#learnLead"),cfg.lead);
 if(cfg.csLead)setH($("#csLead"),cfg.csLead);
 if(cfg.qLead)setH($("#qLead"),cfg.qLead);
 const hasTab={learn:LEARN.length||(cfg.widgets||[]).some(w=>w.tab!=="ex"),ex:EX.length||(cfg.widgets||[]).some(w=>w.tab==="ex"),prac:Q.length,long:LONG.length,cs:CS.length,rev:true};
 $$("#nav button").forEach(b=>{if(!hasTab[b.dataset.t])b.classList.add("hid")});
 const first=$$("#nav button:not(.hid)")[0];
 if(first&&first.dataset.t!=="learn"){$$("#nav button").forEach(x=>x.setAttribute("aria-selected",x===first));$$("section.tab").forEach(s=>s.classList.toggle("on",s.id==="t-"+first.dataset.t))}

 /* learn */
 function renderLearn(){
  setH($("#learnList"),LEARN.map(c=>`
   <details class="card" data-id="${c.id}"><summary><span>${esc(c.t)}${zhLine(c.zh)}</span></summary>
    <div class="body">${c.h}${srcRow(c.src)}
    <div class="row"><button class="btn sm ${S.read[c.id]?"":"sec"}" data-read="${c.id}">${ic(S.read[c.id]?"check-circle":"check")}<span>${S.read[c.id]?"Got it":"Mark as read"}</span></button></div></div></details>`).join(""));
 }
 /* widgets */
 function renderWidgets(){
  const box=$("#learnWidgets"),exBox=$("#exWidgets");
  (cfg.widgets||[]).forEach((w,i)=>{
   const host=w.tab==="ex"?exBox:box;
   const d=document.createElement("div");d.innerHTML=`<h2 class="sec">${esc(w.title)}</h2><div class="card q" id="wg${i}"></div>`;
   host.appendChild(d);const el=d.querySelector(".card");
   if(w.html)setH(el,w.html);if(w.init)w.init(el,Y);
  });
 }

 /* mcq engine */
 function optsHTML(o,sel,ans,done){
  return o.map((t,i)=>{const L="ABCD"[i];let c="";
   if(done){if(L===ans)c=" ok";else if(L===sel)c=" bad"}
   return `<button class="opt${c}" data-opt="${L}" ${done?"disabled":""}><b>${L}</b><span>${t}</span></button>`}).join("");
 }
 const tableHTML=t=>`<div class="tw"><table><tr>${t.h.map(h=>`<th>${h}</th>`).join("")}</tr>${t.r.map(r=>`<tr>${r.map((c,i)=>`<td${i?' class="n"':""}>${c}</td>`).join("")}</tr>`).join("")}</table></div>`;
 const chainHTML=c=>`<ul class="chain">${c.map(x=>`<li>${x}</li>`).join("")}</ul>`;
 function fbHTML(x,r){
  const k=KEY[x.s];const qf=x.f||QF;
  return `<div class="fb ${r.ok?"ok":"bad"}"><div class="verdict">${ic(r.ok?"check-circle":"x-circle")}<span>${r.ok?"Correct":"Not quite"}. Answer ${x.a}.</span></div>${x.w}
   ${x.v?`<div class="note">${ic("warning")} ${x.v}</div>`:""}
   ${(k||x.p)?`<div class="srcs">${k&&x.p?`Printed key: ${badge(k[0],k[1],k[2])} `:""}${x.p?`Question: ${badge(qf,x.p,x.pr)}`:""}</div>`:""}</div>`;
 }
 function qHTML(x){
  const r=S.ans[x.id],done=!!r,qf=x.f||QF;
  return `<div class="card q in" data-qid="${x.id}">
   <div class="qh"><span class="id">${x.id}</span><span>${esc(x.src)}</span>${x.p?badge(qf,x.p,x.pr):""}${x.v?`<span class="tag">check</span>`:""}</div>
   <div class="stem">${x.stem}</div>${x.t?tableHTML(x.t):""}${x.c?chainHTML(x.c):""}
   <div class="opts">${optsHTML(x.o,r&&r.sel,x.a,done)}</div>
   <div>${done?fbHTML(x,r):""}</div>
   ${done?`<div class="row"><button class="btn sec sm" data-retry="${x.id}">${ic("arrow-counter-clockwise")}<span>Try again</span></button></div>`:""}
  </div>`;
 }
 const swapQ=(card,x)=>{const d=document.createElement("div");d.innerHTML=tx(qHTML(x));card.replaceWith(d.firstElementChild)};

 /* examples */
 function renderEx(){
  setH($("#exList"),EX.map(x=>{
   const r=S.ans["ex"+x.id],n=S.num[x.id];
   let ctl="";
   if(x.k==="mcq")ctl=`<div class="opts">${optsHTML(x.o,r&&r.sel,x.a,!!r)}</div>`;
   if(x.k==="num")ctl=`<div class="row"><input type="number" step="any" id="n_${x.id}" placeholder="Your answer (${x.u})" aria-label="Your answer" value="${n&&n.v!==undefined?n.v:""}" style="max-width:230px"><button class="btn sm" data-check="${x.id}">Check</button></div>${n&&n.ok!=null?`<div class="fb ${n.ok?"ok":"bad"}"><div class="verdict">${ic(n.ok?"check-circle":"x-circle")}<span>${n.ok?"Correct":"Not yet. Try again, or reveal the working."}</span></div></div>`:""}`;
   if(x.k==="open")ctl=`<textarea id="o_${x.id}" aria-label="Your answer" placeholder="Write your answer first">${esc((S.num[x.id]&&S.num[x.id].t)||"")}</textarea>`;
   const open=(r&&x.k==="mcq")||(S.num[x.id]&&S.num[x.id].show);
   return `<div class="card q" data-exid="${x.id}">
    <div class="qh"><span class="id">${x.id}</span><b>${esc(x.t)}</b></div>
    <div class="stem">${x.stem}</div>${ctl}
    <div class="row"><button class="btn sec sm" data-show="${x.id}">${ic(open?"eye-slash":"eye")}<span>${open?"Hide working":"Show working"}</span></button></div>
    <div class="${open?"":"hid"} fb ok" id="w_${x.id}">${x.w}</div>
    ${srcRow(x.src)}</div>`}).join(""));
 }

 /* practice */
 let filt="all";
 function renderChips(){
  const keys=Object.keys(SEC);
  const chips=[["all","All"]].concat(keys.length>1?keys.map(k=>[k,SEC[k]]):[]).concat([["todo","Not answered"],["wrong","Wrong"]]);
  $("#chips").innerHTML=chips.map(c=>`<button class="chip" aria-pressed="${filt===c[0]}" data-f="${c[0]}">${esc(c[1])}</button>`).join("");
 }
 function renderQ(){
  const list=Q.filter(x=>filt==="all"||x.s===filt||(filt==="todo"&&!S.ans[x.id])||(filt==="wrong"&&S.ans[x.id]&&!S.ans[x.id].ok));
  setH($("#qList"),list.length?list.map(qHTML).join(""):'<div class="empty">Nothing here yet.</div>');
 }

 /* long */
 function renderLong(){
  setH($("#longList"),LONG.map(x=>{
   const r=S.lng[x.id]||{},qf=x.f||QF,kf=x.kf||AF;
   const answer=x.k&&(typeof x.k[0]==="string"?x.k:[kf,x.k[0],x.k[1]]);
   return `<div class="card q" data-lid="${x.id}">
    <div class="qh"><span class="id">${x.id}</span><span>${esc(x.src)}</span>${x.p?badge(qf,x.p,x.pr):""}</div>
    <div class="stem">${x.q}</div>
    <textarea id="l_${x.id}" aria-label="Your answer" placeholder="Write your answer first">${esc(r.t||"")}</textarea>
    <div class="row"><button class="btn sec sm" data-lshow="${x.id}">${ic(r.show?"eye-slash":"eye")}<span>${r.show?"Hide model answer":"Show model answer"}</span></button></div>
    <div class="fb ok ${r.show?"":"hid"}"><b>Model answer</b><br>${x.m}
     ${answer?`<div class="srcs">Printed answer: ${badge(answer[0],answer[1],answer[2])}</div>`:""}
     <div class="row"><span>How did you do?</span>
      ${[["good","Got it"],["part","Partly"],["miss","Missed"]].map(g=>`<button class="chip" aria-pressed="${r.rate===g[0]}" data-lrate="${x.id}|${g[0]}">${g[1]}</button>`).join("")}</div></div>
   </div>`}).join(""));
 }
 function renderCS(){setH($("#csList"),CS.map(c=>`<details class="card"><summary><span>${esc(c.t)}${zhLine(c.zh)}</span></summary><div class="body">${c.h}${srcRow(c.src)}</div></details>`).join(""))}
 function wrong(){
  const w=Q.filter(x=>S.ans[x.id]&&!S.ans[x.id].ok);
  setH($("#wrongList"),w.length?w.map(qHTML).join(""):'<div class="empty">No wrong answers yet. They collect here automatically.</div>');
 }
 function renderVerify(){
  if(!VERIFY.length){$("#verifyBox").classList.add("hid");return}
  setH($("#verifyList"),VERIFY.map((v,i)=>`<div class="card q"><b>${i+1}. ${esc(v[0])}</b><p style="margin:.45em 0 0">${v[1]}</p>${v[2]?srcRow([v[2]]):""}</div>`).join(""));
 }

 /* stats + summary for the index page */
 function stats(){
  const rd=LEARN.filter(c=>S.read[c.id]).length;
  const ans=Q.filter(x=>S.ans[x.id]),ok=ans.filter(x=>S.ans[x.id].ok).length;
  const exd=EX.filter(x=>S.ans["ex"+x.id]||(S.num[x.id]&&(S.num[x.id].ok||S.num[x.id].show))).length;
  const ln=LONG.filter(x=>S.lng[x.id]&&S.lng[x.id].rate).length;
  const chips=[];
  if(LEARN.length)chips.push(`Cards read <b>${rd}/${LEARN.length}</b>`);
  if(EX.length)chips.push(`Examples <b>${exd}/${EX.length}</b>`);
  if(Q.length)chips.push(`MCQ <b>${ans.length}/${Q.length}</b> done, <b>${ans.length?Math.round(100*ok/ans.length):0}%</b> right`);
  if(LONG.length)chips.push(`Long <b>${ln}/${LONG.length}</b> graded`);
  $("#stats").innerHTML=chips.map(c=>`<span class="stat">${c}</span>`).join("");
  if(Q.length){$("#pstats").innerHTML=`Answered <b>${ans.length}</b> of ${Q.length}. Correct <b>${ok}</b>, wrong <b>${ans.length-ok}</b>.`;$("#pbar").style.width=(100*ans.length/Q.length)+"%"}
  store.set("sum",{done:rd+exd+ans.length+ln,total:LEARN.length+EX.length+Q.length+LONG.length,ok,an:ans.length});
 }

 /* events */
 document.addEventListener("click",e=>{
  const b=e.target.closest(".src");if(b){const F=FILES[b.dataset.f];openLB(b.dataset.f,b.dataset.p,b.dataset.pr?((F&&F.printedLabel)||"printed p.")+b.dataset.pr:"");return}
  const rd=e.target.closest("[data-read]");
  if(rd){const id=rd.dataset.read;S.read[id]=!S.read[id];save();rd.className="btn sm "+(S.read[id]?"":"sec");rd.innerHTML=ic(S.read[id]?"check-circle":"check")+`<span>${S.read[id]?"Got it":"Mark as read"}</span>`;stats();return}
  const o=e.target.closest(".opt");
  if(o&&!o.disabled){
   const card=o.closest("[data-qid]"),L=o.dataset.opt;
   if(card){const x=Q.find(z=>z.id===card.dataset.qid);S.ans[x.id]={sel:L,ok:L===x.a};save();swapQ(card,x);stats();wrong();return}
   const ex=o.closest("[data-exid]");
   if(ex){const x=EX.find(z=>z.id===ex.dataset.exid);S.ans["ex"+x.id]={sel:L,ok:L===x.a};save();renderEx();stats();return}
  }
  const rt=e.target.closest("[data-retry]");
  if(rt){delete S.ans[rt.dataset.retry];save();const x=Q.find(z=>z.id===rt.dataset.retry);swapQ(rt.closest("[data-qid]"),x);stats();wrong();return}
  const c=e.target.closest("[data-check]");
  if(c){const x=EX.find(z=>z.id===c.dataset.check);const v=parseFloat($("#n_"+x.id).value);
   S.num[x.id]=Object.assign(S.num[x.id]||{},{v:isNaN(v)?"":v,ok:isNaN(v)?null:Math.abs(v-x.a)<(x.tol||0.5)});save();renderEx();stats();return}
  const s=e.target.closest("[data-show]");
  if(s){const id=s.dataset.show;const w=$("#w_"+id);const hid=w.classList.toggle("hid");
   s.innerHTML=ic(hid?"eye":"eye-slash")+`<span>${hid?"Show working":"Hide working"}</span>`;
   S.num[id]=Object.assign(S.num[id]||{},{show:!hid});save();stats();return}
  const ls=e.target.closest("[data-lshow]");
  if(ls){const id=ls.dataset.lshow;S.lng[id]=Object.assign(S.lng[id]||{},{show:!(S.lng[id]&&S.lng[id].show)});save();renderLong();stats();return}
  const lr=e.target.closest("[data-lrate]");
  if(lr){const [id,v]=lr.dataset.lrate.split("|");S.lng[id]=Object.assign(S.lng[id]||{},{rate:v});save();renderLong();stats();return}
  const ch=e.target.closest("#chips .chip");
  if(ch){filt=ch.dataset.f;renderChips();renderQ();reveal($("#qList"))}
 });
 document.addEventListener("input",e=>{
  const t=e.target;
  if(t.id&&t.id.startsWith("o_")){const id=t.id.slice(2);S.num[id]=Object.assign(S.num[id]||{},{t:t.value});save()}
  if(t.id&&t.id.startsWith("l_")){const id=t.id.slice(2);S.lng[id]=Object.assign(S.lng[id]||{},{t:t.value});save()}
 });
 $("#resetP").onclick=()=>{if(confirm("Clear all practice answers in this chapter?")){Q.forEach(x=>delete S.ans[x.id]);save();renderQ();stats();wrong()}};
 $("#nav").addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;
  $$("#nav button").forEach(x=>x.setAttribute("aria-selected",x===b));
  $$("section.tab").forEach(s=>s.classList.toggle("on",s.id==="t-"+b.dataset.t));
  if(b.dataset.t==="rev")wrong();
  reveal($("#t-"+b.dataset.t));scrollTo({top:0});
 });
 $("#zhBtn").onclick=()=>{S.zh=!S.zh;save();applyZh()};
 function applyZh(){document.body.classList.toggle("showzh",S.zh);$("#zhBtn").setAttribute("aria-pressed",S.zh)}
 $("#themeBtn").onclick=Y.toggleTheme;
 $("#lbm").onclick=()=>zoom(-25);$("#lbp").onclick=()=>zoom(25);$("#lbf").onclick=()=>{lbz=100;zoom(0)};
 $("#lbx").onclick=()=>$("#lb").classList.remove("on");
 $("#lb").addEventListener("click",e=>{if(e.target.id==="lb"||e.target.id==="lbs")$("#lb").classList.remove("on")});
 addEventListener("keydown",e=>{if(e.key==="Escape")$("#lb").classList.remove("on")});

 /* boot */
 renderLearn();renderWidgets();renderEx();renderChips();renderQ();renderLong();renderCS();wrong();renderVerify();applyZh();stats();hydrateIcons();
 reveal();
 const h=location.hash.slice(1),hb=$(`#nav [data-t="${h}"]`);if(hb&&!hb.classList.contains("hid"))hb.click();
 if(h==="selftest"){
  const bad=Q.filter(x=>!x.o||x.o.length<2||!"ABCD".includes(x.a)).map(x=>x.id);
  const ids=Q.map(x=>x.id),dup=ids.filter((id,i)=>ids.indexOf(id)!==i);
  const tex=document.querySelectorAll(".katex-error").length;
  const em=(document.body.innerText.match(/[—–]/g)||[]).length;
  document.title=`selftest ${bad.length||dup.length||tex||em?"FAIL bad="+bad+" dup="+dup+" texerr="+tex+" dash="+em:"ok"} Q=${Q.length} EX=${EX.length} LONG=${LONG.length} LEARN=${LEARN.length}`;
 }
};
})();

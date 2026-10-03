(() => {
  "use strict";
  const lessons=window.BA_LESSONS, questions=window.BA_QUESTIONS;
  const main=document.querySelector("#lesson"), values={}, quiz={};
  let completed=[], current=0;
  try {
    const saved=JSON.parse(localStorage.getItem("ba-mastery")||"[]");
    if(Array.isArray(saved))completed=[...new Set(saved.filter(id=>lessons.slice(0,7).some(l=>l.id===id)))];
    document.body.classList.toggle("dark",localStorage.getItem("ba-theme")==="dark");
  }catch{}
  const fmt=(v,d=2)=>new Intl.NumberFormat("en-HK",{maximumFractionDigits:d}).format(v);
  const money=v=>(v<0?"−":"")+"$"+fmt(Math.abs(v));
  const cents=v=>Math.round(v*100);
  function math(el){
    if(window.renderMathInElement)window.renderMathInElement(el,{delimiters:[{left:"\\[",right:"\\]",display:true},{left:"\\(",right:"\\)",display:false}],throwOnError:false,strict:"ignore",trust:false});
  }
  function intro(l){
    return '<div class="chapter-intro"><div class="eyebrow">'+l.tag+' / '+l.english.toUpperCase()+'</div><h1>'+l.heading+'</h1><p class="lede">'+l.intro+'</p><div class="meta-row">'+l.pills.map(p=>'<span class="pill">'+p+'</span>').join("")+'</div></div>';
  }
  function progress(){
    document.querySelector("#progress-label").textContent=completed.length+" / 7 章已掌握";
    document.querySelector("#progress-fill").style.width=completed.length/7*100+"%";
    document.querySelector("#chapters").innerHTML=lessons.slice(0,7).map((l,i)=>'<a class="chapter '+(i===current?"active":"")+'" href="#'+l.id+'" '+(i===current?'aria-current="page"':"")+'><span class="num">'+String(i+1).padStart(2,"0")+'</span><span>'+l.title+'<small>'+l.english+'</small></span>'+(completed.includes(l.id)?'<span class="check" aria-label="已掌握">✓</span>':"")+'</a>').join("");
  }
  function render(focus=false){
    const found=lessons.findIndex(l=>l.id===(location.hash.slice(1)||"model"));
    current=found<0?0:found;
    const l=lessons[current];main.innerHTML=intro(l)+l.body;
    document.title=l.title+" · COST / LOGIC | HKDSE BAFS 2026";
    document.querySelector("#breadcrumb").textContent=(current<7?String(current+1).padStart(2,"0"):"REF")+" / "+l.title;
    document.querySelector("#previous").disabled=current===0;
    document.querySelector("#next").disabled=current===lessons.length-1;
    const mastered=document.querySelector("#mastered");
    mastered.checked=completed.includes(l.id);mastered.closest("label").hidden=current===7;
    main.querySelectorAll("[data-lab]").forEach(bindLab);
    if(l.id==="practice")renderQuiz();
    math(main);progress();
    if(focus){window.scrollTo({top:0,behavior:"instant"});main.focus({preventScroll:true});}
  }
  const metrics=entries=>'<div class="metrics">'+entries.map(([l,v])=>'<div class="metric"><small>'+l+'</small><strong>'+v+'</strong></div>').join("")+'</div>';
  function chart(maxX,lines,q,title){
    const W=600,H=290,left=65,right=22,top=20,bottom=42;
    const maxY=Math.max(1,...lines.map(l=>l.fn(maxX)),...lines.map(l=>l.fn(0)))*1.12;
    const x=q=>left+q/maxX*(W-left-right),y=c=>H-bottom-c/maxY*(H-top-bottom);
    let grid="";
    for(let i=0;i<=4;i++){
      const a=maxX*i/4,b=maxY*i/4;
      grid+='<line class="grid" x1="'+left+'" y1="'+y(b)+'" x2="'+(W-right)+'" y2="'+y(b)+'"/><text x="'+(left-10)+'" y="'+(y(b)+4)+'" text-anchor="end">'+fmt(b,0)+'</text><text x="'+x(a)+'" y="'+(H-bottom+21)+'" text-anchor="middle">'+fmt(a,0)+'</text>';
    }
    return '<svg class="chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+title+'"><title>'+title+'</title>'+grid+'<text x="14" y="16">$</text><text x="'+(W-22)+'" y="'+(H-5)+'" text-anchor="end">q / 件</text>'+lines.map(l=>'<path class="line '+l.cls+'" d="M'+x(0)+','+y(l.fn(0))+' L'+x(maxX)+','+y(l.fn(maxX))+'"/>').join("")+'<line class="guide" x1="'+x(q)+'" y1="'+top+'" x2="'+x(q)+'" y2="'+(H-bottom)+'"/><circle class="point" cx="'+x(q)+'" cy="'+y(lines[0].fn(q))+'" r="4"/></svg>';
  }
  function bindLab(lab){
    const type=lab.dataset.lab,nums=[...lab.querySelectorAll('input[type="number"]')];
    if(type==="cvp")nums.filter(i=>i.name!=="q").forEach(i=>i.step="0.01");
    nums.forEach(i=>{if(values[type]?.[i.name]!==undefined)i.value=values[type][i.name];});
    const named=name=>lab.querySelector('input[name="'+name+'"]');
    function update(e){
      if(e?.target.type==="range")named(e.target.name.replace("-slider","")).value=e.target.value;
      values[type]=Object.fromEntries(nums.map(i=>[i.name,i.value]));
      lab.querySelectorAll('input[type="range"]').forEach(s=>{const n=named(s.name.replace("-slider",""));s.max=Math.max(Number(n.max),Number(n.value)||0);s.value=n.value;});
      const out=lab.querySelector(".lab-output");
      const invalid=nums.find(i=>i.value.trim()===""||!Number.isFinite(Number(i.value))||Number(i.value)<Number(i.min)||Number(i.value)>Number(i.max)||(["q","P","S","DA","DB"].includes(i.name)&&!Number.isInteger(Number(i.value))));
      if(invalid){out.innerHTML='<div class="error" role="status">请填写范围内的非负数；件数须为整数。各输入框上下限限制了实验范围。</div>';return;}
      if(type==="cvp"&&nums.some(i=>i.name!=="q"&&Math.abs(Number(i.value)*100-cents(Number(i.value)))>0.000001)){
        out.innerHTML='<div class="error" role="status">CVP 实验的金额最多保留两位小数。</div>';return;
      }
      const d=Object.fromEntries(nums.map(i=>[i.name,Number(i.value)]));
      out.innerHTML={model:modelOutput,cvp:cvpOutput,costing:costingOutput,mix:mixOutput}[type](d);math(out);
    }
    lab.addEventListener("input",update);
    lab.querySelector("[data-reset]").addEventListener("click",()=>{nums.forEach(i=>i.value=i.defaultValue);update();});
    lab.querySelector("[data-break-even]")?.addEventListener("click",()=>{
      const p=Number(named("p").value),v=Number(named("v").value),F=Number(named("F").value);
      if(p>v&&F>=0&&Number.isFinite(F)){
        const needed=Math.ceil(cents(F)/(cents(p)-cents(v))),q=named("q");
        if(needed<=Number(q.max)){q.value=needed;update();}
        else lab.querySelector(".lab-output").innerHTML='<div class="error">不亏损销量超出实验上限 1,000,000 件。请降低固定成本或提高单位贡献。</div>';
      }
    });update();
  }
  function modelOutput({v,F,q}){
    return '<div class="legend"><span>总成本 C</span><span class="var">变动成本 VC</span><span class="fix">固定成本 F</span></div>'
    +chart(2000,[{cls:"cost",fn:x=>v*x+F},{cls:"variable",fn:x=>v*x},{cls:"fixed",fn:()=>F}],q,"成本随业务量线性变化；当前业务量 "+q+" 件，总成本 "+(v*q+F))
    +metrics([["总成本 C(q)",money(v*q+F)],["平均成本 / 件",q?money(v+F/q):"无定义"],["多做一件 ΔC",money(v)]])
    +'<div class="result-note">\\(C('+q+')='+v+'\\times'+q+'+'+F+'='+(v*q+F)+'\\)。'+(q?'每件固定成本 '+money(F/q)+'；固定总额仍为 '+money(F)+'。':"q = 0 时平均成本无定义。")+'</div>';
  }
  function cvpOutput({p,v,F,q,T}){
    // Integer cents prevent a theoretical 100 units from rounding up to 101.
    const kc=cents(p)-cents(v),k=kc/100,profit=(kc*q-cents(F))/100;
    const be=kc>0?cents(F)/kc:null,target=kc>0?(cents(F)+cents(T))/kc:null,mos=be===null?null:q-be;
    const edge=F===0?(k===0?"固定成本与贡献均为 0，任何销量利润均为 0；正目标利润不可达。":"q = 0 时利润为 0；正销量均亏损，正目标利润不可达。"):"单位贡献非正，无法通过增加销量覆盖正固定成本。";
    return '<div class="legend"><span>总成本 C</span><span class="rev">收入 R</span></div>'
    +chart(Math.max(100,q*1.2,be===null?0:be*1.25),[{cls:"cost",fn:x=>v*x+F},{cls:"revenue",fn:x=>p*x}],q,"销量 "+q+" 件，利润 "+profit+"，单位贡献 "+k)
    +metrics([["单位贡献 k",money(k)],["本期利润 π",money(profit)],["CMR",p?fmt(k/p*100)+"%":"无定义"]])
    +metrics([["理论 BE / 件",be===null?"不适用":fmt(be)],["目标最低整数销量",target===null?(F===0&&T===0?"0":"不可达"):fmt(Math.ceil(target),0)],["MOS %",mos===null||q===0?"无定义":fmt(mos/q*100)+"%"]])
    +'<div class="result-note">\\(\\pi=('+p+'-'+v+')\\times'+q+'-'+F+'='+profit+'\\)。'+(be!==null?'不亏损最低整数销量：'+fmt(Math.ceil(be),0)+' 件；理论 BE 销售额：'+money(be*p)+'。MOS：'+fmt(mos)+' 件。':edge)+'</div>';
  }
  function statement(title,rows){
    return '<div class="table-wrap"><table><thead><tr><th>'+title+'</th><th class="amount">HK$</th></tr></thead><tbody>'+rows.map(([l,v,total])=>'<tr '+(total?'class="total"':"")+'><td>'+l+'</td><td class="amount">'+v+'</td></tr>').join("")+'</tbody></table></div>';
  }
  function costingOutput({P,S,p,vm,vs,Fm,h,Fn}){
    if(S>P)return '<div class="error">零期初存货下，销量 S 不能超过产量 P。请调整参数。</div>';
    const end=P-S,U=Fm-h*P,revenue=p*S,contribution=revenue-vm*S-vs*S,mc=contribution-Fm-Fn,ac=revenue-(vm+h)*S-U-vs*S-Fn;
    return statement("Marginal costing",[
      ["Sales",fmt(revenue)],["− Variable production COGS",fmt(vm*S)],["− Variable selling expenses",fmt(vs*S)],["Contribution",fmt(contribution),true],["− Fixed factory overhead",fmt(Fm)],["− Fixed non-manufacturing",fmt(Fn)],["Net profit",fmt(mc),true]
    ])+statement("Absorption costing",[
      ["Sales",fmt(revenue)],["Unadjusted production COGS",fmt((vm+h)*S)],[U>=0?"+ Under-absorption":"− Over-absorption",fmt(Math.abs(U))],["Adjusted COGS",fmt((vm+h)*S+U),true],["Gross profit",fmt(revenue-(vm+h)*S-U)],["− Variable selling expenses",fmt(vs*S)],["− Fixed non-manufacturing",fmt(Fn)],["Net profit",fmt(ac),true]
    ])+metrics([["期末存货 / 件",fmt(end,0)],["MC 存货价值",money(end*vm)],["AC 存货价值",money(end*(vm+h))]])
    +'<div class="result-note">\\(U='+Fm+'-'+h+'\\times'+P+'='+U+'\\)。利润差：\\(\\pi_{AC}-\\pi_{MC}=('+P+'-'+S+')\\times'+h+'='+(end*h)+'\\)。来自存货内含固定生产成本的确认时间差。</div>';
  }
  function mixOutput({L,DA,DB}){
    const A=Math.min(DA,L/2),B=Math.min(DB,(L-2*A)/5),usedA=A*2,usedB=B*5,unused=Math.max(0,L-usedA-usedB),width=n=>n/Math.max(1,L)*520;
    return '<div class="section-label">MACHINE HOURS / 优先 A，再分配 B</div><svg class="chart" viewBox="0 0 600 115" role="img" aria-label="A 使用 '+fmt(usedA)+' 小时，B 使用 '+fmt(usedB)+' 小时，剩余 '+fmt(unused)+' 小时"><title>资源分配</title><rect x="40" y="30" width="520" height="24" rx="3" fill="var(--line)"/><rect x="40" y="30" width="'+width(usedA)+'" height="24" fill="var(--green)"/><rect x="'+(40+width(usedA))+'" y="30" width="'+width(usedB)+'" height="24" fill="var(--accent)"/><text x="40" y="79">A · '+fmt(usedA)+' h</text><text x="225" y="79">B · '+fmt(usedB)+' h</text><text x="560" y="79" text-anchor="end">剩余 · '+fmt(unused)+' h</text></svg>'
    +metrics([["A 产量 / 件",fmt(A)],["B 产量 / 件",fmt(B)],["总贡献",money(30*A+50*B)]])
    +'<div class="result-note">\\(q_A=\\min('+DA+','+L+'/2)='+A+'\\)；\\(q_B=\\min('+DB+',('+L+'-2q_A)/5)='+B+'\\)。按连续产量计算，未取整。需求用尽后可保留闲置资源。</div>';
  }
  function renderQuiz(){
    const list=main.querySelector("#quiz-list");
    list.innerHTML=questions.map((q,i)=>'<section class="quiz-card" data-question="'+q.id+'"><div class="quiz-number">QUESTION '+String(i+1).padStart(2,"0")+'</div><div class="quiz-prompt" id="prompt-'+q.id+'">'+q.prompt+'</div><form class="quiz-form">'+(q.type==="choice"?'<select name="answer" aria-labelledby="prompt-'+q.id+'" required><option value="">选择答案</option>'+q.options.map(o=>'<option>'+o+'</option>').join("")+'</select>':'<input name="answer" type="number" step="any" placeholder="输入数值" required aria-labelledby="prompt-'+q.id+'">')+'<button type="submit">检验答案 →</button></form><div class="feedback" aria-live="polite"></div></section>').join("");
    questions.forEach(q=>{
      const card=list.querySelector('[data-question="'+q.id+'"]'),input=card.querySelector("[name=answer]");
      if(quiz[q.id]){input.value=quiz[q.id].value;feedback(card,q,quiz[q.id].correct);}
      card.querySelector("form").addEventListener("submit",e=>{
        e.preventDefault();const value=input.value;
        const correct=q.type==="choice"?value===q.answer:Number.isFinite(Number(value))&&Math.abs(Number(value)-q.answer)<=q.tolerance;
        quiz[q.id]={value,correct};feedback(card,q,correct);score();
      });
    });score();
  }
  function feedback(card,q,correct){
    const el=card.querySelector(".feedback");el.className="feedback "+(correct?"good":"bad");
    el.innerHTML="<strong>"+(correct?"✓ 正确。":"再检查一次。")+"</strong> "+q.explanation;math(el);
  }
  function score(){main.querySelector("#quiz-score").textContent=Object.values(quiz).filter(a=>a.correct).length+" / "+questions.length;}
  document.querySelector("#previous").addEventListener("click",()=>{if(current>0)location.hash=lessons[current-1].id;});
  document.querySelector("#next").addEventListener("click",()=>{if(current<lessons.length-1)location.hash=lessons[current+1].id;});
  document.querySelector("#mastered").addEventListener("change",e=>{
    const id=lessons[current].id;completed=completed.filter(v=>v!==id);
    if(e.target.checked&&current<7)completed.push(id);
    try{localStorage.setItem("ba-mastery",JSON.stringify(completed));}catch{}progress();
  });
  const themeButton=document.querySelector("#theme");
  function themeLabel(){themeButton.textContent=document.body.classList.contains("dark")?"浅色":"深色";}
  themeButton.addEventListener("click",()=>{
    const dark=document.body.classList.toggle("dark");try{localStorage.setItem("ba-theme",dark?"dark":"light");}catch{}themeLabel();
  });
  function preparePrint(){
    const content=document.querySelector("#print-content");
    content.innerHTML=lessons.map(l=>'<article class="print-lesson">'+intro(l)+l.body+'</article>').join("");
    content.querySelectorAll("details").forEach(d=>d.open=true);
    content.querySelector("#quiz-list").innerHTML=questions.map((q,i)=>'<div class="quiz-card"><h3>'+(i+1)+'. '+q.prompt+'</h3><p>答案：'+q.answer+'。'+q.explanation+'</p></div>').join("");
    content.querySelector("#quiz-score").closest(".card").remove();math(content);
  }
  window.addEventListener("beforeprint",preparePrint);
  document.querySelector("#print").addEventListener("click",()=>window.print());
  window.addEventListener("hashchange",()=>render(true));
  themeLabel();render();
})();

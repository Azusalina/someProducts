'use strict';
const HKUModel = (() => {
  const defaults = {chinese:'4',english:'5',math:'5**',m1:'5**',bafs:'5*',ict:'5*',econ:'4'};
  const subjects = {chinese:'中文',english:'英文',math:'數學必修',m1:'M1',bafs:'BAFS 會計',ict:'ICT',econ:'經濟'};
  const points = {'U':0,'1':1,'2':2,'3':3,'4':4,'5':5.5,'5*':7,'5**':8.5};
  const rank = Object.fromEntries(Object.keys(points).map((x,i)=>[x,i]));
  const recipes = {
    JS6298:{type:'artsai',formula:'2×英文 + 1.5×數學 + 兩科指定選修×1.5 + 最佳餘下一科'},
    JS6755:{type:'business',formula:'1.5×英文 + 1.5×數學 + 最佳三科 + 0.2×第六科'},
    JS6767:{type:'business',formula:'1.5×英文 + 1.5×數學 + 最佳三科 + 0.2×第六科'},
    JS6793:{type:'business',formula:'1.5×英文 + 1.5×數學 + 最佳三科 + 0.2×第六科'},
    JS6810:{type:'six',formula:'最佳六科'},
    JS6200:{type:'engmath',formula:'英文 + 數學 + 最佳三科'},
    JS6224:{type:'engmath',formula:'英文 + 數學 + 最佳三科（2026獨立代碼）'},
    JS6248:{type:'engmath',formula:'英文 + 數學 + 最佳三科'},
    JS6729:{type:'actuarial',formula:'1.2×英文 + 1.2×數學 + 1.2×M1 + 最佳兩科'},
    JS6779:{type:'stats',formula:'1.5×數學 + 最佳四科'},
    JS6999:{type:'engmath',formula:'英文 + 數學 + 最佳三科'},
    JS6602:{type:'innovation',formula:'2×英文 + 2×數學 + 最佳三科（M1／ICT×2，其他×1.5）'}
  };
  const sum = a=>a.reduce((s,n)=>s+n,0);
  function score(code,grades) {
    const r=recipes[code];if(!r)return null;
    const p=Object.fromEntries(Object.keys(defaults).map(k=>[k,points[grades[k]]??0]));
    const term=(k,w=1)=>({subject:k,label:subjects[k],grade:grades[k],points:p[k],weight:w,value:Math.round(p[k]*w*100)/100});
    const best=(exclude,n,weight=()=>1)=>Object.keys(p).filter(k=>!exclude.includes(k)).map(k=>term(k,weight(k))).sort((a,b)=>b.value-a.value).slice(0,n);
    let terms=[];
    if(r.type==='engmath')terms=[term('english'),term('math'),...best(['english','math'],3)];
    if(r.type==='business'){const b=best(['english','math'],4);terms=[term('english',1.5),term('math',1.5),...b.slice(0,3),term(b[3].subject,.2)];}
    if(r.type==='six')terms=best([],6);
    if(r.type==='stats')terms=[term('math',1.5),...best(['math'],4)];
    if(r.type==='actuarial')terms=[term('english',1.2),term('math',1.2),term('m1',1.2),...best(['english','math','m1'],2)];
    if(r.type==='innovation')terms=[term('english',2),term('math',2),...best(['english','math'],3,k=>['m1','ict'].includes(k)?2:1.5)];
    if(r.type==='artsai'){
      const specified=['m1','ict','econ'];let highest=-Infinity;
      for(let i=0;i<specified.length;i++)for(let j=i+1;j<specified.length;j++){
        const a=specified[i],b=specified[j],candidate=[term('english',2),term('math',1.5),term(a,1.5),term(b,1.5),...best(['english','math',a,b],1)],total=sum(candidate.map(t=>t.value));
        if(total>highest){highest=total;terms=candidate;}
      }
    }
    return {...r,value:Math.round(sum(terms.map(t=>t.value))*100)/100,terms,year:2026,kind:'2026實際取錄分布與計分原則',source:'data/hku26.pdf'};
  }
  function eligibility(code,grades,csd='attained'){
    if(!recipes[code])return {status:'removed',text:'此課程已移出清單'};
    if(code==='JS6224')return {status:'historical',text:'2027 改由 JS6999 入學'};
    const reasons=[];
    const atLeast=(key,grade)=>rank[grades[key]]>=rank[grade];
    let english='3',chinese='3',math='3';
    if(['JS6755','JS6767','JS6793','JS6248'].includes(code))english='4';
    if(code==='JS6810'){english='5';chinese='4';}
    if(['JS6729','JS6779','JS6602'].includes(code))math='4';
    for(const [k,g] of [['english',english],['chinese',chinese],['math',math]])if(!atLeast(k,g))reasons.push(`${subjects[k]}須${g}`);
    if(Object.keys(grades).filter(k=>['bafs','ict','econ','m1'].includes(k)&&atLeast(k,'3')).length<2)reasons.push('至少兩科合資格選修達3');
    if(['JS6200','JS6999','JS6298'].includes(code)&&!atLeast('ict','3')&&!atLeast('econ','3'))reasons.push('須有指定選修達3（你的科目中為ICT／經濟）');
    if(code==='JS6793'&&!atLeast('ict','3'))reasons.push('須有指定理科或ICT達3（你的科目中為ICT）');
    if(code==='JS6729'&&!atLeast('m1','4'))reasons.push('M1／M2須4');
    if(code==='JS6602'&&!atLeast('ict','4'))reasons.push('指定科技科須4（你的科目中為ICT）');
    if(csd==='not')reasons.push('公民科須達標');
    if(reasons.length)return {status:'blocked',text:reasons.join('；')};
    return {status:csd==='attained'?'meets':'pending',text:csd==='attained'?'已知科目門檻符合；仍須校方評核':'已知科目門檻符合；公民科待確認'};
  }
  function summary(grades){const p=Object.values(grades).map(g=>points[g]??0).sort((a,b)=>b-a);return {best5:sum(p.slice(0,5)),best6:sum(p.slice(0,6)),business:score('JS6755',grades).value};}
  function cleanState(input,codes){
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('筆記格式不正確');
    const grades={...defaults};for(const k of Object.keys(defaults))if(Object.hasOwn(points,input.grades?.[k]))grades[k]=input.grades[k];
    const valid=x=>typeof x==='string'&&codes.includes(x);
    return {version:2,grades,csd:input.version===2&&['unknown','attained','not'].includes(input.csd)?input.csd:'attained',plan:[...new Set((Array.isArray(input.plan)?input.plan:[]).filter(c=>valid(c)&&c!=='JS6224'))],compare:[...new Set((Array.isArray(input.compare)?input.compare:[]).filter(valid))].slice(0,4),notes:Object.fromEntries(codes.filter(k=>typeof input.notes?.[k]==='string').map(k=>[k,input.notes[k].slice(0,20000)])),globalNotes:typeof input.globalNotes==='string'?input.globalNotes.slice(0,40000):''};
  }
  return {defaults,subjects,points,recipes,score,eligibility,summary,cleanState};
})();
if(typeof module!=='undefined')module.exports=HKUModel;

import {codeFor, simulate} from './model.mjs';

const D = window.JUPAS_DATA;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = n => Math.round(n).toLocaleString('en-US');
const compact = n => Math.abs(n)>=1000000 ? `${(n/1000000).toFixed(2)}m` : `${(n/1000).toFixed(0)}k`;
const find = (list,id) => D[list].find(v=>v.id===id);
const storageKey = 'jupasanalysis-v1';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch {}
const validIds = ids => Array.isArray(ids) ? [...new Set(ids.filter(id=>find('programmes',id)))] : [];
let selected = validIds(saved.selected);
if (!selected.length) selected = ['cs','da','qfin'];
let active = selected.includes(saved.active) ? saved.active : selected[0];
let year = saved.year === '2026' ? '2026' : '2027';
let view = 'paths';
let zoom = 1;
let salaryRelevant = false;
const costDefaults = {months:18,horizon:10,salary:30000,after:40000,stipend:0,fundedMonths:0,tuition:300000,living:5000,discount:3};
let cost = {...costDefaults};
let preset = 'custom';
let costResult;
const store = () => { try { localStorage.setItem(storageKey,JSON.stringify({selected,active,year,theme:document.documentElement.dataset.theme})); } catch {} };
document.documentElement.dataset.theme = saved.theme === 'dark' ? 'dark' : 'light';
$('#theme').addEventListener('click',()=>{document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';store();});
const sourceLink = (id, short = false) => {
  const s=find('sources',id);
  return s ? `<a class="source-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="${esc(s.title)}">${short?(s.type.includes('官方')?'官方来源 ↗':'原始来源 ↗'):esc(s.title)+' ↗'}</a>` : '';
};
const badges = arr => arr.map(x=>`<span class="chip">${esc(x)}</span>`).join('');
const selectedPrograms = () => D.programmes.filter(p=>selected.includes(p.id));
const pageIntro = (n,title,copy) => `<div class="section-heading"><div><p class="eyebrow">${n}</p><h2>${title}</h2><p>${copy}</p></div></div>`;

function renderPaths() {
  const count = selected.length;
  const pick = find('programmes',active);
  $('#workspace').innerHTML = `<div class="paths-layout">
    <aside class="selector panel"><div class="selector-heading"><h2>选择要探索的方向</h2><span>${count} / 11</span></div>
      <label class="year-label">本科入学年度<select id="year"><option value="2027" ${year==='2027'?'selected':''}>2027–28</option><option value="2026" ${year==='2026'?'selected':''}>2026–27（参考）</option></select></label>
      <div class="selection-actions"><button id="select-all" class="text-button">全部显示</button><button id="select-default" class="text-button">恢复三条示例</button></div>
      ${['CDS','跨院','商学院'].map(g=>`<p class="group-label">${g==='CDS'?'School of Computing & Data Science':g==='跨院'?'跨院双学位':'Business School'}</p><div class="programme-list">${D.programmes.filter(p=>p.group===g).map(p=>`<label class="programme-choice ${selected.includes(p.id)?'chosen':''}"><input type="checkbox" data-select="${p.id}" ${selected.includes(p.id)?'checked':''}><span><strong>${esc(p.short)}</strong><small>${esc(p.zh)} · JS${codeFor(p,year)}</small></span></label>`).join('')}</div>`).join('')}
      <p class="aside-note">显示的是学位／专业核心方向。Delta+ 是同一 BEng 的不同入学与学习安排。</p>
    </aside>
    <div class="path-main">
      <div class="map-heading"><div><p class="eyebrow">EXPLORE THE CONNECTIONS</p><h2>本科之后，不只一种走法。</h2></div><div class="map-tools"><button id="zoom-out" aria-label="缩小路径地图">−</button><output id="zoom-label">100%</output><button id="zoom-in" aria-label="放大路径地图">+</button><button id="zoom-reset">复位</button></div></div>
      <div class="notice"><span class="notice-mark">↗</span><p>${year==='2027'?'2027–28：Applied AI 已并入 6999；CS / AI & Data Science / Applied AI 可于首年结束选择。':'2026–27 参考：Applied AI 使用独立入口 6224。'} ${sourceLink('cds',true)}</p></div>
      <p class="map-hint">左右滚动或拖动空白处查看完整路径；点击节点查看详情。虚线表示须补先修与研究经历的可能路径，非保证录取。</p>
      <div id="map-scroll" class="map-scroll" tabindex="0" aria-label="横向升学职业路径，可左右滚动"><div id="map-sized"><div id="map-canvas" class="map-canvas">
      <div class="lane-labels"><span>01 / 本科与入学</span><span>02 / 方向与补强 <em>分析建议</em></span><span>03 / 授课硕士 <em>路径推断</em></span><span>04 / 研究硕博 <em>路径推断</em></span><span>05 / 职业出口 <em>可能方向</em></span></div>
      ${selectedPrograms().map(p=>`<div class="path-lane ${p.id===active?'active-lane':''}">
        <button class="node degree-node" data-active="${p.id}"><span class="node-meta">JS${codeFor(p,year)} · ${p.years} 年</span><strong>${esc(p.short)}</strong><span>${esc(p.degree)}</span>${p.delta?'<small>另有 JS6200 · Delta+</small>':''}</button>
        <button class="node" data-active="${p.id}" data-detail="focus"><span class="node-meta">学习方向</span><strong>${esc(p.zh)}</strong><span>${p.focus.map(esc).join(' / ')}</span><small>选修／第二专业须核对学分与资格</small></button>
        <div class="node node-stack"><span class="node-meta">升学例子 · 须另行申请</span>${p.masters.slice(0,3).map(id=>`<button data-master="${id}" data-active="${p.id}">${esc(find('masters',id).name)} <span>↗</span></button>`).join('')}<button class="more-link" data-active="${p.id}" data-detail="masters">查看 ${p.masters.length} 个硕士例子 →</button></div>
        <button class="node research-node" data-active="${p.id}" data-detail="research"><span class="node-meta">可本科申请 / 经研究训练再申请</span><strong>${p.research.length===1&&p.research[0]==='business'?'Business PhD':p.research.includes('business')?'CDS / Business PhD':'CDS MPhil / PhD'}</strong><span>${p.research.map(id=>esc(find('research',id).fields.split('；')[0])).join(' / ')}</span><small>研究问题 · 导师匹配 · 推荐信</small></button>
        <button class="node career-node" data-active="${p.id}" data-detail="career"><span class="node-meta">香港职位市场 · 非起薪</span><strong>${p.roles.slice(0,2).map(id=>esc(find('roles',id).name.split(' · ')[0])).join(' / ')}</strong><span>${p.roles.map(id=>find('roles',id)).find(r=>r.hk)?(()=>{const r=p.roles.map(id=>find('roles',id)).find(r=>r.hk);return `${esc(r.name.split(' · ')[0])}：${compact(r.hk[0])}–${compact(r.hk[2])} HKD/月`;})(): '可比薪酬待补'}</span><small>本科也可直接就业，硕博并非必经</small></button>
        <div class="route-branches"><span>↳ 本科 → 直接就业</span><span>↳ 本科 → 申请 MPhil / PhD（按学位资格）</span><span>↳ 本科 → 授课硕士 → 就业 / 再申请研究学位</span></div>
      </div>`).join('')}
      </div></div></div>
      <section class="detail-panel panel" id="detail"><div class="detail-top"><div><p class="eyebrow">SELECTED PATH / JS${codeFor(pick,year)}</p><h2>${esc(pick.zh)} <span>${esc(pick.short)}</span></h2></div><span class="pill">${esc(pick.degree)}</span></div>
        <p>${esc(pick.summary)} ${sourceLink(pick.source,true)}</p>
        <div class="detail-grid"><div><h3>需要主动设计的部分 <span class="inference">分析建议</span></h3><p>${esc(pick.patch)}</p>${sourceLink('second',true)}</div><div class="tradeoff"><h3>选择的代价与边界</h3><p>${esc(pick.tradeoff)}</p></div></div>
        ${pick.delta?`<details class="delta-info"><summary>JS6200 Delta+：同一学位，另一种学习安排</summary><p>香港 2.5 年 + 上海 1.5 年，含六个月 Co-operative Placement；选择 CS 或 AI & Data Science。仅限直接获 JS6200 录取，不接受内部转入。比较时考虑上海生活、实习地点与跨院选课安排。${sourceLink('delta',true)}</p></details>`:''}
        <div class="detail-tabs" aria-label="路径详细资料"><button data-detailtab="masters" class="active">硕士 ${pick.masters.length}</button><button data-detailtab="research">MPhil / PhD</button><button data-detailtab="career">职业与薪酬</button></div><div id="detail-body"></div>
      </section>
    </div></div>`;
  $('#year').onchange=e=>{year=e.target.value;store();renderPaths();};
  $('[id="select-all"]').onclick=()=>{selected=D.programmes.map(p=>p.id);store();renderPaths();};
  $('#select-default').onclick=()=>{selected=['cs','da','qfin'];active='cs';store();renderPaths();};
  document.querySelectorAll('[data-select]').forEach(c=>c.onchange=()=>{
    const id=c.dataset.select;
    if (c.checked) selected.push(id); else if(selected.length>1) selected=selected.filter(v=>v!==id); else {c.checked=true;$('#announce').textContent='请至少保留一个方向。';return;}
    if(!selected.includes(active)) active=selected[0];store();renderPaths();
  });
  document.querySelectorAll('[data-active]').forEach(b=>b.onclick=()=>{
    const oldScroll=$('#map-scroll').scrollLeft;
    active=b.dataset.active;const detail=b.dataset.detail || 'masters';const master=b.dataset.master;store();renderPaths();$('#map-scroll').scrollLeft=oldScroll;
    setDetailTab(detail==='focus'?'masters':detail,master);
    $('#announce').textContent=`已选择 ${find('programmes',active).zh}`;
    if(master || b.dataset.detail) $('#detail').scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  });
  document.querySelectorAll('[data-detailtab]').forEach(b=>b.onclick=()=>setDetailTab(b.dataset.detailtab));
  $('#zoom-out').onclick=()=>setZoom(zoom-.1);$('#zoom-in').onclick=()=>setZoom(zoom+.1);$('#zoom-reset').onclick=()=>{setZoom(1);$('#map-scroll').scrollLeft=0;};
  setZoom(zoom);setDetailTab('masters');bindDrag();
}

function setZoom(z) {
  zoom=Math.max(.55,Math.min(1.4,Math.round(z*100)/100));
  const canvas=$('#map-canvas');if(!canvas)return;
  canvas.style.transform=`scale(${zoom})`;$('#map-sized').style.width=`${canvas.offsetWidth*zoom}px`;$('#map-sized').style.height=`${canvas.offsetHeight*zoom}px`;$('#zoom-label').textContent=`${Math.round(zoom*100)}%`;
}
function bindDrag() {
  const el=$('#map-scroll');let drag;
  el.onpointerdown=e=>{if(e.pointerType!=='mouse' || e.button!==0 || e.target.closest('button,a'))return;drag={x:e.clientX,left:el.scrollLeft};el.setPointerCapture(e.pointerId);el.classList.add('dragging');};
  el.onpointermove=e=>{if(drag)el.scrollLeft=drag.left-(e.clientX-drag.x);};
  const end=()=>{drag=null;el.classList.remove('dragging');};el.onpointerup=end;el.onpointercancel=end;
}
function setDetailTab(tab, highlighted) {
  if(!['masters','research','career'].includes(tab))tab='masters';
  const p=find('programmes',active);
  document.querySelectorAll('[data-detailtab]').forEach(b=>{b.classList.toggle('active',b.dataset.detailtab===tab);b.setAttribute('aria-pressed',String(b.dataset.detailtab===tab));});
  if(tab==='masters') $('#detail-body').innerHTML=`<p class="detail-caption">以下为课程内容匹配的升学例子，不是联招衔接保证。官方门槛与分析建议分别标注；你在 2027 入读本科后，须以实际硕士申请年份重新核对。</p><div class="graduate-grid">${p.masters.map(id=>{const m=find('masters',id);return `<article class="graduate-card ${highlighted===id?'highlighted':''}"><span class="node-meta">${esc(m.place)} · 授课硕士</span><h3>${esc(m.name)}</h3><p class="graduate-focus">${esc(m.focus)}</p><p>${esc(m.gate)}</p>${m.sources.map(s=>sourceLink(s,true)).join(' ')}</article>`;}).join('')}</div>`;
  if(tab==='research') $('#detail-body').innerHTML=`<div class="research-note"><strong>研究路线可以分叉，授课硕士不是博士必经步骤。</strong><p>本科 → 申请 PhD，或本科 → MPhil / 研究准备 → PhD；录取取决于具体学位资格与研究匹配。博士是研究训练，适合以问题为驱动的长期投入。</p></div><div class="graduate-grid">${p.research.map(id=>{const r=find('research',id);return `<article class="graduate-card"><span class="node-meta">研究学位 · 路径推断</span><h3>${esc(r.name)}</h3><p>${esc(r.fields)}</p><p>${esc(r.gate)}</p>${r.sources.map(s=>sourceLink(s,true)).join(' ')}</article>`;}).join('')}</div><div class="funding-row"><div><h3>PGS 参考：HK$19,135 / 月</h3><p>商学院页面基本费率，自 2025-09 起。学习资助，非工资；将来入学费率与资格须重查。${sourceLink('phdadmit',true)}</p></div><div><h3>HKPFS：HK$344,400 / 年</h3><p>2027–28 call circular 的竞争性奖项，支持三年；第四年另查。不得与普通 PGS 重复叠加。${sourceLink('hkpfs',true)}</p></div></div>`;
  if(tab==='career') $('#detail-body').innerHTML=`<p class="detail-caption">本科、硕士、博士可以进入部分相同职位。以下为相关职位的市场区间，不是学历溢价或该专业毕业生的薪酬预测。</p><div class="graduate-grid">${p.roles.map(id=>{const r=find('roles',id);return `<article class="graduate-card"><span class="node-meta">${r.year||'数据待补'} · 香港职位</span><h3>${esc(r.name)}</h3><p class="salary-value">${r.hk?`HK$${num(r.hk[0])}–${num(r.hk[2])}<small> / 月 · Low–High</small>`:'暂缺可比薪酬'}</p><p>${esc(r.note)}</p>${r.source?sourceLink(r.source):''}</article>`;}).join('')}</div><a class="inline-action" href="#salary">查看完整香港与海外薪酬证据 →</a>`;
}

function renderCompare() {
  $('#workspace').innerHTML=`${pageIntro('COMPARE THE TRADE-OFFS','专业名称之外，看训练与出口。','比较的是课程方向与准备成本；不设置虚构的就业率、录取概率或学校排名分数。')}
    <div class="notice"><span class="notice-mark">i</span><p>全本科范围：CDS 学位与 BStat 三个 Professional Cores，补入 6298 跨院双学位，以及商学院 IBGM / QFin。6200 Delta+ 与 6999 共享两个 BEng 学位。</p></div>
    <div class="comparison-wrap panel"><table><caption class="sr-only">11 个 HKU 本科方向的训练、升学和代价比较</caption><thead><tr><th>本科方向 / 2027 入口</th><th>训练重心</th><th>建议的硕博方向</th><th>主要代价与边界</th><th>探索</th></tr></thead><tbody>${D.programmes.map(p=>`<tr><td><strong>${esc(p.zh)}</strong><span>${esc(p.short)}</span><small>JS${p.code} · ${p.years} 年 · ${esc(p.degree)}</small>${sourceLink(p.source,true)}</td><td>${badges(p.skills)}<p>${p.focus.map(esc).join(' / ')}</p></td><td><span>${p.masters.slice(0,2).map(id=>esc(find('masters',id).name)).join(' / ')}</span><small class="inference">路径匹配推断，须满足先修与入学资格</small></td><td>${esc(p.tradeoff)}</td><td><button class="round-action" data-explore="${p.id}" aria-label="探索${esc(p.zh)}">↗</button></td></tr>`).join('')}</tbody></table></div>
    <div class="comparison-notes"><article class="panel"><h3>FinTech vs QFin</h3><p>FinTech 从金融科技应用、计算与监管切入；QFin 从金融建模、数学统计与定价切入。走同一岗位仍需用课程、研究及实习证明能力。</p>${sourceLink('fintech',true)} ${sourceLink('qfin',true)}</article><article class="panel"><h3>IBGM 的第二专业很关键</h3><p>第二专业是课程组成部分；数学、统计与编程课程决定转向数据或金融工程的准备程度。QFin 第二专业须甄选，课程还有配额与先修限制。</p>${sourceLink('ibgm',true)} ${sourceLink('second',true)}</article></div>`;
  document.querySelectorAll('[data-explore]').forEach(b=>b.onclick=()=>{active=b.dataset.explore;if(!selected.includes(active))selected.push(active);store();location.hash='paths';});
}

function rangeChart(roles) {
  const rows=roles.filter(r=>r.hk);const w=920,h=70+rows.length*58;const x=n=>295+n/100000*520;
  return `<svg class="range-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="香港职位薪酬区间图，单位为港币每月；线段代表来源 Low 至 High，圆点为来源 Median"><title>香港职位市场薪酬区间，非应届生起薪</title>${[0,25000,50000,75000,100000].map(n=>`<line class="grid-line" x1="${x(n)}" y1="30" x2="${x(n)}" y2="${h-20}"/><text class="axis-label" x="${x(n)}" y="18" text-anchor="middle">${n===0?'0':compact(n)}</text>`).join('')}${rows.map((r,i)=>{const y=60+i*58;return `<g><text class="chart-label" x="8" y="${y-3}">${esc(r.name.split(' · ')[0])}</text><text class="axis-label" x="8" y="${y+15}">${r.year} · ${r.source==='randstad'?'Randstad':'Morgan McKinley'}</text><line class="range-line ${r.year===2025?'older-range':''}" x1="${x(r.hk[0])}" x2="${x(r.hk[2])}" y1="${y}" y2="${y}"/><circle class="median-dot" cx="${x(r.hk[1])}" cy="${y}" r="5"/><text class="chart-value" x="${x(r.hk[2])+12}" y="${y+4}">${compact(r.hk[0])}–${compact(r.hk[2])}</text></g>`;}).join('')}</svg>`;
}
function renderSalary() {
  const relevant = new Set(selectedPrograms().flatMap(p=>p.roles));
  const roles=D.roles.filter(r=>!salaryRelevant || relevant.has(r.id));
  $('#workspace').innerHTML=`${pageIntro('READ THE EVIDENCE','薪酬由职位决定，再回看专业准备。','香港为主；美国作海外参照。保持原币种和年份，避免把不同统计口径换算成一份排名。')}
    <div class="salary-benchmarks"><article class="benchmark"><span>HKU 全校毕业生 · 2024</span><strong>HK$27,600<small> / 月</small></strong><p>月薪中位数 · 全校口径，非 CDS 或商学院专属</p>${sourceLink('ges',true)}</article><article class="benchmark"><span>HKU CS 毕业生 · 2023</span><strong>HK$27,147<small> / 月</small></strong><p>平均月收入 · 历史专业调查，非 2027 起薪预测</p>${sourceLink('cs',true)}</article><article class="benchmark benchmark-note"><span>怎么看这些数字</span><h3>调查 ≠ 职位市场 ≠ 你的 offer</h3><p>经验、雇主、岗位和奖金差异很大。专业细分的当前起薪不足时，明确保留数据空白。</p></article></div>
    <div class="panel salary-panel"><div class="panel-heading"><div><h2>香港职位市场区间</h2><p>HKD / 月 · 线段 Low–High · 圆点为来源 Median</p></div><label class="switch-label"><input id="relevant" type="checkbox" ${salaryRelevant?'checked':''}>只看地图已选方向</label></div>
    <p class="evidence-note">这些是招聘机构的职位市场估计，未统一工作年资；Low / High 不是薪酬分位数，也不是毕业后第 1 / 5 / 10 年。精算行使用较旧的 2025 数据。</p>
    <div class="chart-scroll">${rangeChart(roles)}</div></div>
    <div class="salary-table-wrap panel"><table><caption>逐项证据 · 香港月薪与美国年薪分别保留</caption><thead><tr><th>相关职业</th><th>香港 HKD/月<br><small>Low / Median / High</small></th><th>美国 USD/年<br><small>May 2025 · 全经验中位数</small></th><th>统计边界 / 来源</th></tr></thead><tbody>${roles.map(r=>`<tr><td><strong>${esc(r.name)}</strong></td><td class="numeric">${r.hk?`${num(r.hk[0])} / <strong>${num(r.hk[1])}</strong> / ${num(r.hk[2])}<small>${r.year} · 职位市场</small>`:'暂缺可比数据'}</td><td class="numeric">${r.us?`<strong>$${num(r.us)}</strong><small>${esc(r.usLabel)}</small>${sourceLink(r.usSource,true)}`:'暂缺直接对应数据'}</td><td><p>${esc(r.note)}</p>${r.source?sourceLink(r.source):''}</td></tr>`).join('')}</tbody></table></div>
    <div class="notice"><span class="notice-mark">i</span><p>美国统计受当地行业结构、税费、生活成本与工作许可影响；这里没有换算为香港净收入。研究职位、咨询及管理培训生缺少相同口径数字时不补造薪资。博士津贴放在升学成本页，与就业工资分开。</p></div>`;
  $('#relevant').onchange=e=>{salaryRelevant=e.target.checked;renderSalary();};
}

function costChart(result) {
  const w=860,h=350,left=85,right=30,top=32,bottom=45;
  const values=result.points.flatMap(p=>[p.work,p.study]);const min=Math.min(0,...values),max=Math.max(1,...values);const pad=(max-min)*.07;
  const lo=min-pad,hi=max+pad,x=m=>left+m/(cost.horizon*12)*(w-left-right),y=v=>h-bottom-(v-lo)/(hi-lo)*(h-top-bottom);
  const path=k=>result.points.map((p,i)=>`${i?'L':'M'}${x(p.month).toFixed(2)},${y(p[k]).toFixed(2)}`).join(' ');
  return `<svg class="cost-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="毕业后累计折现现金流比较，港币；比较直接就业与升学情景"><title>累计折现现金流，用户输入情景</title>${[0,.25,.5,.75,1].map(f=>{const val=lo+f*(hi-lo);return `<line class="grid-line" x1="${left}" x2="${w-right}" y1="${y(val)}" y2="${y(val)}"/><text class="axis-label" x="${left-12}" y="${y(val)+4}" text-anchor="end">${compact(val)}</text>`;}).join('')}<line class="zero-line" x1="${left}" x2="${w-right}" y1="${y(0)}" y2="${y(0)}"/>${[0,.2,.4,.6,.8,1].map(f=>`<text class="axis-label" x="${x(f*cost.horizon*12)}" y="${h-14}" text-anchor="middle">${Number((f*cost.horizon).toFixed(1))} 年</text>`).join('')}<path class="work-line" d="${path('work')}"/><path class="study-line" d="${path('study')}"/><text class="axis-label" x="${left}" y="18">累计现值 · HKD</text></svg>`;
}
function renderCost() {
  const fields=[['months','全日制学习月数',0,120,1],['tuition','总学费 HKD',0,3000000,1],['salary','直接就业月薪 HKD',0,500000,1],['after','升学后就业月薪 HKD',0,500000,1],['living','学习期间新增月开支 HKD',0,100000,1],['stipend','每月资助 HKD（非工资）',0,100000,1],['fundedMonths','资助持续月数',0,120,1],['horizon','比较期限（毕业后年数）',1,30,1],['discount','年折现率 %',0,30,.1]];
  $('#workspace').innerHTML=`${pageIntro('MODEL YOUR ASSUMPTIONS','继续读书的代价，可以自己算。','从本科毕业时开始比较。工资、学费与学习时间由你输入，不自动给硕士或博士加薪。')}
    <div class="cost-layout"><form id="cost-form" class="panel cost-inputs"><h2>你的情景</h2><label>参考模板<select id="preset"><option value="custom">自定义示例（非预测）</option><option value="ai">MSc AI · 已公布 2027–28 学费参考</option><option value="phd">四年 PhD · PGS 费率参考</option><option value="hkpfs">四年 PhD · 三年 HKPFS 参考</option></select></label><p id="preset-note" class="input-note"></p>${fields.map(([key,label,min,max,step])=>`<label for="cost-${key}">${label}<input id="cost-${key}" name="${key}" type="number" min="${min}" max="${max}" step="${step}" required value="${cost[key]}"></label>`).join('')}<button type="button" id="cost-reset" class="secondary-button">恢复自定义示例</button></form>
    <div class="cost-output"><div class="notice"><span class="notice-mark">∑</span><p>恒定实际月薪情景；未建模晋升、失业、税费、奖金、通胀或投资回报。新增生活费指相对直接就业的差额，避免重复计算日常开支。</p></div><div class="panel cost-result-panel"><div class="panel-heading"><h2>累计现金流的两条路径</h2><div class="chart-legend"><span><i class="work-swatch"></i>直接就业</span><span><i class="study-swatch"></i>升学情景</span></div></div><div id="cost-plot"></div><div id="cost-results" aria-live="polite"></div></div><details class="panel methodology" open><summary>公式与边界</summary><p>学习期间净流入 = 资助 − 新增生活费；毕业后净流入 = 你输入的升学后月薪。学费在起点一次支付。直接就业路径从起点按输入月薪累计。</p><p>每月现金流 ÷ (1 + 年折现率)<sup>月数 / 12</sup>；现金成本 = 学费 + 学习月数 ×（新增月开支 + 放弃月薪）− 资助月数 × 资助。</p><p>回本指两条累计现值曲线首次在学习结束后相交；若期限内未追平，显示“期限内未追平”。模板的资助不能自动叠加，也不承诺实际录取或获奖。</p></details></div></div>`;
  $('#preset').value=preset;updatePresetNote();updateCost();
  $('#cost-form').addEventListener('input',e=>{
    if(e.target.tagName!=='INPUT')return;
    for(const [key] of fields){const input=$(`#cost-${key}`);cost[key]=input.value===''?NaN:Number(input.value);}
    updateCost();
  });
  $('#preset').onchange=e=>{
    preset=e.target.value;cost={...costDefaults};
    if(preset==='ai')Object.assign(cost,{months:18,tuition:420000});
    if(preset==='phd')Object.assign(cost,{months:48,fundedMonths:48,stipend:19135,tuition:198000});
    if(preset==='hkpfs')Object.assign(cost,{months:48,fundedMonths:36,stipend:28700,tuition:198000});
    renderCost();
  };
  $('#cost-reset').onclick=()=>{cost={...costDefaults};preset='custom';renderCost();};
}
function updatePresetNote() {
  const notes={custom:'全部数字为示例假设，不是任何专业的预期回报。',ai:`学费 420,000、18 个月仅对应已公布 2027–28 硕士入学；你本科毕业后的学费未定。工资和生活费仍是示例。${sourceLink('mscai',true)}`,phd:`商学院参考：2027–28 年学费 49,500 × 4 年为情景假设；基本 PGS 19,135/月自 2025-09。未来费率、资格和持续资助须重查。${sourceLink('phdadmit',true)}`,hkpfs:`HKPFS 344,400/年 = 28,700/月，三年；第四年默认无资助。学费假设 49,500 × 4，不假设奖项免学费或叠加 PGS。${sourceLink('hkpfs',true)} ${sourceLink('phdadmit',true)}`};
  $('#preset-note').innerHTML=notes[preset];
}
function updateCost() {
  try {
    if(!$('#cost-form').checkValidity())throw new Error('请输入完整且在允许范围内的参数。');
    costResult=simulate(cost);
    $('#cost-plot').innerHTML=costChart(costResult);
    $('#cost-results').innerHTML=`<div class="cost-metrics"><div><span>学习期未折现机会成本</span><strong>HK$${num(costResult.netCost)}</strong></div><div><span>${cost.horizon} 年后升学相对就业现值差</span><strong class="${costResult.difference>=0?'positive':'negative'}">${costResult.difference>=0?'+':'−'}HK$${num(Math.abs(costResult.difference))}</strong></div><div><span>本科毕业后首次追平</span><strong>${costResult.paybackMonth?`第 ${(costResult.paybackMonth/12).toFixed(1)} 年`:'期限内未追平'}</strong></div></div><p class="input-note">这一结果只对应当前输入。它没有证明学历导致加薪；改变“升学后月薪”即可检验你的假设。</p>`;
  } catch(e) {$('#cost-plot').innerHTML='';$('#cost-results').innerHTML=`<p class="error" role="alert">${esc(e.message)}</p>`;}
}

function renderSources() {
  $('#workspace').innerHTML=`${pageIntro('SOURCES & METHOD','每条路径，都应该能回到证据。','2026-10-03 核查快照。本科选择按 2027–28；薪酬、硕士及资助各自保留资料年份。')}
    <div class="method-grid"><article class="panel"><span class="pill">官方事实</span><h3>课程与申请资格</h3><p>专业名称、入学代码、已公布路径及先修来自大学。2027 本科之后的硕博申请预计在更晚年份，当前项目仅作例子，不能当作未来招生承诺。</p></article><article class="panel"><span class="pill">分析推断</span><h3>从课程到职业的匹配</h3><p>硕士连接、职业出口、第二专业探索及补强建议，是基于训练方向的判断。没有计算录取率、就业率、保证薪酬或自创评分。</p></article><article class="panel"><span class="pill">情景假设</span><h3>成本与收益</h3><p>成本页的工资及多数开支是可修改假设。引用的学费、资助只对应标明年度；不保证本科毕业后仍有相同项目或费率。</p></article></div>
    <div class="source-actions"><button id="export-data" class="secondary-button">导出研究数据 JSON</button><span>含专业、路径、薪酬与来源，不含你的成本输入</span></div>
    <div class="source-list">${D.sources.map((s,i)=>`<article class="source-card panel"><span class="source-number">${String(i+1).padStart(2,'0')}</span><div><span class="node-meta">${esc(s.type)} · ${esc(s.period)}</span><h3><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a></h3><p>${esc(s.note)}</p></div></article>`).join('')}</div>`;
  $('#export-data').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(D,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='hku-pathways-2026-10-03.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
}
function render() {
  view=location.hash.slice(1);if(!['paths','compare','salary','cost','sources'].includes(view))view='paths';
  document.querySelectorAll('[data-view]').forEach(a=>{a.classList.toggle('active',a.dataset.view===view);if(a.dataset.view===view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  ({paths:renderPaths,compare:renderCompare,salary:renderSalary,cost:renderCost,sources:renderSources})[view]();
}
window.addEventListener('hashchange',render);
render();

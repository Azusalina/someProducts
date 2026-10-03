import * as M from './math.js';
import * as P from './plots.js';
import { latex } from './ui.js';
const titles={vectors:'Vector explorer / 向量探索',span:'Linear combinations / 線性組合',dot:'Dot product & projection / 內積與投影',matrix:'Transformation studio / 變換工作室',composition:'Composition / 變換合成',determinant:'Signed area / 帶符號面積',systems:'Equation explorer / 方程探索',eigen:'Eigenvector finder / 特徵向量探索',summary:'Data explorer / 數據探索',probability:'Binomial experiment / 二項實驗',normal:'Normal distribution / 常態分布',sampling:'Sampling experiment / 抽樣實驗',regression:'Least-squares studio / 最小二乘工作室',bootstrap:'Bootstrap experiment / 自助法實驗'};
const presetMatrices={identity:[1,0,0,1],shear:[1,1,0,1],stretch:[2,0,0,1],rotation:[0,-1,1,0],reflection:[-1,0,0,1],collapse:[1,2,.5,1]};
const matrixTex=A=>String.raw`\begin{bmatrix}${A.slice(0,2).map(x=>M.fmt(x)).join('&')}\\${A.slice(2).map(x=>M.fmt(x)).join('&')}\end{bmatrix}`;
const vectorTex=v=>String.raw`\begin{bmatrix}${v.map(x=>M.fmt(x)).join(String.raw`\\`)}\end{bmatrix}`;
function initial(mode) {
  return {dim:2,v:[3,2,1],u:mode==='dot'?[1,0,0]:[-1,2,1],scale:1.5,c1:1,c2:1,A:mode==='systems'?[1,1,1,-1]:mode==='eigen'||mode==='determinant'?[2,0,0,1]:[1,1,0,1],A3:[1,1,0,0,1,0,0,0,1],t:1,angle:mode==='composition'?90:30,sx:2,sy:1,b:[3,1],xs:[2,4,4,6,9],mu:0,sigma:1,lower:-1,upper:1,n:mode==='sampling'?40:10,p:.3,k:3,runs:0,counts:null,population:'exponential',means:[],points:[[1,2],[2,3.2],[3,4],[4,4.6],[5,6.8],[6,7],[7,9],[8,8.8]],seed:42,resample:[]};
}
export function mountLab(root, mode) {
  let s=initial(mode),view=null,disposed=false,loadToken=0,coordinates=null,currentExtent=null;
  const can3D=['vectors','span','matrix','determinant'].includes(mode);
  root.innerHTML=`<section class="lab"><div class="lab-top"><span class="lab-name"><i class="status-dot"></i>${titles[mode]}</span><div style="display:flex;gap:8px">${can3D?'<div class="segmented" aria-label="Dimensions"><button data-dim="2" aria-pressed="true">2D</button><button data-dim="3" aria-pressed="false">3D</button></div>':''}<button class="tiny-button" data-reset>Reset / 重設</button></div></div><div class="lab-body"><div class="plot-panel"><div class="plot"></div><div class="plot-help"></div><div class="interval-list" hidden></div><div class="legend"></div></div><div class="lab-controls"></div></div><div class="live-math" aria-live="polite"><span class="math-output"></span><span class="live-note"></span></div></section>`;
  const plot=root.querySelector('.plot'),controls=root.querySelector('.lab-controls'),live=root.querySelector('.math-output'),note=root.querySelector('.live-note'),help=root.querySelector('.plot-help'),legend=root.querySelector('.legend'),intervals=root.querySelector('.interval-list');
  function number(key,value,label,min=-6,max=6,step=.5) {return `<label>${label.split(' of ')[0]}<input aria-label="${label}" type="number" data-key="${key}" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;}
  function range(key,value,label,min,max,step=1) {return `<div class="control"><label for="${mode}-${key}">${label}<output data-output="${key}">${M.fmt(value)}</output></label><input id="${mode}-${key}" data-key="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;}
  function coords(key,label) {return `<div class="control"><span class="control-label">${label}</span><div class="coordinate-row ${s.dim===2?'two':''}">${s[key].slice(0,s.dim).map((v,i)=>number(`${key}.${i}`,v,['x','y','z'][i]+` of ${key}`)).join('')}</div></div>`;}
  function matrixInputs() {const dim=s.dim===3?3:2,A=s.dim===3?s.A3:s.A,key=s.dim===3?'A3':'A';return `<div class="control"><span class="control-label">Matrix A / 矩陣</span><div class="matrix-input ${dim===3?'three':''}">${A.map((v,i)=>`<input aria-label="A row ${Math.floor(i/dim)+1} column ${i%dim+1}" data-key="${key}.${i}" type="number" min="-4" max="4" step=".25" value="${v}">`).join('')}</div></div>`;}
  const select=(key,label,options)=>`<div class="control"><label for="${mode}-${key}">${label}</label><select id="${mode}-${key}" data-select="${key}">${options.map(([val,label])=>`<option value="${val}" ${s[key]===val?'selected':''}>${label}</option>`).join('')}</select></div>`;
  const runButton=(text,count)=>`<div class="control"><button class="btn small" data-run="${count}">${text}</button></div>`;
  function dataControls(outlier=false) {return `<div class="control"><label for="${mode}-data">Your data / 你的數據</label><textarea id="${mode}-data" class="data-input" data-data spellcheck="false">${s.xs.join(', ')}</textarea><div class="input-error" role="status"></div><button class="btn secondary small" data-apply>Apply data / 更新數據</button></div>${outlier?range('outlier',s.xs.at(-1),'Last value / 最後數值',Math.min(0,s.xs.at(-1)),Math.max(40,s.xs.at(-1)),.5):''}`;}
  function controlHTML() {
    let html='';
    if(['vectors','span','dot'].includes(mode)) {
      html+=coords('v','Vector v / 向量 v');
      if(mode!=='vectors')html+=coords('u','Vector u / 向量 u');
      if(mode==='vectors')html+=range('scale',s.scale,'Scale s / 倍數',-3,3,.1);
      if(mode==='span')html+=range('c1',s.c1,'Coefficient c₁ / 倍數',-3,3,.1)+range('c2',s.c2,'Coefficient c₂ / 倍數',-3,3,.1)+`<div class="control"><button class="btn secondary small" data-dependent>Dependent / 線性相關</button></div>`;
    }
    if(['matrix','determinant','eigen','systems'].includes(mode)) {
      if(mode!=='systems')html+=select('preset','Try a transformation / 試試變換',[['custom','Custom / 自訂'],['identity','Identity / 單位'],['shear','Shear / 剪切'],['stretch','Stretch / 拉伸'],['rotation','90° rotation / 旋轉'],['reflection','Reflection / 反射'],['collapse','Collapse / 壓扁']]);
      else html+=select('systemPreset','Equations / 方程',[['unique','Unique / 唯一解'],['none','Parallel / 無解'],['infinite','Coincident / 無限多解']]);
      html+=matrixInputs();
      if(mode==='systems')html+=`<div class="control"><span class="control-label">Right side b / 右邊常數</span><div class="coordinate-row two">${s.b.map((v,i)=>number(`b.${i}`,v,`b${i+1}`,-10,10,.5)).join('')}</div></div>`;
      else if(mode==='eigen')html+=range('angle',s.angle,'Direction θ / 方向',0,360,1);
      else html+=range('t',s.t,'Blend t / 變換進度',0,1,.01);
      if(mode==='matrix')html+=coords('v','Input v / 輸入向量');
    }
    if(mode==='composition')html+=range('sx',s.sx,'Stretch x / x 拉伸',.25,3,.25)+range('sy',s.sy,'Stretch y / y 拉伸',.25,3,.25)+range('angle',s.angle,'Rotation θ / 旋轉角度',0,360,1);
    if(mode==='summary')html+=dataControls(true);
    if(mode==='probability')html+=range('n',s.n,'Trials n / 試驗數',1,30)+range('p',s.p,'Success p / 成功機率',0,1,.01)+range('k',s.k,'Highlight k / 標示次數',0,s.n)+runButton('Simulate 1,000 / 模擬','1000');
    if(mode==='normal')html+=range('mu',s.mu,'Mean μ / 平均數',-3,3,.1)+range('sigma',s.sigma,'SD σ / 標準差',.3,3,.1)+range('lower',s.lower,'Lower bound / 下界',-6,6,.1)+range('upper',s.upper,'Upper bound / 上界',-6,6,.1)+`<div class="control"><button class="btn secondary small" data-one-sigma>μ ± σ / 一個標準差</button></div>`;
    if(mode==='sampling')html+=select('population','Population / 總體',[['exponential','Exponential / 指數'],['normal','Normal / 常態']])+range('n',s.n,'Sample size n / 樣本量',2,100)+runButton('Generate 500 / 抽樣 500 次',500)+`<div class="control-note">Each interval uses known σ = 1.<span class="zh" lang="zh-Hant">每個區間使用已知 σ = 1。</span></div>`;
    if(mode==='regression')html+=`<div class="control"><span class="control-label">Move the blue points<span class="zh" lang="zh-Hant">拖動藍色數據點</span></span><button class="btn secondary small" data-outlier>Add an outlier / 加入離群值</button></div><div class="control-note">Drag with a mouse or one finger. Green: fitted line. Pink: vertical residuals.<span class="zh" lang="zh-Hant">用滑鼠或單指拖動。綠線：擬合直線；粉紅：垂直殘差。</span></div>`;
    if(mode==='bootstrap')html+=dataControls()+runButton('Resample 1,000 / 再抽樣',1000)+`<div class="control-note" data-resample></div>`;
    if(s.dim===3)html+=`<div class="control"><button class="btn secondary small" data-camera>Reset camera / 重設視角</button></div>`;
    html+=`<div class="control-note">Every change updates the picture.<span class="zh" lang="zh-Hant">每次改動，即時看見結果。</span></div>`;
    controls.innerHTML=html;
  }
  function legendHTML(items) {legend.innerHTML=items.map(([color,label])=>`<span><i style="background:${color}"></i>${label}</span>`).join('');}
  function syncInputs() {
    controls.querySelectorAll('[data-key]').forEach(el=>{
      const key=el.dataset.key,[base,index]=key.split('.'),value=base==='outlier'?s.xs.at(-1):index!==undefined?s[base][Number(index)]:s[key];
      if(document.activeElement!==el)el.value=value;
      if(key==='k')el.max=s.n;
      const out=controls.querySelector(`[data-output="${key}"]`);if(out)out.textContent=M.fmt(value);
    });
  }
  function simulation(count) {
    const random=M.seededRandom(s.seed++);
    if(mode==='sampling')s.means=Array.from({length:count},()=>M.mean(Array.from({length:s.n},()=>s.population==='normal'?M.randomNormal(random):-Math.log(Math.max(1-random(),1e-15)))));
    if(mode==='bootstrap') {s.resample=Array.from({length:s.xs.length},()=>s.xs[Math.floor(random()*s.xs.length)]);s.means=M.bootstrap(s.xs,count,random);}
    if(mode==='probability'){s.runs=count;s.counts=Array(s.n+1).fill(0);for(let i=0;i<count;i++){let k=0;for(let j=0;j<s.n;j++)if(random()<s.p)k++;s.counts[k]++;}}
  }
  function liveValues() {
    let tex='',message=''; const dim=s.dim===3?3:2,v=s.v.slice(0,dim),u=s.u.slice(0,dim);
    if(mode==='vectors'){tex=String.raw`${M.fmt(s.scale)}\mathbf v=${vectorTex(M.scale(v,s.scale))},\quad\|\mathbf v\|=${M.fmt(M.norm(v))}`;message='Length is measured in the selected dimensions. / 長度按所選維度計算。';legendHTML([[P.C.v,'v'],[P.C.r,'s·v']]);}
    if(mode==='span'){const result=M.add(M.scale(u,s.c1),M.scale(v,s.c2));tex=String.raw`c_1\mathbf u+c_2\mathbf v=${vectorTex(result)}`;const uu=M.dot(u,u),vv=M.dot(v,v),rank=uu<1e-9&&vv<1e-9?0:uu*vv-M.dot(u,v)**2>1e-8?2:1;message=`Span dimension / 張成維度: ${rank}${rank===2?' · independent / 線性獨立':rank===1?' · one line / 一條直線':' · just the origin / 只有原點'}`;legendHTML([[P.C.u,'u'],[P.C.v,'v'],[P.C.r,'c₁u + c₂v']]);}
    if(mode==='dot'){const d=M.dot(v,u),proj=M.projection(v,u),denom=M.norm(v)*M.norm(u);tex=String.raw`\mathbf v\cdot\mathbf u=${M.fmt(d)}${proj?String.raw`,\quad\operatorname{proj}_{\mathbf u}\mathbf v=${vectorTex(proj)}`:''}`;message=denom<1e-9?'Angle undefined for zero vectors. / 零向量的夾角未定義。':`Angle / 夾角: ${M.fmt(Math.acos(Math.max(-1,Math.min(1,d/denom)))*180/Math.PI)}°`;if(!proj)message+=' Projection undefined: u = 0. / 投影未定義。';legendHTML([[P.C.v,'v'],[P.C.u,'u'],[P.C.r,'projection / 投影']]);}
    if(['matrix','determinant'].includes(mode)){
      if(s.dim===3){const A=s.A3.map((x,i)=>s.t*x+(i%4===0?1-s.t:0)),D=A[0]*(A[4]*A[8]-A[5]*A[7])-A[1]*(A[3]*A[8]-A[5]*A[6])+A[2]*(A[3]*A[7]-A[4]*A[6]);const out=[0,1,2].map(r=>M.dot(A.slice(3*r,3*r+3),s.v));tex=String.raw`A_t\mathbf v=${vectorTex(out)},\quad\det(A_t)=${M.fmt(D)}`;message=`Volume scale / 體積倍數: ${M.fmt(Math.abs(D))}`;}
      else{const A=s.A.map((x,i)=>s.t*x+((i===0||i===3)?1-s.t:0)),D=M.det(A);tex=String.raw`A_t=${matrixTex(A)},\quad\det(A_t)=${M.fmt(D)}${mode==='matrix'?String.raw`,\quad A_t\mathbf v=${vectorTex(M.transform(A,v))}`:''}`;message=`Area scale / 面積倍數: ${M.fmt(Math.abs(D))} · ${Math.abs(D)<1e-9?'singular / 奇異':D<0?'orientation reversed / 方向翻轉':'orientation preserved / 方向保留'}`;}
      message+=' · Aₜ = (1 − t)I + tA';legendHTML([[P.C.v,'Ae₁'],[P.C.u,'Ae₂'],[P.C.r,s.dim===3?'transformed cube / 立方體':'transformed square / 正方形']]);
    }
    if(mode==='composition'){const a=s.angle*Math.PI/180,A=[s.sx,0,0,s.sy],B=[Math.cos(a),-Math.sin(a),Math.sin(a),Math.cos(a)];tex=String.raw`AB\mathbf v=${vectorTex(M.transform(M.multiply(A,B),[1,1]))},\quad BA\mathbf v=${vectorTex(M.transform(M.multiply(B,A),[1,1]))}`;message='A = stretch, B = rotation, v = (1, 1). / A 為拉伸，B 為旋轉。';legendHTML([[P.C.v,'ABv · B first / 先 B'],[P.C.u,'BAv · A first / 先 A']]);}
    if(mode==='systems'){const solution=M.solve(s.A,s.b);tex=String.raw`${matrixTex(s.A)}\mathbf x=${vectorTex(s.b)}${solution.x?String.raw`,\quad\mathbf x=${vectorTex(solution.x)}`:''}`;message={unique:'One intersection · unique solution / 一個交點，唯一解',none:'Inconsistent · no solution / 矛盾，無解',infinite:'Consistent and dependent · infinitely many solutions / 相容而線性相關，無限多解'}[solution.kind];legendHTML([[P.C.v,'equation 1 / 方程 1'],[P.C.u,'equation 2 / 方程 2']]);}
    if(mode==='eigen'){const a=s.angle*Math.PI/180,v=[Math.cos(a),Math.sin(a)],out=M.transform(s.A,v),lambda=M.dot(v,out),cross=v[0]*out[1]-v[1]*out[0],eig=M.eigenvalues(s.A);tex=String.raw`\lambda_{1,2}=${eig?eig.map(x=>M.fmt(x)).join(',\ '):'\text{not real}'}`;message=Math.abs(cross)<.02?`Nearly a steady direction / 接近特徵方向 · Av ≈ ${M.fmt(lambda)}v`:`Turn θ to align v and Av. / 轉動 θ，令 v 與 Av 共線。 Alignment error / 共線誤差: ${M.fmt(Math.abs(cross),3)}`;if(!eig)message='No real eigenvectors. / 沒有實特徵向量。';legendHTML([['#849181','v'],[P.C.r,'Av'],[P.C.v,'Ae₁'],[P.C.u,'Ae₂']]);}
    if(mode==='summary'){tex=String.raw`n=${s.xs.length},\quad\bar x=${M.fmt(M.mean(s.xs))},\quad\mathrm{median}=${M.fmt(M.median(s.xs))},\quad s=${M.fmt(Math.sqrt(M.variance(s.xs)))}`;message=`Sample variance / 樣本方差 s² = ${M.fmt(M.variance(s.xs))} (n − 1 denominator / 分母)`;legendHTML([[P.C.r,'data / 數據'],[P.C.v,'mean / 平均數'],[P.C.u,'median / 中位數']]);}
    if(mode==='probability'){const pmf=M.binomialPMF(s.n,s.p);tex=String.raw`P(X=${s.k})=${M.fmt(pmf[s.k],4)},\quad E[X]=${M.fmt(s.n*s.p)},\quad\mathrm{Var}(X)=${M.fmt(s.n*s.p*(1-s.p))}`;message=s.runs?`Observed frequency / 實測頻率: ${M.fmt(s.counts[s.k]/s.runs,4)} · ${s.runs} experiments / 次實驗`:'Independent trials with fixed p. / 試驗獨立，成功機率固定。';legendHTML([[P.C.r,'theory / 理論'],[P.C.u,'selected k / 已選 k'],[P.C.v,'simulated / 模擬']]);}
    if(mode==='normal'){const a=Math.min(s.lower,s.upper),b=Math.max(s.lower,s.upper),p=M.normalCDF(b,s.mu,s.sigma)-M.normalCDF(a,s.mu,s.sigma);tex=String.raw`P(${M.fmt(a)}\le X\le${M.fmt(b)})=${M.fmt(p,4)}\approx${M.fmt(p*100)}\%`;message='Bounds are sorted automatically; CDF is numerically approximated. / 上下界自動排序；CDF 以數值近似計算。';legendHTML([[P.C.r,'density & area / 密度與面積'],[P.C.u,'μ']]);}
    if(mode==='sampling'){const se=1/Math.sqrt(s.n),mu=s.population==='normal'?0:1,covered=s.means.filter(m=>Math.abs(m-mu)<=1.96*se).length;tex=String.raw`\mu=${mu},\quad\operatorname{SE}(\bar X)=\frac1{\sqrt{${s.n}}}=${M.fmt(se,3)}`;message=`${s.means.length} samples / 個樣本 · interval coverage / 區間覆蓋: ${M.fmt(covered/s.means.length*100)}% · last 25 intervals below / 下圖為最近 25 個區間`;legendHTML([[P.C.r,'sample means / 樣本平均數'],[P.C.u,'normal approximation / 常態近似'],['#ba7161','missed intervals / 未覆蓋區間']]);}
    if(mode==='regression'){const fit=M.regression(s.points);tex=fit?String.raw`\hat y=${M.fmt(fit.intercept)}${fit.slope<0?'-':'+'}${M.fmt(Math.abs(fit.slope))}x,\quad\mathrm{SSE}=${M.fmt(fit.sse)},\quad R^2=${fit.r2===null?'\text{undefined}':M.fmt(fit.r2,3)}`:String.raw`\text{Slope is not identifiable}`;message=fit?'Residual = y − ŷ; line includes an intercept. / 殘差 = y − ŷ；模型包含截距。':'All x-values are equal; only a constant fit is identifiable. / 所有 x 相同，無法辨識斜率。';legendHTML([[P.C.v,'data / 數據'],[P.C.r,'least squares / 最小二乘'],[P.C.u,'residuals / 殘差']]);}
    if(mode==='bootstrap'){const a=M.quantile(s.means,.025),b=M.quantile(s.means,.975);tex=String.raw`\bar x=${M.fmt(M.mean(s.xs))},\quad\mathrm{CI}_{95\%}\approx[${M.fmt(a)},\ ${M.fmt(b)}]`;message=`${s.means.length} resamples / 次再抽樣 · percentile interval; approximate coverage / 百分位區間，近似覆蓋率`;const el=controls.querySelector('[data-resample]');if(el)el.textContent=`One resample / 一次再抽樣: ${s.resample.slice(0,12).join(', ')}${s.resample.length>12?'…':''}`;legendHTML([[P.C.r,'bootstrap means / 自助平均數'],[P.C.v,'sample mean / 樣本平均數'],[P.C.u,'95% endpoints / 區間端點']]);}
    latex(live,tex);note.textContent=message;
  }
  async function update() {
    if(disposed)return;
    syncInputs();liveValues();
    intervals.hidden=mode!=='sampling';
    if(s.dim===3&&can3D){
      help.textContent='Drag to orbit · pinch / scroll to zoom · 右邊可重設視角';
      if(view){view.update(s);return;}
      const token=++loadToken;plot.innerHTML='<div class="empty-feedback">Opening 3D / 正在開啟 3D…</div>';
      try {const {createThreeView}=await import('./three-view.js');if(disposed||token!==loadToken||s.dim!==3)return;plot.innerHTML='';view=createThreeView(plot,mode,s);}
      catch(error){if(disposed||token!==loadToken)return;s.dim=2;view?.dispose();view=null;plot.innerHTML='';controlHTML();root.querySelectorAll('[data-dim]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.dim==='2')));update();help.textContent='3D needs WebGL; the 2D diagram is available. / 3D 需要 WebGL，現顯示二維圖。';}
      return;
    }
    loadToken++;if(view){view.dispose();view=null;}
    let result;
    if(['vectors','span','dot'].includes(mode))result=P.vectorPlot(mode,s);
    if(['matrix','determinant','eigen'].includes(mode))result=P.matrixPlot(mode,s);
    if(mode==='composition')result=P.compositionPlot(s);
    if(mode==='systems')result=P.systemPlot(s);
    if(mode==='summary')result=P.summaryPlot(s.xs);
    if(mode==='normal')result=P.normalPlot(s);
    if(mode==='probability')result=P.probabilityPlot(s,M.binomialPMF(s.n,s.p));
    if(mode==='regression')result=P.regressionPlot(s.points);
    if(mode==='sampling'){const mu=s.population==='normal'?0:1,se=1/Math.sqrt(s.n);result=P.histogramPlot(s.means,{density:x=>M.normalPDF(x,mu,se),title:'Sample mean / 樣本平均數'});intervals.innerHTML=P.intervalPlot(s.means,se,mu);}
    if(mode==='bootstrap')result=P.histogramPlot(s.means,{title:'Bootstrap mean / 自助平均數',markers:[{value:M.mean(s.xs),label:'mean',color:P.C.v},{value:M.quantile(s.means,.025),label:'2.5%',color:P.C.u},{value:M.quantile(s.means,.975),label:'97.5%',color:P.C.u}]});
    plot.innerHTML=result.html;coordinates=result.inv;currentExtent=result.extent;
    help.textContent=mode==='regression'?'Drag the blue points / 拖動藍色數據點':['vectors','span','dot'].includes(mode)?'Drag an arrow tip or edit the values / 拖動箭嘴末端或修改數值':'Change a value. Notice what moves. / 修改一個數值，觀察變化。';
  }
  function handleInput(event) {
    const el=event.target;if(!el.matches('[data-key]'))return;
    if(el.value.trim()==='')return;const value=Number(el.value);if(!Number.isFinite(value))return;
    const min=Number(el.min),max=Number(el.max),val=Math.min(max,Math.max(min,value)),key=el.dataset.key,[base,index]=key.split('.');
    if(value!==val){el.setCustomValidity(`Use ${min} to ${max} / 請用範圍內數值`);return;}el.setCustomValidity('');
    if(base==='outlier')s.xs[s.xs.length-1]=val;else if(index!==undefined)s[base][Number(index)]=val;else s[key]=val;
    if(base==='A'||base==='A3'){s.preset='custom';const preset=controls.querySelector('[data-select="preset"]');if(preset)preset.value='custom';}
    if(mode==='probability'){s.k=Math.min(s.k,s.n);s.counts=null;s.runs=0;}
    if(mode==='sampling')simulation(500);
    if(mode==='summary'){const textarea=controls.querySelector('[data-data]');textarea.value=s.xs.join(', ');}
    update();
  }
  function handleChange(event) {
    const el=event.target;if(!el.matches('[data-select]'))return;const key=el.dataset.select;s[key]=el.value;
    if(key==='preset'&&el.value!=='custom'){s.A=[...presetMatrices[el.value]];s.A3=[s.A[0],s.A[1],0,s.A[2],s.A[3],0,0,0,1];s.t=1;}
    if(key==='systemPreset'){s.A=el.value==='unique'?[1,1,1,-1]:[1,1,2,2];s.b=el.value==='unique'?[3,1]:el.value==='none'?[2,5]:[2,4];}
    if(key==='population')simulation(500);
    update();
  }
  function handleClick(event) {
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-reset')){s=initial(mode);view?.dispose();view=null;loadToken++;controlHTML();root.querySelectorAll('[data-dim]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.dim==='2')));if(['sampling','bootstrap'].includes(mode))simulation(mode==='sampling'?500:1000);update();}
    if(button.dataset.dim){const dim=Number(button.dataset.dim);if(dim===s.dim)return;if(['matrix','determinant'].includes(mode)){if(dim===3){s.A3[0]=s.A[0];s.A3[1]=s.A[1];s.A3[3]=s.A[2];s.A3[4]=s.A[3];}else s.A=[s.A3[0],s.A3[1],s.A3[3],s.A3[4]];}s.dim=dim;root.querySelectorAll('[data-dim]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.dim)===dim)));controlHTML();update();}
    if(button.hasAttribute('data-camera'))view?.resetCamera();
    if(button.hasAttribute('data-dependent')){s.u=[1,1,1];s.v=[2,2,2];update();}
    if(button.hasAttribute('data-one-sigma')){s.lower=s.mu-s.sigma;s.upper=s.mu+s.sigma;update();}
    if(button.hasAttribute('data-outlier')){s.points[s.points.length-1]=[8,1];update();}
    if(button.dataset.run){simulation(Number(button.dataset.run));update();}
    if(button.hasAttribute('data-apply')){
      const raw=controls.querySelector('[data-data]').value.trim(),values=raw?raw.split(/[\s,;，]+/).map(Number):[],error=controls.querySelector('.input-error');
      if(values.length<2||values.length>1000||values.some(v=>!Number.isFinite(v)||Math.abs(v)>1e6)){error.textContent='Use 2–1,000 finite numbers, within ±1,000,000. / 請輸入 2–1,000 個範圍內數字。';return;}
      error.textContent='';s.xs=values;if(mode==='bootstrap')simulation(1000);controlHTML();update();
    }
  }
  let dragging=null;
  function down(event){const handle=event.target.closest('[data-drag]');if(!handle||s.dim!==2)return;dragging=handle.dataset.drag;if(currentExtent)s.dragExtent=currentExtent;plot.setPointerCapture(event.pointerId);event.preventDefault();}
  function move(event){if(!dragging||!coordinates)return;const svg=plot.querySelector('svg');if(!svg)return;const pt=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());const p=coordinates([pt.x,pt.y]);if(dragging.startsWith('point-'))s.points[Number(dragging.split('-')[1])]=[Math.max(0,Math.min(10,p[0])),Math.max(0,Math.min(12,p[1]))];else{s[dragging][0]=Math.round(Math.max(-6,Math.min(6,p[0]))*10)/10;s[dragging][1]=Math.round(Math.max(-6,Math.min(6,p[1]))*10)/10;}update();}
  function up(){if(!dragging)return;dragging=null;delete s.dragExtent;update();}
  root.addEventListener('input',handleInput);root.addEventListener('change',handleChange);root.addEventListener('click',handleClick);
  plot.style.touchAction=['vectors','span','dot','regression'].includes(mode)?'none':'pan-y';plot.addEventListener('pointerdown',down);plot.addEventListener('pointermove',move);plot.addEventListener('pointerup',up);plot.addEventListener('pointercancel',up);plot.addEventListener('lostpointercapture',up);
  controlHTML();if(['sampling','bootstrap'].includes(mode))simulation(mode==='sampling'?500:1000);update();
  return ()=>{disposed=true;loadToken++;view?.dispose();root.removeEventListener('input',handleInput);root.removeEventListener('change',handleChange);root.removeEventListener('click',handleClick);plot.removeEventListener('pointerdown',down);plot.removeEventListener('pointermove',move);plot.removeEventListener('pointerup',up);plot.removeEventListener('pointercancel',up);plot.removeEventListener('lostpointercapture',up);};
}

/* Local application. Classic scripts also work when index.html is opened directly. */
(function(){
  'use strict';
  const M=GraphMath,P=GraphPlot,L=GraphLatex,E=GraphEditor,S=GraphStats,C=GraphComplex,$=id=>document.getElementById(id);
  const palette=['#376ca3','#bb4a46','#41815a','#885a9b','#aa7727','#27878a'];
  const darkPalette=['#79adff','#ff8b86','#7dc5a2','#c59aed','#e2b66c','#77cbd1'];
  const distributionsSeen=new Set();let autoProbabilityId=null,restoringView=false;
  let nextId=1,toolsOpen=false;
  const row=text=>({id:nextId++,text,color:palette[(nextId-2)%palette.length],visible:true,min:-10,max:10,step:0.1});
  let state={version:1,rows:[row('')],view:{cx:0,cy:0,scale:65},angle:'rad',grid:true,source:null,tangent:false,tx:1,integral:false,a:0,b:Math.PI,panel:true,theme:'light',areaColor:'#376ca3',intersections:[]};
  let model,history=[],future=[],dirty=false,drawRequest=0,historyTimer,activeId=state.rows[0].id;
  let width=0,height=0,ratio=1,renderRevision=0,implicitRequest=0,hoverRequest=0,cache=new Map(),drag=null,hover=null,notice='',noticeUntil=0;
  const canvas=$('canvas'),overlay=$('overlay'),renderCanvas=document.createElement('canvas'),ctx=renderCanvas.getContext('2d'),screen=canvas.getContext('2d'),ox=overlay.getContext('2d'),relationCache=new Map(),relationHits=new Map();let pendingPoint=null,pendingExpression=null,intersectionNotice=false;const intersectionCache=new Map();
  function serialize(){return JSON.stringify(state);}
  function validateProject(s){
    if(!s||s.version!==1||!Array.isArray(s.rows)||s.rows.length>64)throw Error('项目格式不正确，最多 64 行');
    const finite=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
    if(!s.view||!finite(s.view.cx,-1e12,1e12)||!finite(s.view.cy,-1e12,1e12)||!finite(s.view.scale,1e-6,1e8))throw Error('无效视图范围');
    if(s.view.yScale!==undefined&&!finite(s.view.yScale,1e-6,1e8))throw Error('无效纵轴范围');
    if(s.areaColor===undefined)s.areaColor='#376ca3';if(!/^#[0-9a-f]{6}$/i.test(s.areaColor))throw Error('无效面积颜色');
    if(s.theme===undefined)s.theme='light';if(!['light','dark'].includes(s.theme))throw Error('无效主题');
    if(!['rad','deg'].includes(s.angle)||typeof s.grid!=='boolean'||typeof s.panel!=='boolean')throw Error('无效设置');
    for(const key of ['tx','a','b'])if(!finite(s[key],-1e12,1e12))throw Error('无效微积分参数');
    if(typeof s.tangent!=='boolean'||typeof s.integral!=='boolean')throw Error('无效微积分设置');
    const ids=new Set();
    for(const r of s.rows){
      if(!Number.isSafeInteger(r.id)||r.id<1||ids.has(r.id)||typeof r.text!=='string'||r.text.length>600||!/^#[0-9a-f]{6}$/i.test(r.color)||typeof r.visible!=='boolean')throw Error('无效表达式行');
      if(!finite(r.min,-1e12,1e12)||!finite(r.max,-1e12,1e12)||r.min>=r.max||!finite(r.step,1e-9,1e12))throw Error('无效滑块范围');
      ids.add(r.id);
    }
    if(s.intersections===undefined)s.intersections=[];if(!Array.isArray(s.intersections)||s.intersections.length>2016||s.intersections.some(p=>!Array.isArray(p)||p.length!==2||p[0]===p[1]||p.some(id=>!ids.has(id))))throw Error('无效交点选择');
    if(s.source!==null&&!ids.has(s.source))s.source=null;
    return s;
  }
  function flash(message){notice=message;noticeUntil=Date.now()+5500;scheduleDraw();}
  function checkpoint(){
    clearTimeout(historyTimer);const value=serialize();
    if(history.at(-1)!==value){history.push(value);if(history.length>80)history.shift();}
    future=[];updateHistory();
  }
  function beforeChange(){if(!dirty){checkpoint();dirty=true;}}
  function persist(){updateHistory();}
  function changed(rebuild=true){if(rebuild)compileRows();else{cache.clear();scheduleDraw();}persist();}
  function updateHistory(){$('undo').disabled=!history.length;$('redo').disabled=!future.length;}
  function undo(redo=false){
    clearTimeout(historyTimer);const from=redo?future:history,to=redo?history:future;if(!from.length)return;
    pendingPoint=null;pendingExpression=null;to.push(serialize());state=JSON.parse(from.pop());dirty=false;nextId=Math.max(...state.rows.map(r=>r.id))+1;
    restoringView=true;autoProbabilityId=null;
    renderRows();syncControls();compileRows();persist();
  }
  function make(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
  function renderRows(){
    const parent=$('expressions');parent.replaceChildren();$('parameters').replaceChildren();
    for(const r of state.rows){
      const item=make('div','expression');item.dataset.id=r.id;item.classList.toggle('intersection-pick',pendingExpression===r.id);
      item.addEventListener('pointerdown',e=>{if(e.button===0&&e.ctrlKey){e.preventDefault();e.stopPropagation();selectIntersectionExpression(r.id);}},{capture:true});
      const line=make('div','expression-row'),input=make('math-field');
      item.style.setProperty('--color',displayColor(r.color));item.classList.toggle('hidden-curve',!r.visible);
      input.setAttribute('aria-label',`表达式 ${state.rows.indexOf(r)+1}`);
      input.onfocus=()=>{activeId=r.id;updateActiveTools();};
      input.oninput=()=>{
        beforeChange();E.expandOperator(input);r.text=input.value;changed();
        clearTimeout(historyTimer);historyTimer=setTimeout(()=>{dirty=false;},650);
      };
      input.addEventListener('keydown',e=>{
        const index=state.rows.indexOf(r);
        if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(input.mode==='latex'){input.executeCommand(['complete','accept-all']);input.dispatchEvent(new Event('input'));}else addRow('',index+1);}
        else if(['ArrowUp','ArrowDown'].includes(e.key)&&!e.shiftKey&&E.moveIntegralBoundary(input,e.key==='ArrowUp'?'up':'down')){e.preventDefault();}
        else if(e.key==='ArrowUp'&&input.position===0&&index>0){e.preventDefault();focusRow(state.rows[index-1].id);}
        else if(e.key==='ArrowDown'&&input.position===input.lastOffset&&index<state.rows.length-1){e.preventDefault();focusRow(state.rows[index+1].id);}
        else if(e.key==='Backspace'&&!input.value&&state.rows.length>1){e.preventDefault();deleteRow(r.id);}
        else if(e.key==='~'){e.preventDefault();input.insert('\\sim');input.dispatchEvent(new Event('input'));}
        if(e.defaultPrevented)e.stopPropagation();
      },{capture:true});
      input.addEventListener('paste',e=>{
        const text=e.clipboardData?.getData('text');if(!text)return;
        e.preventDefault();e.stopPropagation();
        if(!text.includes('\n')){if(text.length>600){flash('表达式最多 600 字符');return;}input.insert(L.toLatex(text));input.dispatchEvent(new Event('input'));return;}
        const lines=text.split(/\r?\n/).filter(s=>s.trim());
        if(lines.length+state.rows.length-1>64||lines.some(s=>s.length>600)){flash('最多 64 行，每行 600 字符');return;}
        checkpoint();dirty=false;r.text=lines[0]||'';state.rows.splice(indexOf(r)+1,0,...lines.slice(1).map(row));renderRows();compileRows();persist();focusRow(r.id);
      },{capture:true});
      line.append(input);item.append(line,make('div','row-result'));parent.append(item);E.configure(input,r.text);
    }
  }
  function indexOf(r){return state.rows.findIndex(s=>s.id===r.id);}
  function focusRow(id){const input=document.querySelector(`.expression[data-id="${id}"] math-field`);if(input){input.focus();input.position=input.lastOffset;activeId=id;}}
  function setTools(open){toolsOpen=open;if(open)state.panel=true;document.body.classList.toggle('tools-open',open);$('tools-toggle').setAttribute('aria-expanded',String(open));document.body.classList.toggle('panel-hidden',!open||!state.panel);if(!open){$('source-options').hidden=true;$('tool-controls').hidden=true;$('controls-toggle').setAttribute('aria-expanded','false');window.mathVirtualKeyboard?.hide({animate:false});canvas.focus({preventScroll:true});}}
  function activeRow(){return state.rows.find(r=>r.id===activeId)||state.rows[0];}
  function displayColor(color){const i=palette.indexOf(color);return state.theme==='dark'&&i>=0?darkPalette[i]:color;}
  function plotColors(){return state.theme==='dark'?{bg:'#181c21',grid:'#313a43',axis:'#7d8a98',text:'#a8b5c3',cursor:'#aebfce',tangent:'#c1cdd8'}:{bg:'#fff',grid:'#eaeaea',axis:'#a5aaa7',text:'#808583',cursor:'#677788',tangent:'#5f6d7a'};}
  function applyTheme(){document.documentElement.dataset.theme=state.theme;$('theme-toggle').setAttribute('aria-pressed',String(state.theme==='dark'));for(const r of state.rows)document.querySelector(`.expression[data-id="${r.id}"]`)?.style.setProperty('--color',displayColor(r.color));updateActiveTools();}
  function updateActiveTools(){const r=activeRow();$('visibility').setAttribute('aria-pressed',String(!!r?.visible));$('cycle-color').style.color=displayColor(r?.color||palette[0]);}
  function addRow(text='',index=state.rows.length){
    if(state.rows.length>=64){flash('最多 64 行');return;}
    checkpoint();dirty=false;state.panel=true;setTools(true);syncControls();const r=row(text);state.rows.splice(index,0,r);renderRows();compileRows();persist();focusRow(r.id);
  }
  function deleteRow(id){checkpoint();dirty=false;const index=state.rows.findIndex(r=>r.id===id);state.rows.splice(index,1);if(!state.rows.length)state.rows.push(row(''));renderRows();compileRows();persist();focusRow(state.rows[Math.max(0,index-1)].id);}
  function compileRows(){
    state.intersections=state.intersections.filter(p=>p.every(id=>state.rows.some(r=>r.id===id)));model=M.build(state.rows,state.angle);cache.clear();relationHits.clear();
    const newProbability=model.entries.find(e=>!e.error&&e.fn&&e.distribution&&(autoProbabilityId===e.id||!distributionsSeen.has(e.id)));
    if(newProbability&&!restoringView){fitProbability(newProbability);if(!distributionsSeen.has(newProbability.id))state.source=newProbability.id;}
    restoringView=false;for(const e of model.entries)if(e.distribution&&e.fn)distributionsSeen.add(e.id);
    for(const config of $('parameters').querySelectorAll('.parameter-config'))if(!model.entries.some(e=>e.id===Number(config.dataset.id)&&e.slider&&!e.error))config.remove();
    const valid=model.entries.filter(e=>!e.error&&(['function','curve','distribution'].includes(e.kind)||e.integral));
    if(!valid.some(e=>e.id===state.source))state.source=valid[0]?.id??null;
    const select=$('source');select.replaceChildren();const options=$('source-options');options.replaceChildren();
    if(!valid.length)select.append(make('option','',''));
    for(const entry of valid){const o=make('option','',entry.text);o.value=entry.id;select.append(o);}
    select.value=state.source??'';select.disabled=!valid.length;$('source-toggle').disabled=!valid.length;
    E.render($('source-value'),valid.find(e=>e.id===state.source)?L.toLatex(valid.find(e=>e.id===state.source).text):'');
    for(const entry of valid){const button=make('button');button.setAttribute('role','option');button.setAttribute('aria-selected',String(entry.id===state.source));E.render(button,L.toLatex(entry.text));button.onclick=()=>{select.value=entry.id;select.dispatchEvent(new Event('change'));options.hidden=true;$('source-toggle').setAttribute('aria-expanded','false');};options.append(button);}
    for(const entry of model.entries){
      const item=document.querySelector(`.expression[data-id="${entry.id}"]`);if(!item)continue;
      const result=item.querySelector('.row-result');result.classList.toggle('error',!!entry.error);
      if(entry.error){result.removeAttribute('data-latex');result.textContent=entry.error;}else E.render(result,entry.complexScalar?'='+complexTex(entry.value):entry.kind==='value'?`${entry.hasIntegral?'\\approx':'='}${numberTex(entry.value,10)}`:'');
      let slider=item.querySelector('.slider');
      if(slider&&slider.dataset.name!==entry.name){slider.remove();$('parameters').querySelector(`.parameter-config[data-id="${entry.id}"]`)?.remove();slider=null;}
      if(entry.slider&&!entry.error){
        const r=state.rows.find(r=>r.id===entry.id),hint=model.parameterHints[entry.name]||{};
        if(!slider){slider=createSlider(r,entry.name);item.append(slider);}
        const range=slider.querySelector('input[type=range]'),config=$('parameters').querySelector(`.parameter-config[data-id="${entry.id}"]`);
        if(hint.min!==undefined)r.min=Math.max(r.min,hint.min);if(hint.max!==undefined)r.max=Math.min(r.max,hint.max);if(hint.step!==undefined)r.step=hint.step;if(r.max<=r.min)r.max=r.min+1;
        for(const key of ['min','max','step']){range[key]=r[key];config.querySelector(`[data-setting="${key}"]`).value=r[key];}
        range.value=model.scope.vars[entry.name];E.render(config.querySelector('.parameter-value'),`${L.identifier(entry.name)}=${numberTex(model.scope.vars[entry.name])}`);
      }else slider?.remove();
    }
    updateActiveTools();updateCalculus();scheduleDraw();
  }
  function createSlider(r,name){
    const value=model.scope.vars[name];r.min=Math.min(r.min,value);r.max=Math.max(r.max,value);
    const box=make('div','slider'),range=make('input'),settings=make('div','slider-settings');box.dataset.id=r.id;box.dataset.name=name;range.type='range';range.setAttribute('aria-label',`参数 ${name}`);
    range.onpointerdown=()=>{checkpoint();dirty=false;};range.oninput=()=>{beforeChange();r.text=`${name}=${range.value}`;document.querySelector(`.expression[data-id="${r.id}"] math-field`).setValue(L.toLatex(r.text),{silenceNotifications:true});changed();};range.onchange=()=>{dirty=false;};
    for(const [key,label]of [['min','最小'],['max','最大'],['step','步长']]){const l=make('label','',label),i=make('input');i.type='number';i.step='any';i.dataset.setting=key;i.setAttribute('aria-label',`${name} ${label}`);i.onchange=()=>{const value=Number(i.value);if(!i.value||!Number.isFinite(value)||Math.abs(value)>1e12||key==='step'&&value<1e-9||key==='min'&&value>=r.max||key==='max'&&value<=r.min){i.value=r[key];return;}checkpoint();r[key]=value;changed();};l.append(i);settings.append(l);}
    const config=make('div','parameter-config');config.dataset.id=r.id;config.append(make('div','parameter-value'),settings);$('parameters').append(config);box.append(range);return box;
  }
  function source(){return model?.entries.find(e=>e.id===state.source&&!e.error);}
  function distributionExpression(e){if(e.kind==='distribution')return L.astTex(e.ast);if(e.ast?.type==='call'&&['pdf','pmf','cdf'].includes(e.ast.name))return L.astTex(e.ast.args[0]);return null;}
  function sourceExpression(e){if(e.integral)return M.normalize(L.astTex(e.ast.args[0]));if(e.kind==='distribution')return `pdf(${M.normalize(distributionExpression(e))},x)`;return e.kind==='function'?`${e.name}(x)`:M.normalize(e.text).trim().replace(/^y\s*=\s*/,'').replace(/\{[^{}]+\}\s*$/,'');}
  function complexTex(value){if(!C.is(value))return numberTex(value,10);const r=Math.abs(value.re)<1e-12?0:value.re,i=Math.abs(value.im)<1e-12?0:value.im;if(!i)return numberTex(r,10);return (r?numberTex(r,10)+(i<0?'-':'+'):i<0?'-':'')+(Math.abs(i)===1?'':numberTex(Math.abs(i),10))+'i';}
  function numberTex(value,digits=6){if(!Number.isFinite(value))return '\\operatorname{undefined}';const text=P.format(value,digits);return text.replace(/^(.+?)e([+-]?\d+)$/,(_,n,p)=>`${n}\\times10^{${Number(p)}}`);}
  function sourceFn(e){if(e.integral)return e.integral.fn;return x=>{const y=e.fn(x);return e.allowed&&!e.allowed(x,y)?NaN:y;};}
  function sourceDf(e,x){if(e.integral)return M.numericDerivative(e.integral.fn,x);if(e.discrete)return NaN;const h=1e-7*Math.max(1,Math.abs(x)),fn=sourceFn(e);return [fn(x),fn(x-h),fn(x+h)].every(Number.isFinite)?e.df(x):NaN;}
  function updateCalculus(){
    const e=source();$('integral-on').disabled=!!e?.complex;$('tangent-controls').hidden=!state.tangent||!!e?.complex||!!e?.discrete||!!e?.step;$('integral-controls').hidden=!state.integral;
    $('add-derivative').disabled=!e||e.complex||e.discrete||e.step;$('tangent-on').disabled=!e||e.complex||e.discrete||e.step;
    $('integral-label').textContent=e?.discrete?(e.probability?'区间概率':'离散求和'):'定积分 · 有符号面积';
    E.render($('add-integral').querySelector('[data-math]'),e?.discrete?'F(x)=\\sum_{k\\leq x}p(k)':'F(x)=\\int_a^x f(t)\\,\\mathrm{d}t');
    $('add-integral').disabled=!e||e.complex||(e.discrete&&(!distributionExpression(e)||e.allowed));
    if(!e){E.render($('tangent-value'),'');E.render($('integral-value'),'');return;}
    const fn=sourceFn(e),v=fn(state.tx),slope=sourceDf(e,state.tx);
    E.render($('tangent-value'),`\\begin{gathered}f(${numberTex(state.tx)})=${numberTex(v)}\\\\f'(${numberTex(state.tx)})=${numberTex(Number.isFinite(v)?slope:NaN)}\\end{gathered}`);
    if(state.integral){
      if(e.discrete){const value=e.distribution&&!e.allowed?e.distribution.interval(state.a,state.b):S.sum(fn,state.a,state.b);E.render($('integral-value'),`\\sum_{k=${Math.ceil(state.a)}}^{${Math.floor(state.b)}}${e.probability?'p':'f'}(k)=${numberTex(value,9)}`);}
      else{const value=(e.step?S.integrateStep:M.integrate)(fn,state.a,state.b);E.render($('integral-value'),`\\int_{${numberTex(state.a)}}^{${numberTex(state.b)}}f(x)\\,\\mathrm{d}x\\approx${numberTex(value,9)}`);}
    }
    $('tangent-range').min=state.view.cx-width/(2*state.view.scale);$('tangent-range').max=state.view.cx+width/(2*state.view.scale);$('tangent-range').step=Math.max(1e-9,width/state.view.scale/1000);$('tangent-range').value=state.tx;
  }
  function syncControls(){
    for(const [id,key]of [['angle','angle'],['tangent-x','tx'],['tangent-range','tx'],['bound-a','a'],['bound-b','b']])$(id).value=state[key];
    for(const [id,key]of [['grid-on','grid'],['tangent-on','tangent'],['integral-on','integral']])$(id).checked=state[key];
    $('area-color').value=state.areaColor;document.body.classList.toggle('panel-hidden',!toolsOpen||!state.panel);applyTheme();syncView();
  }
  function syncView(){$('center-x').value=P.format(state.view.cx,9);$('center-y').value=P.format(state.view.cy,9);$('view-width').value=P.format(width/state.view.scale,9);$('view-height').value=P.format(height/(state.view.yScale||state.view.scale),9);$('equal-axes').checked=!state.view.yScale;}
  const toScreen=(x,y)=>[width/2+(x-state.view.cx)*state.view.scale,height/2-(y-state.view.cy)*(state.view.yScale||state.view.scale)];
  const fromScreen=(px,py)=>[state.view.cx+(px-width/2)/state.view.scale,state.view.cy-(py-height/2)/(state.view.yScale||state.view.scale)];
  function resize(){
    const rect=$('graph').getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);ratio=Math.min(3,window.devicePixelRatio||1);
    for(const c of [canvas,overlay,renderCanvas]){c.width=Math.round(width*ratio);c.height=Math.round(height*ratio);c.getContext('2d').setTransform(ratio,0,0,ratio,0,0);}
    if(autoProbabilityId){const e=model?.entries.find(e=>e.id===autoProbabilityId);if(e?.distribution)fitProbability(e);}
    cache.clear();syncView();updateCalculus();scheduleDraw();
  }
  function scheduleDraw(){if(!drawRequest){++renderRevision;if(implicitRequest){cancelAnimationFrame(implicitRequest);implicitRequest=0;}drawRequest=requestAnimationFrame(draw);}}
  function scheduleHover(){if(!hoverRequest)hoverRequest=requestAnimationFrame(()=>{hoverRequest=0;drawHover();});}
  function grid(){
    $('graph-labels').replaceChildren();const colors=plotColors();ctx.fillStyle=colors.bg;ctx.fillRect(0,0,width,height);
    const sx=P.niceStep(state.view.scale),sy=P.niceStep(state.view.yScale||state.view.scale),[xmin,ymax]=fromScreen(0,0),[xmax,ymin]=fromScreen(width,height);
    ctx.font='12px KaTeX_Main, serif';ctx.lineWidth=1;const [zx,zy]=toScreen(0,0),labelY=Math.max(15,Math.min(height-13,zy+17)),labelX=Math.max(7,Math.min(width-42,zx+6));
    for(let x=Math.ceil(xmin/sx)*sx,n=0;x<=xmax&&n++<200;x+=sx){const px=toScreen(x,0)[0];if(state.grid){ctx.strokeStyle=colors.grid;ctx.beginPath();ctx.moveTo(Math.round(px)+.5,0);ctx.lineTo(Math.round(px)+.5,height);ctx.stroke();}if(Math.abs(x)>sx/100){ctx.fillStyle=colors.text;ctx.fillText(P.format(x,4),px+4,labelY);}}
    for(let y=Math.ceil(ymin/sy)*sy,n=0;y<=ymax&&n++<200;y+=sy){const py=toScreen(0,y)[1];if(state.grid){ctx.strokeStyle=colors.grid;ctx.beginPath();ctx.moveTo(0,Math.round(py)+.5);ctx.lineTo(width,Math.round(py)+.5);ctx.stroke();}if(Math.abs(y)>sy/100){ctx.fillStyle=colors.text;ctx.fillText(P.format(y,4),labelX,py-4);}}
    ctx.strokeStyle=colors.axis;ctx.beginPath();ctx.moveTo(zx,0);ctx.lineTo(zx,height);ctx.moveTo(0,zy);ctx.lineTo(width,zy);ctx.stroke();if(zx>=0&&zx<width&&zy>=0&&zy<height){ctx.fillStyle=colors.text;ctx.fillText('0',zx+6,zy+17);}
  }
  function drawCurve(e){
    if(e.complexScalar){const z=C.is(e.value)?e.value:C.make(e.value);if(!C.finite(z))return;const p=toScreen(z.re,z.im);ctx.fillStyle=displayColor(e.color);ctx.beginPath();ctx.arc(...p,4,0,Math.PI*2);ctx.fill();graphLabel('complex-'+e.id,...p,complexTex(z),displayColor(e.color));return;}
    if(e.complex){for(const part of ['re','im']){const fn=x=>{const z=e.fn(x);return C.is(z)?z[part]:part==='re'?z:0;};drawCurve({...e,id:e.id+'-'+part,fn,complex:false,integral:null,componentDash:part==='im',hasIntegral:false});}return;}
    if(e.discrete){
      let data=cache.get(e.id);if(!data){data=P.sampleDiscrete(sourceFn(e),state.view,width,height,e.distribution?.support);cache.set(e.id,data);}const base=toScreen(0,0)[1],color=displayColor(e.color);ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();for(const p of data.points){ctx.moveTo(p.px,base);ctx.lineTo(p.px,p.py);}ctx.stroke();ctx.fillStyle=color;ctx.beginPath();for(const p of data.points){ctx.moveTo(p.px+3,p.py);ctx.arc(p.px,p.py,3,0,Math.PI*2);}ctx.fill();
      if(state.integral&&state.source===e.id&&state.a<=state.b){ctx.fillStyle=state.areaColor+'50';for(const p of data.points)if(p.x>=Math.ceil(state.a)&&p.x<=Math.floor(state.b))ctx.fillRect(p.px-4,Math.min(base,p.py),8,Math.abs(base-p.py));}return;
    }
    if(e.step){const [left]=fromScreen(0,0),[right]=fromScreen(width,0),stride=Math.max(1,Math.ceil((right-left)/4096));ctx.strokeStyle=displayColor(e.color);ctx.fillStyle=displayColor(e.color);ctx.lineWidth=1.7;for(let k=Math.floor(left);k<=right;k+=stride){const y=sourceFn(e)(k);if(!Number.isFinite(y))continue;const [px,py]=toScreen(k,y),end=toScreen(k+stride,y)[0];ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(end,py);ctx.stroke();ctx.beginPath();ctx.arc(px,py,2.5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(end,py,2.5,0,Math.PI*2);ctx.stroke();}return;
    }
    if(e.kind==='vertical'){
      const x=e.fn(0);if(!Number.isFinite(x))return;const px=toScreen(x,0)[0];ctx.strokeStyle=displayColor(e.color);ctx.lineWidth=2;ctx.beginPath();let pen=false;
      for(let py=0;py<=height;py+=2){const y=fromScreen(px,py)[1];if(e.allowed&&!e.allowed(x,y)){pen=false;continue;}if(pen)ctx.lineTo(px,py);else ctx.moveTo(px,py);pen=true;}ctx.stroke();return;
    }
    if(e.kind==='point'){
      const [x,y]=e.point;if(![x,y].every(Number.isFinite)||e.allowed&&!e.allowed(x,y))return;const [px,py]=toScreen(x,y);ctx.fillStyle=displayColor(e.color);ctx.beginPath();ctx.arc(px,py,4.5,0,Math.PI*2);ctx.fill();graphLabel('point-'+e.id,px,py,`\\left(${numberTex(x)},${numberTex(y)}\\right)`,displayColor(e.color));return;
    }
    let data=cache.get(e.id);if(!data){data=P.sampleCurve(e.integral?e.fn:sourceFn(e),state.view,width,height,{integral:e.hasIntegral});cache.set(e.id,data);}
    ctx.strokeStyle=displayColor(e.color);ctx.lineWidth=2;ctx.lineJoin='round';ctx.setLineDash(e.integral||e.componentDash?[5,4]:[]);ctx.beginPath();
    for(const segment of data.segments){if(!segment.length)continue;ctx.moveTo(segment[0].px,segment[0].py);for(let i=1;i<segment.length;i++)ctx.lineTo(segment[i].px,segment[i].py);}ctx.stroke();ctx.setLineDash([]);
  }
  function shadeIntegral(){
    const e=source();if(!e||!state.integral||e.complex)return;if(e.integral)return;if(e.discrete){for(const [label,x]of [['a',state.a],['b',state.b]]){const px=toScreen(x,0)[0];handle(ctx,px,Math.max(20,Math.min(height-24,toScreen(0,0)[1])),label);}return;}const fn=sourceFn(e),left=Math.min(state.a,state.b),right=Math.max(state.a,state.b),start=Math.max(0,toScreen(left,0)[0]),end=Math.min(width,toScreen(right,0)[0]),base=toScreen(0,0)[1];
    for(let px=start;px<end;px+=2){const x=fromScreen(px+1,0)[0],y=fn(x);if(!Number.isFinite(y))continue;const py=toScreen(x,y)[1];ctx.fillStyle=state.areaColor+'40';ctx.fillRect(px,Math.min(base,py),Math.min(2,end-px),Math.abs(py-base));}
    for(const [label,x]of [['a',state.a],['b',state.b]]){const px=toScreen(x,0)[0];ctx.strokeStyle='#7b838b';ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(px,0);ctx.lineTo(px,height);ctx.stroke();ctx.setLineDash([]);handle(ctx,px,Math.max(20,Math.min(height-24,base)),label);}
  }
  function drawIntegralExpression(e){
    const integral=e.integral,a=integral.explicit?integral.a(state.b):state.a,b=integral.explicit?integral.b(state.b):state.b;
    if(Number.isFinite(a)&&Number.isFinite(b)){
      const start=Math.max(0,toScreen(Math.min(a,b),0)[0]),end=Math.min(width,toScreen(Math.max(a,b),0)[0]),base=toScreen(0,0)[1];ctx.fillStyle=state.areaColor+'40';
      for(let px=start;px<end;px+=2){const y=integral.fn(fromScreen(px+1,0)[0]);if(Number.isFinite(y)){const py=toScreen(0,y)[1];ctx.fillRect(px,Math.min(base,py),Math.min(2,end-px),Math.abs(py-base));}}
    }
    drawCurve({...e,id:'integrand-'+e.id,kind:'curve',fn:integral.fn,integral:null,hasIntegral:false,allowed:null});
  }
  function graphLabel(key,px,py,latex,color='#4a555e'){let label=$('graph-labels').querySelector(`[data-key="${key}"]`);if(!label){label=make('span');label.dataset.key=key;$('graph-labels').append(label);}label.style.left=(px+9)+'px';label.style.top=(py-22)+'px';label.style.color=color;E.render(label,latex);}
  function handle(context,px,py,label){context.fillStyle=plotColors().bg;context.strokeStyle=plotColors().tangent;context.lineWidth=1.5;context.beginPath();context.arc(px,py,5,0,Math.PI*2);context.fill();context.stroke();graphLabel(label,px,py,label==='x₀'?'x_0':label,plotColors().tangent);}
  function tangent(){
    const e=source();if(!e||!state.tangent||e.complex||e.discrete||e.step)return;const y=sourceFn(e)(state.tx),slope=sourceDf(e,state.tx);if(!Number.isFinite(y))return;const [px,py]=toScreen(state.tx,y);
    if(Number.isFinite(slope)){const [x1]=fromScreen(0,0),[x2]=fromScreen(width,0);ctx.strokeStyle=plotColors().tangent;ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(0,toScreen(x1,y+slope*(x1-state.tx))[1]);ctx.lineTo(width,toScreen(x2,y+slope*(x2-state.tx))[1]);ctx.stroke();ctx.setLineDash([]);}handle(ctx,px,py,'x₀');
  }
  function draw(){
    drawRequest=0;const revision=++renderRevision;if(implicitRequest)cancelAnimationFrame(implicitRequest);implicitRequest=0;
    grid();for(const e of model.entries)if(e.visible&&!e.error&&e.integral)drawIntegralExpression(e);shadeIntegral();
    const relations=[];for(const e of model.entries){if(e.error||!e.visible)continue;if(['implicit','inequality'].includes(e.kind)){if(!e.hasIntegral)relations.push(e);else flashRelation();}else if(e.complexScalar||['function','curve','distribution','point','vertical'].includes(e.kind))drawCurve(e);}
    tangent();drawHover();syncView();
    $('status').textContent=Date.now()<noticeUntil?notice:'';
    if(relations.length)drawRelations(relations,revision,present);else present();
  }
  function selectIntersectionExpression(id){
    const e=model.entries.find(e=>e.id===id);if(!e||e.error||e.complex||!e.visible||!['function','curve','distribution','vertical','implicit','inequality','segment'].includes(e.kind)){flash('请选择可见的实数曲线表达式');return;}
    pendingPoint=null;scheduleHover();if(pendingExpression===null)pendingExpression=id;else if(pendingExpression===id)pendingExpression=null;else{
      checkpoint();dirty=false;const pair=[pendingExpression,id].sort((a,b)=>a-b),index=state.intersections.findIndex(p=>p[0]===pair[0]&&p[1]===pair[1]);if(index<0)state.intersections.push(pair);else state.intersections.splice(index,1);pendingExpression=null;intersectionNotice=true;changed(false);
    }
    document.querySelectorAll('.expression').forEach(row=>row.classList.toggle('intersection-pick',Number(row.dataset.id)===pendingExpression));
  }
  function drawIntersections(){
    const environment=JSON.stringify([state.view,width,height,state.angle,state.rows.map(r=>r.text)]);let total=0,coincident=false;
    for(const pair of state.intersections){const [a,b]=pair.map(id=>model.entries.find(e=>e.id===id));if(!a||!b||a.error||b.error||!a.visible||!b.visible||a.complex||b.complex)continue;
      const key=JSON.stringify(pair)+environment;let data=intersectionCache.get(key);if(!data){data=P.intersections(a,b,state.view,width,height);intersectionCache.set(key,data);while(intersectionCache.size>32)intersectionCache.delete(intersectionCache.keys().next().value);}
      coincident=coincident||data.coincident;total+=data.points.length;
      data.points.forEach(([x,y],i)=>{const [px,py]=toScreen(x,y);ctx.fillStyle=plotColors().bg;ctx.strokeStyle=plotColors().tangent;ctx.lineWidth=2;ctx.beginPath();ctx.arc(px,py,4,0,Math.PI*2);ctx.fill();ctx.stroke();graphLabel('intersection-'+pair.join('-')+'-'+i,px,py,`(${numberTex(x)},${numberTex(y)})`,plotColors().tangent);});
    }
    if(intersectionNotice){notice=coincident?'存在重合部分，交点不是有限集合':total?`${total} 个可见交点`:'未检测到可见交点';noticeUntil=Date.now()+5500;$('status').textContent=notice;intersectionNotice=false;}
  }
  function drawSegments(){for(const e of model.entries){if(e.error||!e.visible||!e.segment)continue;const a=toScreen(...e.segment[0]),b=toScreen(...e.segment[1]);ctx.strokeStyle=displayColor(e.color);ctx.fillStyle=displayColor(e.color);ctx.lineWidth=2;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();for(const p of [a,b]){ctx.beginPath();ctx.arc(...p,3,0,Math.PI*2);ctx.fill();}graphLabel('segment-'+e.id,(a[0]+b[0])/2,(a[1]+b[1])/2,L.identifier(e.name||'l'+e.id),displayColor(e.color));}}
  function present(){drawSegments();drawIntersections();screen.drawImage(renderCanvas,0,0,width,height);}
  function flashRelation(){notice='含积分的隐式关系暂不绘制；请使用 y=int(…)';noticeUntil=Date.now()+5000;}
  function drawRelations(entries,revision,done){
    // Small frame slices bound UI blocking; edited expressions cancel stale work.
    const step=drag?12:7,definitions=model.entries.filter(e=>['variable','function'].includes(e.kind)||e.randomVariable).map(e=>[e.text,e.error]),environment=JSON.stringify([state.view,width,height,state.angle,definitions,step]);let ei=0,px=0,py=0,pending=null;
    const keys=new Map(entries.map(e=>[e,JSON.stringify([e.ast,e.restriction])+environment])),key=e=>keys.get(e);
    function paint(e,data){ctx.fillStyle=displayColor(e.color)+(state.theme==='dark'?'30':'1c');for(const t of data.tiles)ctx.fillRect(...t);ctx.strokeStyle=displayColor(e.color);ctx.setLineDash(e.kind==='inequality'&&['<','>','!='].includes(e.op)?[3,3]:[]);ctx.beginPath();for(const [a,b]of data.lines){ctx.moveTo(...a);ctx.lineTo(...b);}ctx.stroke();}
    function chunk(){
      implicitRequest=0;if(revision!==renderRevision)return;const until=performance.now()+6;
      ctx.save();ctx.lineWidth=1.5;
      while(ei<entries.length&&performance.now()<until){
        const e=entries[ei],cached=relationCache.get(key(e));if(cached){relationHits.set(e.id,cached);paint(e,cached);ei++;continue;}if(!pending)pending={tiles:[],lines:[]};const p=fromScreen(px,py+step),dx=step/state.view.scale,dy=step/(state.view.yScale||state.view.scale);
        try{
          if(e.kind==='inequality'){
            const [x,y]=fromScreen(px+step/2,py+step/2),v=e.fn(x,y),ok=Number.isFinite(v)&&({'<':v<0,'<=':v<=0,'>':v>0,'>=':v>=0,'!=':v!==0}[e.op]);
            if(ok&&(!e.allowed||e.allowed(x,y))){ctx.fillStyle=displayColor(e.color)+(state.theme==='dark'?'30':'1c');ctx.fillRect(px,py,step,step);pending.tiles.push([px,py,step,step]);}
          }
          if(!e.allowed||e.allowed(p[0]+dx/2,p[1]+dy/2)){
            const lines=P.contourCell(e.fn,p[0],p[1],dx,dy,toScreen);pending.lines.push(...lines);ctx.strokeStyle=displayColor(e.color);ctx.setLineDash(e.kind==='inequality'&&['<','>','!='].includes(e.op)?[3,3]:[]);
            ctx.beginPath();for(const [a,b]of lines){ctx.moveTo(...a);ctx.lineTo(...b);}ctx.stroke();
          }
        }catch{}
        px+=step;if(px>=width){px=0;py+=step;}if(py>=height){py=0;relationCache.set(key(e),pending);relationHits.set(e.id,pending);pending=null;while(relationCache.size>8)relationCache.delete(relationCache.keys().next().value);ei++;}
      }
      ctx.restore();if(ei<entries.length)implicitRequest=requestAnimationFrame(chunk);else{tangent();done();}
    }
    implicitRequest=requestAnimationFrame(chunk);
  }
  function drawHover(){
    ox.clearRect(0,0,width,height);if(pendingPoint){const p=toScreen(...pendingPoint);ox.strokeStyle=plotColors().cursor;ox.lineWidth=2;ox.beginPath();ox.arc(...p,6,0,Math.PI*2);ox.stroke();}if(!hover||drag){E.render($('readout'),'');return;}
    const [x,y]=fromScreen(...hover),colors=plotColors();let text=`x=${numberTex(x)},\\quad y=${numberTex(y)}`;
    ox.strokeStyle=colors.cursor;ox.lineWidth=1;ox.setLineDash([3,4]);ox.beginPath();ox.moveTo(hover[0],0);ox.lineTo(hover[0],height);ox.moveTo(0,hover[1]);ox.lineTo(width,hover[1]);ox.stroke();ox.setLineDash([]);
    const e=source();if(e?.complex){E.render($('readout'),`x=${numberTex(x)},\\quad f(x)=${complexTex(e.fn(x))}`);return;}if(e){const at=e.discrete?Math.round(x):x,v=sourceFn(e)(at);if(Number.isFinite(v)){const p=toScreen(at,v);ox.fillStyle=displayColor(e.color);ox.beginPath();ox.arc(...p,3.5,0,Math.PI*2);ox.fill();text+=e.discrete?`\\\\${e.probability?'p':'f'}(${numberTex(at)})=${numberTex(v)}`:`\\\\f(x)=${numberTex(v)}${e.step?'':`,\\quad f'(x)=${numberTex(sourceDf(e,x))}`}`;}}
    E.render($('readout'),`\\begin{gathered}${text}\\end{gathered}`);
  }
  function position(e){const r=canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];}
  function snapPoint(p){
    let best=null,distance=13;const consider=q=>{if(!q.every(Number.isFinite))return;const screenPoint=toScreen(...q),d=Math.hypot(screenPoint[0]-p[0],screenPoint[1]-p[1]);if(d<distance){best=q;distance=d;}};
    const onSegment=(a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;consider(fromScreen(a[0]+t*dx,a[1]+t*dy));};
    for(const e of model.entries){if(e.error||!e.visible)continue;
      if(e.segment){onSegment(...e.segment.map(q=>toScreen(...q)));continue;}
      if(e.kind==='point'){consider(e.point);continue;}
      if(e.complexScalar){const z=C.is(e.value)?e.value:C.make(e.value);consider([z.re,z.im]);continue;}
      if(e.kind==='vertical'){const x=e.fn(0),y=fromScreen(...p)[1];if(!e.allowed||e.allowed(x,y))consider([x,y]);continue;}
      const implicit=relationHits.get(e.id);if(implicit){for(const [a,b]of implicit.lines)onSegment(a,b);continue;}
      if(!['function','curve','distribution'].includes(e.kind)||!e.fn)continue;
      for(let px=p[0]-12;px<=p[0]+12;px++){
        let x=fromScreen(px,0)[0];if(e.discrete)x=Math.round(x);let y=sourceFn(e)(x);
        if(e.complex){const z=C.is(y)?y:C.make(y);consider([x,z.re]);consider([x,z.im]);}else if(!e.allowed||e.allowed(x,y))consider([x,y]);
      }
    }
    return best;
  }
  function selectSegmentPoint(p){
    const point=snapPoint(p);if(!point){flash('请在曲线上选择点');return;}
    if(!pendingPoint){pendingPoint=point;scheduleHover();return;}
    if(Math.hypot(point[0]-pendingPoint[0],point[1]-pendingPoint[1])<1e-10)return;
    if(state.rows.length>=64){flash('最多 64 行');return;}
    const used=new Set(model.entries.map(e=>e.name));let n=1;while(used.has('l'+n))n++;
    checkpoint();dirty=false;const r=row(`l${n}=segment(${[...pendingPoint,...point].map(v=>P.format(v,12)).join(',')})`);state.rows.push(r);pendingPoint=null;renderRows();compileRows();persist();
  }
  canvas.onpointerdown=e=>{
    if(e.button!==0)return;if(e.ctrlKey){e.preventDefault();canvas.focus();selectSegmentPoint(position(e));return;}
canvas.focus();checkpoint();dirty=false;const p=position(e),f=source();let type='pan';
    if(f&&state.tangent&&!f.discrete&&!f.step){const q=toScreen(state.tx,sourceFn(f)(state.tx));if(Math.hypot(p[0]-q[0],p[1]-q[1])<18)type='tangent';}
    if(type==='pan'&&state.integral&&f){if(Math.abs(p[0]-toScreen(state.a,0)[0])<10)type='a';else if(Math.abs(p[0]-toScreen(state.b,0)[0])<10)type='b';}
    drag={type,start:p,view:{...state.view},pointer:e.pointerId};canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');
  };
  canvas.onpointermove=e=>{
    const p=position(e);hover=p;
    if(drag){
      if(drag.type==='pan'){autoProbabilityId=null;state.view.cx=drag.view.cx-(p[0]-drag.start[0])/state.view.scale;state.view.cy=drag.view.cy+(p[1]-drag.start[1])/(state.view.yScale||state.view.scale);}
      else{const x=fromScreen(...p)[0];if(drag.type==='tangent')state.tx=x;else state[drag.type]=x;syncControls();updateCalculus();}
      changed(false);
    }else scheduleHover();
  };
  function endDrag(e){if(!drag||drag.pointer!==e.pointerId)return;drag=null;canvas.classList.remove('dragging');if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);updateCalculus();persist();scheduleDraw();}
  canvas.onpointerup=endDrag;canvas.onpointercancel=endDrag;
  canvas.onpointerleave=()=>{if(!drag){hover=null;drawHover();}};
  let wheelSession=0;
  function zoom(factor,point=[width/2,height/2]){
    autoProbabilityId=null;const [x,y]=fromScreen(...point),clamp=n=>Math.max(1e-6,Math.min(1e8,n));
    if(state.view.yScale)state.view.yScale=clamp(state.view.yScale*factor);
    state.view.scale=clamp(state.view.scale*factor);state.view.cx=x-(point[0]-width/2)/state.view.scale;state.view.cy=y+(point[1]-height/2)/(state.view.yScale||state.view.scale);updateCalculus();changed(false);
  }
  canvas.addEventListener('wheel',e=>{e.preventDefault();if(Date.now()-wheelSession>350)checkpoint();wheelSession=Date.now();zoom(Math.exp(-Math.max(-120,Math.min(120,e.deltaY))*0.002),position(e));},{passive:false});
  canvas.onkeydown=e=>{
    if(['+','=','-','Home','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();checkpoint();}
    if(e.key==='+'||e.key==='=')zoom(1.25);else if(e.key==='-')zoom(0.8);else if(e.key==='Home')resetView();
    else if(e.key.startsWith('Arrow')){autoProbabilityId=null;const delta=60/state.view.scale,dy=60/(state.view.yScale||state.view.scale);if(e.key==='ArrowLeft')state.view.cx-=delta;if(e.key==='ArrowRight')state.view.cx+=delta;if(e.key==='ArrowUp')state.view.cy+=dy;if(e.key==='ArrowDown')state.view.cy-=dy;changed(false);updateCalculus();}
  };
  function resetView(){if(source()?.distribution){fitProbability(source());changed(false);updateCalculus();return;}autoProbabilityId=null;state.view={cx:0,cy:0,scale:Math.max(12,Math.min(width/20,height/12))};changed(false);updateCalculus();}
  function fitProbability(e){
    autoProbabilityId=e.id;if(!width||!height)return false;
    const d=e.distribution,[lo,hi]=d.domain,peak=e.step||e.ast?.name==='cdf'?1:d.peak;
    if(![lo,hi,peak].every(Number.isFinite)||hi<=lo||peak<=0||Math.max(Math.abs(lo),Math.abs(hi),peak)>1e12)return false;
    const clamp=n=>Math.max(1e-6,Math.min(1e8,n));
    state.view={cx:(lo+hi)/2,cy:peak*.55,scale:clamp(width*.9/(hi-lo)),yScale:clamp(height/(peak*1.4))};return true;
  }
  function fitView(){
    const e=source();if(!e)return;if(e.distribution){checkpoint();fitProbability(e);changed(false);updateCalculus();return;}autoProbabilityId=null;const fn=sourceFn(e),[xmin]=fromScreen(0,0),[xmax]=fromScreen(width,0),values=[];
    for(let i=0;i<150;i++){const y=fn(xmin+(xmax-xmin)*i/149);if(Number.isFinite(y))values.push(y);}
    if(!values.length){flash('当前范围内没有有限函数值');return;}values.sort((a,b)=>a-b);const low=values[Math.floor(values.length*0.03)],high=values[Math.floor(values.length*0.97)];
    checkpoint();state.view.cy=(low+high)/2;state.view.yScale=Math.max(1e-6,Math.min(1e8,height/Math.max(1e-6,(high-low)*1.25)));changed(false);updateCalculus();
  }
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
  function exportProject(){download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),'graphVis.json');flash('已导出项目 JSON');}
  $('save').onclick=exportProject;$('open').onclick=()=>$('file').click();
  $('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;try{if(file.size>100000)throw Error('项目文件过大');const s=validateProject(JSON.parse(await file.text()));checkpoint();dirty=false;state=s;pendingPoint=null;pendingExpression=null;restoringView=true;autoProbabilityId=null;nextId=Math.max(0,...state.rows.map(r=>r.id))+1;if(!state.rows.length)state.rows.push(row(''));renderRows();syncControls();compileRows();resize();persist();flash('项目已打开');}catch(e){flash(`无法打开：${e.message}`);}$('file').value='';};
  $('export').onclick=()=>{
    if(implicitRequest){flash('关系绘制中');return;}
    const copy=canvas.cloneNode(false),c=copy.getContext('2d');c.setTransform(ratio,0,0,ratio,0,0);c.drawImage(canvas,0,0,width,height);
    c.font='12px KaTeX_Main, serif';
    for(const label of $('graph-labels').children){let text=label.dataset.key;if(text.startsWith('intersection-'))text=label.dataset.latex||text;if(text.startsWith('segment-'))text=model.entries.find(e=>e.id===Number(text.slice(8)))?.name||text;if(text.startsWith('complex-')){const z=model.entries.find(e=>e.id===Number(text.slice(8)))?.value;if(!z)continue;text=C.is(z)?`${P.format(z.re)}${z.im<0?'-':'+'}${P.format(Math.abs(z.im))}i`:P.format(z);}if(text.startsWith('point-')){const point=model.entries.find(e=>e.id===Number(text.slice(6)))?.point;if(!point)continue;text=`(${P.format(point[0])}, ${P.format(point[1])})`;}c.fillStyle=label.style.color;c.fillText(text,parseFloat(label.style.left),parseFloat(label.style.top)+13);}
    copy.toBlob(blob=>{if(blob)download(blob,'graphVis.png');else flash('无法导出图像');},'image/png');
  };
  $('undo').onclick=()=>undo();$('redo').onclick=()=>undo(true);$('add').onclick=()=>addRow();
  $('tools-toggle').onclick=()=>{setTools(!toolsOpen);if(toolsOpen)focusRow(activeRow().id);};
  $('theme-toggle').onclick=()=>{checkpoint();state.theme=state.theme==='dark'?'light':'dark';applyTheme();changed(false);};
  $('controls-toggle').onclick=()=>{const controls=$('tool-controls');controls.hidden=!controls.hidden;$('controls-toggle').setAttribute('aria-expanded',String(!controls.hidden));};
  $('delete-expression').onclick=()=>deleteRow(activeRow().id);
  $('visibility').onclick=()=>{const r=activeRow();checkpoint();r.visible=!r.visible;document.querySelector(`.expression[data-id="${r.id}"]`).classList.toggle('hidden-curve',!r.visible);changed();};
  $('cycle-color').onclick=()=>{const r=activeRow();checkpoint();r.color=palette[(palette.indexOf(r.color)+1)%palette.length];document.querySelector(`.expression[data-id="${r.id}"]`).style.setProperty('--color',displayColor(r.color));changed();};
  $('keyboard-toggle').onclick=()=>{const input=document.querySelector(`.expression[data-id="${activeId}"] math-field`)||document.querySelector('math-field');input?.focus();const keyboard=window.mathVirtualKeyboard;if(keyboard.visible)keyboard.hide({animate:false});else keyboard.show({animate:false});};
  function keyboardState(){const keyboard=window.mathVirtualKeyboard;$('keyboard-toggle').setAttribute('aria-expanded',String(keyboard.visible));document.documentElement.style.setProperty('--keyboard-height',keyboard.visible?keyboard.boundingRect.height+'px':'0px');}
  window.mathVirtualKeyboard.addEventListener('virtual-keyboard-toggle',keyboardState);
  window.mathVirtualKeyboard.addEventListener('geometrychange',keyboardState);
  $('source-toggle').onclick=()=>{const options=$('source-options');options.hidden=!options.hidden;$('source-toggle').setAttribute('aria-expanded',String(!options.hidden));};
  $('zoom-in').onclick=()=>{checkpoint();zoom(1.25);};$('zoom-out').onclick=()=>{checkpoint();zoom(0.8);};$('reset-view').onclick=()=>{checkpoint();resetView();};$('fit-view').onclick=fitView;
  $('source').onchange=()=>{checkpoint();state.source=Number($('source').value);E.render($('source-value'),source()?L.toLatex(source().text):'');updateCalculus();changed(false);};
  $('add-derivative').onclick=()=>{const e=source();if(e)addRow(e.kind==='function'?`${e.name}'(x)`:`diff(${sourceExpression(e)})${M.normalize(e.text).match(/\{[^{}]+\}\s*$/)?.[0]||''}`);};
  $('add-integral').onclick=()=>{const e=source();if(e)addRow(e.discrete?`cdf(${M.normalize(distributionExpression(e))},x)`:`int(${sourceExpression(e)},${P.format(state.a,12)},x)`);};
  for(const [id,key]of [['tangent-on','tangent'],['integral-on','integral'],['grid-on','grid']])$(id).onchange=()=>{checkpoint();state[key]=$(id).checked;updateCalculus();changed(false);};
  $('area-color').oninput=()=>{beforeChange();state.areaColor=$('area-color').value;changed(false);};$('area-color').onchange=()=>{dirty=false;};
  $('bound-a').addEventListener('keydown',e=>{if(e.key==='ArrowUp'){e.preventDefault();$('bound-b').focus();$('bound-b').select();}});
  $('bound-b').addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();$('bound-a').focus();$('bound-a').select();}});
  $('angle').onchange=()=>{checkpoint();state.angle=$('angle').value;changed();};
  for(const [id,key]of [['tangent-x','tx'],['bound-a','a'],['bound-b','b']])$(id).oninput=()=>{const v=Number($(id).value);if(!$(id).value||!Number.isFinite(v)||Math.abs(v)>1e12)return;beforeChange();state[key]=v;updateCalculus();changed(false);};
  for(const id of ['tangent-x','bound-a','bound-b'])$(id).onchange=()=>{dirty=false;};
  $('tangent-range').onpointerdown=()=>{checkpoint();dirty=false;};$('tangent-range').oninput=()=>{beforeChange();state.tx=Number($('tangent-range').value);$('tangent-x').value=P.format(state.tx,10);updateCalculus();changed(false);};$('tangent-range').onchange=()=>{dirty=false;};
  for(const [id,key]of [['center-x','cx'],['center-y','cy']])$(id).onchange=()=>{const value=Number($(id).value);if(!$(id).value||!Number.isFinite(value)||Math.abs(value)>1e12){syncView();return;}checkpoint();autoProbabilityId=null;state.view[key]=value;updateCalculus();changed(false);};
  $('view-width').onchange=()=>{const value=Number($('view-width').value),scale=width/value;if(!Number.isFinite(scale)||scale<1e-6||scale>1e8){syncView();return;}checkpoint();autoProbabilityId=null;state.view.scale=scale;updateCalculus();changed(false);};
  $('view-height').onchange=()=>{const scale=height/Number($('view-height').value);if(!Number.isFinite(scale)||scale<1e-6||scale>1e8){syncView();return;}checkpoint();autoProbabilityId=null;state.view.yScale=scale;updateCalculus();changed(false);};
  $('equal-axes').onchange=()=>{checkpoint();autoProbabilityId=null;if($('equal-axes').checked)delete state.view.yScale;else state.view.yScale=state.view.scale;updateCalculus();changed(false);};
  document.querySelectorAll('[data-insert]').forEach(button=>{button.onclick=()=>{let input=document.querySelector(`.expression[data-id="${activeId}"] math-field`);if(!input){addRow();input=document.querySelector(`.expression[data-id="${activeId}"] math-field`);}input.focus();input.insert(button.dataset.insert);input.dispatchEvent(new Event('input'));};});
  let refreshApproved=false;
  const refreshDialog=$('refresh-confirm');$('refresh-cancel').onclick=()=>refreshDialog.close();$('refresh-ok').onclick=()=>{refreshApproved=true;refreshDialog.close();window.location.reload();};
  refreshDialog.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('refresh-ok').click();}});
  document.addEventListener('keydown',e=>{
    const editing=['MATH-FIELD','INPUT'].includes(document.activeElement?.tagName);
    if(e.key==='F5'||(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='r'){e.preventDefault();if(!refreshDialog.open)refreshDialog.showModal();$('refresh-ok').focus();}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();exportProject();}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);}
    else if(e.altKey&&e.key.toLowerCase()==='n'){e.preventDefault();addRow();}
    else if((e.ctrlKey||e.metaKey)&&e.key==='/'){e.preventDefault();setTools(!toolsOpen);}
    else if(e.key==='Escape'){pendingPoint=null;pendingExpression=null;document.querySelectorAll('.intersection-pick').forEach(e=>e.classList.remove('intersection-pick'));scheduleHover();setTools(false);}
    else if(!editing&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key.length===1&&/[A-Za-z0-9\\]/.test(e.key)){e.preventDefault();setTools(true);focusRow(state.rows.find(r=>!r.text)?.id||state.rows.at(-1).id);const input=document.activeElement;input.insert(e.key);input.dispatchEvent(new Event('input'));}
    if(e.defaultPrevented)e.stopPropagation();
  },{capture:true});
  renderRows();syncControls();compileRows();resize();updateHistory();
  document.querySelectorAll('[data-math]').forEach(element=>E.render(element,element.dataset.math));
  new ResizeObserver(resize).observe($('graph'));
  window.addEventListener('beforeunload',e=>{if(refreshApproved)return;e.preventDefault();e.returnValue='';});
})();

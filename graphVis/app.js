/* Local application. Classic scripts also work when index.html is opened directly. */
(function(){
  'use strict';
  const M=GraphMath,P=GraphPlot,L=GraphLatex,E=GraphEditor,$=id=>document.getElementById(id);
  const palette=['#376ca3','#bb4a46','#41815a','#885a9b','#aa7727','#27878a'];
  const STORE='graphVis.v2';let nextId=1,toolsOpen=false;
  const row=text=>({id:nextId++,text,color:palette[(nextId-2)%palette.length],visible:true,min:-10,max:10,step:0.1});
  let state={version:1,rows:[row('')],view:{cx:0,cy:0,scale:65},angle:'rad',grid:true,source:null,tangent:false,tx:1,integral:false,a:0,b:Math.PI,panel:true};
  let model,history=[],future=[],dirty=false,drawRequest=0,saveTimer,historyTimer,activeId=state.rows[0].id;
  let width=0,height=0,ratio=1,renderRevision=0,implicitRequest=0,hoverRequest=0,cache=new Map(),drag=null,hover=null,notice='',noticeUntil=0;
  const canvas=$('canvas'),overlay=$('overlay'),ctx=canvas.getContext('2d'),ox=overlay.getContext('2d');
  function serialize(){return JSON.stringify(state);}
  function validateProject(s){
    if(!s||s.version!==1||!Array.isArray(s.rows)||s.rows.length>64)throw Error('项目格式不正确，最多 64 行');
    const finite=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
    if(!s.view||!finite(s.view.cx,-1e12,1e12)||!finite(s.view.cy,-1e12,1e12)||!finite(s.view.scale,1e-6,1e8))throw Error('无效视图范围');
    if(!['rad','deg'].includes(s.angle)||typeof s.grid!=='boolean'||typeof s.panel!=='boolean')throw Error('无效设置');
    for(const key of ['tx','a','b'])if(!finite(s[key],-1e12,1e12))throw Error('无效微积分参数');
    if(typeof s.tangent!=='boolean'||typeof s.integral!=='boolean')throw Error('无效微积分设置');
    const ids=new Set();
    for(const r of s.rows){
      if(!Number.isSafeInteger(r.id)||r.id<1||ids.has(r.id)||typeof r.text!=='string'||r.text.length>600||!/^#[0-9a-f]{6}$/i.test(r.color)||typeof r.visible!=='boolean')throw Error('无效表达式行');
      if(!finite(r.min,-1e12,1e12)||!finite(r.max,-1e12,1e12)||r.min>=r.max||!finite(r.step,1e-9,1e12))throw Error('无效滑块范围');
      ids.add(r.id);
    }
    if(s.source!==null&&!ids.has(s.source))s.source=null;
    return s;
  }
  function loadSaved(){
    try{const value=localStorage.getItem(STORE);if(value)state=validateProject(JSON.parse(value));}
    catch{notice='本地记录不可用';noticeUntil=Date.now()+7000;}
    nextId=Math.max(0,...state.rows.map(r=>r.id))+1;
    if(!state.rows.length)state.rows.push(row(''));
  }
  function flash(message){notice=message;noticeUntil=Date.now()+5500;scheduleDraw();}
  function checkpoint(){
    clearTimeout(historyTimer);const value=serialize();
    if(history.at(-1)!==value){history.push(value);if(history.length>80)history.shift();}
    future=[];updateHistory();
  }
  function beforeChange(){if(!dirty){checkpoint();dirty=true;}}
  function persist(){
    clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem(STORE,serialize());}catch{flash('无法自动保存；请使用“保存”下载项目');}},350);
    updateHistory();
  }
  function changed(rebuild=true){if(rebuild)compileRows();else{cache.clear();scheduleDraw();}persist();}
  function updateHistory(){$('undo').disabled=!history.length;$('redo').disabled=!future.length;}
  function undo(redo=false){
    clearTimeout(historyTimer);const from=redo?future:history,to=redo?history:future;if(!from.length)return;
    to.push(serialize());state=JSON.parse(from.pop());dirty=false;nextId=Math.max(...state.rows.map(r=>r.id))+1;
    renderRows();syncControls();compileRows();persist();
  }
  function make(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
  function renderRows(){
    const parent=$('expressions');parent.replaceChildren();$('parameters').replaceChildren();
    for(const r of state.rows){
      const item=make('div','expression');item.dataset.id=r.id;
      const line=make('div','expression-row'),input=make('math-field');
      item.style.setProperty('--color',r.color);item.classList.toggle('hidden-curve',!r.visible);
      input.setAttribute('aria-label',`表达式 ${state.rows.indexOf(r)+1}`);
      input.onfocus=()=>{activeId=r.id;updateActiveTools();};
      input.oninput=()=>{
        beforeChange();r.text=input.value;changed();
        clearTimeout(historyTimer);historyTimer=setTimeout(()=>{dirty=false;},650);
      };
      input.addEventListener('keydown',e=>{
        const index=state.rows.indexOf(r);
        if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();addRow('',index+1);}
        else if(e.key==='ArrowUp'&&input.position===0&&index>0){e.preventDefault();focusRow(state.rows[index-1].id);}
        else if(e.key==='ArrowDown'&&input.position===input.lastOffset&&index<state.rows.length-1){e.preventDefault();focusRow(state.rows[index+1].id);}
        else if(e.key==='Backspace'&&!input.value&&state.rows.length>1){e.preventDefault();deleteRow(r.id);}
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
  function updateActiveTools(){const r=activeRow();$('visibility').setAttribute('aria-pressed',String(!!r?.visible));$('cycle-color').style.color=r?.color||palette[0];}
  function addRow(text='',index=state.rows.length){
    if(state.rows.length>=64){flash('最多 64 行');return;}
    checkpoint();dirty=false;state.panel=true;setTools(true);syncControls();const r=row(text);state.rows.splice(index,0,r);renderRows();compileRows();persist();focusRow(r.id);
  }
  function deleteRow(id){checkpoint();dirty=false;const index=state.rows.findIndex(r=>r.id===id);state.rows.splice(index,1);if(!state.rows.length)state.rows.push(row(''));renderRows();compileRows();persist();focusRow(state.rows[Math.max(0,index-1)].id);}
  function compileRows(){
    model=M.build(state.rows,state.angle);cache.clear();
    for(const box of $('parameters').querySelectorAll('.slider'))if(!model.entries.some(e=>e.id===Number(box.dataset.id)&&e.slider&&!e.error))box.remove();
    const valid=model.entries.filter(e=>!e.error&&['function','curve'].includes(e.kind));
    if(!valid.some(e=>e.id===state.source))state.source=valid[0]?.id??null;
    const select=$('source');select.replaceChildren();
    const options=$('source-options');options.replaceChildren();
    if(!valid.length){const o=make('option','','');select.append(o);}
    for(const entry of valid){const o=make('option','',entry.text);o.value=entry.id;select.append(o);}
    select.value=state.source??'';select.disabled=!valid.length;$('add-derivative').disabled=!valid.length;$('add-integral').disabled=!valid.length;
    $('source-toggle').disabled=!valid.length;E.render($('source-value'),valid.find(e=>e.id===state.source)?L.toLatex(valid.find(e=>e.id===state.source).text):'');
    for(const entry of valid){const button=make('button');button.setAttribute('role','option');button.setAttribute('aria-selected',String(entry.id===state.source));E.render(button,L.toLatex(entry.text));button.onclick=()=>{select.value=entry.id;select.dispatchEvent(new Event('change'));options.hidden=true;$('source-toggle').setAttribute('aria-expanded','false');};options.append(button);}
    for(const entry of model.entries){
      const item=document.querySelector(`.expression[data-id="${entry.id}"]`);if(!item)continue;
      const result=item.querySelector('.row-result');result.classList.toggle('error',!!entry.error);
      if(entry.error){result.removeAttribute('data-latex');result.textContent=entry.error;}else E.render(result,entry.kind==='value'?`${entry.hasIntegral?'\\approx':'='}${numberTex(entry.value,10)}`:'');
      let slider=$('parameters').querySelector(`.slider[data-id="${entry.id}"]`);
      if(entry.slider&&!entry.error){if(!slider){slider=createSlider(state.rows.find(r=>r.id===entry.id),entry.name);$('parameters').append(slider);}const range=slider.querySelector('input[type=range]');range.value=model.scope.vars[entry.name];E.render(slider.querySelector('.parameter-value'),`${L.identifier(entry.name)}=${numberTex(model.scope.vars[entry.name])}`);}
      else slider?.remove();
    }
    updateActiveTools();updateCalculus();scheduleDraw();
  }
  function createSlider(r,name){
    const value=model.scope.vars[name];r.min=Math.min(r.min,value);r.max=Math.max(r.max,value);
    const box=make('div','slider'),range=make('input'),settings=make('div','slider-settings');box.dataset.id=r.id;range.type='range';range.min=r.min;range.max=r.max;range.step=r.step;range.setAttribute('aria-label',`参数 ${name}`);
    range.onpointerdown=()=>{checkpoint();dirty=false;};range.oninput=()=>{beforeChange();r.text=`${name}=${range.value}`;const input=document.querySelector(`.expression[data-id="${r.id}"] math-field`);input.setValue(L.toLatex(r.text),{silenceNotifications:true});changed();};range.onchange=()=>{dirty=false;};
    for(const [key,label] of [['min','最小'],['max','最大'],['step','步长']]){
      const l=make('label','',label),i=make('input');i.type='number';i.value=r[key];i.step='any';i.setAttribute('aria-label',`${name} ${label}`);
      i.onchange=()=>{const value=Number(i.value);if(!i.value||!Number.isFinite(value)||Math.abs(value)>1e12||key==='step'&&value<1e-9||key==='min'&&value>=r.max||key==='max'&&value<=r.min){i.value=r[key];return;}checkpoint();r[key]=value;range[key]=value;changed();};l.append(i);settings.append(l);
    }
    box.append(make('div','parameter-value'),range,settings);return box;
  }
  function source(){return model?.entries.find(e=>e.id===state.source&&!e.error);}
  function sourceExpression(e){return e.kind==='function'?`${e.name}(x)`:M.normalize(e.text).trim().replace(/^y\s*=\s*/,'').replace(/\{[^{}]+\}\s*$/,'');}
  function numberTex(value,digits=6){if(!Number.isFinite(value))return '\\operatorname{undefined}';const text=P.format(value,digits);return text.replace(/^(.+?)e([+-]?\d+)$/,(_,n,p)=>`${n}\\times10^{${Number(p)}}`);}
  function sourceFn(e){return x=>{const y=e.fn(x);return e.allowed&&!e.allowed(x,y)?NaN:y;};}
  function sourceDf(e,x){const h=1e-7*Math.max(1,Math.abs(x)),fn=sourceFn(e);return [fn(x),fn(x-h),fn(x+h)].every(Number.isFinite)?e.df(x):NaN;}
  function updateCalculus(){
    const e=source();$('tangent-controls').hidden=!state.tangent;$('integral-controls').hidden=!state.integral;
    if(!e){E.render($('tangent-value'),'');E.render($('integral-value'),'');return;}
    const fn=sourceFn(e),v=fn(state.tx),slope=sourceDf(e,state.tx);
    E.render($('tangent-value'),`\\begin{gathered}f(${numberTex(state.tx)})=${numberTex(v)}\\\\f'(${numberTex(state.tx)})=${numberTex(Number.isFinite(v)?slope:NaN)}\\end{gathered}`);
    if(state.integral){const value=M.integrate(fn,state.a,state.b);E.render($('integral-value'),`\\int_{${numberTex(state.a)}}^{${numberTex(state.b)}}f(x)\\,\\mathrm{d}x\\approx${numberTex(value,9)}`);}
    $('tangent-range').min=state.view.cx-width/(2*state.view.scale);$('tangent-range').max=state.view.cx+width/(2*state.view.scale);$('tangent-range').step=Math.max(1e-9,width/state.view.scale/1000);$('tangent-range').value=state.tx;
  }
  function syncControls(){
    for(const [id,key]of [['angle','angle'],['tangent-x','tx'],['tangent-range','tx'],['bound-a','a'],['bound-b','b']])$(id).value=state[key];
    for(const [id,key]of [['grid-on','grid'],['tangent-on','tangent'],['integral-on','integral']])$(id).checked=state[key];
    document.body.classList.toggle('panel-hidden',!toolsOpen||!state.panel);syncView();
  }
  function syncView(){$('center-x').value=P.format(state.view.cx,9);$('center-y').value=P.format(state.view.cy,9);$('view-width').value=P.format(width/state.view.scale,9);}
  const toScreen=(x,y)=>[width/2+(x-state.view.cx)*state.view.scale,height/2-(y-state.view.cy)*state.view.scale];
  const fromScreen=(px,py)=>[state.view.cx+(px-width/2)/state.view.scale,state.view.cy-(py-height/2)/state.view.scale];
  function resize(){
    const rect=$('graph').getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);ratio=Math.min(3,window.devicePixelRatio||1);
    for(const c of [canvas,overlay]){c.width=Math.round(width*ratio);c.height=Math.round(height*ratio);c.getContext('2d').setTransform(ratio,0,0,ratio,0,0);}
    cache.clear();syncView();updateCalculus();scheduleDraw();
  }
  function scheduleDraw(){if(!drawRequest)drawRequest=requestAnimationFrame(draw);}
  function scheduleHover(){if(!hoverRequest)hoverRequest=requestAnimationFrame(()=>{hoverRequest=0;drawHover();});}
  function grid(){
    $('graph-labels').replaceChildren();
    ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);const s=P.niceStep(state.view.scale),[xmin,ymax]=fromScreen(0,0),[xmax,ymin]=fromScreen(width,height);
    ctx.font='12px KaTeX_Main, serif';ctx.lineWidth=1;
    const [zx,zy]=toScreen(0,0),labelY=Math.max(15,Math.min(height-13,zy+17)),labelX=Math.max(7,Math.min(width-42,zx+6));
    for(let x=Math.ceil(xmin/s)*s,n=0;x<=xmax&&n++<200;x+=s){const px=toScreen(x,0)[0];if(state.grid){ctx.strokeStyle='#eaeaea';ctx.beginPath();ctx.moveTo(Math.round(px)+.5,0);ctx.lineTo(Math.round(px)+.5,height);ctx.stroke();}if(Math.abs(x)>s/100){ctx.fillStyle='#808583';ctx.fillText(P.format(x,4),px+4,labelY);}}
    for(let y=Math.ceil(ymin/s)*s,n=0;y<=ymax&&n++<200;y+=s){const py=toScreen(0,y)[1];if(state.grid){ctx.strokeStyle='#eaeaea';ctx.beginPath();ctx.moveTo(0,Math.round(py)+.5);ctx.lineTo(width,Math.round(py)+.5);ctx.stroke();}if(Math.abs(y)>s/100){ctx.fillStyle='#808583';ctx.fillText(P.format(y,4),labelX,py-4);}}
    ctx.strokeStyle='#a5aaa7';ctx.beginPath();ctx.moveTo(zx,0);ctx.lineTo(zx,height);ctx.moveTo(0,zy);ctx.lineTo(width,zy);ctx.stroke();
    if(zx>=0&&zx<width&&zy>=0&&zy<height){ctx.fillStyle='#808583';ctx.fillText('0',zx+6,zy+17);}
  }
  function drawCurve(e){
    if(e.kind==='vertical'){
      const x=e.fn(0);if(!Number.isFinite(x))return;const px=toScreen(x,0)[0];ctx.strokeStyle=e.color;ctx.lineWidth=2;ctx.beginPath();let pen=false;
      for(let py=0;py<=height;py+=2){const y=fromScreen(px,py)[1];if(e.allowed&&!e.allowed(x,y)){pen=false;continue;}if(pen)ctx.lineTo(px,py);else ctx.moveTo(px,py);pen=true;}ctx.stroke();return;
    }
    if(e.kind==='point'){
      const [x,y]=e.point;if(![x,y].every(Number.isFinite)||e.allowed&&!e.allowed(x,y))return;const [px,py]=toScreen(x,y);ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(px,py,4.5,0,Math.PI*2);ctx.fill();graphLabel('point-'+e.id,px,py,`\\left(${numberTex(x)},${numberTex(y)}\\right)`,e.color);return;
    }
    let data=cache.get(e.id);if(!data){data=P.sampleCurve(sourceFn(e),state.view,width,height,{integral:e.hasIntegral});cache.set(e.id,data);}
    ctx.strokeStyle=e.color;ctx.lineWidth=2;ctx.lineJoin='round';ctx.beginPath();
    for(const segment of data.segments){if(!segment.length)continue;ctx.moveTo(segment[0].px,segment[0].py);for(let i=1;i<segment.length;i++)ctx.lineTo(segment[i].px,segment[i].py);}ctx.stroke();
  }
  function shadeIntegral(){
    const e=source();if(!e||!state.integral)return;const fn=sourceFn(e),left=Math.min(state.a,state.b),right=Math.max(state.a,state.b),start=Math.max(0,toScreen(left,0)[0]),end=Math.min(width,toScreen(right,0)[0]),base=toScreen(0,0)[1];
    const orientation=state.b>=state.a?1:-1;
    for(let px=start;px<end;px+=2){const x=fromScreen(px+1,0)[0],y=fn(x);if(!Number.isFinite(y))continue;const py=toScreen(x,y)[1];ctx.fillStyle=y*orientation>=0?'#376ca326':'#bb4a4626';ctx.fillRect(px,Math.min(base,py),Math.min(2,end-px),Math.abs(py-base));}
    for(const [label,x]of [['a',state.a],['b',state.b]]){const px=toScreen(x,0)[0];ctx.strokeStyle='#7b838b';ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(px,0);ctx.lineTo(px,height);ctx.stroke();ctx.setLineDash([]);handle(ctx,px,Math.max(20,Math.min(height-24,base)),label);}
  }
  function graphLabel(key,px,py,latex,color='#4a555e'){let label=$('graph-labels').querySelector(`[data-key="${key}"]`);if(!label){label=make('span');label.dataset.key=key;$('graph-labels').append(label);}label.style.left=(px+9)+'px';label.style.top=(py-22)+'px';label.style.color=color;E.render(label,latex);}
  function handle(context,px,py,label){context.fillStyle='#fff';context.strokeStyle='#5f6d7a';context.lineWidth=1.5;context.beginPath();context.arc(px,py,5,0,Math.PI*2);context.fill();context.stroke();graphLabel(label,px,py,label==='x₀'?'x_0':label);}
  function tangent(){
    const e=source();if(!e||!state.tangent)return;const y=sourceFn(e)(state.tx),slope=sourceDf(e,state.tx);if(!Number.isFinite(y))return;const [px,py]=toScreen(state.tx,y);
    if(Number.isFinite(slope)){const [x1]=fromScreen(0,0),[x2]=fromScreen(width,0);ctx.strokeStyle='#5f6d7a';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(0,toScreen(x1,y+slope*(x1-state.tx))[1]);ctx.lineTo(width,toScreen(x2,y+slope*(x2-state.tx))[1]);ctx.stroke();ctx.setLineDash([]);}handle(ctx,px,py,'x₀');
  }
  function draw(){
    drawRequest=0;const revision=++renderRevision;if(implicitRequest)cancelAnimationFrame(implicitRequest);implicitRequest=0;
    grid();shadeIntegral();
    const relations=[];for(const e of model.entries){if(e.error||!e.visible)continue;if(['implicit','inequality'].includes(e.kind)){if(!e.hasIntegral)relations.push(e);else flashRelation();}else if(['function','curve','point','vertical'].includes(e.kind))drawCurve(e);}
    tangent();drawHover();syncView();
    $('status').textContent=Date.now()<noticeUntil?notice:'';
    if(relations.length)drawRelations(relations,revision,()=>{});
  }
  function flashRelation(){notice='含积分的隐式关系暂不绘制；请使用 y=int(…)';noticeUntil=Date.now()+5000;}
  function drawRelations(entries,revision,done){
    // Small frame slices bound UI blocking; edited expressions cancel stale work.
    const step=drag?12:7;let ei=0,px=0,py=0;
    function chunk(){
      implicitRequest=0;if(revision!==renderRevision)return;const until=performance.now()+6;
      ctx.save();ctx.lineWidth=1.5;
      while(ei<entries.length&&performance.now()<until){
        const e=entries[ei],p=fromScreen(px,py+step),dx=step/state.view.scale,dy=step/state.view.scale;
        try{
          if(e.kind==='inequality'){
            const [x,y]=fromScreen(px+step/2,py+step/2),v=e.fn(x,y),ok=Number.isFinite(v)&&({'<':v<0,'<=':v<=0,'>':v>0,'>=':v>=0,'!=':v!==0}[e.op]);
            if(ok&&(!e.allowed||e.allowed(x,y))){ctx.fillStyle=e.color+'1c';ctx.fillRect(px,py,step,step);}
          }
          if(!e.allowed||e.allowed(p[0]+dx/2,p[1]+dy/2)){
            const lines=P.contourCell(e.fn,p[0],p[1],dx,dy,toScreen);ctx.strokeStyle=e.color;ctx.setLineDash(e.kind==='inequality'&&['<','>','!='].includes(e.op)?[3,3]:[]);
            ctx.beginPath();for(const [a,b]of lines){ctx.moveTo(...a);ctx.lineTo(...b);}ctx.stroke();
          }
        }catch{}
        px+=step;if(px>=width){px=0;py+=step;}if(py>=height){py=0;ei++;}
      }
      ctx.restore();if(ei<entries.length)implicitRequest=requestAnimationFrame(chunk);else{tangent();done();}
    }
    implicitRequest=requestAnimationFrame(chunk);
  }
  function drawHover(){
    ox.clearRect(0,0,width,height);if(!hover||drag){E.render($('readout'),'');return;}
    const [x,y]=fromScreen(...hover);let text=`x=${numberTex(x)},\\quad y=${numberTex(y)}`;
    const e=source();if(e){const v=sourceFn(e)(x);if(Number.isFinite(v)){const p=toScreen(x,v);ox.strokeStyle='#929997';ox.lineWidth=1;ox.setLineDash([3,4]);ox.beginPath();ox.moveTo(hover[0],0);ox.lineTo(hover[0],height);ox.stroke();ox.setLineDash([]);ox.fillStyle=e.color;ox.beginPath();ox.arc(...p,3.5,0,Math.PI*2);ox.fill();text+=`\\\\f(x)=${numberTex(v)},\\quad f'(x)=${numberTex(sourceDf(e,x))}`;}}
    E.render($('readout'),`\\begin{gathered}${text}\\end{gathered}`);
  }
  function position(e){const r=canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];}
  canvas.onpointerdown=e=>{
    if(e.button!==0)return;canvas.focus();checkpoint();dirty=false;const p=position(e),f=source();let type='pan';
    if(f&&state.tangent){const q=toScreen(state.tx,sourceFn(f)(state.tx));if(Math.hypot(p[0]-q[0],p[1]-q[1])<18)type='tangent';}
    if(type==='pan'&&state.integral&&f){if(Math.abs(p[0]-toScreen(state.a,0)[0])<10)type='a';else if(Math.abs(p[0]-toScreen(state.b,0)[0])<10)type='b';}
    drag={type,start:p,view:{...state.view},pointer:e.pointerId};canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');
  };
  canvas.onpointermove=e=>{
    const p=position(e);hover=p;
    if(drag){
      if(drag.type==='pan'){state.view.cx=drag.view.cx-(p[0]-drag.start[0])/state.view.scale;state.view.cy=drag.view.cy+(p[1]-drag.start[1])/state.view.scale;}
      else{const x=fromScreen(...p)[0];if(drag.type==='tangent')state.tx=x;else state[drag.type]=x;syncControls();updateCalculus();}
      changed(false);
    }else scheduleHover();
  };
  function endDrag(e){if(!drag||drag.pointer!==e.pointerId)return;drag=null;canvas.classList.remove('dragging');if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);updateCalculus();persist();scheduleDraw();}
  canvas.onpointerup=endDrag;canvas.onpointercancel=endDrag;
  canvas.onpointerleave=()=>{if(!drag){hover=null;drawHover();}};
  let wheelSession=0;
  function zoom(factor,point=[width/2,height/2]){
    const [x,y]=fromScreen(...point),scale=Math.max(1e-6,Math.min(1e8,state.view.scale*factor));state.view.scale=scale;state.view.cx=x-(point[0]-width/2)/scale;state.view.cy=y+(point[1]-height/2)/scale;updateCalculus();changed(false);
  }
  canvas.addEventListener('wheel',e=>{e.preventDefault();if(Date.now()-wheelSession>350)checkpoint();wheelSession=Date.now();zoom(Math.exp(-Math.max(-120,Math.min(120,e.deltaY))*0.002),position(e));},{passive:false});
  canvas.onkeydown=e=>{
    if(['+','=','-','Home','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();checkpoint();}
    if(e.key==='+'||e.key==='=')zoom(1.25);else if(e.key==='-')zoom(0.8);else if(e.key==='Home')resetView();
    else if(e.key.startsWith('Arrow')){const delta=60/state.view.scale;if(e.key==='ArrowLeft')state.view.cx-=delta;if(e.key==='ArrowRight')state.view.cx+=delta;if(e.key==='ArrowUp')state.view.cy+=delta;if(e.key==='ArrowDown')state.view.cy-=delta;changed(false);updateCalculus();}
  };
  function resetView(){state.view={cx:0,cy:0,scale:Math.max(12,Math.min(width/20,height/12))};changed(false);updateCalculus();}
  function fitView(){
    const e=source();if(!e)return;const fn=sourceFn(e),[xmin]=fromScreen(0,0),[xmax]=fromScreen(width,0),values=[];
    for(let i=0;i<150;i++){const y=fn(xmin+(xmax-xmin)*i/149);if(Number.isFinite(y))values.push(y);}
    if(!values.length){flash('当前范围内没有有限函数值');return;}values.sort((a,b)=>a-b);const low=values[Math.floor(values.length*0.03)],high=values[Math.floor(values.length*0.97)];
    checkpoint();state.view.cy=(low+high)/2;state.view.scale=Math.max(1e-6,Math.min(1e8,width/(xmax-xmin),height/Math.max(1e-6,(high-low)*1.25)));changed(false);updateCalculus();
  }
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
  function exportProject(){download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),'graphVis.json');flash('已导出项目 JSON');}
  $('save').onclick=exportProject;$('open').onclick=()=>$('file').click();
  $('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;try{if(file.size>100000)throw Error('项目文件过大');const s=validateProject(JSON.parse(await file.text()));checkpoint();dirty=false;state=s;nextId=Math.max(0,...state.rows.map(r=>r.id))+1;if(!state.rows.length)state.rows.push(row(''));renderRows();syncControls();compileRows();resize();persist();flash('项目已打开');}catch(e){flash(`无法打开：${e.message}`);}$('file').value='';};
  $('export').onclick=()=>{
    if(implicitRequest){flash('关系绘制中');return;}
    const copy=canvas.cloneNode(false),c=copy.getContext('2d');c.setTransform(ratio,0,0,ratio,0,0);c.drawImage(canvas,0,0,width,height);
    c.font='12px KaTeX_Main, serif';
    for(const label of $('graph-labels').children){let text=label.dataset.key;if(text.startsWith('point-')){const point=model.entries.find(e=>e.id===Number(text.slice(6)))?.point;if(!point)continue;text=`(${P.format(point[0])}, ${P.format(point[1])})`;}c.fillStyle=label.style.color;c.fillText(text,parseFloat(label.style.left),parseFloat(label.style.top)+13);}
    copy.toBlob(blob=>{if(blob)download(blob,'graphVis.png');else flash('无法导出图像');},'image/png');
  };
  $('undo').onclick=()=>undo();$('redo').onclick=()=>undo(true);$('add').onclick=()=>addRow();
  $('tools-toggle').onclick=()=>setTools(!toolsOpen);
  $('controls-toggle').onclick=()=>{const controls=$('tool-controls');controls.hidden=!controls.hidden;$('controls-toggle').setAttribute('aria-expanded',String(!controls.hidden));};
  $('delete-expression').onclick=()=>deleteRow(activeRow().id);
  $('visibility').onclick=()=>{const r=activeRow();checkpoint();r.visible=!r.visible;document.querySelector(`.expression[data-id="${r.id}"]`).classList.toggle('hidden-curve',!r.visible);changed();};
  $('cycle-color').onclick=()=>{const r=activeRow();checkpoint();r.color=palette[(palette.indexOf(r.color)+1)%palette.length];document.querySelector(`.expression[data-id="${r.id}"]`).style.setProperty('--color',r.color);changed();};
  $('keyboard-toggle').onclick=()=>{const input=document.querySelector(`.expression[data-id="${activeId}"] math-field`)||document.querySelector('math-field');input?.focus();const keyboard=window.mathVirtualKeyboard;if(keyboard.visible)keyboard.hide({animate:false});else keyboard.show({animate:false});};
  function keyboardState(){const keyboard=window.mathVirtualKeyboard;$('keyboard-toggle').setAttribute('aria-expanded',String(keyboard.visible));document.documentElement.style.setProperty('--keyboard-height',keyboard.visible?keyboard.boundingRect.height+'px':'0px');}
  window.mathVirtualKeyboard.addEventListener('virtual-keyboard-toggle',keyboardState);
  window.mathVirtualKeyboard.addEventListener('geometrychange',keyboardState);
  $('source-toggle').onclick=()=>{const options=$('source-options');options.hidden=!options.hidden;$('source-toggle').setAttribute('aria-expanded',String(!options.hidden));};
  $('zoom-in').onclick=()=>{checkpoint();zoom(1.25);};$('zoom-out').onclick=()=>{checkpoint();zoom(0.8);};$('reset-view').onclick=()=>{checkpoint();resetView();};$('fit-view').onclick=fitView;
  $('source').onchange=()=>{checkpoint();state.source=Number($('source').value);E.render($('source-value'),source()?L.toLatex(source().text):'');updateCalculus();changed(false);};
  $('add-derivative').onclick=()=>{const e=source();if(e)addRow(e.kind==='function'?`${e.name}'(x)`:`diff(${sourceExpression(e)})${M.normalize(e.text).match(/\{[^{}]+\}\s*$/)?.[0]||''}`);};
  $('add-integral').onclick=()=>{const e=source();if(e)addRow(`int(${sourceExpression(e)},${P.format(state.a,12)},x)`);};
  for(const [id,key]of [['tangent-on','tangent'],['integral-on','integral'],['grid-on','grid']])$(id).onchange=()=>{checkpoint();state[key]=$(id).checked;updateCalculus();changed(false);};
  $('angle').onchange=()=>{checkpoint();state.angle=$('angle').value;changed();};
  for(const [id,key]of [['tangent-x','tx'],['bound-a','a'],['bound-b','b']])$(id).oninput=()=>{const v=Number($(id).value);if(!$(id).value||!Number.isFinite(v)||Math.abs(v)>1e12)return;beforeChange();state[key]=v;updateCalculus();changed(false);};
  for(const id of ['tangent-x','bound-a','bound-b'])$(id).onchange=()=>{dirty=false;};
  $('tangent-range').onpointerdown=()=>{checkpoint();dirty=false;};$('tangent-range').oninput=()=>{beforeChange();state.tx=Number($('tangent-range').value);$('tangent-x').value=P.format(state.tx,10);updateCalculus();changed(false);};$('tangent-range').onchange=()=>{dirty=false;};
  for(const [id,key]of [['center-x','cx'],['center-y','cy']])$(id).onchange=()=>{const value=Number($(id).value);if(!$(id).value||!Number.isFinite(value)||Math.abs(value)>1e12){syncView();return;}checkpoint();state.view[key]=value;updateCalculus();changed(false);};
  $('view-width').onchange=()=>{const value=Number($('view-width').value),scale=width/value;if(!Number.isFinite(scale)||scale<1e-6||scale>1e8){syncView();return;}checkpoint();state.view.scale=scale;updateCalculus();changed(false);};
  document.querySelectorAll('[data-insert]').forEach(button=>{button.onclick=()=>{let input=document.querySelector(`.expression[data-id="${activeId}"] math-field`);if(!input){addRow();input=document.querySelector(`.expression[data-id="${activeId}"] math-field`);}input.focus();input.insert(button.dataset.insert);input.dispatchEvent(new Event('input'));};});
  document.addEventListener('keydown',e=>{
    const editing=['MATH-FIELD','INPUT'].includes(document.activeElement?.tagName);
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();exportProject();}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);}
    else if(e.altKey&&e.key.toLowerCase()==='n'){e.preventDefault();addRow();}
    else if((e.ctrlKey||e.metaKey)&&e.key==='/'){e.preventDefault();setTools(!toolsOpen);}
    else if(e.key==='Escape'){setTools(false);}
    else if(!editing&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key.length===1&&/[A-Za-z0-9\\]/.test(e.key)){e.preventDefault();setTools(true);focusRow(state.rows.find(r=>!r.text)?.id||state.rows.at(-1).id);const input=document.activeElement;input.insert(e.key);input.dispatchEvent(new Event('input'));}
    if(e.defaultPrevented)e.stopPropagation();
  },{capture:true});
  loadSaved();renderRows();syncControls();compileRows();resize();updateHistory();
  document.querySelectorAll('[data-math]').forEach(element=>E.render(element,element.dataset.math));
  new ResizeObserver(resize).observe($('graph'));
  window.addEventListener('beforeunload',()=>{try{localStorage.setItem(STORE,serialize());}catch{}});
})();

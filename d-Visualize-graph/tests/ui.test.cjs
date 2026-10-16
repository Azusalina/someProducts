const {test}=require('node:test'),assert=require('node:assert/strict');
const {boot}=require('./ui-helper.cjs');
const tex=(t,id)=>t.get(id).dataset.latex||'';
function seed(t,...expressions){t.click('tools-toggle');for(let i=0;i<expressions.length;i++){if(i)t.click('add');t.input(t.texts()[i],expressions[i]);}t.flush();}
test('null default, one launcher and expression-only column',()=>{
 const t=boot();assert.equal(t.texts().length,1);assert.equal(t.texts()[0].value,'');assert.equal(t.get('status').textContent,'');assert.equal(t.w.document.body.classList.contains('tools-open'),false);
 for(const id of ['toggle-panel','help','help-open','example'])assert.equal(t.get(id),null);
 assert.equal(t.get('panel').querySelector('button,summary,input,p'),null);assert.equal(t.get('panel').contains(t.get('keyboard-toggle')),false);assert.equal(t.texts()[0].getAttribute('placeholder'),null);
 t.click('tools-toggle');assert.equal(t.w.document.body.classList.contains('panel-hidden'),false);t.click('tools-toggle');assert.equal(t.w.document.body.classList.contains('panel-hidden'),true);t.dom.window.close();
});
test('LaTeX editor and calculus outputs use actual mathematical markup',()=>{
 const t=boot();seed(t,'f(x)=x^2');t.check('tangent-on',true);t.input(t.get('tangent-x'),'2');t.check('integral-on',true);t.input(t.get('bound-a'),'0');t.input(t.get('bound-b'),'3');t.flush();
 assert.match(tex(t,'tangent-value'),/f'\(2\)=4/);assert.match(tex(t,'integral-value'),/\\approx9/);assert.ok(t.get('tangent-value').querySelector('.ML__latex'));
 t.click('add-integral');t.flush();const e=t.w.GraphMath.build(t.texts().map(f=>({text:f.value}))).entries.at(-1);assert.equal(e.error,undefined);assert.ok(Math.abs(e.fn(3)-9)<1e-6);assert.match(t.texts().at(-1).value,/\\int/);t.dom.window.close();
});
test('fractions, sinx and sine powers pass through the real MathLive field',()=>{
 const t=boot();seed(t,'f(x)=\\frac{x^2+1}{2}','\\sin^2 x');let m=t.w.GraphMath.build(t.texts().map(f=>({text:f.value})));assert.equal(m.entries[0].fn(2),2.5);assert.ok(Math.abs(m.entries[1].fn(1)-Math.sin(1)**2)<1e-8);
 t.input(t.texts()[1],'sinx');t.flush();m=t.w.GraphMath.build(t.texts().map(f=>({text:f.value})));assert.ok(Math.abs(m.entries[1].fn(1)-Math.sin(1))<1e-8);t.input(t.texts()[0],'\\alpha_{1}=2');t.input(t.texts()[1],'\\alpha_{1}x');t.flush();m=t.w.GraphMath.build(t.texts().map(f=>({text:f.value})));assert.equal(m.entries[1].error,undefined);assert.equal(m.entries[1].fn(3),6);t.dom.window.close();
});
test('Enter adds an expression and toolbar insertion targets the mathfield',()=>{
 const t=boot();seed(t,'x');const f=t.texts()[0];f.focus();f.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));t.flush();assert.equal(t.texts().length,2);
 [...t.w.document.querySelectorAll('[data-insert]')].find(b=>b.dataset.insert==='\\pi').click();t.flush();assert.equal(t.texts()[1].value,'\\pi');assert.equal(t.texts()[0].value,'x');t.dom.window.close();
});
test('parameter definitions append a slider and undo/redo work',()=>{
 const t=boot();seed(t,'a=2','f(x)=a\\sin x');assert.ok(t.get('panel').querySelector('.expression .slider'));assert.equal(t.get('parameters').querySelector('input[type=range]'),null);const range=t.get('panel').querySelector('input[type=range]');assert.ok(range);range.dispatchEvent(new t.w.Event('pointerdown'));t.input(range,'3');range.dispatchEvent(new t.w.Event('change'));t.flush();assert.equal(t.texts()[0].value,'a=3');t.click('undo');t.flush();assert.equal(t.texts()[0].value,'a=2');t.click('redo');t.flush();assert.equal(t.texts()[0].value,'a=3');t.dom.window.close();
});
test('row errors are contained and derivative tools retain restricted domains',()=>{
 const t=boot();seed(t,'f(x)=unknown(x)');assert.ok(t.get('panel').querySelector('.error'));t.input(t.texts()[0],'y=x^2\\left\\{x>0\\right\\}');t.click('add-derivative');t.flush();const e=t.w.GraphMath.build(t.texts().map(f=>({text:f.value}))).entries.at(-1);assert.equal(e.error,undefined);assert.equal(e.fn(2),4);assert.equal(e.allowed(-1,0),false);t.dom.window.close();
});
test('implicit plotting and file export work without any guide UI',()=>{
 const t=boot();seed(t,'x^2+y^2=9','y<x^2-2');t.click('export');t.click('save');assert.ok(t.calls.some(c=>c[0]==='download'&&c[1]==='graphVis.png'));assert.ok(t.calls.some(c=>c[0]==='download'&&c[1]==='graphVis.json'));t.dom.window.close();
});
test('every opening resets all state even when old browser storage exists',()=>{const t=boot();seed(t,'f(x)=\\cos x');t.click('theme-toggle');const saved=t.project();const r=boot(saved);assert.equal(r.texts()[0].value,'');assert.equal(r.w.document.documentElement.dataset.theme,'light');assert.equal(Number(r.get('center-x').value),0);assert.equal(Number(r.get('center-y').value),0);assert.equal(r.get('equal-axes').checked,true);assert.equal(r.w.document.body.classList.contains('tools-open'),false);r.dom.window.close();t.dom.window.close();});
test('dragging calculus handles, panning and zoom still update controls',()=>{
 const t=boot();seed(t,'f(x)=\\sin x');t.check('tangent-on',true);t.check('integral-on',true);const c=t.get('canvas');const pointer=(type,x,y)=>{const e=new t.w.MouseEvent(type,{clientX:x,clientY:y,button:0,bubbles:true});Object.defineProperty(e,'pointerId',{value:1});c.dispatchEvent(e);};
 pointer('pointerdown',565,360-Math.sin(1)*65);pointer('pointermove',630,360);pointer('pointerup',630,360);t.flush();assert.equal(Number(t.get('tangent-x').value),2);pointer('pointerdown',500,200);pointer('pointermove',565,200);pointer('pointerup',565,200);t.flush();assert.equal(Number(t.get('bound-a').value),1);
 t.check('integral-on',false);t.check('tangent-on',false);pointer('pointerdown',300,200);pointer('pointermove',365,200);pointer('pointerup',365,200);t.flush();assert.equal(Number(t.get('center-x').value),-1);const before=Number(t.get('view-width').value);c.dispatchEvent(new t.w.WheelEvent('wheel',{clientX:500,clientY:360,deltaY:-100,cancelable:true}));t.flush();assert.ok(Number(t.get('view-width').value)<before);t.dom.window.close();
});
test('JSON imports remain compatible and invalid imports preserve current work',async()=>{
 const t=boot();seed(t,'f(x)=x^3');const p=t.project();t.input(t.texts()[0],'f(x)=x');const file=t.get('file');Object.defineProperty(file,'files',{value:[{size:p.length,text:async()=>p}],configurable:true});await file.onchange();t.flush();assert.match(t.texts()[0].value,/x\^/);Object.defineProperty(file,'files',{value:[{size:10,text:async()=>'{"version":1}'}],configurable:true});await file.onchange();t.flush();assert.match(t.get('status').textContent,/无法打开/);t.dom.window.close();
});
test('keyboard launcher is separate and tracks visibility and bottom space',()=>{
 const t=boot();t.click('tools-toggle');let visible=false;const k=t.w.mathVirtualKeyboard;k.show=()=>{visible=true;k.dispatchEvent(new t.w.Event('virtual-keyboard-toggle'));};k.hide=()=>{visible=false;k.dispatchEvent(new t.w.Event('virtual-keyboard-toggle'));};Object.defineProperty(k,'visible',{get:()=>visible,configurable:true});Object.defineProperty(k,'boundingRect',{get:()=>({height:visible?260:0}),configurable:true});t.click('keyboard-toggle');assert.equal(t.get('keyboard-toggle').getAttribute('aria-expanded'),'true');assert.equal(t.w.document.documentElement.style.getPropertyValue('--keyboard-height'),'260px');t.click('keyboard-toggle');assert.equal(t.get('keyboard-toggle').getAttribute('aria-expanded'),'false');t.dom.window.close();
});
test('LaTeX paste, multi-line paste and limits apply before editor insertion',()=>{
 const t=boot();t.click('tools-toggle');const f=t.texts()[0];const paste=text=>{const e=new t.w.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(e,'clipboardData',{value:{getData:()=>text}});f.dispatchEvent(e);t.flush();};paste('\\frac{1}{2}');assert.equal(t.w.GraphMath.build([{text:t.texts()[0].value}]).entries[0].value,.5);paste('x'.repeat(601));assert.match(t.get('status').textContent,/600/);paste('f(x)=sinx\nf\u0027(x)');assert.equal(t.texts().length,2);const m=t.w.GraphMath.build(t.texts().map(f=>({text:f.value})));assert.equal(m.entries[1].error,undefined);assert.ok(Math.abs(m.entries[1].fn(0)-1)<1e-8);t.dom.window.close();
});
test('handled keyboard events do not reach the editor after app-level changes',()=>{
 const t=boot();seed(t,'x');let bubbled=false;t.w.document.addEventListener('keydown',()=>{bubbled=true;});const enter=new t.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});t.texts()[0].dispatchEvent(enter);assert.equal(enter.defaultPrevented,true);assert.equal(bubbled,false);assert.equal(t.texts().length,2);const save=new t.w.KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true});t.texts()[1].dispatchEvent(save);assert.equal(save.defaultPrevented,true);assert.ok(t.calls.some(c=>c[0]==='download'&&c[1]==='graphVis.json'));t.dom.window.close();
});

test('Poisson notation, inline slider, probability sum and cumulative step graph',()=>{
 const t=boot();seed(t,'\\lambda=4','x\\sim\\operatorname{poisson}(\\lambda)');assert.equal(t.get('panel').querySelector('.error'),null);assert.equal(t.get('equal-axes').checked,false);assert.ok(Number(t.get('view-height').value)<1);
 const range=t.get('panel').querySelector('input[type=range]');assert.equal(range.min,'0');t.input(range,'6');t.flush();assert.equal(t.get('panel').querySelector('.error'),null);assert.match(t.texts()[0].value,/6/);
 assert.equal(t.get('tangent-on').disabled,true);t.check('integral-on',true);t.input(t.get('bound-a'),'0');t.input(t.get('bound-b'),'3');t.flush();assert.match(tex(t,'integral-value'),/\\sum/);const probability=t.w.GraphStats.create('poisson',[6]).interval(0,3);assert.ok(tex(t,'integral-value').includes(String(Number(probability.toPrecision(9)))));
 t.click('add-integral');t.flush();const e=t.w.GraphMath.build(t.texts().map(f=>({text:f.value}))).entries.at(-1);assert.equal(e.error,undefined);assert.equal(e.step,true);assert.ok(Math.abs(e.fn(3.8)-probability)<1e-12);t.dom.window.close();
});
test('continuous PDF and d/dx pass through the editor',()=>{
 const t=boot();seed(t,'x\\sim\\operatorname{normal}(0,1)','\\frac{d}{dx}x^3');assert.equal(t.get('panel').querySelector('.error'),null);const e=t.w.GraphMath.build(t.texts().map(f=>({text:f.value}))).entries.at(-1);assert.equal(e.fn(2),12);t.dom.window.close();
});
test('dark mode exports, tools focus the visible caret, and pointer crosshair renders',async()=>{
 const t=boot();t.click('tools-toggle');assert.equal(t.texts()[0].hasFocus(),true);assert.equal(t.texts()[0].tabIndex,0);t.click('theme-toggle');t.flush();assert.equal(t.w.document.documentElement.dataset.theme,'dark');assert.equal(t.get('theme-toggle').getAttribute('aria-pressed'),'true');
 const before=t.calls.length;t.get('canvas').dispatchEvent(new t.w.MouseEvent('pointermove',{clientX:200,clientY:100,bubbles:true}));t.flush();assert.match(tex(t,'readout'),/x=.*y=/);assert.ok(t.calls.slice(before).filter(c=>c[0]==='lineTo').length>=2);
 const saved=t.project();const r=boot();await r.importProject(saved);assert.equal(r.w.document.documentElement.dataset.theme,'dark');r.dom.window.close();t.dom.window.close();
});
test('independent axes survive manual zoom, pan, JSON import and equal axis switch',async()=>{
 const t=boot();seed(t,'x\\sim\\operatorname{poisson}(4)');t.change('view-height','2');t.flush();assert.equal(Number(t.get('view-height').value),2);const old=Number(t.get('center-y').value),c=t.get('canvas');
 const pointer=(type,y)=>{const e=new t.w.MouseEvent(type,{clientX:100,clientY:y,button:0,bubbles:true});Object.defineProperty(e,'pointerId',{value:1});c.dispatchEvent(e);};pointer('pointerdown',100);pointer('pointermove',136);pointer('pointerup',136);t.flush();assert.ok(Math.abs(Number(t.get('center-y').value)-old-.1)<1e-8);
 t.click('zoom-in');t.flush();assert.ok(Math.abs(Number(t.get('view-height').value)-1.6)<1e-8);const saved=t.project();const r=boot();await r.importProject(saved);assert.equal(Number(r.get('view-height').value),1.6);r.check('equal-axes',true);r.flush();assert.equal(r.get('equal-axes').checked,true);assert.ok(Math.abs(Number(r.get('view-height').value)/Number(r.get('view-width').value)-.72)<1e-8);r.dom.window.close();t.dom.window.close();
});

test('symbols require explicit LaTeX commands and P(X=n) renders the probability',()=>{
 const t=boot();seed(t,'X\\sim\\operatorname{poisson}(4)','P(X=2)');assert.equal(t.get('panel').querySelector('.error'),null);assert.match(t.get('panel').querySelectorAll('.row-result')[1].dataset.latex,/0\.146525/);
 const f=t.texts()[1];assert.deepEqual(Object.keys(f.inlineShortcuts),['int','sum']);f.setValue('',{silenceNotifications:true});f.executeCommand(['typedText','in']);assert.equal(f.value.includes('\\in'),false);f.setValue('\\in',{silenceNotifications:true});assert.match(f.value,/\\in/);t.dom.window.close();
});
test('implicit curves retain the completed frame and reuse geometry during other edits',()=>{
 const t=boot();let cells=0;const original=t.w.GraphPlot.contourCell;t.w.GraphPlot.contourCell=(...args)=>{cells++;return original(...args);};seed(t,'x^2+y^2=1','x');assert.ok(cells>0);const initial=cells;
 const before=t.calls.filter(c=>c[0]==='drawImage').length;t.input(t.texts()[1],'x^2');t.frame();assert.equal(t.calls.filter(c=>c[0]==='drawImage').length,before,'visible image stays intact until the implicit layer is complete');t.flush();assert.equal(cells,initial,'unrelated curve edits reuse implicit geometry');assert.equal(t.calls.filter(c=>c[0]==='drawImage').length,before+1);
 t.input(t.texts()[0],'x^2+y^2=4');t.flush();assert.ok(cells>initial,'changed implicit expression recomputes geometry');t.dom.window.close();
});
test('arrow keys switch integral limits and leave the expression row intact',()=>{
 const t=boot();seed(t,'\\int_0^2 x^2dx');const f=t.texts()[0];f.position=2;
 const key=k=>f.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));key('ArrowUp');assert.equal(f.position,4);f.insert('3');f.dispatchEvent(new t.w.Event('input'));assert.match(f.value,/23/);key('ArrowDown');assert.equal(f.position,2);assert.equal(t.texts().length,1);t.flush();
 const a=t.get('bound-a'),b=t.get('bound-b');a.focus();a.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));assert.equal(t.w.document.activeElement,b);b.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert.equal(t.w.document.activeElement,a);t.dom.window.close();
});
test('integral expressions draw the integrand and fill its area using an exported chosen color',async()=>{
 const t=boot();seed(t,'\\int_0^2 x^2dx');const e=t.w.GraphMath.build(t.texts().map(f=>({text:f.value}))).entries[0];assert.equal(e.error,undefined);assert.equal(e.integral.fn(3),9);assert.ok(Math.abs(e.value-8/3)<1e-10);assert.ok(t.calls.some(c=>c[0]==='lineTo'),'definite scalar integral still plots its integrand');
 t.input(t.get('area-color'),'#e04caf');t.flush();assert.equal(t.get('area-color').value,'#e04caf');assert.ok(t.calls.some(c=>c[0]==='style'&&c[1]==='fillStyle'&&c[2]==='#e04caf40'));assert.ok(t.calls.some(c=>c[0]==='fillRect'&&c[3]===2&&c[4]>0),'area columns are filled');const saved=t.project();assert.equal(JSON.parse(saved).areaColor,'#e04caf');const r=boot();await r.importProject(saved);assert.equal(r.get('area-color').value,'#e04caf');r.dom.window.close();t.dom.window.close();
});

test('refresh asks confirmation, cancellation keeps work, and Enter confirms once',()=>{
 const t=boot();seed(t,'x^2');const key=k=>t.w.document.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));key('F5');assert.equal(t.get('refresh-confirm').open,true);assert.equal(t.w.document.activeElement,t.get('refresh-ok'));t.click('refresh-cancel');assert.equal(t.get('refresh-confirm').open,false);assert.equal(t.texts()[0].value,'x^2');
 const unload=new t.w.Event('beforeunload',{cancelable:true});t.w.dispatchEvent(unload);assert.equal(unload.defaultPrevented,true);key('F5');t.get('refresh-confirm').dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(t.get('refresh-confirm').open,false);const approved=new t.w.Event('beforeunload',{cancelable:true});t.w.dispatchEvent(approved);assert.equal(approved.defaultPrevented,false);t.dom.window.close();
});
test('complex LaTeX results, complex-plane points and component curves render',()=>{
 const t=boot();seed(t,'z=2+3i','z^2','f(x)=x+i');assert.equal(t.get('panel').querySelector('.error'),null);assert.match(t.get('panel').querySelectorAll('.row-result')[1].dataset.latex,/-5\+12i/);assert.ok(t.get('graph-labels').querySelector('[data-key="complex-1"]'));assert.ok(t.calls.some(c=>c[0]==='setLineDash'&&c[1]?.[0]===5));t.flush();t.dom.window.close();
});

test('int and sum shortcuts expand, Enter completes an escape including bounds',()=>{
 const t=boot();t.click('tools-toggle');const f=t.texts()[0];t.input(f,'int');assert.match(f.value,/\\int/);t.input(f,'sum');assert.match(f.value,/\\sum/);
 f.setValue('',{silenceNotifications:true});f.executeCommand(['switchMode','latex']);for(const c of '\\int^1_0')f.executeCommand(['typedText',c]);assert.equal(f.mode,'latex');f.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(t.texts().length,1);assert.equal(f.mode,'math');assert.match(f.value,/\\int/);assert.ok(/(?:_0|_\{0\})/.test(f.value));assert.ok(/(?:\^1|\^\{1\})/.test(f.value));t.dom.window.close();
});
test('sum arrow limits edit and calculate using the MathLive field',()=>{
 const t=boot();seed(t,'\\sum_{n=1}^3 n^2');const f=t.texts()[0];assert.match(t.get('panel').querySelector('.row-result').dataset.latex,/14/);f.position=4;f.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));assert.equal(f.position,6);f.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert.equal(f.position,4);t.dom.window.close();
});
test('Ctrl clicks snap to two curves and create named, undoable, exportable segments',async()=>{
 const t=boot();seed(t,'y=x','y=2x');const c=t.get('canvas'),select=(x,y)=>c.dispatchEvent(new t.w.MouseEvent('pointerdown',{ctrlKey:true,button:0,clientX:x,clientY:y,bubbles:true,cancelable:true}));
 select(500,360);select(565,230);t.flush();let m=t.w.GraphMath.build(t.texts().map(f=>({text:f.value}))),segment=m.entries.at(-1);assert.equal(segment.name,'l1');assert.equal(segment.kind,'segment');assert.equal(segment.segment[0][0],0);assert.equal(segment.segment[1][0],1);assert.equal(segment.segment[1][1],2);assert.ok(t.get('graph-labels').querySelector('[data-key="segment-3"]'));
 select(565,295);select(630,230);t.flush();m=t.w.GraphMath.build(t.texts().map(f=>({text:f.value})));assert.equal(m.entries.at(-1).name,'l2');const count=t.texts().length;t.click('undo');t.flush();assert.equal(t.texts().length,count-1);t.click('redo');t.flush();assert.equal(t.texts().length,count);const exported=t.project(),r=boot();await r.importProject(exported);assert.equal(r.w.GraphMath.build(r.texts().map(f=>({text:f.value}))).entries.at(-1).name,'l2');r.dom.window.close();t.dom.window.close();
});

test('typing sinx with a domain clips the graph and prevents outside Ctrl selection',()=>{
 const t=boot();t.click('tools-toggle');const f=t.texts()[0];for(const c of 'sinx{0<=x<=2pi}')f.executeCommand(['typedText',c]);f.dispatchEvent(new t.w.Event('input'));t.flush();assert.equal(t.get('panel').querySelector('.error'),null);const e=t.w.GraphMath.build([{text:f.value}]).entries[0];assert.equal(e.allowed(0,0),true);assert.equal(e.allowed(2*Math.PI,0),true);assert.equal(e.allowed(-1,0),false);
 const choose=(x,y)=>t.get('canvas').dispatchEvent(new t.w.MouseEvent('pointerdown',{ctrlKey:true,button:0,clientX:500+x*65,clientY:360-y*65,bubbles:true,cancelable:true}));choose(-1,Math.sin(-1));choose(0,0);t.flush();assert.equal(t.texts().length,1,'outside click does not become the first endpoint');choose(1,Math.sin(1));t.flush();assert.equal(t.texts().length,2);assert.match(t.texts()[1].value,/segment/);t.dom.window.close();
});

test('Ctrl selecting two expression rows marks every visible intersection and saves the pair',async()=>{
 const t=boot();seed(t,'x^2','y=1');const pick=i=>t.w.document.querySelectorAll('.expression')[i].dispatchEvent(new t.w.MouseEvent('pointerdown',{ctrlKey:true,button:0,bubbles:true,cancelable:true}));pick(0);assert.equal(t.w.document.querySelectorAll('.intersection-pick').length,1);pick(1);t.flush();assert.equal(t.get('graph-labels').querySelectorAll('[data-key^="intersection-"]').length,2);assert.match(t.get('status').textContent,/2/);
 const project=t.project();assert.equal(JSON.parse(project).intersections.length,1);const r=boot();await r.importProject(project);assert.equal(r.get('graph-labels').querySelectorAll('[data-key^="intersection-"]').length,2);r.dom.window.close();pick(0);pick(1);t.flush();assert.equal(t.get('graph-labels').querySelectorAll('[data-key^="intersection-"]').length,0);t.click('undo');t.flush();assert.equal(t.get('graph-labels').querySelectorAll('[data-key^="intersection-"]').length,2);t.dom.window.close();
});
test('named points show labels and exact custom colors survive theme, undo and JSON import',async()=>{
 const t=boot();seed(t,'a=(1,2)');assert.equal(t.get('panel').querySelector('.error'),null);assert.match(t.get('graph-labels').querySelector('[data-key="point-1"]').dataset.latex,/a=/);const color=t.get('expression-color');color.focus();t.input(color,'#376ca3');color.dispatchEvent(new t.w.Event('change'));t.click('theme-toggle');t.flush();const label=t.get('graph-labels').querySelector('[data-key="point-1"]');assert.equal(label.style.color,'rgb(55, 108, 163)');const project=t.project(),r=boot();await r.importProject(project);assert.equal(r.get('expression-color').value,'#376ca3');assert.equal(JSON.parse(project).rows[0].customColor,true);assert.equal(r.get('graph-labels').querySelector('[data-key="point-1"]').style.color,'rgb(55, 108, 163)');t.click('undo');t.click('undo');t.flush();assert.equal(JSON.parse(t.project()).rows[0].customColor,false);r.dom.window.close();t.dom.window.close();
});
test('axis +/- changes only one scale and 1:1 restores the origin without clearing work',()=>{
 const t=boot();seed(t,'a=(1,2)');const width=Number(t.get('view-width').value),height=Number(t.get('view-height').value);t.click('zoom-x-in');t.flush();assert.ok(Math.abs(Number(t.get('view-width').value)-width/1.25)<1e-7);assert.equal(Number(t.get('view-height').value),height);t.click('zoom-y-in');t.flush();assert.ok(Math.abs(Number(t.get('view-height').value)-height/1.25)<1e-7);t.click('zoom-x-out');t.click('zoom-y-out');t.flush();assert.ok(Math.abs(Number(t.get('view-width').value)-width)<1e-7);assert.ok(Math.abs(Number(t.get('view-height').value)-height)<1e-7);t.change('center-x','3');t.change('center-y','-2');t.click('reset-equal-view');t.flush();assert.equal(Number(t.get('center-x').value),0);assert.equal(Number(t.get('center-y').value),0);assert.equal(t.get('equal-axes').checked,true);assert.equal(t.texts().length,1);assert.match(t.texts()[0].value,/a=/);t.click('undo');t.flush();assert.equal(Number(t.get('center-x').value),3);assert.equal(Number(t.get('center-y').value),-2);t.dom.window.close();
});

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
test('parameter sliders remain outside the formula column and undo/redo work',()=>{
 const t=boot();seed(t,'a=2','f(x)=a\\sin x');assert.equal(t.get('panel').querySelector('.slider'),null);const range=t.get('parameters').querySelector('input[type=range]');assert.ok(range);range.dispatchEvent(new t.w.Event('pointerdown'));t.input(range,'3');range.dispatchEvent(new t.w.Event('change'));t.flush();assert.equal(t.texts()[0].value,'a=3');t.click('undo');t.flush();assert.equal(t.texts()[0].value,'a=2');t.click('redo');t.flush();assert.equal(t.texts()[0].value,'a=3');t.dom.window.close();
});
test('row errors are contained and derivative tools retain restricted domains',()=>{
 const t=boot();seed(t,'f(x)=unknown(x)');assert.ok(t.get('panel').querySelector('.error'));t.input(t.texts()[0],'y=x^2\\left\\{x>0\\right\\}');t.click('add-derivative');t.flush();const e=t.w.GraphMath.build(t.texts().map(f=>({text:f.value}))).entries.at(-1);assert.equal(e.error,undefined);assert.equal(e.fn(2),4);assert.equal(e.allowed(-1,0),false);t.dom.window.close();
});
test('implicit plotting and file export work without any guide UI',()=>{
 const t=boot();seed(t,'x^2+y^2=9','y<x^2-2');t.click('export');t.click('save');assert.ok(t.calls.some(c=>c[0]==='download'&&c[1]==='graphVis.png'));assert.ok(t.calls.some(c=>c[0]==='download'&&c[1]==='graphVis.json'));t.dom.window.close();
});
test('authored state restores with tools closed; malformed state gives a blank project',()=>{
 const t=boot();seed(t,'f(x)=\\cos x');t.w.dispatchEvent(new t.w.Event('beforeunload'));const saved=t.w.localStorage.getItem('graphVis.v2');t.dom.window.close();const r=boot(saved);assert.match(r.texts()[0].value,/\\cos/);assert.equal(r.w.document.body.classList.contains('tools-open'),false);r.dom.window.close();const invalid=boot('{"version":1}');assert.equal(invalid.texts()[0].value,'');invalid.dom.window.close();
});
test('dragging calculus handles, panning and zoom still update controls',()=>{
 const t=boot();seed(t,'f(x)=\\sin x');t.check('tangent-on',true);t.check('integral-on',true);const c=t.get('canvas');const pointer=(type,x,y)=>{const e=new t.w.MouseEvent(type,{clientX:x,clientY:y,button:0,bubbles:true});Object.defineProperty(e,'pointerId',{value:1});c.dispatchEvent(e);};
 pointer('pointerdown',565,360-Math.sin(1)*65);pointer('pointermove',630,360);pointer('pointerup',630,360);t.flush();assert.equal(Number(t.get('tangent-x').value),2);pointer('pointerdown',500,200);pointer('pointermove',565,200);pointer('pointerup',565,200);t.flush();assert.equal(Number(t.get('bound-a').value),1);
 t.check('integral-on',false);t.check('tangent-on',false);pointer('pointerdown',300,200);pointer('pointermove',365,200);pointer('pointerup',365,200);t.flush();assert.equal(Number(t.get('center-x').value),-1);const before=Number(t.get('view-width').value);c.dispatchEvent(new t.w.WheelEvent('wheel',{clientX:500,clientY:360,deltaY:-100,cancelable:true}));t.flush();assert.ok(Number(t.get('view-width').value)<before);t.dom.window.close();
});
test('JSON imports remain compatible and invalid imports preserve current work',async()=>{
 const t=boot();seed(t,'f(x)=x^3');t.w.dispatchEvent(new t.w.Event('beforeunload'));const p=t.w.localStorage.getItem('graphVis.v2');t.input(t.texts()[0],'f(x)=x');const file=t.get('file');Object.defineProperty(file,'files',{value:[{size:p.length,text:async()=>p}],configurable:true});await file.onchange();t.flush();assert.match(t.texts()[0].value,/x\^/);Object.defineProperty(file,'files',{value:[{size:10,text:async()=>'{"version":1}'}],configurable:true});await file.onchange();t.flush();assert.match(t.get('status').textContent,/无法打开/);t.dom.window.close();
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

/* DOM integration test; canvas calls are recorded, no browser automation. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require(process.env.GRAPHVIS_JSDOM||'jsdom');
const opened=[];require('node:test').afterEach(async()=>{await new Promise(setImmediate);for(const close of opened.splice(0))close();});
function boot(saved,options={}){
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>{if(!/navigation/.test(e.message))throw e;});
  const dom=new JSDOM(html,{virtualConsole,url:'https://graphvis.test',runScripts:'outside-only',pretendToBeVisual:true});
  const close=dom.window.close.bind(dom.window);opened.push(close);dom.window.close=()=>{};
  const w=dom.window,errors=[],frames=new Map(),calls=[];let frameId=0;
  w.addEventListener('error',e=>errors.push(e.error||e.message));
  w.requestAnimationFrame=fn=>{frames.set(++frameId,fn);return frameId;};w.cancelAnimationFrame=id=>frames.delete(id);
  const context=new Proxy({}, {get:(obj,key)=>obj[key]||((...args)=>calls.push([key,...args])),set:(o,k,v)=>(calls.push(['style',k,v]),o[k]=v,true)});
  const nativeCanvases=new Map();
  w.HTMLCanvasElement.prototype.getContext=function(){if(!options.canvasFactory)return context;let c=nativeCanvases.get(this);if(!c){c=options.canvasFactory(this.width,this.height);nativeCanvases.set(this,c);}if(c.width!==this.width)c.width=this.width;if(c.height!==this.height)c.height=this.height;const nativeContext=c.getContext('2d');if(!nativeContext.graphVisPatched){const draw=nativeContext.drawImage.bind(nativeContext);nativeContext.drawImage=(source,...args)=>draw(nativeCanvases.get(source)||source,...args);nativeContext.graphVisPatched=true;}return nativeContext;};
  w.HTMLCanvasElement.prototype.toBlob=function(fn){fn(new w.Blob(['png'],{type:'image/png'}));};
  w.HTMLCanvasElement.prototype.setPointerCapture=function(){};w.HTMLCanvasElement.prototype.hasPointerCapture=()=>false;
  w.HTMLElement.prototype.getBoundingClientRect=function(){return {x:0,y:0,left:0,top:0,right:1000,bottom:720,width:1000,height:720};};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLElement.prototype.scroll=function(){};w.HTMLElement.prototype.scrollTo=function(){};
  w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
  w.document.fonts={ready:Promise.resolve(),check:()=>true,add(){},load:()=>Promise.resolve([])};
  w.FontFace=class{constructor(family){this.family=family;this.status='loaded';}load(){return Promise.resolve(this);}};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const BlobClass=w.Blob;w.Blob=class extends BlobClass{constructor(parts,options){super(parts,options);if(options?.type==='application/json')calls.push(['project',parts.join('')]);}};
  w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){calls.push(['download',this.download]);};
  if(saved)w.localStorage.setItem('graphVis.v2',saved);
  w.eval(fs.readFileSync(path.join(__dirname,'../vendor/mathlive/mathlive.min.js'),'utf8')+'\n//# sourceURL=https://graphvis.test/vendor/mathlive/mathlive.min.js');
  for(const f of ['latex.js','stats.js','complex.js','math.js','editor.js','plot.js','app.js']){w.eval(fs.readFileSync(path.join(__dirname,'..',f),'utf8'));if(f==='editor.js')w.MathfieldElement.fontsDirectory=null;}
  function frame(){const batch=[...frames];frames.clear();for(const [,f]of batch)f(w.performance.now());assert.deepEqual(errors,[]);}
  function flush(limit=500){let count=0;while(frames.size&&count++<limit){const batch=[...frames];frames.clear();for(const [,f]of batch)f(w.performance.now());}assert.ok(count<limit,'frames should finish');assert.deepEqual(errors,[]);}
  const get=id=>w.document.getElementById(id),click=id=>get(id).click();
  function input(element,value,event='input'){if(element.tagName==='MATH-FIELD')element.setValue(value,{silenceNotifications:true});else element.value=value;element.dispatchEvent(new w.Event(event,{bubbles:true}));}
  const change=(id,v)=>input(get(id),v,'change');
  const check=(id,value)=>{get(id).checked=value;get(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
  const texts=()=>[...w.document.querySelectorAll('.expression math-field')];
  function project(){click('save');return calls.filter(c=>c[0]==='project').at(-1)[1];}
  async function importProject(value){const file=get('file');Object.defineProperty(file,'files',{value:[{size:value.length,text:async()=>value}],configurable:true});await file.onchange();flush();}
  async function dispose(){await new Promise(setImmediate);const i=opened.indexOf(close);if(i>=0)opened.splice(i,1);close();}
  flush();return {dom,w,get,click,input,change,check,texts,flush,frame,calls,nativeCanvases,project,importProject,dispose};
}

module.exports={boot};

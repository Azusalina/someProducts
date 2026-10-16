// @vitest-environment jsdom
import {beforeEach,afterEach,expect,test,vi} from 'vitest';
vi.mock('pdfjs-dist',()=>({getDocument:vi.fn(),GlobalWorkerOptions:{},AnnotationMode:{DISABLE:0}}));
import {getDocument} from 'pdfjs-dist';
import {PDFView,type SourceMap} from '../src/pdf-view';
import {musicXMLToScore} from '../src/score';
import {readFileSync} from 'node:fs';

const deferred=<T,>()=>{let resolve!:(v:T)=>void,reject!:(e:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
function setup(){
  const root=document.createElement('div');document.body.append(root);const view=new PDFView(root),scroll=root.querySelector('.pdf-scroll')as HTMLElement;
  Object.defineProperties(scroll,{clientWidth:{value:500,configurable:true},clientHeight:{value:200}});
  return {root,view,scroll};
}
function pdf(marker:string,numPages=3){
  const paints:ReturnType<typeof deferred<void>>[]=[];
  const page={getViewport:({scale}:{scale:number})=>({width:480*scale,height:800*scale}),cleanup:vi.fn(),render:vi.fn(({canvas}:{canvas:HTMLCanvasElement})=>{
    canvas.dataset.file=marker;const paint=deferred<void>();paints.push(paint);return {promise:paint.promise,cancel:vi.fn()};
  })};
  const doc={numPages,getPage:vi.fn(async()=>page)},loading={promise:Promise.resolve(doc),destroy:vi.fn(async()=>{})};
  vi.mocked(getDocument).mockReturnValueOnce(loading as never);return {doc,loading,paints,page};
}
async function finish(file:ReturnType<typeof pdf>){for(let i=0;i<file.doc.numPages+3;i++){await flush();for(const paint of file.paints)paint.resolve();}await flush();}
beforeEach(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.mocked(getDocument).mockReset();
  vi.spyOn(HTMLElement.prototype,'offsetTop','get').mockImplementation(function(this:HTMLElement){return this.classList.contains('pdf-page')?(Number(this.dataset.page)-1)*(parseFloat(this.style.height||'800')+12):0;});
});
afterEach(()=>{document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals();});

test('clear invalidates every unfinished page and releases all old surfaces',async()=>{
  const {view,root}=setup(),file=pdf('old');const loading=view.load(new ArrayBuffer(0));await flush();
  expect(root.getAttribute('aria-busy')).toBe('true');view.clear();await finish(file);await loading;
  expect(root.querySelectorAll('canvas')).toHaveLength(0);expect(root.querySelectorAll('.pdf-page')).toHaveLength(0);
  expect(root.querySelector('.pdf-count')?.textContent).toBe('');expect(root.getAttribute('aria-busy')).toBe('false');
});
test('late old document pages cannot appear inside a new document',async()=>{
  const {view,root}=setup(),old=pdf('old'),next=pdf('new');
  const first=view.load(new ArrayBuffer(0));await flush();const second=view.load(new ArrayBuffer(0));await finish(next);await second;await finish(old);await first;
  expect([...root.querySelectorAll('canvas')].map(c=>c.dataset.file)).toEqual(['new','new','new']);expect(root.getAttribute('aria-busy')).toBe('false');
});
test('clear during metadata loading never renders or reports a stale error',async()=>{
  const {view,root}=setup(),file=pdf('old'),delayed=deferred<typeof file.page>();
  file.doc.getPage.mockReturnValue(delayed.promise);const error=vi.fn();view.onError=error;
  const loading=view.load(new ArrayBuffer(0));await flush();view.clear();delayed.reject(new Error('document destroyed'));await loading;
  expect(file.page.render).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();expect(root.getAttribute('aria-busy')).toBe('false');
});
test('preloads the entire PDF and rapid page navigation preserves canvas identity and pixels',async()=>{
  const {view,root}=setup(),file=pdf('a');const initial=view.load(new ArrayBuffer(0));await finish(file);await initial;
  const canvases=[...root.querySelectorAll('canvas')];expect(canvases).toHaveLength(3);expect(file.doc.getPage.mock.calls.map(c=>c[0])).toEqual([1,2,3]);
  await view.showPage(2);await view.showPage(3);await view.showPage(1);
  expect([...root.querySelectorAll('canvas')]).toEqual(canvases);expect(file.page.render).toHaveBeenCalledTimes(3);expect(canvases.every(c=>c.width>0&&c.height>0)).toBe(true);
  expect(root.querySelector('[hidden]')).toBeNull();expect(view.page).toBe(1);
});
test('a failed page is retried while successful canvases remain untouched',async()=>{
  const {view,root}=setup(),file=pdf('a');const initial=view.load(new ArrayBuffer(0));await flush();file.paints[0].reject(new Error('render failed'));await finish(file);await initial;
  const successful=root.querySelector('[data-page="2"] canvas');const retry=view.showPage(1);await finish(file);await retry;
  expect(root.querySelectorAll('canvas')).toHaveLength(3);expect(root.querySelector('[data-page="2"] canvas')).toBe(successful);expect(file.page.render).toHaveBeenCalledTimes(4);
});
test('same-width requests never duplicate work and resizing keeps every old page visible until replacement is ready',async()=>{
  const {view,root,scroll}=setup(),file=pdf('a');const initial=view.load(new ArrayBuffer(0));await flush();
  await view.showPage(1);await view.showPage(1);expect(file.page.render).toHaveBeenCalledTimes(2);
  await finish(file);await initial;const original=[...root.querySelectorAll('canvas')];await view.showPage(1);expect(file.page.render).toHaveBeenCalledTimes(3);
  scroll.scrollTop=120;await view.showPage(1);expect(scroll.scrollTop).toBe(120);
  Object.defineProperty(scroll,'clientWidth',{value:600,configurable:true});
  const resize=view.showPage(2);await flush();await view.showPage(2);
  expect([...root.querySelectorAll('canvas')]).toEqual(original);expect(original.every(c=>c.width>0)).toBe(true);expect(root.querySelector('[hidden]')).toBeNull();
  await finish(file);await resize;expect(file.page.render).toHaveBeenCalledTimes(6);expect(root.querySelector('[data-page="1"] canvas')).not.toBe(original[0]);expect(original.every(c=>c.width===0)).toBe(true);
});
test('automatic follow scrolls to page-relative note positions without rendering another page',async()=>{
  const {view,scroll,root}=setup(),file=pdf('a');const loading=view.load(new ArrayBuffer(0));await finish(file);await loading;
  const score=musicXMLToScore(readFileSync('public/demo.musicxml','utf8')),id=score.notes[0].sources![0].id;
  const map:SourceMap={version:4,mapped:1,total:1,positions:{[id]:{page:2,x:.2,y:.9,w:.01,h:.01,head:'1',grade:1}}};
  view.attach(score,map);view.update(.01,{left:true,right:true},true);
  expect(scroll.scrollTop).toBeGreaterThan(1400);expect(root.querySelector('[data-page="2"] .note-highlight')).not.toBeNull();expect(file.page.render).toHaveBeenCalledTimes(3);
});
test('wheel scrolls continuously, tracks the page and disables follow without intercepting scrolling',async()=>{
  const {view,root,scroll}=setup(),file=pdf('vertical');const loading=view.load(new ArrayBuffer(0));await finish(file);await loading;
  const canvases=[...root.querySelectorAll('canvas')],wheel=new WheelEvent('wheel',{deltaY:100,cancelable:true});scroll.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(false);expect(view.follow).toBe(false);expect((root.querySelector('.pdf-follow')as HTMLInputElement).checked).toBe(false);
  scroll.scrollTop=850;scroll.dispatchEvent(new Event('scroll'));expect(view.page).toBe(2);
  scroll.scrollTop=0;scroll.dispatchEvent(new Event('scroll'));expect(view.page).toBe(1);expect([...root.querySelectorAll('canvas')]).toEqual(canvases);
});
test('long documents keep every page while bounding total canvas pixel memory',async()=>{
  vi.stubGlobal('devicePixelRatio',2);const {view,root}=setup(),file=pdf('long',30);const loading=view.load(new ArrayBuffer(0));await finish(file);await loading;
  const canvases=[...root.querySelectorAll('canvas')];expect(canvases).toHaveLength(30);expect(canvases.reduce((n,c)=>n+c.width*c.height,0)).toBeLessThanOrEqual(32_000_000);
});
test('clicking notes and selecting regions use the clicked page, independent of the page-number control',async()=>{
  const {view,root}=setup(),file=pdf('selection');const loading=view.load(new ArrayBuffer(0));await finish(file);await loading;
  const score=musicXMLToScore(readFileSync('public/demo.musicxml','utf8')),id=score.notes[0].sources![0].id;
  view.attach(score,{version:4,mapped:1,total:1,positions:{[id]:{page:3,x:.2,y:.2,w:.02,h:.02,head:'1',grade:1}}});
  const box=root.querySelector('[data-page="3"]')as HTMLElement;box.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,width:480,height:800,right:480,bottom:800,toJSON(){}});box.setPointerCapture=vi.fn();
  const select=vi.fn(),note=vi.fn();view.onRegionSelect=select;view.onNoteSelect=note;box.dispatchEvent(new MouseEvent('click',{clientX:100,clientY:168}));expect(note).toHaveBeenCalledWith(id);
  const region={index:20,number:'21',page:3,system:'1',x:.1,y:.1,w:.7,h:.3};view.selectRegions([region]);
  box.dispatchEvent(new MouseEvent('pointerdown',{button:0,clientX:100,clientY:168}));box.dispatchEvent(new MouseEvent('pointerup',{button:0,clientX:100,clientY:168}));
  expect(select).toHaveBeenCalledWith([region]);expect(root.querySelector('[data-page="3"] .measure-selection')).not.toBeNull();expect(note).toHaveBeenCalledTimes(1);
});

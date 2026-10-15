// @vitest-environment jsdom
import {beforeEach,afterEach,expect,test,vi} from 'vitest';
vi.mock('pdfjs-dist',()=>({getDocument:vi.fn(),GlobalWorkerOptions:{},AnnotationMode:{DISABLE:0}}));
import {getDocument} from 'pdfjs-dist';
import {PDFView,type SourceMap} from '../src/pdf-view';
import {musicXMLToScore} from '../src/score';
import {readFileSync} from 'node:fs';

const deferred = <T,>() => {let resolve!:(v:T)=>void, reject!:(e:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush = async () => {for(let i=0;i<10;i++) await Promise.resolve();};
function setup() {
  const root=document.createElement('div');document.body.append(root);const view=new PDFView(root);
  const scroll=root.querySelector('.pdf-scroll') as HTMLElement;
  Object.defineProperties(scroll,{clientWidth:{value:500,configurable:true},clientHeight:{value:200}});
  return {root,view,scroll};
}
function pdf(marker:string) {
  const paints:ReturnType<typeof deferred<void>>[]=[];
  const page={getViewport:({scale}:{scale:number})=>({width:480*scale,height:800*scale}),render:vi.fn(({canvas}:{canvas:HTMLCanvasElement})=>{
    canvas.dataset.file=marker;const paint=deferred<void>();paints.push(paint);return {promise:paint.promise,cancel:vi.fn()};
  })};
  const doc={numPages:3,getPage:vi.fn(async()=>page)};
  const loading={promise:Promise.resolve(doc),destroy:vi.fn(async()=>{})};
  vi.mocked(getDocument).mockReturnValueOnce(loading as never);return {doc,loading,paints,page};
}
beforeEach(()=>{vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}});vi.mocked(getDocument).mockReset();});
afterEach(()=>{document.body.replaceChildren();vi.unstubAllGlobals();});

test('clear invalidates an unfinished render and resets every visible file state',async()=>{
  const {view,root}=setup(), file=pdf('old');const loading=view.load(new ArrayBuffer(0));await flush();
  expect(root.getAttribute('aria-busy')).toBe('true');view.clear();file.paints[0].resolve();await loading;
  expect(root.querySelector('canvas')?.dataset.file).toBeUndefined();expect(root.querySelector('.pdf-page')?.hasAttribute('hidden')).toBe(true);
  expect(root.querySelector('.pdf-count')?.textContent).toBe('');expect(root.getAttribute('aria-busy')).toBe('false');
});
test('a late old document page cannot replace a newly loaded document',async()=>{
  const {view,root}=setup(), old=pdf('old'), next=pdf('new');
  const first=view.load(new ArrayBuffer(0));await flush();const second=view.load(new ArrayBuffer(0));await flush();
  next.paints[0].resolve();await second;old.paints[0].resolve();await first;
  expect(root.querySelector('canvas')?.dataset.file).toBe('new');expect(root.getAttribute('aria-busy')).toBe('false');
});
test('clear during getPage never renders or reports a stale error',async()=>{
  const {view,root}=setup(), file=pdf('old'), delayed=deferred<typeof file.page>();
  file.doc.getPage.mockReturnValue(delayed.promise);const error=vi.fn();view.onError=error;
  const loading=view.load(new ArrayBuffer(0));await flush();view.clear();delayed.reject(new Error('document destroyed'));await loading;
  expect(file.page.render).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();expect(root.getAttribute('aria-busy')).toBe('false');
});
test('rapid navigation commits only the newest page even when cancellation finishes late',async()=>{
  const {view,root}=setup(), file=pdf('a');const initial=view.load(new ArrayBuffer(0));await flush();file.paints[0].resolve();await initial;
  const second=view.showPage(2);await flush();const third=view.showPage(3);await flush();file.paints[2].resolve();await third;file.paints[1].resolve();await second;
  expect(root.querySelector('canvas')?.getAttribute('aria-label')).toContain('第 3 页');expect(view.page).toBe(3);
});
test('a failed page can be retried without forcing a resize',async()=>{
  const {view,root}=setup(), file=pdf('a');const initial=view.load(new ArrayBuffer(0));await flush();file.paints[0].reject(new Error('render failed'));await initial;
  const retry=view.showPage(1);await flush();file.paints[1].resolve();await retry;
  expect(root.querySelector('.pdf-page')?.hasAttribute('hidden')).toBe(false);expect(file.page.render).toHaveBeenCalledTimes(2);
});
test('auto-follow scrolls to the current note after a page render completes',async()=>{
  const {view,scroll,root}=setup(), file=pdf('a');const loading=view.load(new ArrayBuffer(0));await flush();file.paints[0].resolve();await loading;
  const score=musicXMLToScore(readFileSync('public/demo.musicxml','utf8'));
  const id=score.notes[0].sources![0].id;
  const map:SourceMap={version:4,mapped:1,total:1,positions:{[id]:{page:2,x:.2,y:.9,w:.01,h:.01,head:'1',grade:1}}};
  view.attach(score,map);Object.defineProperty(root.querySelector('.pdf-page'),'clientHeight',{get:()=>800});
  view.update(.01,{left:true,right:true},true);await flush();file.paints[1].resolve();await flush();
  expect(scroll.scrollTop).toBeGreaterThan(500);expect(root.querySelectorAll('.note-highlight')).toHaveLength(1);
});

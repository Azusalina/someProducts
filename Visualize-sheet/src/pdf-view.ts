import {pdfSourceAt} from './navigation';
import { getDocument, GlobalWorkerOptions, AnnotationMode, type PDFDocumentProxy, type PDFDocumentLoadingTask, type RenderTask } from 'pdfjs-dist';
import workerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Score } from './score';

GlobalWorkerOptions.workerSrc = workerURL;
export interface NotePosition { page: number; x: number; y: number; w: number; h: number; head: string; grade: number }
export interface MeasureRegion {index:number;number:string;page:number;system:string;x:number;y:number;w:number;h:number}
export interface SourceMap { version: number; positions: Record<string, NotePosition>; mapped: number; total: number }

export function currentPositions(score: Score | null, mapping: SourceMap | null, time: number, hands = { left:true, right:true }) {
  if (!score || !mapping) return [];
  return score.notes.filter(n => hands[n.hand]).flatMap(n => (n.sources ?? []).filter(s => s.start <= time + .001 && s.start + s.duration > time + .001)
    .map(s => ({ id:s.id, ...mapping.positions[s.id], hand:n.hand })).filter(p => p.page !== undefined));
}

interface PageSurface {
  number:number;
  box:HTMLDivElement;
  overlay:SVGSVGElement;
  selectionOverlay:SVGSVGElement;
  canvas:HTMLCanvasElement|null;
  width:number;
  height:number;
  renderedWidth:number;
  shown:string;
}

// Keep the entire document resident without multiplying canvas memory by DPR
// on long scores. CSS page size and note coordinates remain independent of DPR.
const DOCUMENT_PIXEL_BUDGET=32_000_000;
const PAGE_PADDING=10;

export class PDFView {
  private document:PDFDocumentProxy|null=null;
  private loading:PDFDocumentLoadingTask|null=null;
  private generation=0;
  private renderRevision=0;
  private tasks=new Set<RenderTask>();
  private surfaces:PageSurface[]=[];
  private rendering:Promise<void>|null=null;
  private requestedWidth=0;
  private highlighted=new Set<number>();
  private pending:ReturnType<typeof currentPositions>=[];
  private pendingScroll=false;
  page=1;
  follow=true;
  mapping:SourceMap|null=null;
  score:Score|null=null;
  onNoteSelect:(source:string)=>void=()=>{};
  onError:(message:string)=>void=()=>{};
  onRegionSelect:(measures:MeasureRegion[])=>void=()=>{};
  private regions:MeasureRegion[]=[];
  private selected:MeasureRegion[]=[];
  private selecting=false;
  private suppressClickUntil=0;
  private number:HTMLInputElement;
  private count:HTMLOutputElement;
  private status:HTMLOutputElement;
  private scroll:HTMLDivElement;
  private pages:HTMLDivElement;

  constructor(private root:HTMLElement){
    root.innerHTML=`<div class="pdf-controls"><button class="pdf-prev" aria-label="上一页">‹</button><input class="pdf-number" type="number" min="1" value="1" aria-label="PDF 页码"><output class="pdf-count"></output><button class="pdf-next" aria-label="下一页">›</button><label><input class="pdf-follow" type="checkbox" checked>跟随</label><output class="pdf-render-status" aria-live="polite"></output><span class="pdf-mapping"></span></div><div class="pdf-scroll"><div class="pdf-pages"></div></div>`;
    this.scroll=root.querySelector('.pdf-scroll')!;this.pages=root.querySelector('.pdf-pages')!;
    this.number=root.querySelector('.pdf-number')!;this.count=root.querySelector('.pdf-count')!;this.status=root.querySelector('.pdf-render-status')!;
    root.querySelector('.pdf-prev')!.addEventListener('click',()=>{this.manual();void this.showPage(this.page-1);});
    root.querySelector('.pdf-next')!.addEventListener('click',()=>{this.manual();void this.showPage(this.page+1);});
    this.number.addEventListener('change',()=>{this.manual();void this.showPage(Number(this.number.value));});
    root.querySelector('.pdf-follow')!.addEventListener('change',e=>{this.follow=(e.target as HTMLInputElement).checked;});
    this.scroll.addEventListener('wheel',e=>{if(!e.ctrlKey&&(e.deltaY||e.deltaX))this.manual();},{passive:true});
    this.scroll.addEventListener('touchstart',()=>this.manual(),{passive:true});
    this.scroll.addEventListener('pointerdown',e=>{if(e.target===this.scroll)this.manual();});
    this.scroll.addEventListener('scroll',()=>this.trackPage(),{passive:true});
    let timer:ReturnType<typeof setTimeout>,width=0;
    new ResizeObserver(()=>{
      const next=this.scroll.clientWidth;
      if(next===width)return;
      width=next;clearTimeout(timer);
      if(next>20&&!root.hidden)timer=setTimeout(()=>void this.renderAll(next-20),100);
    }).observe(this.scroll);
  }

  private manual(){this.follow=false;(this.root.querySelector('.pdf-follow')as HTMLInputElement).checked=false;}
  private setPage(number:number){this.page=number;this.number.value=String(number);}
  private top(surface:PageSurface){return surface.box.offsetTop+PAGE_PADDING;}
  private trackPage(){
    if(!this.surfaces.length)return;
    const probe=this.scroll.scrollTop+Math.min(80,this.scroll.clientHeight*.2);
    const visible=this.surfaces.find(s=>this.top(s)+s.height>probe)??this.surfaces.at(-1)!;
    this.setPage(visible.number);
  }
  private createSurface(number:number):PageSurface{
    const box=document.createElement('div');box.className='pdf-page';box.dataset.page=String(number);box.setAttribute('aria-label',`原 PDF 第 ${number} 页`);
    const svg=(className:string,label:string)=>{const el=document.createElementNS('http://www.w3.org/2000/svg','svg');el.classList.add(className);el.setAttribute('viewBox','0 0 1 1');el.setAttribute('preserveAspectRatio','none');el.setAttribute('aria-label',label);box.append(el);return el;};
    const surface:PageSurface={number,box,overlay:svg('pdf-overlay','当前音符高亮'),selectionOverlay:svg('pdf-selection-overlay','小节选区'),canvas:null,width:0,height:0,renderedWidth:0,shown:''};
    box.addEventListener('click',e=>{
      if(this.selecting||performance.now()<this.suppressClickUntil||!surface.canvas)return;
      const b=box.getBoundingClientRect(),source=pdfSourceAt(this.mapping,number,e.clientX-b.left,e.clientY-b.top,b.width,b.height);
      if(source)this.onNoteSelect(source);
    });
    let start:{x:number;y:number}|null=null;
    const point=(e:PointerEvent)=>{const b=box.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),y:Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))};};
    box.addEventListener('pointerdown',e=>{
      if(!this.selecting||e.button!==0||!surface.canvas)return;
      e.preventDefault();start=point(e);box.setPointerCapture(e.pointerId);
    });
    box.addEventListener('pointermove',e=>{
      if(!start)return;const end=point(e);this.drawSelection({page:number,x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),w:Math.abs(end.x-start.x),h:Math.abs(end.y-start.y)});
    });
    box.addEventListener('pointerup',e=>{
      if(!start)return;
      const end=point(e),b={x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),w:Math.max(.001,Math.abs(end.x-start.x)),h:Math.max(.001,Math.abs(end.y-start.y))};start=null;
      this.suppressClickUntil=performance.now()+300;
      this.selected=this.regions.filter(r=>r.page===number&&b.x<r.x+r.w&&b.x+b.w>r.x&&b.y<r.y+r.h&&b.y+b.h>r.y).sort((a,b)=>a.index-b.index);
      this.selecting=false;this.root.classList.remove('selecting');this.drawSelection();this.onRegionSelect(this.selected);
    });
    box.addEventListener('pointercancel',()=>{start=null;this.clearSelection();});
    this.pages.append(box);return surface;
  }
  selectRegions(regions:MeasureRegion[]){this.regions=regions;this.selected=[];this.selecting=true;this.manual();this.root.classList.add('selecting');this.drawSelection();}
  clearSelection(){this.selected=[];this.selecting=false;this.root.classList.remove('selecting');this.drawSelection();}
  private drawSelection(drag?:{page:number;x:number;y:number;w:number;h:number}){
    for(const s of this.surfaces){
      s.selectionOverlay.replaceChildren();
      for(const p of (drag?[drag]:this.selected).filter(r=>r.page===s.number)){
        const r=document.createElementNS('http://www.w3.org/2000/svg','rect');
        for(const key of ['x','y','w','h']as const)r.setAttribute(key==='w'?'width':key==='h'?'height':key,String(p[key]));
        r.setAttribute('class','measure-selection');s.selectionOverlay.append(r);
      }
    }
  }

  async load(data:ArrayBuffer){
    const previous=this.reset(),generation=this.generation;
    try{await previous?.destroy();}catch{/* Superseded worker cleanup. */}
    if(generation!==this.generation)return;
    const assetRoot=import.meta.env.DEV?'/node_modules/pdfjs-dist/':'/pdfjs/';
    const loading=getDocument({data:new Uint8Array(data.slice(0)),wasmUrl:`${assetRoot}wasm/`,standardFontDataUrl:`${assetRoot}${import.meta.env.DEV?'standard_fonts':'fonts'}/`,cMapUrl:`${assetRoot}cmaps/`,cMapPacked:true});
    this.loading=loading;
    try{
      const doc=await loading.promise;
      if(generation!==this.generation)return;
      this.document=doc;this.count.textContent=`/ ${doc.numPages}`;this.number.max=String(doc.numPages);
      this.surfaces=Array.from({length:doc.numPages},(_,i)=>this.createSurface(i+1));
      await this.renderAll(this.scroll.clientWidth>20?this.scroll.clientWidth-20:480);
    }catch(error){if(generation===this.generation)throw error;}
  }
  private reset(){
    ++this.generation;++this.renderRevision;
    for(const task of this.tasks)task.cancel();this.tasks.clear();this.rendering=null;
    const previous=this.loading;this.loading=null;this.document=null;
    this.clearSelection();this.regions=[];this.mapping=null;this.score=null;this.pending=[];this.pendingScroll=false;this.highlighted.clear();
    for(const s of this.surfaces)if(s.canvas){s.canvas.width=0;s.canvas.height=0;}
    this.surfaces=[];this.pages.replaceChildren();this.requestedWidth=0;this.setPage(1);
    this.scroll.scrollTop=0;this.number.removeAttribute('max');this.count.textContent='';this.status.textContent='';
    this.root.querySelector('.pdf-mapping')!.textContent='';this.root.setAttribute('aria-busy','false');
    return previous;
  }
  clear(){const previous=this.reset();void previous?.destroy().catch(()=>{});}
  attach(score:Score,mapping:SourceMap|null){
    this.score=score;this.mapping=mapping;this.pending=[];this.highlighted.clear();
    for(const s of this.surfaces){s.shown='';s.overlay.replaceChildren();}
    this.root.querySelector('.pdf-mapping')!.textContent=mapping?`定位 ${mapping.mapped}/${mapping.total}`:'音符定位不可用';
  }

  async showPage(number:number,force=false){
    if(!this.document)return;
    const requested=Math.max(1,Math.min(this.document.numPages,Math.round(number)||1));
    const changed=requested!==this.page;
    this.setPage(requested);
    const surface=this.surfaces[requested-1];
    if(surface&&(changed||force))this.scroll.scrollTop=Math.max(0,this.top(surface)-PAGE_PADDING);
    const width=this.scroll.clientWidth-20;
    if(!this.root.hidden&&width>0&&(force||width!==this.requestedWidth||(!this.rendering&&!surface?.canvas)))await this.renderAll(width,force);
  }

  private renderAll(width:number,force=false):Promise<void>{
    const doc=this.document;
    if(!doc||width<=0)return Promise.resolve();
    if(!force&&width===this.requestedWidth){
      if(this.rendering)return this.rendering;
      if(this.surfaces.every(s=>s.renderedWidth===width))return Promise.resolve();
    }
    const revision=++this.renderRevision,generation=this.generation;
    for(const task of this.tasks)task.cancel();this.tasks.clear();
    this.requestedWidth=width;this.root.setAttribute('aria-busy','true');
    const current=()=>revision===this.renderRevision&&generation===this.generation&&doc===this.document;
    const work=(async()=>{
      try{
        const pdfPages=await Promise.all(this.surfaces.map(s=>doc.getPage(s.number)));
        if(!current())return;
        const anchor=this.surfaces[this.page-1],fraction=anchor?.height?(this.scroll.scrollTop-this.top(anchor))/anchor.height:0;
        let area=0;
        const viewports=pdfPages.map(p=>{const base=p.getViewport({scale:1});return p.getViewport({scale:width/base.width});});
        this.surfaces.forEach((s,i)=>{
          s.width=viewports[i].width;s.height=viewports[i].height;area+=s.width*s.height;
          s.box.style.width=`${s.width}px`;s.box.style.height=`${s.height}px`;
        });
        if(anchor)this.scroll.scrollTop=Math.max(0,this.top(anchor)+fraction*anchor.height);
        const dpr=Math.min(devicePixelRatio||1,2,Math.sqrt(DOCUMENT_PIXEL_BUDGET/Math.max(1,area)));
        let next=0,finished=0,failed=false;
        const total=this.surfaces.length;
        this.status.textContent=`PDF 渲染 0/${total}`;
        const worker=async()=>{
          while(current()&&next<total){
            const index=next++,s=this.surfaces[index],pdfPage=pdfPages[index],viewport=viewports[index];
            if(!force&&s.renderedWidth===width){finished++;continue;}
            const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',`原 PDF 第 ${s.number} 页`);
            canvas.width=Math.max(1,Math.floor(viewport.width*dpr));canvas.height=Math.max(1,Math.floor(viewport.height*dpr));
            canvas.style.width='100%';canvas.style.height='100%';
            let task:RenderTask|null=null;
            try{
              task=pdfPage.render({canvas,viewport,annotationMode:AnnotationMode.DISABLE,transform:dpr===1?undefined:[dpr,0,0,dpr,0,0]});this.tasks.add(task);
              await task.promise;
              if(!current()){canvas.width=0;canvas.height=0;return;}
              const old=s.canvas;
              if(old)old.replaceWith(canvas);else s.box.prepend(canvas);
              s.canvas=canvas;s.renderedWidth=width;s.box.dataset.rendered='true';
              if(old){old.width=0;old.height=0;}
              pdfPage.cleanup?.();
            }catch(error){
              canvas.width=0;canvas.height=0;
              if(current()&&(error as Error).name!=='RenderingCancelledException'){failed=true;this.onError(`PDF 第 ${s.number} 页显示失败：${error}`);}
            }finally{if(task)this.tasks.delete(task);}
            if(current()){finished++;this.status.textContent=`PDF 渲染 ${finished}/${total}`;}
          }
        };
        await Promise.all(Array.from({length:Math.min(2,total)},()=>worker()));
        if(current()){
          this.status.textContent=failed?'PDF 部分页面渲染失败':`PDF ${total}/${total}`;
          this.paint(this.pending,this.pendingScroll);
        }
      }catch(error){if(current())this.onError(`PDF 显示失败：${error}`);}
      finally{if(current()){this.root.setAttribute('aria-busy','false');this.rendering=null;}}
    })();
    this.rendering=work;return work;
  }

  update(time:number,hands:{left:boolean;right:boolean},playing:boolean){
    const positions=currentPositions(this.score,this.mapping,time,hands);this.pending=positions;this.pendingScroll=playing;
    const target=positions[0]?.page;
    if(this.follow&&target&&target!==this.page){
      this.setPage(target);
      if(!playing){const s=this.surfaces[target-1];if(s)this.scroll.scrollTop=Math.max(0,this.top(s)-PAGE_PADDING);}
    }
    this.paint(positions,playing);
  }
  private paint(positions:ReturnType<typeof currentPositions>,scroll=false){
    const groups=new Map<number,typeof positions>();
    for(const p of positions){const group=groups.get(p.page)??[];group.push(p);groups.set(p.page,group);}
    for(const number of new Set([...this.highlighted,...groups.keys()])){
      const s=this.surfaces[number-1];if(!s)continue;
      const visible=groups.get(number)??[],key=visible.map(p=>p.id).sort().join(',');
      if(key===s.shown)continue;
      s.shown=key;s.overlay.replaceChildren();const unique=new Set<string>();
      for(const p of visible){
        if(unique.has(p.head))continue;unique.add(p.head);
        const r=document.createElementNS('http://www.w3.org/2000/svg','rect');
        r.setAttribute('x',String(Math.max(0,p.x-.003)));r.setAttribute('y',String(Math.max(0,p.y-.002)));r.setAttribute('width',String(p.w+.006));r.setAttribute('height',String(p.h+.004));
        r.dataset.source=p.id;r.dataset.head=p.head;r.dataset.hand=p.hand;r.setAttribute('class',`note-highlight ${p.hand}`);s.overlay.append(r);
      }
    }
    this.highlighted=new Set(groups.keys());
    if(scroll&&this.follow&&positions.length){
      const p=positions[0],s=this.surfaces[p.page-1];
      if(s){const center=this.top(s)+p.y*s.height;if(center<this.scroll.scrollTop+60||center>this.scroll.scrollTop+this.scroll.clientHeight-60)this.scroll.scrollTop=Math.max(0,center-this.scroll.clientHeight*.35);}
    }
  }
}

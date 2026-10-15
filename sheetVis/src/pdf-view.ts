import { getDocument, GlobalWorkerOptions, AnnotationMode, type PDFDocumentProxy, type PDFDocumentLoadingTask, type RenderTask } from 'pdfjs-dist';
import workerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Score } from './score';

GlobalWorkerOptions.workerSrc = workerURL;
export interface NotePosition { page: number; x: number; y: number; w: number; h: number; head: string; grade: number }
export interface SourceMap { version: number; positions: Record<string, NotePosition>; mapped: number; total: number }

export function currentPositions(score: Score | null, mapping: SourceMap | null, time: number, hands = { left:true, right:true }) {
  if (!score || !mapping) return [];
  return score.notes.filter(n => hands[n.hand]).flatMap(n => (n.sources ?? []).filter(s => s.start <= time + .001 && s.start + s.duration > time + .001)
    .map(s => ({ id:s.id, ...mapping.positions[s.id], hand:n.hand })).filter(p => p.page !== undefined));
}

export class PDFView {
  private document: PDFDocumentProxy | null = null;
  private loading: PDFDocumentLoadingTask | null = null;
  private task: RenderTask | null = null;
  private generation = 0;
  private pageRevision = 0;
  private shown = '';
  private rendering = false;
  private pending: ReturnType<typeof currentPositions> = [];
  page = 1;
  follow = true;
  mapping: SourceMap | null = null;
  score: Score | null = null;
  onError: (message: string) => void = () => {};
  private canvas: HTMLCanvasElement;
  private overlay: SVGSVGElement;
  private pageBox: HTMLDivElement;
  private number: HTMLInputElement;
  private count: HTMLOutputElement;
  private scroll: HTMLDivElement;
  constructor(private root: HTMLElement) {
    root.innerHTML = `<div class="pdf-controls"><button class="pdf-prev" aria-label="上一页">‹</button><input class="pdf-number" type="number" min="1" value="1" aria-label="PDF 页码"><output class="pdf-count"></output><button class="pdf-next" aria-label="下一页">›</button><label><input class="pdf-follow" type="checkbox" checked>跟随</label><span class="pdf-mapping"></span></div><div class="pdf-scroll"><div class="pdf-page"><canvas aria-label="原 PDF 页面"></canvas><svg class="pdf-overlay" aria-label="当前音符高亮"></svg></div></div>`;
    this.canvas = root.querySelector('canvas')!; this.overlay = root.querySelector('svg')!;
    this.pageBox = root.querySelector('.pdf-page')!; this.scroll = root.querySelector('.pdf-scroll')!;
    this.number = root.querySelector('.pdf-number')!; this.count = root.querySelector('.pdf-count')!;
    root.querySelector('.pdf-prev')!.addEventListener('click', () => void this.showPage(this.page - 1));
    root.querySelector('.pdf-next')!.addEventListener('click', () => void this.showPage(this.page + 1));
    this.number.addEventListener('change', () => void this.showPage(Number(this.number.value)));
    root.querySelector('.pdf-follow')!.addEventListener('change', e => { this.follow = (e.target as HTMLInputElement).checked; });
    let timer: ReturnType<typeof setTimeout>;
    let width = 0;
    new ResizeObserver(() => {
      const next = this.scroll.clientWidth;
      if (!next || next === width || this.root.hidden) return;
      width = next; clearTimeout(timer); timer = setTimeout(() => void this.showPage(this.page, true), 100);
    }).observe(this.scroll);
  }

  async load(data: ArrayBuffer) {
    const generation = ++this.generation;
    this.task?.cancel(); const previous = this.loading; this.loading = null; this.document = null;
    await previous?.destroy();
    if (generation !== this.generation) return;
    this.mapping = null; this.score = null; this.page = 1; this.overlay.replaceChildren();
    const loading = getDocument({ data: new Uint8Array(data.slice(0)), useWasm:false, standardFontDataUrl:'/pdfjs/fonts/', cMapUrl:'/pdfjs/cmaps/', cMapPacked:true });
    this.loading = loading;
    const document = await loading.promise;
    if (generation !== this.generation) { await loading.destroy(); return; }
    this.document = document; this.count.textContent = `/ ${document.numPages}`; this.number.max = String(document.numPages);
    await this.showPage(1, true);
  }

  clear() {
    ++this.generation; ++this.pageRevision; this.task?.cancel(); void this.loading?.destroy(); this.loading = null; this.document = null;
    this.mapping = null; this.score = null; this.pending = []; this.overlay.replaceChildren(); this.shown = '';
  }

  attach(score: Score, mapping: SourceMap | null) {
    this.score = score; this.mapping = mapping; this.shown = '';
    this.root.querySelector('.pdf-mapping')!.textContent = mapping ? `定位 ${mapping.mapped}/${mapping.total}` : '音符定位不可用';
  }

  async showPage(number: number, force = false) {
    if (!this.document) return;
    const requested = Math.max(1, Math.min(this.document.numPages, Math.round(number) || 1));
    if (requested === this.page && !force) return;
    this.page = requested; this.number.value = String(requested);
    const revision = ++this.pageRevision;
    this.rendering = true; this.overlay.replaceChildren(); this.shown = '';
    this.root.setAttribute('aria-busy','true');
    const previous = this.task; previous?.cancel();
    try { await previous?.promise; } catch {}
    try {
      const page = await this.document.getPage(requested);
      if (revision !== this.pageRevision) return;
      const base = page.getViewport({ scale:1 });
      const width = Math.max(240, this.scroll.clientWidth - 20);
      const viewport = page.getViewport({ scale: width/base.width });
      const dpr = Math.min(devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(viewport.width * dpr); this.canvas.height = Math.round(viewport.height * dpr);
      this.canvas.style.width = `${viewport.width}px`; this.canvas.style.height = `${viewport.height}px`;
      this.pageBox.style.width = `${viewport.width}px`; this.pageBox.style.height = `${viewport.height}px`;
      this.overlay.setAttribute('viewBox', '0 0 1 1'); this.overlay.setAttribute('preserveAspectRatio','none');
      this.task = page.render({ canvas:this.canvas, viewport, annotationMode:AnnotationMode.DISABLE, transform:dpr===1?undefined:[dpr,0,0,dpr,0,0] });
      await this.task.promise;
      if (revision !== this.pageRevision) return;
      this.rendering = false; this.root.setAttribute('aria-busy','false');
      this.shown = ''; this.paint(this.pending);
    } catch (error) {
      if (revision === this.pageRevision) {
        this.rendering = false; this.root.setAttribute('aria-busy','false');
        if ((error as Error).name !== 'RenderingCancelledException') this.onError(`PDF 显示失败：${error}`);
      }
    }
  }

  update(time: number, hands: {left:boolean;right:boolean}, playing: boolean) {
    const positions = currentPositions(this.score, this.mapping, time, hands);
    this.pending = positions;
    const target = positions[0]?.page;
    if (this.follow && target && target !== this.page) void this.showPage(target);
    this.paint(positions, playing);
  }

  private paint(positions: ReturnType<typeof currentPositions>, scroll = false) {
    if (this.rendering) return;
    const visible = positions.filter(p => p.page === this.page);
    const key = `${this.page}:${visible.map(p => p.id).sort().join(',')}`;
    if (key === this.shown) return;
    this.shown = key; this.overlay.replaceChildren();
    const unique = new Set<string>();
    for (const position of visible) {
      if (unique.has(position.head)) continue;
      unique.add(position.head);
      const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
      rect.setAttribute('x', String(Math.max(0, position.x - .003))); rect.setAttribute('y', String(Math.max(0, position.y - .002)));
      rect.setAttribute('width', String(position.w + .006)); rect.setAttribute('height', String(position.h + .004));
      rect.dataset.source = position.id; rect.dataset.head = position.head; rect.dataset.hand = position.hand;
      rect.setAttribute('class', `note-highlight ${position.hand}`); this.overlay.append(rect);
    }
    if (scroll && this.follow && visible.length) {
      const center = visible[0].y * this.pageBox.clientHeight;
      if (center < this.scroll.scrollTop + 60 || center > this.scroll.scrollTop + this.scroll.clientHeight - 60) this.scroll.scrollTop = Math.max(0, center - this.scroll.clientHeight * .35);
    }
  }
}

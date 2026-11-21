let library;
const normalize = text => text.replace(/\s+/g, '').toLowerCase();

export class PagePreview {
  constructor(element) {
    this.element = element;
    this.version = 0;
    this.items = [];
    this.visible = new Set();
    let width = 0;
    this.resize = new ResizeObserver(() => {
      const next = element.clientWidth;
      if (!next || next === width) return;
      width = next;
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        for (const item of this.visible) { this.release(item); this.paint(item); }
      }, 150);
    });
    this.resize.observe(element);
  }
  async clear() {
    ++this.version;
    this.observer?.disconnect();
    clearTimeout(this.resizeTimer);
    for (const item of this.items) this.release(item);
    this.items = [];
    this.visible.clear();
    this.element.querySelector('.paper-pages')?.remove();
    const loading = this.loading;
    this.loading = this.document = null;
    await loading?.destroy();
  }
  async show(data, {paper, background}) {
    const clearing = this.clear(), version = this.version;
    await clearing;
    if (version !== this.version) return;
    library ??= import('/lib/pdfjs/pdf.mjs');
    const pdfjs = await library;
    if (version !== this.version) return;
    pdfjs.GlobalWorkerOptions.workerSrc = '/lib/pdfjs/pdf.worker.mjs';
    const loading = this.loading = pdfjs.getDocument({data:new Uint8Array(data), isEvalSupported:false, useSystemFonts:false,
      cMapUrl:'/lib/pdfjs/cmaps/', cMapPacked:true, standardFontDataUrl:'/lib/pdfjs/standard_fonts/', wasmUrl:'/lib/pdfjs/wasm/'});
    const document = await loading.promise;
    if (version !== this.version) return;
    this.document = document;
    const list = window.document.createElement('div');
    list.className = 'paper-pages';
    list.style.setProperty('--sheet-width', paper === 'Letter' ? '215.9mm' : '210mm');
    list.style.setProperty('--sheet-ratio', paper === 'Letter' ? '215.9 / 279.4' : '210 / 297');
    list.style.setProperty('--sheet-background', {white:'#fff', yellow:'#fff4cc', black:'#161616'}[background]);
    this.observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const item = this.items[Number(entry.target.dataset.page) - 1];
        if (!item || item.figure !== entry.target) continue;
        if (entry.isIntersecting) { this.visible.add(item); this.paint(item); }
        else { this.visible.delete(item); this.release(item); }
      }
    }, {root:this.element, rootMargin:'600px 0px'});
    for (let number = 1; number <= document.numPages; number++) {
      const figure = window.document.createElement('figure'), holder = window.document.createElement('div'), caption = window.document.createElement('figcaption');
      figure.className = 'paper-page'; figure.dataset.page = number;
      holder.className = 'paper-sheet';
      caption.textContent = `Page ${number} of ${document.numPages}`;
      figure.append(holder, caption); list.append(figure);
      const item = {number, figure, holder, version:0};
      this.items.push(item); this.observer.observe(figure);
    }
    this.element.append(list);
    return document.numPages;
  }
  release(item) {
    ++item.version;
    item.task?.cancel(); item.task = null;
    for (const canvas of item.holder.querySelectorAll('canvas')) canvas.width = canvas.height = 0;
    item.holder.replaceChildren();
    delete item.figure.dataset.rendered;
  }
  async paint(item) {
    if (!this.document || item.task || item.figure.dataset.rendered) return;
    const version = this.version, paintVersion = ++item.version, document = this.document;
    try {
      const page = await document.getPage(item.number);
      if (version !== this.version || paintVersion !== item.version || !this.visible.has(item)) return;
      const viewport = page.getViewport({scale:item.holder.clientWidth / page.getViewport({scale:1}).width});
      const ratio = Math.min(2, devicePixelRatio || 1), canvas = window.document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width * ratio); canvas.height = Math.ceil(viewport.height * ratio);
      canvas.setAttribute('aria-label', `PDF page ${item.number} of ${document.numPages}`);
      const task = item.task = page.render({canvasContext:canvas.getContext('2d'), viewport, transform:[ratio,0,0,ratio,0,0]});
      await task.promise;
      if (version !== this.version || paintVersion !== item.version) return;
      item.holder.replaceChildren(canvas); item.figure.dataset.rendered = 'true'; item.task = null;
    } catch (error) {
      if (version !== this.version || paintVersion !== item.version || error.name === 'RenderingCancelledException') return;
      item.task = null;
      item.holder.textContent = `Page ${item.number}: ${error.message}`;
    }
  }
  async reveal(label) {
    const document = this.document;
    if (!document) return;
    for (const item of this.items) {
      if (document !== this.document) return;
      const page = await document.getPage(item.number);
      const text = await page.getTextContent();
      if (document !== this.document) return;
      if (normalize(text.items.map(part => part.str || '').join(' ')).includes(normalize(label))) {
        this.element.scrollTo({top:this.element.scrollTop + item.figure.getBoundingClientRect().top - this.element.getBoundingClientRect().top - 12, behavior:'smooth'});
        this.element.focus(); return;
      }
    }
  }
}

// Left pane: the sheet music (pre-rendered vector PDF pages) with live note highlighting.
// Coordinates in the score are PDF points (page size differs per piece), so overlays are placed in percentages.

export class PdfView {
  constructor(container, score, firstPage = 11) {
    this.el = container;
    this.scroller = container.closest('#sheet') || container;
    this.score = score;
    this.pages = new Map();
    this.hl = [];                 // currently drawn highlight elements
    this.colors = { R: '#ff8a3d', L: '#2fc9b0' };
    this.build(firstPage);
  }

  build(firstPage) {
    this.el.innerHTML = '';
    for (const p of this.score.pages) {
      if (p.index < firstPage) continue;
      const wrap = document.createElement('div');
      wrap.className = 'page';
      wrap.dataset.page = p.index;
      const img = document.createElement('img');
      img.src = p.src;
      img.loading = 'lazy';
      img.alt = 'page ' + (p.index + 1);
      img.draggable = false;
      const layer = document.createElement('div');
      layer.className = 'layer';
      wrap.append(img, layer);
      this.el.append(wrap);
      this.pages.set(p.index, { wrap, layer, pw: p.w / p.scale, ph: p.h / p.scale });   // page size in PDF points
    }
    this.buildPatterns();
  }

  /** a tinted band behind every cell of a repeated figure, with its letter (right hand above, left hand below) */
  buildPatterns() {
    const byNum = this.score.measureByNumber;
    for (const p of this.score.patterns || []) {
      for (const c of p.cells) {
        const parts = new Map();                              // one band per system the cell touches
        for (const n of c.list) {
          const m = byNum.get(n.measure);
          const key = n.page + ':' + (m ? m.system : 0);
          const b = parts.get(key) || { page: n.page, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
          b.x0 = Math.min(b.x0, n.x); b.x1 = Math.max(b.x1, n.x);
          b.y0 = Math.min(b.y0, n.y); b.y1 = Math.max(b.y1, n.y);
          parts.set(key, b);
        }
        for (const b of parts.values()) {
          const pg = this.pages.get(b.page);
          if (!pg) continue;
          const d = document.createElement('div');
          d.className = 'pat-band';
          d.style.setProperty('--c', c.base);
          d.style.left = ((b.x0 - 3) / pg.pw * 100) + '%';
          d.style.top = ((b.y0 - 7) / pg.ph * 100) + '%';
          d.style.width = ((b.x1 - b.x0 + 12) / pg.pw * 100) + '%';
          d.style.height = ((b.y1 - b.y0 + 14) / pg.ph * 100) + '%';
          if (c.tag) {
            const t = document.createElement('span');
            t.textContent = c.tag;
            t.className = p.hand === 'L' ? 'below' : 'above';
            d.append(t);
          }
          pg.layer.prepend(d);
        }
      }
    }
  }

  setPatterns(on) { this.el.classList.toggle('no-pat', !on); }

  setColors(c) { this.colors = c; }

  clear() {
    for (const e of this.hl) e.remove();
    this.hl = [];
  }

  /** highlight note heads. `notes` current/target, `ghost` upcoming (fainter). */
  show(notes, { measure = null, ghost = [], enabled = new Set(['R', 'L']), scroll = true } = {}) {
    this.clear();
    const add = (pg, cls, x, y, w, h, color) => {
      const d = document.createElement('div');
      d.className = cls;
      d.style.left = (x / pg.pw * 100) + '%';
      d.style.top = (y / pg.ph * 100) + '%';
      d.style.width = (w / pg.pw * 100) + '%';
      d.style.height = (h / pg.ph * 100) + '%';
      if (color) d.style.setProperty('--c', color);
      pg.layer.append(d);
      this.hl.push(d);
      return d;
    };
    if (measure) {
      const pg = this.pages.get(measure.page);
      if (pg) add(pg, 'hl-measure', measure.x0, measure.y0 - 16, measure.x1 - measure.x0, measure.y1 - measure.y0 + 32);
    }
    for (const n of ghost) {
      const pg = this.pages.get(n.page);
      if (pg) add(pg, 'hl-ghost', n.x - 1, n.y - 3.4, 9, 6.8, this.colors[n.hand]);
    }
    let first = null;
    for (const n of notes) {
      const pg = this.pages.get(n.page);
      if (!pg) continue;
      const d = add(pg, 'hl-note' + (enabled.has(n.hand) ? '' : ' off'), n.x - 1.6, n.y - 4.4, 10.4, 8.8, this.colors[n.hand]);
      if (!first && enabled.has(n.hand)) first = { d, pg, n };
    }
    if (scroll && (first || measure)) {
      const pg = first ? first.pg : this.pages.get(measure.page);
      if (pg) this.follow(pg, first ? first.n.y : (measure.y0 + measure.y1) / 2);
    }
  }

  follow(pg, ptY) {
    const c = this.scroller, wrap = pg.wrap;
    const yAbs = wrap.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop + (ptY / pg.ph) * wrap.offsetHeight;
    const top = c.scrollTop, bottom = top + c.clientHeight;
    if (yAbs < top + c.clientHeight * 0.18 || yAbs > bottom - c.clientHeight * 0.22) {
      c.scrollTo({ top: Math.max(0, yAbs - c.clientHeight * 0.38), behavior: 'smooth' });
    }
  }
}

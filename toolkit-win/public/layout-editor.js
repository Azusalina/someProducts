const $ = id => document.getElementById(id);
const clamp = (value, min, max) => Math.round(Math.max(min, Math.min(max, value)) * 10) / 10;

export class LayoutEditor {
  constructor(frame, onChange) {
    this.frame = frame; this.onChange = onChange; this.enabled = false;
    for (const key of ['x','y','width','height','align']) $(`layout-${key}`).addEventListener('change', () => this.change(key));
    for (const key of ['pageBefore','keepNext']) $(`layout-${key}`).addEventListener('change', () => this.change(key));
    $('layout-up').addEventListener('click', () => this.reorder(-1));
    $('layout-down').addEventListener('click', () => this.reorder(1));
    $('layout-reset-item').addEventListener('click', () => {
      if (!this.selected) return;
      delete this.model.blocks[this.selected];
      if (this.meta().parent) delete this.model.blocks[this.meta().parent];
      this.emit();
    });
    $('layout-reset-all').addEventListener('click', () => {
      if (this.state?.layoutRevision) this.onChange({revision:this.state.layoutRevision, reset:true});
    });
  }
  setState(state) {
    if (this.state?.layoutRevision !== state?.layoutRevision) this.selected = null;
    this.state = state;
    this.model = state?.layout ? structuredClone(state.layout) : {revision:state?.layoutRevision,
      order:(state?.layoutBlocks || []).filter(block => !block.parent).map(block => block.id), blocks:{}};
    if (!state?.layoutBlocks?.some(block => block.id === this.selected)) this.selected = null;
    this.controls();
  }
  setEnabled(enabled) { this.enabled = enabled; this.attach(); }
  meta() { return this.state?.layoutBlocks?.find(block => block.id === this.selected); }
  node(id = this.selected) { return this.doc?.querySelector(`[data-layout-id="${id}"]`); }
  attach() {
    const doc = this.frame.contentDocument;
    if (!doc?.body) return;
    if (this.doc !== doc) {
      this.doc = doc;
      const style = doc.createElement('style');
      style.textContent = '.toolkit-layout-editing [data-layout-id]{cursor:pointer}.toolkit-layout-selected{outline:2px dashed currentColor;outline-offset:3px}.toolkit-layout-overlay{position:fixed;pointer-events:none;z-index:2147483647;border:1px dashed currentColor;box-sizing:border-box}.toolkit-layout-overlay button{position:absolute;pointer-events:auto;background:#eee;color:#111;border:1px solid #555;font:12px system-ui;padding:3px 7px;touch-action:none;white-space:nowrap}.toolkit-layout-drag{left:0;top:-26px;cursor:move}.toolkit-layout-resize{right:-1px;bottom:-24px;cursor:nwse-resize}';
      doc.head.append(style);
      doc.addEventListener('click', event => {
        if (!this.enabled || this.overlay?.contains(event.target)) return;
        const node = event.target.closest?.('[data-layout-id]');
        if (!node) return;
        event.preventDefault(); this.selected = node.dataset.layoutId; this.controls(); this.highlight();
      });
      doc.addEventListener('load', () => this.position(), true);
      doc.defaultView.addEventListener('scroll', () => this.position(), {passive:true});
      doc.defaultView.addEventListener('resize', () => this.position());
      this.overlay = null;
    }
    doc.body.classList.toggle('toolkit-layout-editing', this.enabled);
    this.controls(); this.highlight();
  }
  highlight() {
    if (!this.doc) return;
    for (const node of this.doc.querySelectorAll('.toolkit-layout-selected')) node.classList.remove('toolkit-layout-selected');
    this.overlay?.remove(); this.overlay = null;
    const node = this.node();
    if (!this.enabled || !node) return;
    node.classList.add('toolkit-layout-selected');
    const overlay = this.overlay = this.doc.createElement('div'); overlay.className = 'toolkit-layout-overlay';
    const drag = this.doc.createElement('button'); drag.type = 'button'; drag.className = 'toolkit-layout-drag'; drag.textContent = 'Drag';
    drag.setAttribute('aria-label','Drag selected content'); drag.addEventListener('pointerdown', event => this.drag(event, false)); overlay.append(drag);
    if (['image','table'].includes(this.meta()?.kind)) {
      const resize = this.doc.createElement('button'); resize.type = 'button'; resize.className = 'toolkit-layout-resize'; resize.textContent = 'Resize';
      resize.setAttribute('aria-label','Resize selected content'); resize.addEventListener('pointerdown', event => this.drag(event, true)); overlay.append(resize);
    }
    this.doc.body.append(overlay); this.position();
  }
  position() {
    const node = this.node();
    if (!this.overlay || !node) return;
    const box = node.getBoundingClientRect();
    Object.assign(this.overlay.style, {left:`${box.left}px`, top:`${box.top}px`, width:`${box.width}px`, height:`${box.height}px`});
  }
  controls() {
    const meta = this.meta(), change = this.model?.blocks[this.selected] || {}, owner = meta?.parent || this.selected;
    $('layout-selection').textContent = meta ? `${meta.kind}: ${meta.label}` : 'Select text, an image or a table.';
    $('layout-fields').disabled = !meta;
    const index = this.model?.order.indexOf(owner) ?? -1;
    $('layout-up').disabled = !meta || index <= 0; $('layout-down').disabled = !meta || index >= this.model.order.length - 1;
    for (const key of ['x','y']) if (document.activeElement !== $(`layout-${key}`)) $(`layout-${key}`).value = change[key] || 0;
    for (const key of ['width','height']) { if (document.activeElement !== $(`layout-${key}`)) $(`layout-${key}`).value = change[key] ?? ''; $(`layout-${key}`).disabled = !['image','table'].includes(meta?.kind); }
    if (document.activeElement !== $('layout-align')) $('layout-align').value = change.align || '';
    const page = this.model?.blocks[owner] || {};
    $('layout-pageBefore').checked = page.pageBefore ?? this.node(owner)?.dataset.pageStart === 'true';
    $('layout-keepNext').checked = Boolean(page.keepNext);
  }
  change(key) {
    if (!this.selected) return;
    const meta = this.meta(), pageKey = ['pageBefore','keepNext'].includes(key), id = pageKey ? meta.parent || meta.id : meta.id;
    const change = this.model.blocks[id] ??= {}, field = $(`layout-${key}`);
    if (pageKey) change[key] = field.checked;
    else if (field.value === '') delete change[key];
    else if (key === 'align') change.align = field.value;
    else {
      const bounds = {x:[-180,180], y:[-250,250], width:[5,100], height:[1,300]}[key];
      change[key] = clamp(Number(field.value), ...bounds);
    }
    this.preview(id); this.emit();
  }
  preview(id = this.selected) {
    const node = this.node(id), change = this.model.blocks[id] || {};
    if (!node) return;
    node.style.transform = `translate(${change.x || 0}mm,${change.y || 0}mm)`;
    node.style.width = change.width == null ? '' : `${change.width}%`;
    node.style.height = change.height == null ? '' : `${change.height}mm`;
    if (change.height != null) node.style.maxHeight = 'none';
    if (change.align) {
      if (['IMG','TABLE'].includes(node.tagName)) {
        node.style.marginLeft = change.align === 'left' ? '0' : 'auto'; node.style.marginRight = change.align === 'right' ? '0' : 'auto';
      } else node.style.textAlign = change.align;
    }
    this.position();
  }
  drag(event, resize) {
    event.preventDefault(); event.stopPropagation();
    const node = this.node(), handle = event.currentTarget, start = {x:event.clientX, y:event.clientY}, box = node.getBoundingClientRect();
    const original = {...this.model.blocks[this.selected]}, kind = this.meta().kind;
    const document = node.closest('.document'), css = this.doc.defaultView.getComputedStyle(document);
    const contentWidth = document.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    handle.setPointerCapture(event.pointerId);
    const move = event => {
      const change = this.model.blocks[this.selected] ??= {}, dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (resize) {
        change.width = clamp((box.width + dx) / contentWidth * 100, 5, 100);
        if (kind === 'table') change.height = clamp((box.height + dy) * 25.4 / 96, 1, 300);
      } else { change.x = clamp((original.x || 0) + dx * 25.4 / 96, -180, 180); change.y = clamp((original.y || 0) + dy * 25.4 / 96, -250, 250); }
      this.preview(); this.controls();
    };
    const finish = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', finish); handle.removeEventListener('pointercancel', finish); this.emit(); };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', finish); handle.addEventListener('pointercancel', finish);
  }
  reorder(delta) {
    const owner = this.meta()?.parent || this.selected, index = this.model.order.indexOf(owner), next = index + delta;
    if (index < 0 || next < 0 || next >= this.model.order.length) return;
    const neighbor = this.node(this.model.order[next]), node = this.node(owner);
    if (delta < 0) neighbor.before(node); else neighbor.after(node);
    [this.model.order[index], this.model.order[next]] = [this.model.order[next], this.model.order[index]];
    this.controls(); this.position(); this.emit();
  }
  emit() { this.onChange(structuredClone(this.model)); }
}

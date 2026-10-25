let library, document, loading, rendering, generation = 0, pageNumber = 1;
const $ = id => window.document.getElementById(id);

async function paint(version = generation) {
  if (!document) return;
  rendering?.cancel();
  const page = await document.getPage(pageNumber);
  if (version !== generation) return;
  const width = Math.max(280, $('tex-preview').parentElement.clientWidth - 64);
  const viewport = page.getViewport({ scale: Math.min(2, width / page.getViewport({ scale: 1 }).width) });
  const ratio = Math.min(2, devicePixelRatio || 1);
  const canvas = window.document.createElement('canvas');
  canvas.width = Math.floor(viewport.width * ratio); canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
  canvas.setAttribute('aria-label', `PDF page ${pageNumber} of ${document.numPages}`);
  rendering = page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
  try { await rendering.promise; } catch (error) { if (error.name === 'RenderingCancelledException') return; throw error; }
  if (version !== generation) return;
  $('tex-canvas').replaceChildren(canvas);
  $('tex-page').textContent = `Page ${pageNumber} of ${document.numPages}`;
  $('tex-previous').disabled = pageNumber <= 1;
  $('tex-next').disabled = pageNumber >= document.numPages;
  $('tex-preview').dataset.rendered = String(version);
}

export async function showTexPreview(base64, { reset = false } = {}) {
  const version = ++generation;
  rendering?.cancel();
  await loading?.destroy();
  if (version !== generation) return;
  if (!library) {
    library = await import('/lib/pdfjs/pdf.mjs');
    library.GlobalWorkerOptions.workerSrc = '/lib/pdfjs/pdf.worker.mjs';
  }
  const data = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  loading = library.getDocument({ data, isEvalSupported: false, useSystemFonts: false,
    cMapUrl: '/lib/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/lib/pdfjs/standard_fonts/', wasmUrl: '/lib/pdfjs/wasm/' });
  const next = await loading.promise;
  if (version !== generation) { await next.destroy(); return; }
  document = next;
  pageNumber = reset ? 1 : Math.min(pageNumber, next.numPages);
  await paint(version);
}

for (const [id, delta] of [['tex-previous', -1], ['tex-next', 1]]) $(id).addEventListener('click', () => {
  if (!document) return;
  pageNumber = Math.max(1, Math.min(document.numPages, pageNumber + delta));
  paint().catch(error => { $('tex-page').textContent = error.message; });
});
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (document && !$('tex-preview').hidden) paint().catch(() => {}); }, 150);
});

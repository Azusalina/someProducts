import { parsePages, extractPages } from './pdf-selection.js';
const $ = id => document.getElementById(id);
let original, PDFDocument, pages = [], filename = '', busy = false, revision = 0, previewUrl;

function status(text, error = false) {
  $('pdf-status').textContent = text;
  $('pdf-status').classList.toggle('error', error);
}
function update() {
  $('pdf-file').disabled = busy;
  $('pdf-page-list').replaceChildren();
  $('pdf-editor-controls').disabled = !original || busy;
  $('pdf-save').disabled = !original || busy || !pages.length;
  $('pdf-preview-result').disabled = !original || busy || !pages.length;
  $('pdf-selection-count').textContent = original ? `${pages.length} of ${original.getPageCount()} pages in output · ${filename}` : 'No PDF open';
  for (const [index, number] of pages.entries()) {
    const row = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${index + 1}. Page ${number}`;
    row.dataset.page = number; row.append(label);
    for (const [text, name, disabled, action] of [
      ['↑', `Move page ${number} earlier`, index === 0, () => { [pages[index - 1], pages[index]] = [pages[index], pages[index - 1]]; }],
      ['↓', `Move page ${number} later`, index === pages.length - 1, () => { [pages[index + 1], pages[index]] = [pages[index], pages[index + 1]]; }],
      ['Delete', `Delete page ${number}`, false, () => pages.splice(index, 1)],
    ]) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = text; button.setAttribute('aria-label', name); button.disabled = disabled || busy;
      button.addEventListener('click', () => { action(); changed(); });
      row.append(button);
    }
    $('pdf-page-list').append(row);
  }
}
function changed() {
  revision++; update();
  const label = $('pdf-preview-label');
  if (!label.textContent.endsWith(' · selection changed')) label.textContent += ' · selection changed';
  status('Page selection changed. Preview result or save as a new PDF.');
}
function showPreview(bytes) {
  const old = previewUrl;
  previewUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  $('pdf-native-preview').src = `${previewUrl}#view=FitH&zoom=page-width&pagemode=none&navpanes=0`;
  $('pdf-native-preview').hidden = false;
  $('pdf-open-preview').href = previewUrl;
  $('pdf-open-preview').hidden = false;
  if (old) URL.revokeObjectURL(old);
}
$('pdf-file').addEventListener('change', async () => {
  const file = $('pdf-file').files[0];
  const current = ++revision;
  if (!file) return;
  if (file.size > 100 * 1024 * 1024) { status('Choose a PDF smaller than 100 MB.', true); return; }
  busy = true; update(); status('Opening PDF…');
  try {
    ({ PDFDocument } = await import('/lib/pdf-lib.js'));
    const bytes = new Uint8Array(await file.arrayBuffer());
    const loaded = await PDFDocument.load(bytes);
    if (!loaded.getPageCount()) throw new Error('This PDF has no pages.');
    if (loaded.getPageCount() > 5000) throw new Error('Choose a PDF with at most 5000 pages.');
    if (loaded.getForm().getFields().length) throw new Error('Interactive PDF forms are not supported. Use a flattened copy.');
    if (revision !== current) return;
    original = loaded; filename = file.name;
    pages = Array.from({ length: loaded.getPageCount() }, (_, i) => i + 1);
    $('pdf-output-name').value = `${filename.replace(/\.pdf$/i, '')}-edited.pdf`;
    $('pdf-range').value = ''; showPreview(bytes);
    $('pdf-preview-label').textContent = `Original · ${filename}`;
    status(`Opened ${filename}. Choose original page numbers below.`);
  } catch (error) {
    if (current === revision) status(/encrypt/i.test(error.message) ? 'Password-protected PDFs are not supported. Open an unlocked copy.' : `Could not open PDF: ${error.message}`, true);
  } finally { if (current === revision) { busy = false; update(); } }
});
function applyRange() {
  if (!original || busy) return false;
  try {
    const selected = parsePages($('pdf-range').value, original.getPageCount());
    pages = $('pdf-range-action').value === 'keep' ? selected : pages.filter(p => !selected.includes(p));
    changed();
    return true;
  } catch (error) { status(error.message, true); return false; }
}
$('pdf-apply-range').addEventListener('click', applyRange);
for (const id of ['pdf-range', 'pdf-range-action']) $(id).addEventListener('keydown', event => {
  if (event.key !== 'Enter' || event.isComposing || event.repeat) return;
  event.preventDefault();
  if (applyRange()) {
    if (pages.length) produce(false);
    else status('Keep at least one page to preview the result.', true);
  }
});
$('pdf-reset').addEventListener('click', () => {
  pages = Array.from({ length: original.getPageCount() }, (_, i) => i + 1); changed();
});
async function produce(download) {
  if (!original || busy || !pages.length) return;
  busy = true; update(); status('Preparing PDF…');
  const current = revision;
  try {
    const bytes = await extractPages(PDFDocument, original, pages);
    if (current !== revision) return;
    if (download) {
      let name = $('pdf-output-name').value.trim().replace(/[\\/]/g, '_') || 'edited.pdf';
      if (!/\.pdf$/i.test(name)) name += '.pdf';
      if (name.toLowerCase() === filename.toLowerCase()) name = filename.replace(/\.pdf$/i, '') + '-edited.pdf';
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const link = document.createElement('a'); link.href = url; link.download = name;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      status(`Downloaded ${name}. Original PDF unchanged.`);
    } else {
      showPreview(bytes); $('pdf-preview-label').textContent = `Result preview · ${pages.length} pages · ${filename}`;
      status('Preview updated. Save as a new PDF to download it.');
    }
  } catch (error) { status(`Could not create PDF: ${error.message}`, true); }
  finally { busy = false; update(); }
}
$('pdf-save').addEventListener('click', () => produce(true));
$('pdf-preview-result').addEventListener('click', () => produce(false));
window.addEventListener('pagehide', () => { if (previewUrl) URL.revokeObjectURL(previewUrl); });
update();

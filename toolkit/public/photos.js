import { combinePhotos } from './photo-pdf.js';
const $ = id => document.getElementById(id);
const MAX_TOTAL = 100 * 1024 * 1024;
let photos = [], busy = false;
function status(message) { $('photos-status').textContent = message; }
function update() {
  $('photos-files').disabled = busy;
  $('photos-options').disabled = busy || !photos.length;
  $('photos-save').disabled = busy || !photos.length;
  $('photos-clear').disabled = busy || !photos.length;
  $('photos-count').textContent = `${photos.length} photo${photos.length === 1 ? '' : 's'} · one photo per PDF page`;
  const list = $('photos-list'); list.replaceChildren();
  for (const [index, photo] of photos.entries()) {
    const row = document.createElement('li');
    const image = document.createElement('img'); image.src = photo.url; image.alt = photo.name;
    const name = document.createElement('span'); name.textContent = `${index + 1}. ${photo.name} · ${photo.width} × ${photo.height}`;
    row.append(image, name);
    for (const [text, label, disabled, action] of [
      ['↑', `Move photo ${index + 1} earlier`, index === 0, () => { [photos[index - 1], photos[index]] = [photos[index], photos[index - 1]]; }],
      ['↓', `Move photo ${index + 1} later`, index === photos.length - 1, () => { [photos[index + 1], photos[index]] = [photos[index], photos[index + 1]]; }],
      ['Remove', `Remove photo ${index + 1}`, false, () => { URL.revokeObjectURL(photo.url); photos.splice(index, 1); }],
    ]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
      button.setAttribute('aria-label', label); button.disabled = disabled || busy;
      button.addEventListener('click', () => { action(); update(); status('Photo order updated. Save PDF when ready.'); });
      row.append(button);
    }
    list.append(row);
  }
}
async function normalize(file) {
  if (!/\.(jpe?g|png|webp|avif)$/i.test(file.name)) throw new Error('Use JPEG, PNG, WebP or AVIF photos.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Each photo must be at most 25 MB.');
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url; await image.decode();
    const width = image.naturalWidth, height = image.naturalHeight;
    if (!width || !height || width * height > 32_000_000) throw new Error('Each photo must be at most 32 megapixels.');
    // Browser decoding applies EXIF orientation before drawing. Normalize one
    // image at a time so the PDF matches the thumbnail, including phone photos.
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const jpeg = /\.jpe?g$/i.test(file.name);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, jpeg ? 'image/jpeg' : 'image/png', .92));
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error('Could not decode this photo.');
    return { name: file.name, url, bytes: new Uint8Array(await blob.arrayBuffer()), jpeg, width, height, sourceSize: file.size };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
  finally { image.src = ''; }
}
$('photos-files').addEventListener('change', async () => {
  const files = [...$('photos-files').files];
  if (!files.length || busy) return;
  busy = true; update();
  const failures = [];
  try {
    for (const [index, file] of files.entries()) {
      status(`Opening photo ${index + 1} of ${files.length}…`);
      try {
        if (photos.length >= 100) throw new Error('Keep at most 100 photos.');
        if (photos.reduce((sum, p) => sum + p.sourceSize, 0) + file.size > MAX_TOTAL) throw new Error('Keep at most 100 MB of source photos.');
        const photo = await normalize(file);
        if (photos.reduce((sum, p) => sum + p.bytes.length, 0) + photo.bytes.length > MAX_TOTAL) {
          URL.revokeObjectURL(photo.url); throw new Error('Decoded photos exceed 100 MB; remove some photos first.');
        }
        photos.push(photo);
      } catch (error) { failures.push(`${file.name}: ${error.message}`); }
    }
    status(failures.length ? failures.join('\n') : 'Photos ready. Adjust their order and save as one PDF.');
  } finally { busy = false; $('photos-files').value = ''; update(); }
});
$('photos-clear').addEventListener('click', () => {
  for (const photo of photos) URL.revokeObjectURL(photo.url);
  photos = []; update(); status('Add photos to combine them into one PDF.');
});
$('photos-save').addEventListener('click', async () => {
  if (busy || !photos.length) return;
  busy = true; update(); status('Combining photos…');
  try {
    const { PDFDocument } = await import('/lib/pdf-lib.js');
    const bytes = await combinePhotos(PDFDocument, photos, $('photos-paper').value);
    let filename = $('photos-name').value.trim().replace(/[\\/]/g, '_') || 'photos.pdf';
    if (!/\.pdf$/i.test(filename)) filename += '.pdf';
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a'); link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    status(`Downloaded ${filename} · ${photos.length} pages. Original photos unchanged.`);
  } catch (error) { status(`Could not create PDF: ${error.message}`); }
  finally { busy = false; update(); }
});
update();

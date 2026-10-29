import {renderFlowchart} from './flowchart-render.js';
const $ = id => document.getElementById(id);
let filename = 'code.js', url, pending = false;
function status(text) { $('code-flowchart-status').hidden = !text; $('code-flowchart-status').textContent = text; }
function clear() {
  if (url) URL.revokeObjectURL(url);
  url = null; $('code-flowchart-image').hidden = true; $('code-flowchart-image').removeAttribute('src');
  $('code-flowchart-download').disabled = true;
}
function update() {
  for (const id of ['file', 'source', 'generate']) $(`code-flowchart-${id}`).disabled = pending;
}
$('code-flowchart-file').addEventListener('change', async () => {
  const file = $('code-flowchart-file').files[0]; if (!file) return;
  clear(); status('');
  if (!/\.m?js$/i.test(file.name)) { status('Choose a .js or .mjs file.'); return; }
  if (file.size > 100 * 1024) { status('Choose code up to 100 KB.'); return; }
  pending = true; update();
  try {
    const text = await file.text(); filename = file.name;
    $('code-flowchart-source').value = text;
    $('code-flowchart-name').value = file.name.replace(/\.m?js$/i, '.svg');
  } catch (error) { status(error.message); }
  finally { pending = false; update(); }
});
$('code-flowchart-source').addEventListener('input', () => { clear(); status(''); });
$('code-flowchart-generate').addEventListener('click', async () => {
  if (pending) return;
  clear(); pending = true; update(); status('Generating…');
  try {
    const view = history.state?.toolkitView;
    if (!view) throw new Error('The page is still connecting. Try again shortly.');
    const source = $('code-flowchart-source').value;
    if (new Blob([source]).size > 100 * 1024) throw new Error('Choose code up to 100 KB.');
    const response = await fetch('/api/flowchart/source', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Toolkit-View': view }, body: JSON.stringify({ source, filename }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not generate SVG.');
    url = URL.createObjectURL(new Blob([await renderFlowchart(result.diagram)], { type: 'image/svg+xml' }));
    $('code-flowchart-image').src = url; $('code-flowchart-image').hidden = false;
    $('code-flowchart-download').disabled = false; status('');
  } catch (error) { status(error.message); }
  finally { pending = false; update(); }
});
$('code-flowchart-download').addEventListener('click', () => {
  if (!url) return;
  let name = $('code-flowchart-name').value.trim().replace(/[\\/\x00-\x1f\x7f]/g, '_') || 'flowchart.svg';
  if (!/\.svg$/i.test(name)) name += '.svg';
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
});
window.addEventListener('pagehide', clear);

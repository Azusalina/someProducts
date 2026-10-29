const $ = id => document.getElementById(id);
import { showTexPreview } from './tex-preview.js';
const headers = { 'Content-Type': 'application/json' };
let viewId;
let state = null, sourceView = false, opening = false, exporting = false, style = '';
let streamError = '', actionError = '', info;
let previousFilename;
let zenMode = false, focusBeforeZen;
let texPreviewUrl;

function setZenMode(active) {
  if (active && state?.html === undefined) return;
  if (active === zenMode) return;
  if (active) focusBeforeZen = document.activeElement;
  zenMode = active;
  document.body.classList.toggle('zen-mode', active);
  $('zen-button').setAttribute('aria-pressed', String(active));
  updateViews();
  if (active) (state?.module === 'tex' ? $('tex-preview') : $('preview')).focus();
  else (focusBeforeZen?.isConnected ? focusBeforeZen : $('zen-button')).focus();
}
function exitZenOnEscape(event) {
  if (event.key === 'Escape' && zenMode) {
    event.preventDefault();
    setZenMode(false);
  }
}
document.addEventListener('keydown', exitZenOnEscape);

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'The local server did not respond.' }));
    const failure = new Error(error.error);
    failure.status = response.status;
    throw failure;
  }
  return response;
}
async function createView(options = {}) {
  const details = await (await api('/api/views', { method: 'POST', body: JSON.stringify(options) })).json();
  viewId = details.viewId;
  headers['X-Toolkit-View'] = viewId;
  // Only an opaque ID enters history; Markdown, paths and renders stay in memory.
  // Every load forks a fresh view, so duplicated tabs cannot share a watcher.
  history.replaceState({ ...history.state, toolkitView: viewId }, '');
  return details;
}
function message() {
  const items = [actionError, streamError, state?.error, ...(state?.warnings || [])].filter(Boolean);
  $('message').textContent = items.join('\n');
  $('message').hidden = items.length === 0;
}
function updateViews() {
  const showSource = sourceView && !zenMode;
  $('empty').hidden = Boolean(state?.html !== undefined);
  $('preview').hidden = !state || state.html === undefined || showSource;
  const tex = state?.module === 'tex';
  if (tex) $('preview').hidden = true;
  $('tex-preview').hidden = !tex || !state?.pdf || showSource;
  $('tex-open-preview').hidden = !tex || !texPreviewUrl || showSource || zenMode;
  $('paper').disabled = tex;
  $('pdf-background').disabled = tex;
  if (!exporting) $('export-button').textContent = tex ? 'Save PDF' : 'Export PDF';
  $('source').hidden = !state || state.html === undefined || !showSource;
  $('preview-tab').classList.toggle('selected', !sourceView);
  $('source-tab').classList.toggle('selected', sourceView);
  $('preview-tab').setAttribute('aria-pressed', String(!sourceView));
  $('source-tab').setAttribute('aria-pressed', String(sourceView));
  $('export-button').disabled = !state || Boolean(state.error) || exporting;
  $('zen-button').disabled = state?.html === undefined;
}
function draw(next) {
  state = next;
  if (!state) { updateViews(); return; }
  if (previousFilename !== state.filename) {
    $('filepath').value = state.filename;
    previousFilename = state.filename;
  }
  $('filename').textContent = state.filename.split(/[\\/]/).pop();
  $('filename').title = state.filename;
  $('updated').textContent = state.error ? 'Waiting for a saved file' : `Saved · ${new Date(state.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  $('source').textContent = state.source || '';
  // Keep reading position when a new save arrives.
  const frame = $('preview');
  if (state.module === 'tex' && state.pdf) {
    const bytes = Uint8Array.from(atob(state.pdf), c => c.charCodeAt(0));
    const previous = texPreviewUrl;
    texPreviewUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    $('tex-preview').dataset.source = texPreviewUrl;
    showTexPreview(state.pdf, { reset: frame.dataset.filename !== state.filename }).catch(error => {
      actionError = `PDF preview: ${error.message}. Use Open PDF preview in new tab.`; message();
    });
    $('tex-open-preview').href = texPreviewUrl;
    if (previous) URL.revokeObjectURL(previous);
  } else if (state.module !== 'tex' && texPreviewUrl) {
    URL.revokeObjectURL(texPreviewUrl); texPreviewUrl = null;
    delete $('tex-preview').dataset.source;
  }
  const sameFile = frame.dataset.filename === state.filename;
  const scroll = sameFile ? (frame.contentWindow?.scrollY || 0) : 0;
  frame.dataset.filename = state.filename;
  frame.onload = () => {
    frame.contentWindow?.scrollTo(0, scroll);
    // Keyboard events inside a focused iframe do not bubble to the parent.
    // Reattach after each saved-file render without enabling preview scripts.
    frame.contentDocument?.addEventListener('keydown', exitZenOnEscape);
  };
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><style>${style}</style></head><body class="document-theme-black"><article class="document">${state.html || ''}</article></body></html>`;
  const outline = $('outline');
  outline.replaceChildren();
  for (const heading of state.outline || []) {
    const link = document.createElement('a');
    link.textContent = heading.label;
    link.href = `#${heading.id}`;
    link.style.paddingLeft = `${5 + Math.min(heading.level - 1, 3) * 10}px`;
    link.addEventListener('click', event => {
      event.preventDefault(); sourceView = false; updateViews();
      frame.contentDocument?.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth' });
    });
    outline.append(link);
  }
  if (!outline.childElementCount) outline.textContent = 'No headings in this document.';
  document.title = `${state.title || 'Markdown'} · Local Toolkit`;
  updateViews(); message();
}
async function openFile(path) {
  if (opening) return;
  opening = true; actionError = ''; message();
  $('open-button').disabled = true;
  try {
    draw(await (await api('/api/open', { method: 'POST', body: JSON.stringify({ path }) })).json());
  } catch (error) { actionError = error.message; message(); }
  finally { opening = false; $('open-button').disabled = false; }
}
$('open-form').addEventListener('submit', event => { event.preventDefault(); openFile($('filepath').value); });
$('example-button').addEventListener('click', () => openFile(info.examplePath));
$('preview-tab').addEventListener('click', () => { sourceView = false; updateViews(); });
$('source-tab').addEventListener('click', () => { sourceView = true; updateViews(); });
$('zen-button').addEventListener('click', () => setZenMode(true));
$('sidebar-toggle').addEventListener('click', () => {
  const collapsed = !$('sidebar').hidden;
  $('sidebar').hidden = collapsed;
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  $('sidebar-toggle').setAttribute('aria-expanded', String(!collapsed));
  const label = collapsed ? 'Show sidebar' : 'Hide sidebar';
  $('sidebar-toggle').setAttribute('aria-label', label);
  $('sidebar-toggle').textContent = label;
});
$('export-button').addEventListener('click', async () => {
  if (!state || exporting) return;
  const filename = state.filename.split(/[\\/]/).pop().replace(/\.(md|markdown|tex)$/i, '.pdf');
  exporting = true; actionError = ''; message(); updateViews();
  $('export-button').textContent = 'Exporting…';
  try {
    const response = await api('/api/export/pdf', { method: 'POST', body: JSON.stringify({ paper: $('paper').value, background: $('pdf-background').value }) });
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (error) { actionError = error.message; message(); }
  finally { exporting = false; $('export-button').textContent = 'Export PDF'; updateViews(); }
});

async function connect() {
  while (true) {
    try {
      const response = await api('/api/events');
      $('connection').textContent = 'Watching'; streamError = ''; message();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) throw new Error('Connection closed.');
        buffer += decoder.decode(value, { stream: true });
        let index;
        while ((index = buffer.indexOf('\n\n')) !== -1) {
          const event = buffer.slice(0, index); buffer = buffer.slice(index + 2);
          if (event.startsWith('data: ')) draw(JSON.parse(event.slice(6)));
        }
      }
    } catch (error) {
      if (error.status === 410) {
        try { info = await createView({ path: state?.filename }); draw(info.state); continue; } catch {}
      }
      $('connection').textContent = 'Reconnecting…';
      streamError = 'Connection lost. Keep the toolkit running in your terminal. Reconnecting…'; message();
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
}
try {
  const [css, details] = await Promise.all([fetch('/document.css').then(response => response.text()), createView({ previousView: history.state?.toolkitView })]);
  style = css; info = details;
  $('path-help').textContent = `Save changes to update the preview. Relative paths start at ${info.baseDir}.`;
  draw(info.state);
  connect();
} catch (error) {
  actionError = error.message; message(); $('connection').textContent = 'Disconnected'; $('example-button').disabled = true;
}

import './style.css';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { PianoPlayer } from './audio';
import { extractMusicXML, midiToScore, musicXMLToScore, type Score } from './score';
import { Waterfall } from './waterfall';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="topbar"><a class="brand" href="/">sheetVis</a><span id="piece-title">小练习 · C 大调</span><span id="piece-meta"></span><span id="time">00:00 / 00:00</span></header>
  <button id="toolbar-toggle" class="toolbar-toggle" aria-controls="toolbar" aria-expanded="false" title="工具栏（Tab）">工具</button>
  <aside id="toolbar" class="toolbar" aria-label="工具栏" hidden>
    <div class="toolbar-heading"><span>工具</span><button id="toolbar-close" aria-label="关闭工具栏">×</button></div>
    <button id="import">导入</button><button id="demo">示例</button><input id="file" type="file" accept=".pdf,.xml,.musicxml,.mxl,.mid,.midi" hidden>
    <div class="toolbar-group"><button id="play" class="primary" aria-label="播放">播放</button><button id="rewind" aria-label="回退 5 秒">−5s</button><button id="forward" aria-label="快进 5 秒">+5s</button><button id="reset">重置</button><label for="progress">位置</label><input id="progress" type="range" min="0" max="100" value="0" step=".01" aria-label="播放位置"></div>
    <div class="toolbar-group"><label for="speed">速度 <output id="speed-value">1.00×</output></label><input id="speed" type="range" min="25" max="200" value="100" step="5"><label for="bpm">BPM</label><input id="bpm" type="number" min="20" max="300" step="1" value="96" aria-label="参考 BPM"><label for="volume">音量</label><input id="volume" type="range" min="0" max="100" value="60"><label for="lookahead">预览</label><select id="lookahead"><option value="4">4s</option><option value="7" selected>7s</option><option value="12">12s</option></select><label class="check"><input id="left-hand" type="checkbox" checked>左手</label><label class="check"><input id="right-hand" type="checkbox" checked>右手</label><label class="check"><input id="autoplay" type="checkbox" checked>自动播放</label></div>
    <div class="toolbar-group"><select id="movement" aria-label="乐章" hidden></select><button id="score-tab" class="selected">五线谱</button><button id="original-tab" hidden>PDF</button><button id="download" disabled>下载 MusicXML</button><a id="log" hidden download="识别日志.txt">日志</a><div id="measure-list" class="measure-list" aria-label="小节"></div><details id="warnings" hidden><summary id="warnings-summary">记录</summary><ul id="warnings-list"></ul></details></div>
    <div class="toolbar-group toolbar-meta"><span id="piece-kind"></span><span id="engine-status"></span><a href="/credits.html" target="_blank" rel="noopener">来源与许可</a></div>
  </aside>
  <main>
    <div id="notice" class="notice" role="status" aria-live="polite" hidden></div>
    <div id="recognition" class="recognition" role="status" aria-live="polite" hidden><span id="recognition-label">识别</span><progress id="recognition-progress" max="100" value="0" aria-label="乐谱识别进度"></progress><output id="recognition-percent">0%</output></div>
    <section id="drop-zone" class="workspace" aria-label="钢琴"><div class="canvas-scroll"><div class="canvas-wrap"><canvas id="waterfall" aria-label="钢琴音符瀑布"></canvas><div id="keyboard-grip" class="keyboard-grip" role="separator" aria-label="琴键高度" aria-orientation="horizontal" aria-valuemin="40" aria-valuemax="260" aria-valuenow="90" tabindex="0"></div></div></div></section>
    <section class="score-section"><div id="score-view" class="score-view"></div><iframe id="pdf-view" title="PDF" hidden></iframe></section>
  </main>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const player = new PianoPlayer();
const waterfall = new Waterfall($<HTMLCanvasElement>('waterfall'));
function toolbar(open: boolean, focus = false) {
  $('toolbar').hidden = !open;
  document.body.classList.toggle('toolbar-open', open);
  $('toolbar-toggle').setAttribute('aria-expanded', String(open));
  if (focus) (open ? $('import') : $('toolbar-toggle')).focus();
}
$('toolbar-toggle').addEventListener('click', () => toolbar($('toolbar').hidden));
$('toolbar-close').addEventListener('click', () => toolbar(false, true));
function recognition(percent: number, label = '识别') {
  $('recognition').hidden = false;
  $<HTMLProgressElement>('recognition-progress').value = percent;
  $('recognition-percent').textContent = `${percent}%`;
  $('recognition-label').textContent = label;
}
function keyboardHeight(height: number, save = false) {
  const value = waterfall.setKeyboardHeight(height);
  $('keyboard-grip').style.bottom = `${value}px`;
  $('keyboard-grip').setAttribute('aria-valuenow', String(value));
  if (save) { try { localStorage.setItem('sheetvis.keyboard-height', String(value)); } catch {} }
}
try { keyboardHeight(Number(localStorage.getItem('sheetvis.keyboard-height')) || 90); } catch { keyboardHeight(90); }
let gripDrag: { y: number; height: number; pointer: number } | null = null;
$('keyboard-grip').addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  e.preventDefault(); gripDrag = { y: e.clientY, height: waterfall.keyboardHeight, pointer: e.pointerId };
  $('keyboard-grip').setPointerCapture(e.pointerId); $('keyboard-grip').classList.add('dragging');
});
$('keyboard-grip').addEventListener('pointermove', e => {
  if (gripDrag?.pointer === e.pointerId) keyboardHeight(gripDrag.height + gripDrag.y - e.clientY);
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) $('keyboard-grip').addEventListener(event, () => {
  if (gripDrag) keyboardHeight(waterfall.keyboardHeight, true);
  gripDrag = null; $('keyboard-grip').classList.remove('dragging');
});
$('keyboard-grip').addEventListener('keydown', e => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); keyboardHeight(waterfall.keyboardHeight + (e.key === 'ArrowUp' ? 5 : -5), true); }
});
$('waterfall').addEventListener('click', e => {
  const midi = waterfall.noteAt(e.clientX, e.clientY);
  if (midi === null) return;
  waterfall.flashNote(midi);
  void player.audition(midi).then(() => waterfall.flashNote(midi)).catch(error => notice(String(error), 'error'));
});
new ResizeObserver(() => keyboardHeight(waterfall.keyboardHeight)).observe($('waterfall'));
let score: Score | null = null;
let display: OpenSheetMusicDisplay | null = null;
let revision = 0, busy = false, audioBusy = false, pdfUrl: string | null = null, scoreUrl: string | null = null;
let currentMeasure = -1, lastCursorSource = -1;
let referenceBpm = 120;
let recognitionResults: { name: string; url: string }[] = [];
let recognizedFilename = '', recognitionRevision = 0;

function notice(message: string, type: 'info' | 'error' | 'success' = 'info') {
  $('notice').textContent = message; $('notice').className = `notice ${type}`; $('notice').hidden = !message;
}
function formatTime(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }
function referenceRatio() { return score ? referenceBpm / score.bpm : 1; }
function updateMeta() {
  if (score) $('piece-meta').textContent = `${score.notes.length} 个音符 · ${Number(referenceBpm.toFixed(2))} BPM · ${formatTime(score.duration / referenceRatio())}`;
}
async function applySpeed() {
  await player.setSpeed(Number($<HTMLInputElement>('speed').value) / 100 * referenceRatio());
  updateButtons();
}
function updateButtons() {
  $('play').textContent = audioBusy ? '载入音色…' : player.playing ? '暂停' : '播放';
  $('play').setAttribute('aria-label', player.playing ? '暂停' : '播放');
  $<HTMLButtonElement>('play').disabled = !score || busy || audioBusy;
}
async function togglePlay() {
  if (busy || audioBusy || !score) return;
  if (player.playing) { player.pause(); updateButtons(); return; }
  audioBusy = true; updateButtons();
  try { await player.play(); } catch (e) { notice(e instanceof Error ? e.message : String(e), 'error'); }
  finally { audioBusy = false; updateButtons(); }
}
player.onEnd = updateButtons;

function showWarnings(warnings: string[]) {
  $('warnings-list').replaceChildren(...warnings.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  $('warnings').hidden = !warnings.length;
  $('warnings-summary').textContent = `播放说明（${warnings.length}）`;
}
async function setScore(next: Score, token: number, kind: string) {
  if (token !== revision) return;
  score = next; player.load(next); waterfall.score = next; currentMeasure = -1; lastCursorSource = -1;
  referenceBpm = next.bpm; $<HTMLInputElement>('bpm').value = String(Number(next.bpm.toFixed(2))); await applySpeed();
  if (token !== revision) return;
  $('piece-title').textContent = next.title;
  $('piece-kind').textContent = kind.startsWith('PDF') ? 'PDF' : kind.startsWith('MIDI') ? 'MIDI' : kind.startsWith('DEMO') ? '示例' : 'MusicXML';
  updateMeta();
  $<HTMLInputElement>('progress').max = String(next.duration);
  $<HTMLInputElement>('progress').value = '0';
  showWarnings(next.warnings);
  const buttons = next.measures.map((m, index) => {
    const button = document.createElement('button'); button.textContent = m.number === 'MIDI' ? 'MIDI 时间线' : `第 ${m.number} 小节`;
    button.dataset.measure = String(index); button.addEventListener('click', () => void seek(m.start)); return button;
  });
  $('measure-list').replaceChildren(...buttons);
  if (scoreUrl) URL.revokeObjectURL(scoreUrl);
  scoreUrl = next.xml ? URL.createObjectURL(new Blob([next.xml], { type: 'application/xml' })) : null;
  $<HTMLButtonElement>('download').disabled = !scoreUrl;
  display?.clear(); display = null;
  $('score-view').replaceChildren();
  if (next.xml) {
    const target = document.createElement('div'); $('score-view').append(target);
    const renderer = new OpenSheetMusicDisplay(target, { autoResize: true, backend: 'svg', drawTitle: false, drawComposer: false, drawPartNames: false, drawingParameters: 'compacttight', newSystemFromXML: true, followCursor: false, darkMode: true, defaultColorMusic: '#c9d2c2', defaultColorLabel: '#b9c5b0' });
    renderer.EngravingRules.PageBackgroundColor = '#111714';
    try {
      await renderer.load(next.xml);
      if (token !== revision) { renderer.clear(); return; }
      renderer.render(); renderer.cursor.show(); display = renderer;
    } catch (error) {
      if (token !== revision) return;
      target.textContent = '五线谱渲染失败';
      console.warn('Score rendering failed:', error);
    }
  } else $('score-view').textContent = 'MIDI';
  busy = false; updateButtons();
}

async function seek(position: number) {
  if (!score || busy) return;
  await player.seek(position); updateButtons();
}
function switchTab(original: boolean) {
  $('score-view').hidden = original; $('pdf-view').hidden = !original;
  $('original-tab').classList.toggle('selected', original); $('score-tab').classList.toggle('selected', !original);
}
async function recognizedScore(result: { name: string; url: string }, token: number) {
  const response = await fetch(result.url);
  if (!response.ok) throw new Error('无法读取识别结果。');
  const buffer = await response.arrayBuffer();
  const xml = result.name.endsWith('.mxl') ? extractMusicXML(buffer) : new TextDecoder().decode(buffer);
  const parsed = musicXMLToScore(xml, recognizedFilename);
  parsed.title = recognizedFilename.replace(/\.[^.]+$/, '');
  parsed.warnings.unshift('PDF 自动识别可能包含错音、漏音或节奏偏差。');
  await setScore(parsed, token, 'PDF / LOCAL OMR');
}

async function recognize(file: File, token: number) {
  notice(''); recognition(0, '读取 PDF');
  const response = await fetch('/api/recognize', { method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-SheetVis': 'local' }, body: file });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'PDF 识别服务不可用。');
  if (token !== revision) return;
  const log = $<HTMLAnchorElement>('log'); log.href = `/api/jobs/${data.id}/engine.log`; log.hidden = false;
  const started = Date.now();
  while (token === revision && Date.now() - started < 660_000) {
    const statusResponse = await fetch(`/api/jobs/${data.id}`);
    if (!statusResponse.ok) throw new Error('无法查询识别任务。');
    const job = await statusResponse.json();
    if (token !== revision) return;
    // Older running services can finish their in-flight jobs without being interrupted by an upgrade.
    if (job.progress === undefined && job.state === 'running') {
      const logResponse = await fetch(`/api/jobs/${data.id}/engine.log`);
      if (logResponse.ok) {
        const log = await logResponse.text();
        const pages = Number(log.match(/\b(\d+) sheets? in /)?.[1]) || 1;
        const stages = [...log.matchAll(/StepMonitoring\s+\d+\s*\|\s*([A-Z_]+)/g)];
        job.progress = /Exporting sheet\(s\)|exported to /.test(log) ? 97 : Math.min(95, 5 + Math.floor(90 * Math.max(0, stages.length - 1) / (pages * 20)));
      }
    }
    if (token !== revision) return;
    recognition(job.progress ?? (job.state === 'done' ? 100 : 0), job.phase === 'scan' ? '筛选' : job.state === 'error' ? '识别失败' : '识别');
    if (job.state === 'error') throw new Error(job.message);
    if (job.state === 'done') {
      recognitionResults = job.results; recognizedFilename = file.name; recognitionRevision = token;
      const select = $<HTMLSelectElement>('movement');
      select.replaceChildren(...recognitionResults.map((r, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = `乐章 ${i + 1}`; return o; }));
      select.hidden = recognitionResults.length <= 1;
      await recognizedScore(recognitionResults[0], token);
      if (token === revision) {
        recognition(100, '完成'); notice('');
        if (pdfUrl && job.included_pages?.length) $<HTMLIFrameElement>('pdf-view').src = `${pdfUrl}#page=${job.included_pages[0]}`;
      }
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 1200));
  }
  if (token === revision) throw new Error('识别等待超时，请拆分 PDF 后重试。');
}

async function loadFile(file: File) {
  const token = ++revision;
  player.pause(); busy = true; updateButtons();
  $('recognition').hidden = true;
  $('log').hidden = true; $('movement').hidden = true; recognitionResults = [];
  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  pdfUrl = null; $<HTMLIFrameElement>('pdf-view').removeAttribute('src'); $('original-tab').hidden = true; switchTab(false);
  // Unlock audio while this file selection / drop is still a user gesture.
  const sound = $<HTMLInputElement>('autoplay').checked ? player.ready().catch(() => {}) : Promise.resolve();
  try {
    if (file.size > 40 * 1024 * 1024) throw new Error('文件必须小于 40 MB。');
    const extension = file.name.split('.').at(-1)?.toLowerCase();
    notice('');
    if (extension === 'pdf') {
      pdfUrl = URL.createObjectURL(file); $<HTMLIFrameElement>('pdf-view').src = pdfUrl; $('original-tab').hidden = false;
      await recognize(file, token);
    } else {
      const buffer = await file.arrayBuffer();
      if (token !== revision) return;
      const parsed = ['mid', 'midi'].includes(extension ?? '') ? midiToScore(buffer, file.name) : musicXMLToScore(extension === 'mxl' ? extractMusicXML(buffer) : new TextDecoder().decode(buffer), file.name);
      await setScore(parsed, token, ['mid', 'midi'].includes(extension ?? '') ? 'MIDI / LOCAL FILE' : 'MUSICXML / LOCAL FILE');
      if (token === revision) notice('');
    }
    await sound;
    if (token === revision && $<HTMLInputElement>('autoplay').checked) await togglePlay();
  } catch (error) {
    if (token === revision) notice(error instanceof Error ? error.message : String(error), 'error');
  } finally { if (token === revision) { busy = false; updateButtons(); } }
}

async function loadDemo() {
  const token = ++revision; player.pause(); busy = true; updateButtons();
  $('recognition').hidden = true;
  if (pdfUrl) URL.revokeObjectURL(pdfUrl); pdfUrl = null;
  $<HTMLIFrameElement>('pdf-view').removeAttribute('src'); $('original-tab').hidden = true; $('log').hidden = true; $('movement').hidden = true; switchTab(false);
  try {
    const response = await fetch('/demo.musicxml');
    await setScore(musicXMLToScore(await response.text(), '小练习 · C 大调'), token, 'DEMO / ORIGINAL EXERCISE');
    if (token === revision) notice('');
  } catch (e) { if (token === revision) notice(String(e), 'error'); }
  finally { if (token === revision) { busy = false; updateButtons(); } }
}

$('import').addEventListener('click', () => $<HTMLInputElement>('file').click());
$('file').addEventListener('change', e => { const input = e.target as HTMLInputElement; const file = input.files?.[0]; input.value = ''; if (file) void loadFile(file); });
$('demo').addEventListener('click', () => void loadDemo());
$('play').addEventListener('click', () => void togglePlay());
$('rewind').addEventListener('click', () => void seek(player.position - 5 * referenceRatio()));
$('forward').addEventListener('click', () => void seek(player.position + 5 * referenceRatio()));
$('reset').addEventListener('click', () => void seek(0));
$('progress').addEventListener('input', e => void seek(Number((e.target as HTMLInputElement).value)));
$('speed').addEventListener('input', e => { const speed = Number((e.target as HTMLInputElement).value) / 100; $('speed-value').textContent = `${speed.toFixed(2)}×`; void applySpeed(); });
$('bpm').addEventListener('change', e => {
  const input = e.target as HTMLInputElement;
  referenceBpm = Math.max(20, Math.min(300, Number(input.value) || score?.bpm || 120));
  input.value = String(referenceBpm); updateMeta(); void applySpeed();
});
$('volume').addEventListener('input', e => player.setVolume(Number((e.target as HTMLInputElement).value) / 100));
for (const hand of ['left', 'right'] as const) $(`${hand}-hand`).addEventListener('change', e => void player.setHand(hand, (e.target as HTMLInputElement).checked));
$('lookahead').addEventListener('change', e => { waterfall.lookAhead = Number((e.target as HTMLSelectElement).value); });
$('score-tab').addEventListener('click', () => switchTab(false));
$('original-tab').addEventListener('click', () => switchTab(true));
$('download').addEventListener('click', () => { if (scoreUrl && score) { const a = document.createElement('a'); a.href = scoreUrl; a.download = `${score.title}.musicxml`; a.click(); } });
$('movement').addEventListener('change', async e => {
  if (recognitionRevision !== revision) return;
  const result = recognitionResults[Number((e.target as HTMLSelectElement).value)];
  if (!result) return;
  player.pause(); busy = true; updateButtons();
  try { await recognizedScore(result, revision); } catch (error) { notice(String(error), 'error'); }
  finally { busy = false; updateButtons(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('toolbar').hidden) { e.preventDefault(); toolbar(false, true); return; }
  if (e.key === 'Tab' && $('toolbar').hidden && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); toolbar(true, true); return; }
  if ((e.target as HTMLElement).matches('input, select, textarea, button') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space') { e.preventDefault(); void togglePlay(); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); void seek(player.position - 5 * referenceRatio()); }
  if (e.key === 'ArrowRight') { e.preventDefault(); void seek(player.position + 5 * referenceRatio()); }
  if (e.key === 'Home') { e.preventDefault(); void seek(0); }
});
for (const event of ['dragenter', 'dragover']) $('drop-zone').addEventListener(event, e => { e.preventDefault(); $('drop-zone').classList.add('dragging'); });
$('drop-zone').addEventListener('dragleave', () => $('drop-zone').classList.remove('dragging'));
$('drop-zone').addEventListener('drop', e => { e.preventDefault(); $('drop-zone').classList.remove('dragging'); const file = (e as DragEvent).dataTransfer?.files[0]; if (file) void loadFile(file); });

let lastCursorUpdate = 0;
function frame(now: number) {
  const position = player.position;
  waterfall.draw(position, player.hands, referenceRatio());
  $('time').textContent = `${formatTime(position / referenceRatio())} / ${formatTime((score?.duration ?? 0) / referenceRatio())}`;
  $<HTMLInputElement>('progress').value = String(position);
  if (score) {
    const index = Math.max(0, score.measures.findLastIndex(m => m.start <= position));
    if (index !== currentMeasure) {
      $('measure-list').querySelector('[aria-current]')?.removeAttribute('aria-current');
      $('measure-list').children[index]?.setAttribute('aria-current', 'true');
      currentMeasure = index;
    }
    if (display && now - lastCursorUpdate > 150) {
      const measure = score.measures[index];
      const source = measure.sourceBeat / 4;
      if (source !== lastCursorSource) {
        display.cursor.reset();
        let steps = 0;
        while (!display.cursor.Iterator.EndReached && display.cursor.Iterator.CurrentSourceTimestamp.RealValue < source - 1e-7 && steps++ < 10000) display.cursor.next();
        display.cursor.show(); lastCursorSource = source;
      }
      lastCursorUpdate = now;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
void loadDemo();
fetch('/api/health').then(r => r.json()).then(h => {
  $('engine-status').textContent = h.omr && h.samples ? 'OMR · 就绪' : '资源缺失';
  $('engine-status').classList.toggle('ready', h.omr && h.samples);
}).catch(() => { $('engine-status').textContent = 'OMR · 离线'; });

import {sourceTime,wheelSeconds} from './navigation';
import {bindStaffNotes} from './staff-click';
import {staffAnchors, currentStaffAnchor, followStaff} from './staff-follow';
import './style.css';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { PianoPlayer } from './audio';
import { extractMusicXML, midiToScore, musicXMLToScore, parseXML, type Score } from './score';
import { Waterfall, defaultColors, validColors, type WaterfallColors } from './waterfall';
import { qualityFeedback, type RecognitionJob } from './quality';
import { PDFView, type SourceMap } from './pdf-view';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="topbar"><a class="brand" href="/">sheetVis</a><span id="piece-title"></span><span id="piece-meta"></span><span id="time">00:00 / 00:00</span></header>
  <button id="toolbar-toggle" class="toolbar-toggle" aria-controls="toolbar" aria-expanded="false" title="工具栏（Tab）">工具</button>
  <aside id="toolbar" class="toolbar" aria-label="工具栏" hidden>
    <div class="toolbar-heading"><span>工具</span><button id="toolbar-close" aria-label="关闭工具栏">×</button></div>
    <button id="import">导入</button><button id="default-score" hidden>默认乐谱</button><button id="demo">示例</button><button id="cache-open">乐谱缓存</button><button id="zen">Zen</button><input id="file" type="file" accept=".pdf,.xml,.musicxml,.mxl,.mid,.midi" hidden>
    <div class="toolbar-group"><button id="play" class="primary" aria-label="播放">播放</button><button id="rewind" aria-label="回退 5 秒">−5s</button><button id="forward" aria-label="快进 5 秒">+5s</button><button id="reset">重置</button></div>
    <div class="toolbar-group"><label for="speed">速度 <output id="speed-value">1.00×</output></label><input id="speed" type="range" min="25" max="200" value="100" step="5"><label for="bpm">BPM</label><input id="bpm" type="number" min="20" max="300" step="1" value="96" aria-label="参考 BPM"><label for="volume">音量</label><input id="volume" type="range" min="0" max="100" value="60"><label for="lookahead">预览</label><select id="lookahead"><option value="4">4s</option><option value="7" selected>7s</option><option value="12">12s</option></select><label class="check"><input id="left-hand" type="checkbox" checked>左手</label><label class="check"><input id="right-hand" type="checkbox" checked>右手</label><label class="check"><input id="autoplay" type="checkbox" checked>自动播放</label></div>
    <div class="toolbar-group"><select id="movement" aria-label="乐章" hidden></select><button id="score-tab" class="selected">五线谱</button><button id="original-tab" hidden>PDF</button><button id="download" disabled>下载 MusicXML</button><a id="log" hidden download="识别日志.txt">日志</a><div id="measure-list" class="measure-list" aria-label="小节"></div><details id="warnings" hidden><summary id="warnings-summary">记录</summary><ul id="warnings-list"></ul></details></div>
    <div class="toolbar-group"><details id="quality-report" hidden><summary>读入与识别反馈</summary><ul id="read-facts"></ul><ul id="quality-issues"></ul><p id="quality-limit"></p></details><details id="color-settings"><summary>瀑布配色</summary>${Object.entries({left:'左手',right:'右手',leftActive:'左手触键',rightActive:'右手触键',background:'背景'}).map(([key,label]) => `<label for="color-${key}">${label}<input id="color-${key}" data-color="${key}" type="color" value="${defaultColors[key as keyof WaterfallColors]}"></label>`).join('')}<button id="colors-reset">恢复配置配色</button><output id="colors-status" aria-live="polite"></output></details></div>
    <div class="toolbar-group"><details id="recognition-settings"><summary>识别资源</summary><label for="recognition-threads">CPU 核心（0 自动）</label><input id="recognition-threads" type="number" min="0" max="64" value="0"><label for="recognition-memory">Java 内存上限 MB</label><input id="recognition-memory" type="number" min="512" max="16384" step="256" value="4096"><button id="recognition-save">保存</button><output id="recognition-resource-status"></output></details></div>
    <div class="toolbar-group toolbar-meta"><span id="piece-kind"></span><span id="engine-status"></span><a href="/credits.html" target="_blank" rel="noopener">来源与许可</a></div>
  </aside>
  <main>
    <div id="notice" class="notice" role="status" aria-live="polite" hidden></div>
    <div id="recognition" class="recognition" role="status" aria-live="polite" hidden><span id="recognition-label">识别</span><progress id="recognition-progress" max="100" value="0" aria-label="乐谱识别进度"></progress><output id="recognition-percent">0%</output><span id="recognition-detail"></span><button id="cancel-recognition" hidden>中断识别</button></div>
    <div id="read-feedback" class="read-feedback" role="status" aria-live="polite" hidden><span id="read-summary"></span><span id="audio-status"></span><button id="feedback-open" hidden>反馈</button></div>
    <div class="transport"><button id="transport-play" aria-label="播放">播放</button><input id="progress" type="range" min="0" max="100" value="0" step=".01" aria-label="播放位置"><output id="seek-time">00:00 / 00:00</output></div>
    <div class="split-view"><section class="score-section"><div id="pdf-view" aria-label="原 PDF" hidden></div><div id="score-view" class="score-view"></div></section>
    <section id="drop-zone" class="workspace" aria-label="钢琴"><div class="canvas-scroll"><div class="canvas-wrap"><canvas id="waterfall" aria-label="钢琴音符瀑布"></canvas><div id="keyboard-grip" class="keyboard-grip" role="separator" aria-label="琴键高度" aria-orientation="horizontal" aria-valuemin="40" aria-valuemax="260" aria-valuenow="90" tabindex="0"></div></div></div></section></div>

  </main><dialog id="cache-dialog" aria-labelledby="cache-title"><div class="cache-heading"><h2 id="cache-title">乐谱缓存</h2><button id="cache-refresh">刷新</button><button id="cache-close" aria-label="关闭缓存管理">×</button></div><p id="cache-status" role="status"></p><ul id="cache-list"></ul></dialog>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const player = new PianoPlayer();
const waterfall = new Waterfall($<HTMLCanvasElement>('waterfall'));
const pdfView = new PDFView($('pdf-view'));
pdfView.onError = message => notice(message, 'error');
let noteMapping: SourceMap | null = null;
function toolbar(open: boolean, focus = false) {
  $('toolbar').hidden = !open;
  document.body.classList.toggle('toolbar-open', open);
  $('toolbar-toggle').setAttribute('aria-expanded', String(open));
  if (focus) (open ? $('import') : $('toolbar-toggle')).focus();
}
$('toolbar-toggle').addEventListener('click', () => toolbar($('toolbar').hidden));
$('toolbar-close').addEventListener('click', () => toolbar(false, true));
let zen = false, toolbarBeforeZen = false, scrollBeforeZen = 0;
function setZen(active: boolean) {
  if (active === zen) return;
  if (active) {
    toolbarBeforeZen = !$('toolbar').hidden; scrollBeforeZen = window.scrollY;
    toolbar(false); (document.activeElement as HTMLElement)?.blur();
  }
  zen = active; document.body.classList.toggle('zen', active);
  if (active) window.scrollTo(0, 0);
  else { toolbar(toolbarBeforeZen); window.scrollTo(0, scrollBeforeZen); }
}
$('zen').addEventListener('click', () => setZen(true));
let configuredColors: WaterfallColors = { ...defaultColors };
function applyColors(colors: WaterfallColors) {
  waterfall.colors = colors;
  for (const key of Object.keys(defaultColors) as (keyof WaterfallColors)[]) $<HTMLInputElement>(`color-${key}`).value = colors[key];
}
document.querySelectorAll<HTMLInputElement>('[data-color]').forEach(input => input.addEventListener('input', () => {
  waterfall.colors = { ...waterfall.colors, ...validColors({ [input.dataset.color!]: input.value }) };
  try { localStorage.setItem('sheetvis.colors', JSON.stringify(waterfall.colors)); $('colors-status').textContent = '已保存到此浏览器'; }
  catch { $('colors-status').textContent = '当前配色已应用，保存失败'; }
}));
$('recognition-save').addEventListener('click',async()=>{
  const button=$<HTMLButtonElement>('recognition-save');button.disabled=true;
  try {
    const response=await fetch('/api/config/recognition',{method:'POST',headers:{'Content-Type':'application/json','X-SheetVis':'local'},body:JSON.stringify({threads:Number($<HTMLInputElement>('recognition-threads').value),memory_mb:Number($<HTMLInputElement>('recognition-memory').value)})});
    const result=await response.json();if(!response.ok)throw new Error(result.error ?? '保存失败');
    $('recognition-resource-status').textContent=`已保存：${result.effective.threads} 核 · 下次新识别生效`;
  } catch(error){$('recognition-resource-status').textContent=String(error);}
  finally{button.disabled=false;}
});
$('colors-reset').addEventListener('click', () => {
  try { localStorage.removeItem('sheetvis.colors'); } catch {}
  applyColors({ ...configuredColors }); $('colors-status').textContent = '已恢复配置配色';
});
$('feedback-open').addEventListener('click', () => { toolbar(true); $<HTMLDetailsElement>('quality-report').open = true; $('quality-report').scrollIntoView({ block: 'nearest' }); });
function syncCancel(job=currentJob) {
  const button=$<HTMLButtonElement>('cancel-recognition');
  button.hidden=!job || !['queued','running','cancelling'].includes(job.state);
  button.disabled=job?.state==='cancelling';button.textContent=button.disabled ? '正在中断…' : '中断识别';
}
async function cancelJob(id:string) {
  const response=await fetch(`/api/jobs/${id}/cancel`,{method:'POST',headers:{'X-SheetVis':'local'}});
  const job=await response.json();if(!response.ok)throw new Error(job.error ?? '无法中断识别');
  if(currentJob?.id===id && job){currentJob=job;readSummary(job.message ?? job.state,job);}
  return job as RecognitionJob|null;
}
$('cancel-recognition').addEventListener('click',async()=>{
  if(!currentJob)return;const id=currentJob.id;
  $<HTMLButtonElement>('cancel-recognition').disabled=true;
  try {await cancelJob(id);}catch(error){notice(String(error),'error');syncCancel();}
});

function recognition(percent: number, label = '识别') {
  $('recognition').hidden = false;
  $<HTMLProgressElement>('recognition-progress').value = percent;
  $('recognition-percent').textContent = `${percent}%`;
  $('recognition-detail').textContent='';
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
let currentMeasure = -1, staffFollowKey = '';
let staffFollowDisplay: OpenSheetMusicDisplay | null = null;
let staffPositions = new Map<string, import('./staff-follow').StaffAnchor>();
let referenceBpm = 120;
let recognitionResults: { name: string; url: string }[] = [];
let recognizedFilename = '', recognitionRevision = 0;
let currentJob: RecognitionJob | undefined;
let readFilename = '', readBytes = 0;
let configuredDefault: { name: string; available: boolean; url: string; job_id?:string } | null = null;

function readSummary(state: string, job = currentJob) {
  syncCancel(job);
  $('read-feedback').hidden = false;
  const pages = job?.total_pages ? ` · ${job.total_pages} 页 / 乐谱 ${job.included_pages?.length ?? 0} 页` : '';
  $('read-summary').textContent = `${readFilename} · ${(readBytes / 1024).toFixed(0)} KB${pages} · ${state}`;
}
function reflect(next: Score) {
  const report = qualityFeedback(next, currentJob);
  const facts = [`文件：${readFilename} · ${readBytes} 字节`, ...report.facts];
  if (currentJob?.total_pages) facts.unshift(`PDF ${currentJob.total_pages} 页；五线谱 ${currentJob.included_pages?.length ?? 0} 页；跳过 ${currentJob.skipped_pages?.join('、') || '无'}。`);
  for (const [id, lines] of [['read-facts', facts], ['quality-issues', report.issues]] as const) {
    $(id).replaceChildren(...lines.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  }
  $('quality-limit').textContent = report.limit;
  $('quality-report').hidden = false;
  $('feedback-open').hidden = false;
  readSummary(report.summary);
}

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
  $('transport-play').textContent = $('play').textContent;
  $('transport-play').setAttribute('aria-label', player.playing ? '暂停' : '播放');
  $<HTMLButtonElement>('transport-play').disabled = !score || busy || audioBusy;
  $<HTMLInputElement>('progress').disabled = !score || busy;
}
async function togglePlay() {
  ++navigationRevision;stopWheel();
  if (busy || audioBusy || !score) return;
  if (player.playing) { player.pause(); updateButtons(); return; }
  audioBusy = true; updateButtons();
  try { await player.play(); if (player.playing) $('audio-status').textContent = ''; } catch (e) { notice(e instanceof Error ? e.message : String(e), 'error'); }
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
  score = next; player.load(next); waterfall.score = next; currentMeasure = -1;
  staffPositions = next.xml ? staffAnchors(next.xml) : new Map();
  referenceBpm = next.bpm; $<HTMLInputElement>('bpm').value = String(Number(next.bpm.toFixed(2))); await applySpeed();
  if (token !== revision) return;
  $('piece-title').textContent = next.title;
  $('piece-kind').textContent = kind.startsWith('PDF') ? 'PDF' : kind.startsWith('MIDI') ? 'MIDI' : kind.startsWith('DEMO') ? '示例' : 'MusicXML';
  updateMeta();
  $<HTMLInputElement>('progress').max = String(next.duration);
  $<HTMLInputElement>('progress').value = '0';
  showWarnings(next.warnings);
  reflect(next);
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
  if (pdfUrl) {
    // The original PDF is the default left pane. Avoid laying out hundreds of
    // reconstructed measures before playback can begin.
    pdfView.attach(next, noteMapping); switchTab(true);
    $('score-view').textContent = 'MusicXML 预览按需载入';
  } else if (next.xml) {
    const target = document.createElement('div'); $('score-view').append(target);
    const renderer = new OpenSheetMusicDisplay(target, { autoResize: false, backend: 'svg', drawTitle: false, drawComposer: false, drawPartNames: false, drawingParameters: 'compacttight', newSystemFromXML: true, followCursor: false, darkMode: true, defaultColorMusic: '#c9d2c2', defaultColorLabel: '#b9c5b0' });
    renderer.EngravingRules.PageBackgroundColor = '#111714';
    try {
      const preview = parseXML(next.xml);
      if (preview.querySelector('ending') && !preview.querySelector('repeat[direction="backward"]')) preview.querySelectorAll('ending').forEach(e => e.remove());
      await renderer.load(preview);
      if (token !== revision) { renderer.clear(); return; }
      try { renderer.render(); }
      catch (error) {
        if (!preview.querySelector('octave-shift')) throw error;
        // Preserve the original XML and its sounding pitches. Only the preview
        // omits broken ottava spans that crash OSMD's layout calculation.
        preview.querySelectorAll('octave-shift').forEach(e => e.remove());
        renderer.clear(); await renderer.load(preview);
        if (token !== revision) { renderer.clear(); return; }
        renderer.render();
        next.warnings.push('八度线排版异常，五线谱预览省略八度线；播放音高与下载仍使用原 MusicXML。');
        showWarnings(next.warnings); reflect(next);
      }
      renderer.cursor.show(); display = renderer; bindStaffNotes(renderer,next,staffPositions);
    } catch (error) {
      if (token !== revision) return;
      target.textContent = '五线谱渲染失败';
      next.warnings.push('五线谱预览失败；可使用原 PDF 对照播放数据。'); showWarnings(next.warnings); reflect(next);
      renderer.clear();
      console.warn('Score rendering failed:', error);
    }
  } else $('score-view').textContent = 'MIDI';
  busy = false; updateButtons();
}

let renderWidth = 0, resizeTimer: ReturnType<typeof setTimeout> | undefined;
new ResizeObserver(entries => {
  const width = entries[0].contentRect.width;
  if (width === renderWidth || !width) return;
  renderWidth = width; clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!display || $('score-view').hidden || zen) return;
    try { display.render(); display.cursor.show(); if(score)bindStaffNotes(display,score,staffPositions); staffFollowKey = ''; }
    catch { notice('五线谱重排失败；可切换原 PDF 对照。', 'error'); }
  }, 150);
}).observe($('score-view'));

let navigationRevision=0, wheelTimer:ReturnType<typeof setTimeout>|undefined, wheelResume=false;
function stopWheel() {
  clearTimeout(wheelTimer);wheelTimer=undefined;wheelResume=false;
}
async function jumpToSource(id:string) {
  if(!score || busy)return;
  const time=sourceTime(score,id,player.position);if(time===undefined)return;
  stopWheel();const navigation=++navigationRevision, token=revision;
  const ready=player.ready();player.pause();
  try {
    await player.seek(time);await ready;
    if(navigation!==navigationRevision || token!==revision)return;
    await player.play();updateButtons();
  } catch(error){if(token===revision && navigation===navigationRevision){notice(String(error),'error');updateButtons();}}
}
pdfView.onNoteSelect=id=>void jumpToSource(id);
$('score-view').addEventListener('click',e=>{
  const head=(e.target as Element).closest<HTMLElement>('.seek-note[data-source]');
  if(head?.dataset.source)void jumpToSource(head.dataset.source);
});
$('score-view').addEventListener('keydown',e=>{
  const head=(e.target as Element).closest<HTMLElement>('.seek-note[data-source]');
  if(head?.dataset.source && ['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();void jumpToSource(head.dataset.source);}
});
$('waterfall').addEventListener('wheel',e=>{
  if(!score || busy || e.ctrlKey || !e.deltaY)return;
  e.preventDefault();++navigationRevision;
  if(wheelTimer===undefined){wheelResume=player.playing;player.pause();}
  clearTimeout(wheelTimer);
  void player.seek(player.position+wheelSeconds(e.deltaY,e.deltaMode,$('waterfall').clientHeight)*referenceRatio());
  updateButtons();
  const token=revision,navigation=navigationRevision;
  wheelTimer=setTimeout(()=>{
    const resume=wheelResume;stopWheel();
    if(token===revision && navigation===navigationRevision && resume && score && player.position<score.duration-1e-6)void player.play().then(updateButtons).catch(error=>notice(String(error),'error'));
  },160);
},{passive:false});

async function seek(position: number) {
  ++navigationRevision;stopWheel();
  if (!score || busy) return;
  await player.seek(position); updateButtons();
}
function switchTab(original: boolean) {
  staffFollowKey = '';
  $('score-view').hidden = original; $('pdf-view').hidden = !original;
  $('original-tab').classList.toggle('selected', original); $('score-tab').classList.toggle('selected', !original);
  if (original) void pdfView.showPage(pdfView.page, true);
}
async function recognizedScore(result: { name: string; url: string; mapping?: string }, token: number) {
  const response = await fetch(result.url);
  if (!response.ok) throw new Error('无法读取识别结果。');
  const buffer = await response.arrayBuffer();
  const xml = result.name.endsWith('.mxl') ? extractMusicXML(buffer) : new TextDecoder().decode(buffer);
  const parsed = musicXMLToScore(xml, recognizedFilename);
  noteMapping = null;
  if (result.mapping) {
    try {
      const response = await fetch(result.mapping);
      if (response.ok) noteMapping = await response.json();
    } catch {}
  }
  if (token !== revision) return;
  if (noteMapping) parsed.warnings.push(`原 PDF 音符定位覆盖 ${noteMapping.mapped}/${noteMapping.total} 个导出音符；未匹配的音符不猜测位置。位置来源明确不代表音高识别正确。`);
  parsed.title = recognizedFilename.replace(/\.[^.]+$/, '');
  parsed.warnings.unshift('PDF 自动识别可能包含错音、漏音或节奏偏差。');
  await setScore(parsed, token, 'PDF / LOCAL OMR');
}

async function recognize(file: File, token: number) {
  notice(''); recognition(0, '读取 PDF');
  const response = await fetch('/api/recognize', { method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-SheetVis': 'local', 'X-SheetVis-Filename':encodeURIComponent(file.name) }, body: file });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'PDF 识别服务不可用。');
  if (token !== revision) return;
  currentJob={id:data.id,state:'queued',results:[]};readSummary('等待本地识别');
  const log = $<HTMLAnchorElement>('log'); log.href = `/api/jobs/${data.id}/engine.log`; log.hidden = false;
  const started = Date.now();
  while (token === revision && Date.now() - started < 7_800_000) {
    const statusResponse = await fetch(`/api/jobs/${data.id}`);
    if (!statusResponse.ok) throw new Error('无法查询识别任务。');
    const job = await statusResponse.json();
    if (token !== revision) return;
    currentJob = job;
    readSummary(job.message ?? job.state, job);
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
    $('recognition-detail').textContent=[job.current_page ? `第 ${job.current_page} 页` : '',job.current_system ? `系统 ${job.current_system}` : '',job.current_measure ? `小节 ID ${job.current_measure}` : '',job.stage ?? ''].filter(Boolean).join(' · ');
    if (job.state==='cancelled') {
      recognition(job.progress ?? 0,'已中断');readSummary(job.message ?? '识别已中断',job);
      notice('识别已中断，可从乐谱缓存继续处理。');return;
    }
    if (job.state === 'error') throw new Error(job.message);
    if (job.state === 'done') {
      await showRecognition(job, file.name, token);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 1200));
  }
  if (token === revision) throw new Error('识别等待超时，请拆分 PDF 后重试。');
}

async function showRecognition(job: RecognitionJob, filename: string, token: number) {
  currentJob = job;
  if (!job.octave_audit) {
    void fetch(`/api/jobs/${job.id}/octave-audit.json`).then(async response=>{
      if(!response.ok)return;
      const audit=await response.json();if(token!==revision)return;
      job.octave_audit=audit;if(score)reflect(score);
    }).catch(()=>{});
  }
  const log = $<HTMLAnchorElement>('log'); log.href = `/api/jobs/${job.id}/engine.log`; log.hidden = false;
  readSummary(job.message ?? job.state, job);
  recognitionResults = job.results; recognizedFilename = filename; recognitionRevision = token;
  const select = $<HTMLSelectElement>('movement');
  select.replaceChildren(...recognitionResults.map((r, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = `乐章 ${i + 1}`; return o; }));
  select.hidden = recognitionResults.length <= 1;
  await recognizedScore(recognitionResults[0], token);
  if (token === revision) {
    recognition(100, '完成'); notice('');
    if (pdfUrl && job.included_pages?.length) void pdfView.showPage(job.included_pages[0]);
  }
}

async function loadFile(file: File, startup = false, cached?: RecognitionJob) {
  const token = ++revision;
  ++navigationRevision;stopWheel();
  player.pause(); busy = true; updateButtons();
  score = null; waterfall.score = null; display?.clear(); display = null; $('score-view').replaceChildren();
  readFilename = file.name; readBytes = file.size; currentJob = undefined;
  $('piece-title').textContent = file.name; $('piece-meta').textContent = '';
  $('quality-report').hidden = true; $('feedback-open').hidden = true; $('audio-status').textContent = '';
  readSummary('已读入');
  $('recognition').hidden = true;
  $('log').hidden = true; $('movement').hidden = true; recognitionResults = [];
  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  pdfUrl = null; pdfView.clear(); noteMapping = null; $('original-tab').hidden = true; switchTab(false);
  // Unlock audio while this file selection / drop is still a user gesture.
  const allowAudio = !startup || navigator.userActivation?.hasBeenActive;
  const sound = allowAudio && $<HTMLInputElement>('autoplay').checked ? player.ready().catch(() => {}) : Promise.resolve();
  try {
    if (file.size > 40 * 1024 * 1024) throw new Error('文件必须小于 40 MB。');
    const extension = file.name.split('.').at(-1)?.toLowerCase();
    notice('');
    if (extension === 'pdf') {
      pdfUrl = URL.createObjectURL(file); $('original-tab').hidden = false; switchTab(true);
      await pdfView.load(await file.arrayBuffer());
      if (token !== revision) return;
      if (cached) await showRecognition(cached, file.name, token);
      else await recognize(file, token);
    } else {
      const buffer = await file.arrayBuffer();
      if (token !== revision) return;
      const parsed = ['mid', 'midi'].includes(extension ?? '') ? midiToScore(buffer, file.name) : musicXMLToScore(extension === 'mxl' ? extractMusicXML(buffer) : new TextDecoder().decode(buffer), file.name);
      await setScore(parsed, token, ['mid', 'midi'].includes(extension ?? '') ? 'MIDI / LOCAL FILE' : 'MUSICXML / LOCAL FILE');
      if (token === revision) notice('');
    }
    await sound;
    if (token === revision && $<HTMLInputElement>('autoplay').checked) {
      if (allowAudio) await togglePlay();
      else $('audio-status').textContent = '音频待启用';
    }
  } catch (error) {
    if (token === revision) { notice(error instanceof Error ? error.message : String(error), 'error'); readSummary('读取／识别失败'); }
  } finally { if (token === revision) { busy = false; updateButtons(); } }
}

async function refreshDefault() {
  const response=await fetch('/api/config');if(!response.ok)throw new Error('无法更新默认乐谱设置');
  configuredDefault=(await response.json()).default_score;
  $('default-score').hidden=!configuredDefault;
}
async function openCached(id:string,filename:string,startup=false) {
  const token=++revision; ++navigationRevision;stopWheel();player.pause();busy=true;updateButtons();
  if(!startup)void player.ready().catch(()=>{});
  try {
    const [source,status]=await Promise.all([fetch(`/api/jobs/${id}/score.pdf`),fetch(`/api/jobs/${id}`)]);
    if(token!==revision)return;
    if(!source.ok||!status.ok)throw new Error('缓存文件已不存在。');
    const job=await status.json() as RecognitionJob, data=await source.blob();
    if(token!==revision)return;
    if(job.state!=='done' && !['cancelled','error'].includes(job.state))throw new Error('此缓存仍在识别中。');
    await loadFile(new File([data],filename,{type:'application/pdf'}),startup,job.state==='done' && !job.upgrade_available ? job : undefined);
  }catch(error){if(token===revision)notice(String(error),'error');}
  finally{if(token===revision){busy=false;updateButtons();}}
}
let cacheTimer:ReturnType<typeof setTimeout>|undefined;

type CacheEntry = {is_default?:boolean;id:string; filename:string; state:string; created:number; bytes:number; pages?:number; results:number};
async function refreshCache() {
  clearTimeout(cacheTimer);
  $('cache-status').textContent = '读取中';
  try {
    const response = await fetch('/api/cache');
    if (!response.ok) throw new Error(response.status === 404 ? '缓存管理需要重启本地服务。' : '缓存读取失败');
    const {entries} = await response.json() as {entries:CacheEntry[]};
    $('cache-list').replaceChildren(...entries.map(entry => {
      const row=document.createElement('li'), name=document.createElement('span'), meta=document.createElement('small');
      name.textContent=entry.filename;
      const states:Record<string,string>={done:'已完成',error:'未完成',queued:'排队',running:'识别中',cancelling:'正在中断',cancelled:'已中断'};
      meta.textContent=`${states[entry.state] ?? entry.state} · ${(entry.bytes/1048576).toFixed(1)} MB${entry.pages ? ` · ${entry.pages} 页` : ''} · ${new Date(entry.created*1000).toLocaleString()}`;
      const open=document.createElement('button');open.textContent=['cancelled','error'].includes(entry.state) ? '继续识别' : '打开';open.disabled=!['done','cancelled','error'].includes(entry.state);
      open.addEventListener('click',async()=>{
        $<HTMLDialogElement>('cache-dialog').close();await openCached(entry.id,entry.filename);
      });
      const setDefault=document.createElement('button');setDefault.textContent=entry.is_default ? '默认' : '设为默认';
      setDefault.disabled=entry.state!=='done'||!!entry.is_default;
      setDefault.addEventListener('click',async()=>{
        setDefault.disabled=true;
        try {
          const response=await fetch(`/api/cache/${entry.id}/default`,{method:'POST',headers:{'X-SheetVis':'local'}});
          const result=await response.json();if(!response.ok)throw new Error(result.error ?? '设置失败');
          await refreshDefault();await refreshCache();
        }catch(error){$('cache-status').textContent=String(error);setDefault.disabled=false;}
      });
      const cancel=document.createElement('button');cancel.textContent=entry.state==='cancelling' ? '正在中断…' : '中断识别';
      cancel.disabled=entry.state==='cancelling';cancel.setAttribute('aria-label',`中断识别 ${entry.filename}`);
      cancel.addEventListener('click',async()=>{
        cancel.disabled=true;
        try {await cancelJob(entry.id);await refreshCache();}
        catch(error){$('cache-status').textContent=String(error);cancel.disabled=false;}
      });
      const remove=document.createElement('button');remove.textContent='删除';remove.setAttribute('aria-label',`删除 ${entry.filename}`);
      remove.disabled=['running','queued','cancelling'].includes(entry.state);
      remove.addEventListener('click',async()=>{
        remove.disabled=true;
        try {
          const response=await fetch(`/api/cache/${entry.id}`,{method:'DELETE',headers:{'X-SheetVis':'local'}});
          const result=await response.json();if (!response.ok) throw new Error(result.error ?? '删除失败');
          await refreshDefault();await refreshCache();
        } catch(error) {$('cache-status').textContent=String(error);remove.disabled=false;}
      });
      const project=document.createElement('a');project.textContent='OMR 工程';project.href=`/api/jobs/${entry.id}/project.omr`;project.download=`${entry.filename.replace(/\.pdf$/i,'')}.omr`;
      const training=document.createElement('a');training.textContent='八度训练包';training.href=`/api/jobs/${entry.id}/octave-training.zip`;training.download=`${entry.filename.replace(/\.pdf$/i,'')}-octaves.zip`;
      row.append(name,meta,open,setDefault,remove);if(['queued','running','cancelling'].includes(entry.state))row.append(cancel);if(entry.state==='done') row.append(project,training);return row;
    }));
    if(entries.some(e=>e.state==='cancelling'))cacheTimer=setTimeout(()=>{if($<HTMLDialogElement>('cache-dialog').open)void refreshCache();},1200);
    $('cache-status').textContent=entries.length ? `${entries.length} 份 · ${(entries.reduce((sum,e)=>sum+e.bytes,0)/1048576).toFixed(1)} MB` : '暂无缓存';
  } catch(error) {$('cache-status').textContent=String(error);}
}
$('cache-open').addEventListener('click',()=>{$<HTMLDialogElement>('cache-dialog').showModal();void refreshCache();});
$('cache-refresh').addEventListener('click',()=>void refreshCache());
$('cache-close').addEventListener('click',()=>$<HTMLDialogElement>('cache-dialog').close());
$('cache-dialog').addEventListener('close',()=>clearTimeout(cacheTimer));
$('cache-dialog').addEventListener('keydown',e=>e.stopPropagation());

async function loadDemo() {
  const token = ++revision; ++navigationRevision;stopWheel();player.pause(); busy = true; updateButtons();
  currentJob = undefined; readFilename = 'demo.musicxml'; readBytes = 0; $('audio-status').textContent = '';
  $('recognition').hidden = true;
  if (pdfUrl) URL.revokeObjectURL(pdfUrl); pdfUrl = null;
  pdfView.clear(); noteMapping = null; $('original-tab').hidden = true; $('log').hidden = true; $('movement').hidden = true; switchTab(false);
  try {
    const response = await fetch('/demo.musicxml');
    const text = await response.text();
    if (token !== revision) return;
    readBytes = new TextEncoder().encode(text).length;
    await setScore(musicXMLToScore(text, '小练习 · C 大调'), token, 'DEMO / ORIGINAL EXERCISE');
    if (token === revision) notice('');
  } catch (e) { if (token === revision) notice(String(e), 'error'); }
  finally { if (token === revision) { busy = false; updateButtons(); } }
}

async function loadDefault(startup = false) {
  if (!configuredDefault) return;
  if(configuredDefault.job_id){await openCached(configuredDefault.job_id,configuredDefault.name,startup);return;}
  const token = ++revision;
  ++navigationRevision;stopWheel();
  player.pause(); busy = true; updateButtons();
  readFilename = configuredDefault.name; readBytes = 0; currentJob = undefined;
  $('quality-report').hidden = true; $('feedback-open').hidden = true; readSummary('读取默认文件');
  try {
    const response = await fetch(configuredDefault.url);
    if (!response.ok) { const error = await response.json(); throw new Error(error.error ?? '无法读取默认乐谱。'); }
    const buffer = await response.arrayBuffer();
    if (token !== revision) return;
    await loadFile(new File([buffer], configuredDefault.name, { type: 'application/pdf' }), startup);
  } catch (error) {
    if (token === revision) { notice(error instanceof Error ? error.message : String(error), 'error'); readSummary('读取失败'); busy = false; updateButtons(); }
  }
}

$('import').addEventListener('click', () => $<HTMLInputElement>('file').click());
$('file').addEventListener('change', e => { const input = e.target as HTMLInputElement; const file = input.files?.[0]; input.value = ''; if (file) void loadFile(file); });
$('demo').addEventListener('click', () => void loadDemo());
$('default-score').addEventListener('click', () => void loadDefault());
$('play').addEventListener('click', () => void togglePlay());
$('transport-play').addEventListener('click', () => void togglePlay());
$('rewind').addEventListener('click', () => void seek(player.position - 5 * referenceRatio()));
$('forward').addEventListener('click', () => void seek(player.position + 5 * referenceRatio()));
$('reset').addEventListener('click', () => void seek(0));
$('progress').addEventListener('input', e => void seek(Number((e.target as HTMLInputElement).value)));
let scrubbing = false, resumeAfterScrub = false;
$('progress').addEventListener('pointerdown', () => {
  if (!score || busy) return;
  scrubbing = true; resumeAfterScrub = player.playing; player.pause(); updateButtons();
});
async function endScrub() {
  if (!scrubbing) return;
  await seek(Number($<HTMLInputElement>('progress').value)); scrubbing = false;
  const resume = resumeAfterScrub; resumeAfterScrub = false;
  if (resume && !player.playing) await togglePlay();
}
window.addEventListener('pointerup', () => void endScrub());
window.addEventListener('pointercancel', () => void endScrub());
$('speed').addEventListener('input', e => { const speed = Number((e.target as HTMLInputElement).value) / 100; $('speed-value').textContent = `${speed.toFixed(2)}×`; void applySpeed(); });
$('bpm').addEventListener('change', e => {
  const input = e.target as HTMLInputElement;
  referenceBpm = Math.max(20, Math.min(300, Number(input.value) || score?.bpm || 120));
  input.value = String(referenceBpm); updateMeta(); void applySpeed();
});
$('volume').addEventListener('input', e => player.setVolume(Number((e.target as HTMLInputElement).value) / 100));
for (const hand of ['left', 'right'] as const) $(`${hand}-hand`).addEventListener('change', e => void player.setHand(hand, (e.target as HTMLInputElement).checked));
$('lookahead').addEventListener('change', e => { waterfall.lookAhead = Number((e.target as HTMLSelectElement).value); });
$('score-tab').addEventListener('click', async () => {
  if (score?.xml && pdfUrl && !display && !busy) {
    const current = score, token = revision;
    busy = true; updateButtons();
    const target = document.createElement('div'); $('score-view').replaceChildren(target);
    switchTab(false);
    const renderer = new OpenSheetMusicDisplay(target, {autoResize:false, backend:'svg', drawTitle:false, drawComposer:false, darkMode:true});
    try {
      const xml = parseXML(current.xml!);
      if (!xml.querySelector('repeat[direction="backward"]')) xml.querySelectorAll('ending').forEach(e=>e.remove());
      try {
        await renderer.load(xml);
        if (token !== revision) { renderer.clear(); return; }
        renderer.render();
      } catch (error) {
        if (!xml.querySelector('octave-shift')) throw error;
        renderer.clear();
        xml.querySelectorAll('octave-shift').forEach(e=>e.remove());
        await renderer.load(xml);
        if (token !== revision) { renderer.clear(); return; }
        renderer.render();
        const warning='重建预览的八度线排版失败，预览暂省略八度线；原 PDF、播放音高与下载保留。';
        if (!current.warnings.includes(warning)) current.warnings.push(warning);
        showWarnings(current.warnings); reflect(current);
      }
      if (token !== revision) { renderer.clear(); return; }
      display = renderer; bindStaffNotes(renderer,current,staffPositions);
    } catch { if (token === revision) $('score-view').textContent = '五线谱预览失败'; renderer.clear(); }
    finally { if (token === revision) {busy=false;updateButtons();} }
  } else switchTab(false);
});
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
  if (e.key === 'Escape' && zen) { e.preventDefault(); setZen(false); return; }
  if (e.key === 'Escape' && !$('toolbar').hidden) { e.preventDefault(); toolbar(false, true); return; }
  if (e.key === 'Tab' && zen) { e.preventDefault(); return; }
  if (e.key === 'Tab' && $('toolbar').hidden && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); toolbar(true, true); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space' && !(e.target as HTMLElement).matches('input:not([type="range"]), select, textarea, [contenteditable="true"]')) {
    e.preventDefault(); if (!e.repeat) {
      if (scrubbing) {resumeAfterScrub=false;player.pause();updateButtons();}
      else void togglePlay();
    } return;
  }
  if ((e.target as HTMLElement).matches('input, select, textarea, button')) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); void seek(player.position - 5 * referenceRatio()); }
  if (e.key === 'ArrowRight') { e.preventDefault(); void seek(player.position + 5 * referenceRatio()); }
  if (e.key === 'Home') { e.preventDefault(); void seek(0); }
  if (e.key.toLowerCase() === 'z') { e.preventDefault(); setZen(!zen); }
});
for (const event of ['dragenter', 'dragover']) $('drop-zone').addEventListener(event, e => { e.preventDefault(); $('drop-zone').classList.add('dragging'); });
$('drop-zone').addEventListener('dragleave', () => $('drop-zone').classList.remove('dragging'));
$('drop-zone').addEventListener('drop', e => { e.preventDefault(); $('drop-zone').classList.remove('dragging'); const file = (e as DragEvent).dataTransfer?.files[0]; if (file) void loadFile(file); });

let lastCursorUpdate = 0;
function frame(now: number) {
  const position = player.position;
  waterfall.draw(position, player.hands, referenceRatio());
  $('time').textContent = `${formatTime(position / referenceRatio())} / ${formatTime((score?.duration ?? 0) / referenceRatio())}`;
  if (!scrubbing) $<HTMLInputElement>('progress').value = String(position);
  $('seek-time').textContent = $('time').textContent;
  if (pdfUrl && !$('pdf-view').hidden && !zen) pdfView.update(position, player.hands, player.playing);
  if (score) {
    const index = Math.max(0, score.measures.findLastIndex(m => m.start <= position));
    if (index !== currentMeasure) {
      $('measure-list').querySelector('[aria-current]')?.removeAttribute('aria-current');
      $('measure-list').children[index]?.setAttribute('aria-current', 'true');
      currentMeasure = index;
    }
    if (display && !$('score-view').hidden && !zen && now - lastCursorUpdate > 50) {
      const target = currentStaffAnchor(score, staffPositions, position, player.hands);
      const key = target ? `${target.measure}:${target.beat}` : 'rest';
      if (staffFollowDisplay !== display || staffFollowKey !== key) {
        followStaff(display.cursor, target, $('score-view'));
        staffFollowDisplay = display; staffFollowKey = key;
      }
      lastCursorUpdate = now;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
async function initialize() {
  const token = revision;
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error('无法读取本地配置。');
    const config = await response.json();
    if (config.recognition) {
      $<HTMLInputElement>('recognition-threads').value=String(config.recognition.threads);
      $<HTMLInputElement>('recognition-threads').max=String(Math.min(64,config.recognition.available_cpus));
      $<HTMLInputElement>('recognition-memory').value=String(config.recognition.memory_mb);
      $('recognition-resource-status').textContent=`可用 ${config.recognition.available_cpus} 核 · 自动最多 8 核`;
    }
    configuredColors = { ...defaultColors, ...validColors(config.colors) };
    let saved = {};
    try { saved = validColors(JSON.parse(localStorage.getItem('sheetvis.colors') ?? '{}')); } catch {}
    applyColors({ ...configuredColors, ...saved });
    configuredDefault = config.default_score;
    $('default-score').hidden = !configuredDefault;
    if (token !== revision) return;
    if (configuredDefault && !new URLSearchParams(location.search).has('demo')) await loadDefault(true);
    else await loadDemo();
  } catch (error) { if (token === revision) notice(String(error), 'error'); }
}
void initialize();
fetch('/api/health').then(r => r.json()).then(h => {
  $('engine-status').textContent = h.omr && h.samples ? 'OMR · 就绪' : '资源缺失';
  $('engine-status').classList.toggle('ready', h.omr && h.samples);
}).catch(() => { $('engine-status').textContent = 'OMR · 离线'; });

import { loadScore, lowerBound, buildSteps, stepIndexAtOrAfter, measureAtTime, selectionOf } from './score.js';
import { RHYTHMS, rhythmOf } from './rhythm.js';
import { Waterfall } from './waterfall.js';
import { PdfView } from './pdfview.js';
import { Synth } from './synth.js';
import { rangeFor, noteName } from './piano.js';
import { Ear, calibrationScale } from './mic.js';
import { activePatterns } from './patterns.js';

const $ = id => document.getElementById(id);
const DEFAULTS = { colR: '#ff8a3d', colL: '#2fc9b0', kb: 130, zoom: 110, tempos: {}, range: 'fit', strict: '0.75', pages: 'coda', patterns: 'on' };
const store = {
  get() { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('ballade4.settings') || '{}') }; } catch { return { ...DEFAULTS }; } },
  set(o) { try { localStorage.setItem('ballade4.settings', JSON.stringify(o)); } catch { /* private mode */ } },
};

const S = {
  cfg: store.get(), mode: 'display', hands: new Set(['R', 'L']), playing: false, bpm: 84, t: 0,
  steps: [], idx: 0, satisfied: new Set(), stepStart: 0, anim: null, scheduled: 0, lastSig: '',
  sel: null, selAnchor: null,    // selected measures ({ set, blocks }) are looped; anchor = last clicked measure
};

/* ---------- which piece ---------- */
const pieces = await (await fetch('data/pieces.json')).json();
const lastPiece = (() => { try { return localStorage.getItem('balldeIV.piece'); } catch { return null; } })();
const piece = pieces.find(p => p.id === new URLSearchParams(location.search).get('piece'))
  || pieces.find(p => p.id === lastPiece) || pieces[0];
for (const p of pieces) $('selPiece').append(new Option(p.title, p.id));
$('selPiece').value = piece.id;
$('brandSub').textContent = piece.composer;
document.title = `${piece.title} · Piano Waterfall`;
$('selPiece').onchange = e => {
  try { localStorage.setItem('balldeIV.piece', e.target.value); } catch { /* private mode */ }
  location.search = '?piece=' + encodeURIComponent(e.target.value);
};
const score = await loadScore(piece.data);
const defaultTempo = piece.tempo ?? score.meta.defaultTempo ?? 84;
S.cfg.tempos ??= {};
S.bpm = S.cfg.tempos[piece.id] ?? (piece.id === 'ballade4-coda' ? S.cfg.tempo : undefined) ?? defaultTempo;
const cv = $('cv');
const wf = new Waterfall(cv, score);
const synth = new Synth();
synth.load();                      // fetch + decode the piano samples while the user looks around
const ear = new Ear();
let pdf = null;

function buildPdf() {
  pdf = new PdfView($('pages'), score, S.cfg.pages === 'all' ? 0 : (piece.sheetFrom ?? 0));
  pdf.setColors({ R: S.cfg.colR, L: S.cfg.colL });
  pdf.onPick = pickMeasure;
  pdf.onDrag = (a, b) => pdf.preview(new Set(measureRange(a, b)));
  if (S.sel) pdf.setSelection(S.sel.set, selNotes());
  S.lastSig = '';
}

/* ---------- settings ---------- */
function applyCfg() {
  const c = S.cfg;
  wf.colors = { R: c.colR, L: c.colL };
  wf.patterns = c.patterns !== 'off';
  pdf?.setPatterns(wf.patterns);
  wf.kbHeight = +c.kb;
  wf.pxPerBeat = +c.zoom;
  const [lo, hi] = c.range === 'full' ? [21, 108] : rangeFor(score.minMidi, score.maxMidi);
  wf.setRange(lo, hi);
  pdf?.setColors({ R: c.colR, L: c.colL });
  document.documentElement.style.setProperty('--rh', c.colR);
  document.documentElement.style.setProperty('--lh', c.colL);
  $('colR').value = c.colR; $('colL').value = c.colL;
  $('rngKb').value = c.kb; $('outKb').value = c.kb;
  $('rngZoom').value = c.zoom; $('outZoom').value = c.zoom;
  $('selRange').value = c.range; $('selStrict').value = c.strict; $('selPat').value = c.patterns; $('selPages').value = c.pages;
  S.lastSig = '';
}
const upd = (k, v) => { S.cfg[k] = v; store.set(S.cfg); applyCfg(); };
$('colR').oninput = e => upd('colR', e.target.value);
$('colL').oninput = e => upd('colL', e.target.value);
$('rngKb').oninput = e => upd('kb', +e.target.value);
$('rngZoom').oninput = e => upd('zoom', +e.target.value);
$('selRange').onchange = e => upd('range', e.target.value);
$('selStrict').onchange = e => upd('strict', e.target.value);
$('selPat').onchange = e => { upd('patterns', e.target.value); S.lastSig = ''; };
$('selPages').onchange = e => { upd('pages', e.target.value); buildPdf(); };
$('btnReset').onclick = () => { S.cfg = { ...DEFAULTS, tempos: {} }; store.set(S.cfg); buildPdf(); applyCfg(); setTempo(defaultTempo); };
$('btnSettings').onclick = () => { const s = $('settings'); s.hidden = !s.hidden; layout(); };

/* ---------- layout ---------- */
function layout() {
  document.documentElement.style.setProperty('--hdr', ($('bar').offsetHeight + ($('settings').hidden ? 0 : $('settings').offsetHeight)) + 'px');
  wf.resize();
}
new ResizeObserver(layout).observe($('stage'));
addEventListener('resize', layout);
{ // draggable splitter
  const g = $('gutter');
  let drag = false;
  const move = x => {
    const r = $('split').getBoundingClientRect();
    const pct = Math.max(22, Math.min(70, ((x - r.left) / r.width) * 100));
    document.documentElement.style.setProperty('--sheetW', pct + '%');
  };
  g.addEventListener('pointerdown', e => { drag = true; g.setPointerCapture(e.pointerId); });
  g.addEventListener('pointermove', e => { if (drag) move(e.clientX); });
  g.addEventListener('pointerup', () => { drag = false; layout(); });
  g.addEventListener('keydown', e => {
    const cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sheetW')) || 46;
    if (e.key === 'ArrowLeft') move(($('split').getBoundingClientRect().width * (cur - 3)) / 100);
    if (e.key === 'ArrowRight') move(($('split').getBoundingClientRect().width * (cur + 3)) / 100);
  });
}

/* ---------- measures / tempo ---------- */
for (const m of score.measures) $('selMeasure').append(new Option(m.label, m.n));
const measureStart = n => score.measureByNumber.get(n).start;
function setTempo(v) { S.bpm = +v; $('rngTempo').value = v; $('outTempo').value = v; S.cfg.tempos[piece.id] = +v; store.set(S.cfg); }
$('rngTempo').oninput = e => setTempo(e.target.value);

/* ---------- clicking measures on the sheet: jump, select, loop ---------- */
const mIndex = new Map(score.measures.map((m, i) => [m.n, i]));
function measureRange(a, b) {
  const [i, j] = [mIndex.get(a), mIndex.get(b)].sort((x, y) => x - y);
  return score.measures.slice(i, j + 1).map(m => m.n);
}
const selNotes = () => (S.sel ? score.notes.filter(n => S.sel.set.has(n.measure)) : []);
function pickMeasure({ a, b, shift, ctrl }) {
  pdf.preview(null);
  if (a !== b) { setSelection(new Set(measureRange(a, b))); S.selAnchor = a; return; }        // dragged across measures
  if (shift) { setSelection(new Set(measureRange(S.selAnchor ?? measureAtTime(score, S.t).n, b))); return; }
  if (ctrl) {
    const set = new Set(S.sel ? S.sel.set : []);
    if (set.has(b)) set.delete(b); else set.add(b);
    S.selAnchor = b;
    setSelection(set);
    return;
  }
  S.selAnchor = b;                                            // plain click: go to that measure
  if (S.sel && !S.sel.set.has(b)) clearSelection();
  seek(measureStart(b) - (S.playing ? 0 : 0.4));
  if (S.mode === 'display') $('selMeasure').value = b;       // the lead-in beat lies in the bar before
}
function setSelection(set) {
  S.sel = selectionOf(score, set);
  if (!S.sel) { clearSelection(); return; }
  wf.sel = S.sel;
  pdf.setSelection(S.sel.set, selNotes());
  showSelBar();
  const inside = S.sel.blocks.some(b => S.t >= b.t0 - 0.5 && S.t < b.t1);
  if (!inside) seek(S.sel.blocks[0].t0 - (S.playing ? 0 : 0.4));
  else if (S.mode === 'learn') { S.idx = selStep(S.idx, 1, true); beginStep(true); }
  S.lastSig = '';
}
function clearSelection() {
  S.sel = null; wf.sel = null;
  pdf.setSelection(null); pdf.preview(null);
  $('selBar').hidden = true;
  S.lastSig = '';
}
function showSelBar() {
  const labels = S.sel.blocks.map(b => (b.first === b.last ? `m.${b.first.label}` : `m.${b.first.n}–${b.last.n2 ?? b.last.n}`));
  const count = new Map();
  for (const n of selNotes()) if (S.hands.has(n.hand)) { const r = rhythmOf(n); count.set(r, (count.get(r) || 0) + 1); }
  const keys = RHYTHMS.filter(r => count.has(r))
    .map(r => `<span class="rk${r.key === 'grace' ? ' grace' : ''}" style="--c:${r.color}"><i></i>${r.label}</span>`).join('');
  const bar = $('selBar');
  bar.innerHTML = `<b>🔁 Loop ${labels.join(', ')}</b>${keys}<button id="btnSelClear" title="Stop looping (Esc)">Esc ✕</button>`;
  bar.classList.toggle('learn', S.mode === 'learn');
  bar.hidden = false;
  $('btnSelClear').onclick = clearSelection;
}
/** in a selection: the block holding beat t (with a little lead-in before it), or null */
const blockAt = t => S.sel && S.sel.blocks.find(b => t >= b.t0 - 0.5 && t < b.t1);
/** the next block to play after beat t, wrapping round to the first */
const nextBlock = t => S.sel.blocks.find(b => b.t0 > t + 1e-6) || S.sel.blocks[0];
/** step index from i in direction d that lies in the selection (wrapping round); `here` accepts i itself */
function selStep(i, d, here = false) {
  if (!S.sel || !S.steps.length) return i;
  const n = S.steps.length;
  for (let k = here ? 0 : 1; k <= n; k++) {
    const j = ((i + d * k) % n + n) % n;
    if (S.sel.set.has(S.steps[j].measure)) return j;
  }
  return i;
}

/* ---------- transport ---------- */
function seek(t) {
  synth.silence();
  S.t = t; S.scheduled = lowerBound(score.notes, t - 1e-6); S.lastSig = '';
  if (S.mode === 'learn') { S.idx = stepIndexAtOrAfter(S.steps, t); beginStep(true); }
  $('selMeasure').value = measureAtTime(score, t).n;
}
function play(on) {
  S.playing = on && S.mode === 'display';
  $('btnPlay').textContent = S.playing ? '⏸' : '▶';
  if (S.playing) {
    synth.resume();
    if (synth.enabled && !synth.loaded && !synth.failed) toast('Loading piano sounds…', 2500);
    S.scheduled = lowerBound(score.notes, S.t - 1e-6);
  } else synth.silence();
}
$('btnPlay').onclick = () => (S.mode === 'display' ? play(!S.playing) : skip(1));
$('btnRestart').onclick = () => { play(false); seek(measureStart(+$('selMeasure').value) - 0.4); };
$('selMeasure').onchange = e => {
  play(false);
  if (S.sel && !S.sel.set.has(+e.target.value)) clearSelection();
  seek(measureStart(+e.target.value) - 0.4);
};
$('btnSound').onclick = e => { synth.enabled = !synth.enabled; if (!synth.enabled) synth.silence(); e.currentTarget.classList.toggle('on', synth.enabled); e.currentTarget.textContent = synth.enabled ? '🔊' : '🔇'; };

function segment(id, cb) {
  const el = $(id);
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    for (const x of el.children) { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }
    cb(b.dataset.v);
  });
}
segment('handSeg', v => {
  S.hands = new Set(v === 'B' ? ['R', 'L'] : [v]);
  wf.hands = S.hands;
  S.steps = buildSteps(score, S.hands);
  if (S.mode === 'learn') { S.idx = selStep(stepIndexAtOrAfter(S.steps, S.t), 1, true); beginStep(true); }
  if (S.sel) showSelBar();
  S.lastSig = '';
});
segment('modeSeg', setMode);

function setMode(m) {
  S.mode = m;
  wf.learn = m === 'learn';
  $('learnHud').hidden = m !== 'learn';
  play(false);
  if (m === 'learn') {
    S.steps = buildSteps(score, S.hands);
    S.idx = selStep(stepIndexAtOrAfter(S.steps, S.t), 1, true);
    beginStep(true);
    if (!ear.running) toast('Learn mode: press the 🎤 button to enable the microphone (Calibrate first for best accuracy). ← / → skip steps.');
  } else {
    wf.targets = new Set(); wf.heard = new Set();
    sendExpect();
  }
  if (S.sel) showSelBar();
  S.lastSig = '';
}

/* ---------- learn mode ---------- */
function beginStep(jump) {
  const st = S.steps[S.idx];
  if (!st) return;
  S.satisfied = new Set();
  S.stepStart = performance.now();
  sendExpect();
  wf.targets = new Set(st.notes.map(n => n.id));
  const dur = jump ? 0 : Math.min(420, Math.max(110, (st.t - S.t) * 260));
  S.anim = dur ? { from: S.t, to: st.t, t0: performance.now(), dur } : null;
  if (!dur) S.t = st.t;
  $('selMeasure').value = st.notes[0].measure;
  const names = [...new Set(st.notes.map(n => n.midi))].sort((a, b) => a - b).map(noteName).join('  ');
  $('wantNotes').textContent = names;
  $('wantMeasure').textContent = `measure ${st.notes[0].measure} · step ${S.idx + 1} / ${S.steps.length}`;
  $('meterFill').style.width = '0%';
  S.lastSig = '';
}
function sendExpect() {
  const st = S.steps[S.idx];
  ear.expect(S.mode === 'learn' && st ? [...new Set(st.notes.filter(n => S.hands.has(n.hand)).map(n => n.midi))] : []);
}
function need(st) {
  const f = +S.cfg.strict;
  const uniq = [...new Set(st.notes.map(n => n.midi))];
  return Math.max(1, Math.ceil(uniq.length * f - 1e-9));
}
function noteHeard(midi) {
  const st = S.steps[S.idx];
  if (!st || S.mode !== 'learn') return;
  const want = new Set(st.notes.map(n => n.midi));
  if (want.has(midi)) S.satisfied.add(midi);
  else { wf.wrong.set(midi, performance.now() + 450); }
  const total = want.size;
  $('meterFill').style.width = Math.min(100, (S.satisfied.size / total) * 100) + '%';
  if (S.satisfied.size >= need(st)) advance(1);
}
function advance(d) {
  if (S.sel) {                                                // a selection is practised round and round
    const ni = selStep(S.idx, d);
    if (d > 0 && ni <= S.idx) toast('Again from the start of the selection');
    S.idx = ni; beginStep(false); return;
  }
  const ni = Math.max(0, Math.min(S.steps.length - 1, S.idx + d));
  if (ni === S.idx && d > 0) { toast('End of the section — well done!'); return; }
  S.idx = ni; beginStep(false);
}
const skip = d => { if (S.mode === 'learn') advance(d); };
$('btnSkip').onclick = () => skip(1);
$('btnPrev').onclick = () => skip(-1);

/* ---------- microphone & calibration ---------- */
ear.onOnset = m => noteHeard(m);
ear.onHeard = set => { wf.heard = set; };
ear.onLevel = db => { $('calMeter').style.width = Math.max(0, Math.min(100, (db + 70) * 1.6)) + '%'; };
ear.onState = s => { $('micState').textContent = s; };
$('btnMic').onclick = async () => {
  if (ear.running) { ear.stop(); $('btnMic').classList.remove('on'); wf.heard = new Set(); return; }
  try { await ear.start(); sendExpect(); $('btnMic').classList.add('on'); toast(ear.profile ? 'Microphone on · calibrated piano profile loaded.' : 'Microphone on · calibrate for best accuracy.'); }
  catch (e) { toast('Microphone unavailable: ' + (e?.message || e)); }
};
function openCal() { $('calDlg').showModal(); renderScale(); }
$('btnCal').onclick = openCal;
$('calCancel').onclick = () => { ear.cancelCalibration(); };
function renderScale() {
  const scale = calibrationScale(+$('selScale').value);
  $('calKeys').innerHTML = scale.map(m => `<span data-m="${m}">${noteName(m)}</span>`).join('');
  return scale;
}
$('selScale').onchange = renderScale;
$('calStart').onclick = async e => {
  e.preventDefault();
  try { if (!ear.running) await ear.start(); sendExpect(); } catch (err) { $('calStatus').textContent = 'Microphone unavailable: ' + (err?.message || err); return; }
  $('btnMic').classList.add('on');
  const scale = renderScale();
  $('calStatus').textContent = 'Measuring room noise… stay quiet for a moment.';
  ear.calibrate(scale, {
    onProgress: (i, st, info) => {
      const spans = [...$('calKeys').children];
      spans.forEach((s, k) => { s.classList.toggle('cur', k === i && st !== 'done'); s.classList.toggle('done', k < i || (k === i && st === 'captured')); });
      if (st === 'waiting') $('calStatus').textContent = `Play ${noteName(scale[i])} (${i + 1} / ${scale.length})`;
      if (st === 'captured') $('calStatus').textContent = `Got ${noteName(scale[i])} · ${info.cents >= 0 ? '+' : ''}${info.cents.toFixed(0)} cents`;
    },
    onDone: p => {
      $('calStatus').textContent = `Calibrated ${p.count} notes · tuning ${p.tuning >= 0 ? '+' : ''}${p.tuning.toFixed(0)} cents. You can close this window.`;
      $('calKeys').querySelectorAll('span').forEach(s => s.classList.add('done'));
    },
  });
};

/* ---------- toast ---------- */
let toastT;
function toast(msg, ms = 5200) {
  const el = $('toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), ms);
}

/* ---------- keyboard shortcuts ---------- */
addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea, dialog')) return;
  if (e.key === 'Escape' && S.sel) { e.preventDefault(); clearSelection(); }
  else if (e.code === 'Space') { e.preventDefault(); $('btnPlay').click(); }
  else if (e.code === 'ArrowRight') skip(1);
  else if (e.code === 'ArrowLeft') skip(-1);
  else if (e.code === 'Home') $('btnRestart').click();
});

/* ---------- main loop ---------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (S.mode === 'display') {
    if (S.playing) {
      S.t += dt * S.bpm / 60;
      if (S.sel) {                                            // loop the selected measures
        const b = blockAt(S.t);
        if (!b || S.t >= b.t1) {
          S.t = nextBlock(b ? b.t1 - 1e-3 : S.t).t0 - 0.25;
          S.scheduled = lowerBound(score.notes, S.t - 1e-6);
          S.lastSig = '';
        }
      }
      // schedule audio ~120 ms ahead
      const ahead = S.t + 0.12 * S.bpm / 60;
      while (S.scheduled < score.notes.length && score.notes[S.scheduled].t < ahead) {
        const n = score.notes[S.scheduled++];
        if (!S.hands.has(n.hand)) continue;
        if (S.sel && !S.sel.set.has(n.measure)) continue;      // nothing outside the loop sounds
        const delay = Math.max(0, (n.t - S.t) * 60 / S.bpm);
        synth.note(n.midi, delay, n.d * 60 / S.bpm, 0.75);
      }
      if (S.t > score.t1 + 1) play(false);
      const m = measureAtTime(score, S.t).n;
      if ($('selMeasure').value != m) $('selMeasure').value = m;
    }
  } else if (S.anim) {
    const a = S.anim, p = Math.min(1, (now - a.t0) / a.dur);
    const e = 1 - Math.pow(1 - p, 3);
    S.t = a.from + (a.to - a.from) * e;
    if (p >= 1) S.anim = null;
  }
  wf.t = S.t;
  updateHighlights();
  wf.draw();
  requestAnimationFrame(frame);
}

/** which repeated figures are sounding now, and which cell of each */
let legendSig = '';
function showLegend(notes) {
  const act = wf.patterns ? activePatterns(notes.filter(n => S.hands.has(n.hand))) : [];
  const sig = act.map(a => a.p.index + ':' + a.cell.i).join(',');
  if (sig === legendSig) return;
  legendSig = sig;
  $('patLegend').innerHTML = act.map(({ p, cell }) => {
    const chips = p.shift
      ? p.cells.map(c => `<span class="chip${c === cell ? ' on' : ''}" style="--c:${c.base}">${c.tag}</span>`).join('')
      : `<span class="chip on" style="--c:${cell.base}">${cell.i + 1} / ${p.cells.length}</span>`;
    return `<div class="pl"><b>${p.hand === 'R' ? 'Right' : 'Left'}</b>${chips}<span>${p.desc}</span></div>`;
  }).join('');
}

function updateHighlights() {
  let cur = [], ghost = [];
  if (S.mode === 'learn') {
    const st = S.steps[S.idx];
    if (st) { cur = st.notes; const nx = S.steps[S.idx + 1]; if (nx) ghost = nx.notes; }
    wf.sounding = new Set();
  } else {
    const active = [];
    for (let i = lowerBound(score.notes, S.t - score.maxDur); i < score.notes.length; i++) {
      const n = score.notes[i];
      if (n.t > S.t + 1e-6) break;
      if (n.end > S.t && S.hands.has(n.hand)) active.push(n);
    }
    cur = active;
    wf.sounding = new Set(active);
  }
  const m = measureAtTime(score, S.t);
  showLegend(cur);
  const sig = cur.map(n => n.id).join(',') + '|' + ghost.length + '|' + (m && m.n);
  if (sig !== S.lastSig) {
    S.lastSig = sig;
    pdf.show(cur, { measure: S.mode === 'display' ? m : null, ghost, enabled: S.hands });
  }
}

if (piece.sheetFrom > 0) {
  $('selPages').options[0].textContent = `${piece.section || 'Section'} only (p.${piece.sheetFrom + 1}–${score.pages.length})`;
} else {
  $('lblPages').hidden = true;                      // the sheet is short enough to always show whole
  S.cfg.pages = 'all';
}
$('lblPat').hidden = !score.patterns?.length;       // only pieces with detected repeats
applyCfg();
buildPdf();
applyCfg();
setTempo(S.bpm);
layout();
seek(measureStart(score.meta.firstMeasure) - 0.4);
requestAnimationFrame(frame);

// small hook for automated tests / debugging
window.ballade = { S, wf, score, ear, synth, seek, play, setMode, noteHeard, advance, beginStep, setSelection, clearSelection, pickMeasure };

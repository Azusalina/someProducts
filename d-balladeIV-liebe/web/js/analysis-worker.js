// Audio analysis worker: ring buffer -> short FFT (onsets) + medium FFT (which notes sound) + calibration.
import { FFT, detectNotes, buildTemplates, measureNote, medianNoise, defaultProfile, LO, HI, harmFreq, peakAt } from './dsp.js';

let fs = 48000, port = null;
let profile = defaultProfile();
let templates = null;
const RB = 1 << 17, ring = new Float32Array(RB);
let wpos = 0;                                       // total samples written
const NS = 4096, NL = 8192, NC = 16384;
let fftS, fftL, fftC;
let hopS, hopL, nextS = 0, nextL = 0, nextLevel = 0;
const histS = [];                                   // recent short magnitude spectra (linear)
const rmsHist = [];
let noise = 0.0005;                                 // median magnitude of the medium spectrum (quiet floor)
const noiseWin = [];
let present = new Map();                            // midi -> {amp, cos}
let presentSince = new Map();
let heardKey = '';
const lastOnset = new Map();
let pending = [];                                   // {midi, t}
const ampHist = new Map();                          // midi -> [{t, amp}] recent peeled amplitudes
let cal = null;                                     // calibration state
let expected = new Set();                           // notes the player should be producing (from the UI)

const tmpS = new Float32Array(NS), tmpL = new Float32Array(NL), tmpC = new Float32Array(NC);

function init(msg) {
  fs = msg.sampleRate;
  profile = msg.profile || defaultProfile();
  templates = buildTemplates(profile, fs);
  fftS = new FFT(NS); fftL = new FFT(NL); fftC = new FFT(NC);
  hopS = Math.round(fs * 0.010); hopL = Math.round(fs * 0.025);
  port = msg.port;
  port.onmessage = e => onAudio(e.data);
}

function onAudio(block) {
  for (let i = 0; i < block.length; i++) ring[(wpos + i) & (RB - 1)] = block[i];
  wpos += block.length;
  if (wpos < NC) return;
  if (!nextS) { nextS = wpos; nextL = wpos; nextLevel = wpos; }
  while (wpos >= nextS) { stepShort(); nextS += hopS; }
  while (wpos >= nextL) { stepLong(); nextL += hopL; }
  if (wpos >= nextLevel) { postLevel(); nextLevel += Math.round(fs * 0.05); }
}

function grab(dst) {
  const n = dst.length, start = wpos - n;
  for (let i = 0; i < n; i++) dst[i] = ring[(start + i) & (RB - 1)];
  return dst;
}

const rmsNow = n => { let s = 0; for (let i = 0; i < n; i++) { const v = ring[(wpos - 1 - i) & (RB - 1)]; s += v * v; } return Math.sqrt(s / n); };
const now = () => wpos / fs;

const HARM = new Set([12, 19, 24, 28, 31, 34, 36]);     // intervals whose partials coincide with the lower note's

/** report an onset; octave-masked partners among the expected notes are reported with it */
function emitOnset(midi, t, extra) {
  postMessage({ type: 'onset', midi, t, ...extra });
  for (const p of expected) {
    if (expected.has(midi) && p > midi && HARM.has(p - midi) && t - (lastOnset.get(p) || -9) > 0.18) {
      lastOnset.set(p, t);
      postMessage({ type: 'onset', midi: p, t, masked: true, by: midi });
    }
  }
}

function postLevel() {
  const r = rmsNow(2048);
  postMessage({ type: 'level', db: 20 * Math.log10(r + 1e-7) });
}

/* ---- short spectrum: onset flux ---- */
function stepShort() {
  const X = fftS.magnitude(grab(tmpS));
  histS.push(X);
  if (histS.length > 8) histS.shift();
  const r = rmsNow(480);
  rmsHist.push(r);
  if (rmsHist.length > 40) rmsHist.shift();
  if (cal) return calStepShort();
  if (histS.length < 6 || !templates) return;
  const binHz = fs / NS;
  const a = histS[histS.length - 1], b = histS[histS.length - 3], c = histS[histS.length - 5];
  const t = now();
  for (let p = LO; p <= HI; p++) {
    const tp = templates[p];
    let wsum = 0, fsum = 0, lvl = 0;
    const H = Math.min(tp.H, 8);
    for (let h = 1; h <= H; h++) {
      const f = harmFreq(tp, h);
      if (f > fs * 0.45) break;
      const [m1, k] = peakAt(a, f, binHz, 30);
      const m0 = Math.max(b[k] || 0, c[k] || 0, (b[k - 1] || 0) * 0.8, (c[k + 1] || 0) * 0.8);
      const wgt = tp.A[h - 1];
      const rise = 20 * Math.log10((m1 + 1e-6) / (m0 + 1e-6));
      if (rise > 0) fsum += wgt * Math.min(rise, 24);
      wsum += wgt;
      lvl += wgt * m1;
    }
    if (wsum <= 0) continue;
    const flux = fsum / wsum;
    if (self.__trace) self.__trace('flux', p, t, flux, lvl / wsum / noise);
    if (flux > (expected.has(p) ? 4.0 : 5.5) && lvl / wsum > 2.5 * noise) {
      const last = pending.length ? pending[pending.length - 1] : null;
      if (!pending.some(q => q.midi === p && t - q.t < 0.05)) pending.push({ midi: p, t });
    }
  }
}

/* ---- medium spectrum: which notes are sounding ---- */
function stepLong() {
  const X = fftL.magnitude(grab(tmpL));
  const med = medianNoise(X, fs, NL);
  noiseWin.push(med);
  if (noiseWin.length > 120) noiseWin.shift();
  noise = Math.min(...noiseWin);
  if (cal) return calStepLong(X);
  if (!templates) return;
  const t = now();
  const found = detectNotes(X, fs, NL, templates, noise, { expected });
  if (self.__trace) self.__trace('present', found, t);
  const prev = present;
  present = new Map(found.map(f => [f.midi, f]));
  for (const m of present.keys()) if (!prev.has(m)) presentSince.set(m, t);
  for (const m of [...presentSince.keys()]) if (!present.has(m)) presentSince.delete(m);
  // onsets: flux candidates that are confirmed by the note actually sounding
  const keep = [];
  for (const q of pending) {
    const age = t - q.t;
    if (age > 0.45) continue;
    if (age >= 0.04 && present.has(q.midi)) {
      if (t - (lastOnset.get(q.midi) || -9) > 0.12) { lastOnset.set(q.midi, t); emitOnset(q.midi, t, { amp: present.get(q.midi).amp }); }
      continue;
    }
    keep.push(q);
  }
  pending = keep;
  // second onset cue: the note's peeled amplitude jumps relative to its own recent past
  for (const [m, f] of present) {
    const h = ampHist.get(m) || [];
    let prev = 0;
    for (const e of h) if (t - e.t > 0.06 && t - e.t < 0.35) prev = Math.max(prev, e.amp);
    if (expected.has(m) && f.amp >= 1.7 * prev + 0.03 && f.amp >= 0.1 && t - (lastOnset.get(m) || -9) > 0.18) {
      lastOnset.set(m, t);
      emitOnset(m, t, { amp: f.amp, rise: true });
      pending = pending.filter(q => q.midi !== m);
    }
  }
  for (const m of new Set([...present.keys(), ...ampHist.keys()])) {
    const h = ampHist.get(m) || [];
    h.push({ t, amp: present.has(m) ? present.get(m).amp : 0 });
    while (h.length && t - h[0].t > 0.4) h.shift();
    if (h.every(e => e.amp === 0)) ampHist.delete(m); else ampHist.set(m, h);
  }
  const key = [...present.keys()].sort((x, y) => x - y).join(',');
  if (key !== heardKey) { heardKey = key; postMessage({ type: 'heard', notes: [...present.keys()] }); }
}

/* ---- calibration ---- */
function startCal(scale) {
  cal = { scale, idx: 0, phase: 'noise', t0: now(), noiseSamples: [], noiseRms: [], data: {}, onsetT: 0, restUntil: 0 };
  postMessage({ type: 'cal', status: 'noise' });
}

function calStepShort() {
  const t = now();
  const r = rmsHist[rmsHist.length - 1];
  if (cal.phase === 'noise') { cal.noiseRms.push(r); return; }
  if (cal.phase === 'rest') { if (t > cal.restUntil) cal.phase = 'wait'; return; }
  if (cal.phase === 'wait') {
    const nr = cal.noiseRmsMean;
    let prevMax = 0;
    for (let i = Math.max(0, rmsHist.length - 14); i < rmsHist.length - 3; i++) prevMax = Math.max(prevMax, rmsHist[i]);
    if (r > nr * 6 && r > 2.5 * prevMax) { cal.phase = 'capture'; cal.onsetT = t; }
  }
}

function calStepLong(X) {
  const t = now();
  if (cal.phase === 'noise') {
    cal.noiseSamples.push(medianNoise(X, fs, NL));
    if (t - cal.t0 > 1.2) {
      cal.noiseRmsMean = cal.noiseRms.reduce((a, b) => a + b, 0) / Math.max(1, cal.noiseRms.length);
      cal.noiseLevel = cal.noiseSamples.sort((a, b) => a - b)[cal.noiseSamples.length >> 1];
      cal.phase = 'wait';
      postMessage({ type: 'cal', status: 'waiting', index: cal.idx });
    }
    return;
  }
  if (cal.phase === 'capture' && t - cal.onsetT >= 0.5) {
    const Xc = fftC.magnitude(grab(tmpC));
    const noiseC = medianNoise(Xc, fs, NC);
    const midi = cal.scale[cal.idx];
    const m = measureNote(Xc, fs, NC, midi, Math.max(noiseC, 1e-6));
    if (!m.ok) {
      postMessage({ type: 'cal', status: 'retry', index: cal.idx, midi });
      cal.phase = 'rest'; cal.restUntil = t + 0.6;
      return;
    }
    cal.data[midi] = { A: m.A, B: m.B, cents: m.cents, f0: m.f0 };
    postMessage({ type: 'cal', status: 'captured', index: cal.idx, midi, cents: m.cents });
    cal.idx++;
    if (cal.idx >= cal.scale.length) { finishCal(noiseC); return; }
    cal.phase = 'rest'; cal.restUntil = t + 0.7;
    postMessage({ type: 'cal', status: 'waiting', index: cal.idx });
  }
}

function finishCal(noiseC) {
  const ms = Object.keys(cal.data).map(Number);
  const cents = ms.map(m => cal.data[m].cents).sort((a, b) => a - b);
  const tuning = cents.length ? cents[cents.length >> 1] : 0;
  // store per-note deviation relative to the median tuning, so templates carry stretch tuning
  const notes = {};
  for (const m of ms) notes[m] = { ...cal.data[m], cents: cal.data[m].cents };
  profile = { version: 1, fs, tuning, notes, noise: cal.noiseLevel, calibratedAt: Date.now(), count: ms.length };
  templates = buildTemplates(profile, fs);
  cal = null;
  postMessage({ type: 'profile', profile });
}

self.onmessage = e => {
  const m = e.data;
  if (m.type === 'init') init(m);
  else if (m.type === 'calibrate') startCal(m.scale);
  else if (m.type === 'cancelCal') { cal = null; }
  else if (m.type === 'expect') { expected = new Set(m.notes); }
  else if (m.type === 'profile') { profile = m.profile || defaultProfile(); if (fs) templates = buildTemplates(profile, fs); }
  else if (m.type === 'reset') { present = new Map(); pending = []; }
};

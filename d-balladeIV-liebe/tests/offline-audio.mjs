// Offline test of the analysis worker: feeds a WAV through the exact worker code and scores the result.
// usage: node tests/offline-audio.mjs tests/audio/session [--no-cal]
import { readFileSync } from 'node:fs';

const prefix = process.argv[2] || 'tests/audio/session';
const useCal = !process.argv.includes('--no-cal');
const truth = JSON.parse(readFileSync(prefix + '.json'));
const wav = readFileSync(prefix + '.wav');
const sr = wav.readUInt32LE(24);
const data = new Int16Array(wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.length));
const samples = Float32Array.from(data, v => v / 32768);

const out = [];
globalThis.self = globalThis;
globalThis.postMessage = m => out.push({ ...m });
const port = { onmessage: null };
const traceMidi = process.argv.includes('--trace') ? +process.argv[process.argv.indexOf('--trace') + 1] : null;
const traceT = process.argv.includes('--trace') ? +process.argv[process.argv.indexOf('--trace') + 2] : 0;
if (traceMidi) globalThis.__trace = (kind, a, b, c, d) => {
  if (kind === 'flux' && a === traceMidi && b > traceT - 0.15 && b < traceT + 0.5 && c > 1) console.log(`flux ${traceMidi} t=${b.toFixed(3)} flux=${c.toFixed(1)} lvl/noise=${d.toFixed(1)}`);
  if (kind === 'present' && b > traceT - 0.1 && b < traceT + 0.5) console.log(`present t=${b.toFixed(3)}:`, a.map(f => f.midi + '(' + f.amp.toFixed(2) + ',' + f.cos.toFixed(2) + ')').join(' '));
};
await import('../web/js/analysis-worker.js');
const send = d => globalThis.onmessage({ data: d });
send({ type: 'init', port, sampleRate: sr, profile: null });
const scale = truth.scale.map(s => s.midi);
if (useCal) send({ type: 'calibrate', scale });

const BLOCK = 512;
const useExpect = !process.argv.includes('--no-expect');
const sched = truth.play.map((st, k) => ({ t: st.t - 0.3, notes: [...st.notes] }));
let si = 0;
for (let i = 0; i + BLOCK <= samples.length; i += BLOCK) {
  while (useExpect && si < sched.length && i / sr >= sched[si].t) send({ type: 'expect', notes: sched[si++].notes });
  port.onmessage({ data: samples.subarray(i, i + BLOCK) });
  // the worker timestamps by sample count; remember the sample index for each message
  for (let k = out.length - 1; k >= 0 && out[k].at === undefined; k--) out[k].at = (i + BLOCK) / sr;
}
const cal = out.filter(m => m.type === 'cal');
const prof = out.find(m => m.type === 'profile');
console.log('calibration messages:', cal.filter(c => c.status === 'captured').length, 'captured,',
  cal.filter(c => c.status === 'retry').length, 'retries; profile:', prof ? `${prof.profile.count} notes, tuning ${prof.profile.tuning.toFixed(1)} cents` : 'none');
if (useCal && prof) {
  const err = Object.entries(prof.profile.notes).map(([m, v]) => v.cents);
  console.log('  per-note cents (should be ~ +4 for A=441.5):', err.map(v => v.toFixed(0)).join(' '));
}

// ---- recognition score on the play segment ----
const onsets = out.filter(m => m.type === 'onset' && m.at >= truth.play_start - 0.5);
let hit = 0, total = 0, steps = 0, stepsOk = 0;
const used = new Set();
for (const st of truth.play) {
  steps++;
  let ok = 0;
  for (const m of st.notes) {
    total++;
    const idx = onsets.findIndex((o, i) => !used.has(i) && o.midi === m && o.at >= st.t - 0.05 && o.at <= st.t + 0.7);
    if (idx >= 0) { used.add(idx); hit++; ok++; }
  }
  if (ok >= Math.ceil(st.notes.length * 0.75)) stepsOk++;
}
const extra = onsets.filter((o, i) => !used.has(i));
console.log(`notes recognised: ${hit}/${total} (${(100 * hit / total).toFixed(1)}%)  |  steps >=75%: ${stepsOk}/${steps}  |  false onsets: ${extra.length}`);
const miss = [];
for (const st of truth.play) {
  const got = new Set(onsets.filter(o => o.at >= st.t - 0.05 && o.at <= st.t + 0.7).map(o => o.midi));
  const lost = st.notes.filter(m => !got.has(m)), spurious = [...got].filter(m => !st.notes.includes(m));
  if (lost.length || spurious.length) miss.push(`t=${st.t.toFixed(1)} missed[${lost}] extra[${spurious}]`);
}
console.log(miss.slice(0, 14).join('\n'));

if (process.argv.includes('--timeline')) {
  const lo = +process.argv[process.argv.indexOf('--timeline') + 1], hi = lo + 4;
  console.log('truth:', truth.play.filter(s => s.t >= lo - 1 && s.t <= hi).map(s => `${s.t.toFixed(2)}:${s.notes}`).join(' | '));
  console.log('onsets:', onsets.filter(o => o.at >= lo && o.at <= hi).map(o => `${o.at.toFixed(2)}:${o.midi}${o.soft ? 's' : ''}`).join(' '));
}
// ---- classify false onsets by interval to the nearest true note of the step ----
const rel = {};
for (const st of truth.play) {
  const got = onsets.filter(o => o.at >= st.t - 0.05 && o.at <= st.t + 0.7);
  for (const o of got) {
    if (st.notes.includes(o.midi)) continue;
    const d = Math.min(...st.notes.map(m => o.midi - m), ...[]);
    const ds = st.notes.map(m => o.midi - m).sort((a, b) => Math.abs(a) - Math.abs(b))[0];
    rel[ds] = (rel[ds] || 0) + 1;
  }
}
console.log('false onset interval to nearest true note (semitones: count):', JSON.stringify(rel));

// ---- latency-aware scoring ----
{
  const allTruth = truth.play.flatMap(st => st.notes.map(m => ({ t: st.t, midi: m })));
  let falseOn = 0; const lat = [];
  for (const o of onsets) {
    const c = allTruth.filter(x => x.midi === o.midi && Math.abs(o.at - x.t) < 0.9).sort((a, b) => Math.abs(o.at - a.t) - Math.abs(o.at - b.t))[0];
    if (!c) falseOn++; else lat.push(o.at - c.t);
  }
  lat.sort((a, b) => a - b);
  const q = p => lat.length ? lat[Math.floor(p * (lat.length - 1))].toFixed(3) : 'n/a';
  let rec = 0;
  for (const x of allTruth) if (onsets.some(o => o.midi === x.midi && o.at >= x.t - 0.05 && o.at <= x.t + 0.6)) rec++;
  console.log(`LATENCY-AWARE: recall(<=0.6s) ${rec}/${allTruth.length} (${(100 * rec / allTruth.length).toFixed(1)}%), unmatched onsets ${falseOn}/${onsets.length}, latency p10/p50/p90 = ${q(0.1)}/${q(0.5)}/${q(0.9)} s`);
}
{
  const bad = [];
  for (const st of truth.play) {
    const got = new Set(onsets.filter(o => o.at >= st.t - 0.05 && o.at <= st.t + 0.6).map(o => o.midi));
    const lost = st.notes.filter(m => !got.has(m));
    if (st.notes.length - lost.length < Math.ceil(st.notes.length * 0.75)) bad.push(`t=${st.t.toFixed(1)} (${st.notes.length} notes) lost[${lost}]`);
  }
  console.log('STEPS BELOW 75%:', bad.length ? '\n  ' + bad.join('\n  ') : 'none');
}

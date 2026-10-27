import { readFileSync } from 'node:fs';
import { FFT, measureNote, medianNoise, buildTemplates, detectNotes, harmFreq, peakAt, LO, HI } from '../web/js/dsp.js';
const truth = JSON.parse(readFileSync('tests/audio/session.json'));
const wav = readFileSync('tests/audio/session.wav');
const sr = wav.readUInt32LE(24);
const x = Float32Array.from(new Int16Array(wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.length)), v => v / 32768);
const NC = 16384, NL = 8192;
const fc = new FFT(NC), fl = new FFT(NL);
const notes = {};
let tun = [];
for (const s of truth.scale) {
  const end = Math.round((s.t + 0.5) * sr);
  const X = fc.magnitude(x.subarray(end - NC, end));
  const m = measureNote(X, sr, NC, s.midi, medianNoise(X, sr, NC));
  notes[s.midi] = { A: m.A, B: m.B, cents: m.cents, f0: m.f0 };
  tun.push(m.cents);
}
const profile = { version: 1, tuning: 6, notes };
const T = buildTemplates(profile, sr);
const target = +process.argv[2] || 43;
const st = truth.play.find(p => p.notes.includes(target));
const end = Math.round((st.t + 0.30) * sr);
const X = fl.magnitude(x.subarray(end - NL, end));
const noise = medianNoise(X, sr, NL);
console.log('step', st, 'noise', noise);
for (const p of [target - 1, target, target + 1, target + 12]) {
  const t = T[p];
  const row = [];
  for (let h = 1; h <= 6; h++) { const f = harmFreq(t, h); const [m] = peakAt(X, f, sr / NL, 28); row.push(`${f.toFixed(1)}:${m.toFixed(3)}/${t.A[h - 1].toFixed(3)}`); }
  console.log(p, 'f0', t.f0.toFixed(2), row.join('  '));
}
console.log('detect (no expected):', detectNotes(X, sr, NL, T, noise).map(d => `${d.midi}(e${d.energy.toFixed(2)},c${d.cos.toFixed(2)})`).join(' '));
console.log('detect (expected):  ', detectNotes(X, sr, NL, T, noise, { expected: new Set(st.notes) }).map(d => `${d.midi}(e${d.energy.toFixed(2)},c${d.cos.toFixed(2)})`).join(' '));

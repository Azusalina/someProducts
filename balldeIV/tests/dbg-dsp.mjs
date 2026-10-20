import { readFileSync } from 'node:fs';
import { FFT, measureNote, medianNoise, peakAt, mtof } from '../web/js/dsp.js';
const prefix = 'tests/audio/session';
const truth = JSON.parse(readFileSync(prefix + '.json'));
const wav = readFileSync(prefix + '.wav');
const sr = wav.readUInt32LE(24);
const data = new Int16Array(wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.length));
const x = Float32Array.from(data, v => v / 32768);
const NC = 16384;
const fft = new FFT(NC);
for (const k of [0, 8, 20, 30]) {
  const s = truth.scale[k];
  const end = Math.round((s.t + 0.5) * sr);
  const X = fft.magnitude(x.subarray(end - NC, end));
  const noise = medianNoise(X, sr, NC);
  const m = measureNote(X, sr, NC, s.midi, noise);
  console.log('midi', s.midi, 'noise', noise.toExponential(2), 'cents', m.cents, 'B', m.B, 'strong', m.strong, 'ok', m.ok,
    'A', m.A.slice(0, 6).map(v => v.toFixed(3)).join(' '));
}

// usage: node tests/dbg-chord.mjs prefix stepTime
import { readFileSync } from 'node:fs';
import { FFT, measureNote, medianNoise, buildTemplates, detectNotes, harmFreq, peakAt } from '../web/js/dsp.js';
const prefix = process.argv[2], T0 = +process.argv[3];
const truth = JSON.parse(readFileSync(prefix + '.json'));
const wav = readFileSync(prefix + '.wav');
const sr = wav.readUInt32LE(24);
const x = Float32Array.from(new Int16Array(wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.length)), v => v / 32768);
const NC = 16384, NL = 8192;
const fc = new FFT(NC), fl = new FFT(NL);
const notes = {};
for (const s of truth.scale) {
  const end = Math.round((s.t + 0.5) * sr);
  const X = fc.magnitude(x.subarray(end - NC, end));
  const m = measureNote(X, sr, NC, s.midi, medianNoise(X, sr, NC));
  notes[s.midi] = { A: m.A, B: m.B, cents: m.cents, f0: m.f0 };
}
const T = buildTemplates({ version: 1, tuning: 6, notes }, sr);
const st = truth.play.reduce((a, b) => Math.abs(b.t - T0) < Math.abs(a.t - T0) ? b : a);
for (const lag of [0.2, 0.3, 0.4]) {
  const end = Math.round((st.t + lag) * sr);
  const X = fl.magnitude(x.subarray(end - NL, end));
  const noise = medianNoise(X, sr, NL);
  const got = detectNotes(X, sr, NL, T, noise, { expected: new Set(st.notes) });
  const g = new Set(got.map(d => d.midi));
  console.log(`step t=${st.t} lag=${lag}: expected [${st.notes}]`);
  console.log('   detected:', got.map(d => `${d.midi}${st.notes.includes(d.midi) ? '' : '!'}(a${d.amp.toFixed(2)},c${d.cos.toFixed(2)})`).join(' '));
  console.log('   missed  :', st.notes.filter(m => !g.has(m)).join(','));
  for (const m of st.notes.filter(m => !g.has(m))) {
    const t = T[m];
    let num = 0, den = 0, ee = 0;
    const row = [];
    for (let h = 1; h <= t.H; h++) {
      const f = harmFreq(t, h); if (f > sr * 0.45) break;
      const [pk] = peakAt(X, f, sr / NL, 28);
      const e = Math.max(0, pk - 2.5 * noise);
      num += t.A[h - 1] * e; den += t.A[h - 1] ** 2; ee += e * e;
      row.push(`${h}:${e.toFixed(3)}/${t.A[h - 1].toFixed(3)}`);
    }
    console.log(`   note ${m}: cos(plain)=${(num / Math.sqrt(den * ee)).toFixed(2)} amp=${(num / den).toFixed(2)}  ${row.slice(0, 8).join(' ')}`);
  }
}
{
  const { fitExpected } = await import('../web/js/dsp.js');
  const end = Math.round((st.t + 0.3) * sr);
  const X = fl.magnitude(x.subarray(end - NL, end));
  const noise = medianNoise(X, sr, NL);
  const fit = fitExpected(X, sr, NL, T, st.notes, noise);
  console.log('fitExpected @0.3:', fit.map(f => `${f.midi}: amp=${f.amp.toFixed(2)} gain=${f.gain.toFixed(3)} cov=${f.cov.toFixed(2)}`).join('\n   '));
}

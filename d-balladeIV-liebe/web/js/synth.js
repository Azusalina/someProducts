// Sampled grand piano for display mode (Salamander Grand Piano, CC-BY 3.0 — see description.md).
// Samples sit a minor third apart; other pitches are made by resampling the nearest one.
// Notes are scheduled ahead on the Web Audio clock. If the samples cannot be loaded the
// old additive oscillator voice is used so the page is never silent.

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

const SAMPLE_DIR = 'assets/piano/';
const NAMES = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
// A0 plus C, D#, F#, A of every octave 1-7, plus C8: 30 files
const SAMPLES = [];
for (let o = 0; o <= 8; o++) for (const pc of [0, 3, 6, 9]) {
  const midi = 12 * (o + 1) + pc;
  if (midi >= 21 && midi <= 108) SAMPLES.push({ midi, file: `${NAMES[pc]}${o}.mp3` });
}

export class Synth {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.buffers = new Map();      // sample midi -> AudioBuffer
    this.sampleMidis = [];
    this.loaded = false;
    this.failed = false;
    this.loading = null;
    this.voices = new Set();
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    return this.ctx;
  }

  resume() { this.ensure(); if (this.ctx.state !== 'running') this.ctx.resume(); return this.load(); }

  /** fetch + decode the piano samples once; safe to call repeatedly (decoding works on a suspended context) */
  load() {
    if (this.loading) return this.loading;
    const ctx = this.ensure();
    this.loading = Promise.all(SAMPLES.map(async s => {
      const res = await fetch(SAMPLE_DIR + s.file);
      if (!res.ok) throw new Error(`${s.file}: HTTP ${res.status}`);
      this.buffers.set(s.midi, await ctx.decodeAudioData(await res.arrayBuffer()));
    })).then(() => {
      this.sampleMidis = [...this.buffers.keys()].sort((a, b) => a - b);
      this.loaded = true;
    }).catch(err => {
      console.warn('Piano samples unavailable, using fallback synth:', err);
      this.failed = true;
    });
    return this.loading;
  }

  nearestSample(midi) {
    let best = this.sampleMidis[0];
    for (const m of this.sampleMidis) if (Math.abs(m - midi) < Math.abs(best - midi)) best = m;
    return best;
  }

  /** start a note `delay` seconds from now, held for `dur` seconds, then damped */
  note(midi, delay, dur, vel = 0.8) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    const t0 = ctx.currentTime + Math.max(0, delay);
    if (this.loaded) this.sampleNote(ctx, midi, t0, dur, vel);
    else if (this.failed) this.fallbackNote(ctx, midi, t0, dur, vel);
    else this.load();             // still decoding: this note is dropped, the next ones will sound
  }

  sampleNote(ctx, midi, t0, dur, vel) {
    const sm = this.nearestSample(midi);
    const src = ctx.createBufferSource();
    src.buffer = this.buffers.get(sm);
    src.playbackRate.value = Math.pow(2, (midi - sm) / 12);

    const lp = ctx.createBiquadFilter();       // softer touch = duller tone
    lp.type = 'lowpass';
    lp.frequency.value = 2500 + 13000 * vel * vel;
    lp.Q.value = 0.3;

    const peak = Math.pow(vel, 1.3) * 1.05;
    const hold = Math.max(dur, 0.12);
    const tau = midi < 48 ? 0.2 : midi < 72 ? 0.12 : 0.07;   // dampers bite faster in the treble
    const out = ctx.createGain();
    out.gain.setValueAtTime(peak, t0);
    out.gain.setValueAtTime(peak, t0 + hold);
    out.gain.setTargetAtTime(0, t0 + hold, tau);

    src.connect(lp).connect(out).connect(this.master);
    src.start(t0);
    src.stop(t0 + hold + tau * 8);
    const v = { src, out };
    this.voices.add(v);
    src.onended = () => { this.voices.delete(v); out.disconnect(); };
  }

  /** fade out everything that is sounding or queued (pause / seek) */
  silence() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const v of this.voices) {
      v.out.gain.cancelScheduledValues(t);
      v.out.gain.setTargetAtTime(0, t, 0.03);
      try { v.src.stop(t + 0.25); } catch { /* already stopped */ }
    }
  }

  /** oscillator voice used only when the samples failed to load */
  fallbackNote(ctx, midi, t0, dur, vel) {
    const f = mtof(midi);
    const len = Math.min(Math.max(dur, 0.18), 6) + 0.35;
    const out = ctx.createGain();
    const peak = vel * 0.3 / Math.sqrt(1 + (midi - 60) * 0.02 * (midi > 60 ? 1 : 0));
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(Math.max(peak, 0.001), t0 + 0.006);
    out.gain.exponentialRampToValueAtTime(peak * 0.35, t0 + 0.25);
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(f * 14, 9000), t0);
    lp.frequency.exponentialRampToValueAtTime(Math.min(f * 3, 4000), t0 + 0.4);
    for (const [h, a] of [[1, 1], [2, 0.5], [3, 0.28], [4, 0.14], [5, 0.08]]) {
      if (f * h > 12000) continue;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * h * (1 + 0.00012 * h * h);      // slight inharmonicity
      const g = ctx.createGain();
      g.gain.value = a;
      o.connect(g).connect(lp);
      o.start(t0);
      o.stop(t0 + len + 0.05);
    }
    lp.connect(out).connect(this.master);
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }
}

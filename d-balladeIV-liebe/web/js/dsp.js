// DSP + piano-note recognition (pure functions, shared by the worker and the Node tests).

export class FFT {
  constructor(n) {
    this.n = n;
    this.levels = Math.log2(n) | 0;
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { this.cos[i] = Math.cos(2 * Math.PI * i / n); this.sin[i] = Math.sin(2 * Math.PI * i / n); }
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < this.levels; b++) r |= ((i >> b) & 1) << (this.levels - 1 - b);
      this.rev[i] = r;
    }
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
    this.win = new Float64Array(n);
    for (let i = 0; i < n; i++) this.win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n);
  }

  /** magnitude spectrum (n/2 bins, amplitude-normalised: a unit sine gives ~1) of `x` (length n) */
  magnitude(x, out) {
    const { n, re, im, rev, win } = this;
    for (let i = 0; i < n; i++) { re[rev[i]] = x[i] * win[i]; im[rev[i]] = 0; }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const l = j + half;
          const tr = re[l] * this.cos[k] + im[l] * this.sin[k];
          const ti = -re[l] * this.sin[k] + im[l] * this.cos[k];
          re[l] = re[j] - tr; im[l] = im[j] - ti;
          re[j] += tr; im[j] += ti;
        }
      }
    }
    const m = out || new Float32Array(n / 2);
    const s = 4 / n;                        // Hann: coherent gain 0.5, one-sided x2
    for (let i = 0; i < n / 2; i++) m[i] = Math.hypot(re[i], im[i]) * s;
    return m;
  }
}

export const mtof = (m, cents = 0) => 440 * Math.pow(2, (m - 69 + cents / 100) / 12);
export const LO = 21, HI = 108;

/** default (uncalibrated) piano template: gently falling harmonics */
export function defaultProfile() {
  return { version: 1, tuning: 0, notes: {}, noise: 0, default: true };
}

/** Build per-note templates for every piano key from a (possibly sparse) calibration profile. */
export function buildTemplates(profile, fs) {
  const cal = Object.keys(profile.notes).map(Number).sort((a, b) => a - b);
  const T = new Array(HI + 1).fill(null);
  const Hmax = 14;
  for (let p = LO; p <= HI; p++) {
    const f0n = mtof(p);
    const H = Math.max(3, Math.min(Hmax, Math.floor(Math.min(5200, fs * 0.45) / f0n)));
    let A = new Float64Array(H), B = 0.0002 * Math.pow(2, (p - 60) / 14), cents = profile.tuning || 0;
    if (cal.length) {
      let lo = null, hi = null;
      for (const c of cal) { if (c <= p) lo = c; if (c >= p && hi === null) hi = c; }
      const one = (c, h) => { const a = profile.notes[c].A; return h < a.length ? a[h] : a[a.length - 1] * 0.5; };
      for (let h = 0; h < H; h++) {
        let v;
        if (lo !== null && hi !== null && lo !== hi) {
          const w = (p - lo) / (hi - lo);
          v = Math.exp((1 - w) * Math.log(one(lo, h) + 1e-6) + w * Math.log(one(hi, h) + 1e-6));
        } else {
          const c = lo !== null ? lo : hi;
          v = one(c, h);
          // outside the calibrated range keep the shape, but a bass note's partials sit relatively higher
        }
        A[h] = v;
      }
      const near = lo !== null && hi !== null ? (p - lo < hi - p ? lo : hi) : (lo !== null ? lo : hi);
      B = profile.notes[near].B;
      cents = interpCents(profile, cal, p);
    } else {
      for (let h = 0; h < H; h++) A[h] = 0.5 * Math.pow(h + 1, -0.9);
    }
    T[p] = { f0: mtof(p, cents), B, A, H };
  }
  return T;
}

function interpCents(profile, cal, p) {
  let lo = null, hi = null;
  for (const c of cal) { if (c <= p) lo = c; if (c >= p && hi === null) hi = c; }
  const g = c => profile.notes[c].cents;
  if (lo !== null && hi !== null && lo !== hi) return g(lo) + (g(hi) - g(lo)) * (p - lo) / (hi - lo);
  return g(lo !== null ? lo : hi);
}

/** predicted frequency of harmonic h (1-based) of template t */
export const harmFreq = (t, h) => t.f0 * h * Math.sqrt(1 + t.B * h * h);

/** peak magnitude around frequency f (+/- `cents`) in spectrum `X` (bin width fs/N) */
export function peakAt(X, f, binHz, cents = 30) {
  const k = f / binHz;
  const w = Math.max(1.0, f * (Math.pow(2, cents / 1200) - 1) / binHz);
  const a = Math.max(1, Math.floor(k - w)), b = Math.min(X.length - 2, Math.ceil(k + w));
  let m = 0, at = a;
  for (let i = a; i <= b; i++) if (X[i] > m) { m = X[i]; at = i; }
  return [m, at];
}

/**
 * Iterative harmonic cancellation: repeatedly take the note whose template explains the most of the
 * residual spectrum, subtract it and look again. Returns [{midi, amp, cos, energy}].
 */
/**
 * Joint non-negative fit of the expected notes' templates to the spectrum (multiplicative updates).
 * Returns per-note amplitude and "evidence" = share of spectral energy that note alone removes.
 */
export function fitExpected(res, fs, N, templates, expectedList, nf) {
  const binHz = fs / N;
  const K = expectedList.length;
  if (!K) return [];
  const binIndex = new Map();
  const cols = [];
  const lobe = [[0, 1], [-1, 0.75], [1, 0.75], [-2, 0.25], [2, 0.25]];
  expectedList.forEach((p, k) => {
    const t = templates[p];
    const col = new Map();
    for (let h = 1; h <= t.H; h++) {
      const f = harmFreq(t, h);
      if (f > fs * 0.45) break;
      const kc = Math.round(f / binHz);
      for (const [d, w] of lobe) {
        const i = kc + d;
        if (i < 1 || i >= res.length) continue;
        if (!binIndex.has(i)) binIndex.set(i, binIndex.size);
        col.set(binIndex.get(i), (col.get(binIndex.get(i)) || 0) + w * t.A[h - 1]);
      }
    }
    cols.push(col);
  });
  const n = binIndex.size;
  const y = new Float64Array(n);
  for (const [i, j] of binIndex) y[j] = Math.max(0, res[i] - 2.5 * nf);
  const a = new Float64Array(K).fill(0.5);
  const pred = new Float64Array(n);
  const refresh = () => { pred.fill(0); for (let k = 0; k < K; k++) for (const [j, v] of cols[k]) pred[j] += v * a[k]; };
  for (let it = 0; it < 80; it++) {
    refresh();
    for (let k = 0; k < K; k++) {
      let nu = 0, de = 1e-9;
      for (const [j, v] of cols[k]) { nu += v * y[j]; de += v * pred[j]; }
      a[k] *= nu / de;
    }
  }
  refresh();
  let ee = 0; for (let j = 0; j < n; j++) ee += (y[j] - pred[j]) ** 2;
  let yy = 1e-12; for (let j = 0; j < n; j++) yy += y[j] * y[j];
  return expectedList.map((p, k) => {
    // error without note k (others refit lightly by keeping their amplitudes)
    let e2 = 0;
    for (let j = 0; j < n; j++) { const pk = (cols[k].get(j) || 0) * a[k]; e2 += (y[j] - (pred[j] - pk)) ** 2; }
    let own = 0, ownT = 0;
    for (const [j, v] of cols[k]) { own += v * v; ownT += Math.min(y[j], v * a[k] * 1.0) ** 2; }
    // coverage: how much of the note's predicted *resolvable* partial energy is really there
    const t = templates[p];
    let seen = 0, want = 0;
    for (let h = 1; h <= t.H; h++) {
      const f = harmFreq(t, h);
      if (f > fs * 0.45) break;
      if (f * 0.0595 < 2.5 * binHz) continue;
      const [m] = peakAt(res, f, binHz, 25);
      const pr = a[k] * t.A[h - 1];
      seen += Math.min(Math.max(0, m - 2.5 * nf), pr);
      want += pr;
    }
    const cov = want > 0 ? seen / want : 1;
    return { midi: p, amp: a[k], gain: (e2 - ee) / yy, share: ownT / yy, cov };
  });
}

export function detectNotes(X, fs, N, templates, noise, opts = {}) {
  const binHz = fs / N;
  const res = Float32Array.from(X);
  const out = [];
  const expected = opts.expected || new Set();
  const used = new Set();
  const nf = Math.max(noise, 1e-5);
  const subFactor = opts.subFactor ?? 1.35;
  const subtract = (best) => {
    const t = templates[best.midi];
    for (let h = 1; h <= t.H; h++) {
      const f = harmFreq(t, h);
      if (f > fs * 0.45) break;
      const k = Math.round(f / binHz);
      const sub = best.amp * t.A[h - 1] * subFactor;
      for (let d = -2; d <= 2; d++) {
        const i = k + d;
        if (i < 1 || i >= res.length) continue;
        const shape = d === 0 ? 1 : Math.abs(d) === 1 ? 0.75 : 0.25;      // Hann main lobe
        res[i] = Math.max(0, res[i] - sub * shape);
      }
    }
  };
  // 1) expected notes: joint fit
  let maxEnergy = 0;
  if (expected.size) {
    const list = [...expected].filter(p => templates[p]);
    const fit = fitExpected(res, fs, N, templates, list, nf);
    for (const f of fit) {
      const t = templates[f.midi];
      let den = 0; for (let h = 0; h < t.H; h++) den += t.A[h] ** 2;
      const energy = f.amp * Math.sqrt(den);
      if (f.amp >= (opts.expAmp ?? 0.12) && f.gain >= (opts.expGain ?? 0.012) && f.cov >= (opts.expCov ?? 0.55)) {
        out.push({ midi: f.midi, amp: f.amp, cos: 1, energy, expected: true });
        used.add(f.midi);
        maxEnergy = Math.max(maxEnergy, energy);
      }
    }
    for (const o of out) subtract(o);
  }
  // 2) everything else: greedy cancellation with strict thresholds
  for (let iter = 0; iter < (opts.maxNotes ?? 14); iter++) {
    let best = null;
    for (let p = LO; p <= HI; p++) {
      if (used.has(p)) continue;
      const t = templates[p];
      let num = 0, den = 0, ee = 0, low = 0, fund = 0;
      for (let h = 1; h <= t.H; h++) {
        const f = harmFreq(t, h);
        if (f > fs * 0.45) break;
        const [m] = peakAt(res, f, binHz, 28);
        const e = Math.max(0, m - 2.5 * nf);
        const a = t.A[h - 1];
        const wr = f * 0.0595 < 2.5 * binHz ? 0.25 : 1;      // unresolved partials discriminate poorly
        num += wr * a * e; den += wr * a * a; ee += wr * e * e;
        if (h <= 3) low += wr * a * e;
        if (h === 1) fund = e / Math.max(a, 1e-6);
      }
      if (den <= 0 || ee <= 0 || num <= 0) continue;
      const amp = num / den;
      const cos = num / Math.sqrt(den * ee);
      const energy = amp * Math.sqrt(den);
      if (cos < (opts.minCos ?? 0.82) || energy < (opts.minEnergy ?? 0.03)) continue;
      if (low < 0.3 * num) continue;
      if (maxEnergy > 0 && energy < (opts.relMin ?? 0.2) * maxEnergy) continue;
      if (fund < 0.3 && t.H >= 6) continue;
      const score = energy * cos;
      if (!best || score > best.score) best = { midi: p, amp, cos, energy, score };
    }
    if (!best) break;
    out.push(best);
    used.add(best.midi);
    maxEnergy = Math.max(maxEnergy, best.energy);
    subtract(best);
  }
  return out;
}

/** Measure one calibration note: refine f0 (cents) and inharmonicity, return partial amplitudes. */
export function measureNote(X, fs, N, midi, noise) {
  const binHz = fs / N;
  const f0n = mtof(midi);
  let best = { s: -Infinity, c: 0, B: 0.0002 };
  const Bs = [0, 0.00005, 0.0001, 0.0002, 0.0004, 0.0008, 0.0016, 0.003];
  const score = (c, B) => {
    const f = f0n * Math.pow(2, c / 1200);
    let s = 0;
    for (let h = 1; h <= 8; h++) {
      const fh = f * h * Math.sqrt(1 + B * h * h);
      if (fh > fs * 0.45) break;
      const [m] = peakAt(X, fh, binHz, 8);
      s += Math.log(m + 1e-7);
    }
    return s;
  };
  for (let c = -70; c <= 70; c += 2) for (const B of Bs) {
    const sc = score(c, B);
    if (sc > best.s) best = { s: sc, c, B };
  }
  for (let c = best.c - 2; c <= best.c + 2; c += 0.5) for (const B of Bs) {
    const sc = score(c, B);
    if (sc > best.s) best = { s: sc, c, B };
  }
  let f0 = f0n * Math.pow(2, best.c / 1200);
  let bestB = { B: best.B };
  // refine: precise partial frequencies (parabolic peak interpolation) -> weighted LS fit of f0 and B
  {
    const pts = [];
    for (let h = 1; h <= 14; h++) {
      const fh = f0 * h * Math.sqrt(1 + bestB.B * h * h);
      if (fh > Math.min(5200, fs * 0.45)) break;
      const [m, k] = peakAt(X, fh, binHz, 35);
      if (m < 6 * noise || k < 2 || k >= X.length - 2) continue;
      const l = Math.log(X[k - 1] + 1e-9), c = Math.log(X[k] + 1e-9), r = Math.log(X[k + 1] + 1e-9);
      const den = l - 2 * c + r;
      const off = den < 0 ? 0.5 * (l - r) / den : 0;
      pts.push({ h, f: (k + Math.max(-0.5, Math.min(0.5, off))) * binHz, w: m });
    }
    if (pts.length >= 3) {
      let bestFit = null;
      for (let B = 0; B <= 0.006; B += 0.00005) {
        let sg = 0, sgg = 0;
        for (const q of pts) { const g = q.h * Math.sqrt(1 + B * q.h * q.h); sg += q.w * q.f * g; sgg += q.w * g * g; }
        const f0f = sg / sgg;
        let r = 0;
        for (const q of pts) { const g = q.h * Math.sqrt(1 + B * q.h * q.h); r += q.w * (q.f - f0f * g) ** 2 / (q.f * q.f); }
        if (!bestFit || r < bestFit.r) bestFit = { r, B, f0: f0f };
      }
      if (Math.abs(1200 * Math.log2(bestFit.f0 / f0n)) < 80) { f0 = bestFit.f0; bestB = { B: bestFit.B }; best.c = 1200 * Math.log2(f0 / f0n); }
    }
  }
  const H = Math.max(3, Math.min(14, Math.floor(Math.min(5200, fs * 0.45) / f0)));
  const A = [];
  let strong = 0;
  for (let h = 1; h <= H; h++) {
    const f = f0 * h * Math.sqrt(1 + bestB.B * h * h);
    const [m] = peakAt(X, f, binHz, 25);
    const a = Math.max(0, m - 2.5 * noise);
    A.push(a);
    if (a > 4 * noise) strong++;
  }
  // exact deviation: refine the fundamental peak position with parabolic interpolation
  return { cents: best.c, B: bestB.B, A, f0, strong, ok: strong >= 2 && Math.abs(best.c) < 65 && A[0] + A[1] > 0 };
}

export function medianNoise(X, fs, N) {
  const binHz = fs / N;
  const a = Math.floor(100 / binHz), b = Math.floor(5000 / binHz);
  const v = Array.from(X.subarray(a, b)).sort((x, y) => x - y);
  return v[v.length >> 1];
}

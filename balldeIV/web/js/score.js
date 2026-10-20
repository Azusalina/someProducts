// Score data: loading, indexing and "steps" (groups of notes the player must strike together).

export async function loadScore(url) {
  const s = await (await fetch(url)).json();
  s.notes.sort((a, b) => a.t - b.t || a.midi - b.midi);
  s.notes.forEach((n, i) => {
    n.i = i;
    n.end = n.t + Math.max(n.d, 0.06);
  });
  s.minMidi = Math.min(...s.notes.map(n => n.midi));
  s.maxMidi = Math.max(...s.notes.map(n => n.midi));
  s.maxDur = Math.max(...s.notes.map(n => n.end - n.t));
  s.t0 = s.notes[0].t;
  s.t1 = Math.max(...s.notes.map(n => n.end));
  s.measureByNumber = new Map(s.measures.map(m => [m.n, m]));
  return s;
}

/** index of the first note with t >= x (notes are sorted by t) */
export function lowerBound(notes, x) {
  let lo = 0, hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].t < x) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/**
 * Steps = onsets the player has to produce. Notes whose onsets differ by less than `tol` beats are one step
 * (chords, arpeggio rolls). Grace notes are not required. `hands` is a Set of "R"/"L".
 */
export function buildSteps(score, hands, tol = 0.04) {
  const steps = [];
  for (const n of score.notes) {
    if (n.grace || !hands.has(n.hand)) continue;
    const last = steps[steps.length - 1];
    if (last && n.t - last.t < tol) last.notes.push(n);
    else steps.push({ t: n.t, notes: [n], measure: n.measure });
  }
  steps.forEach((s, i) => { s.i = i; s.t = s.notes[0].t; });
  return steps;
}

export function stepIndexAtOrAfter(steps, t) {
  let lo = 0, hi = steps.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (steps[mid].t < t - 1e-6) lo = mid + 1; else hi = mid;
  }
  return Math.min(lo, steps.length - 1);
}

export function measureAt(score, t) {
  const m = Math.floor(t / 3) + 1;
  return Math.max(score.meta.firstMeasure, Math.min(score.meta.lastMeasure, m));
}

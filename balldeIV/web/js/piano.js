// Keyboard geometry shared by the waterfall lanes and the drawn keyboard.

const BLACK = new Set([1, 3, 6, 8, 10]);
export const isBlack = m => BLACK.has(((m % 12) + 12) % 12);
export const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = m => NAMES[m % 12] + (Math.floor(m / 12) - 1);

/** Lay out keys lo..hi (MIDI) across `width` px. Returns {keys, byMidi, whiteW}. */
export function layoutKeyboard(lo, hi, width) {
  const whites = [];
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
  const whiteW = width / whites.length;
  const keys = [];
  const byMidi = new Map();
  let wi = 0;
  const blackW = whiteW * 0.62;
  for (let m = lo; m <= hi; m++) {
    let k;
    if (!isBlack(m)) {
      k = { midi: m, black: false, x: wi * whiteW, w: whiteW };
      wi++;
    } else {
      // centred on the boundary between neighbouring white keys, nudged like a real keyboard
      const pc = m % 12;
      const nudge = { 1: -0.08, 3: 0.08, 6: -0.1, 8: 0, 10: 0.1 }[pc] * whiteW;
      k = { midi: m, black: true, x: wi * whiteW - blackW / 2 + nudge, w: blackW };
    }
    keys.push(k);
    byMidi.set(m, k);
  }
  return { keys, byMidi, whiteW, lo, hi };
}

/** widest sensible range: whole octaves around the notes (C .. B) */
export function rangeFor(minMidi, maxMidi) {
  let lo = minMidi - (minMidi % 12);
  let hi = maxMidi + (11 - (maxMidi % 12));
  lo = Math.max(21, lo);
  hi = Math.min(108, hi);
  return [lo, hi];
}

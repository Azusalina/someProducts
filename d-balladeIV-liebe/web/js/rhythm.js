// Rhythm colours for selected measures: every written note value gets its own high-contrast colour, so the rhythm of
// a passage can be read at a glance on the waterfall and on the sheet. A note's written value is `v` (quarters, from
// the engraving: a tied note keeps the value of its first head; a trill note the value of the trilled note); pieces
// built from a MIDI file have no `v`, so their sounding length `d` is used.

export const RHYTHMS = [
  { key: '32', label: '32nd or shorter', color: '#ff3b3b' },
  { key: '16', label: '16th', v: 0.25, color: '#ff9f1c' },
  { key: '16.', label: 'dotted 16th', v: 0.375, color: '#ffe14d' },
  { key: '8', label: '8th', v: 0.5, color: '#2ee66b' },
  { key: '8.', label: 'dotted 8th', v: 0.75, color: '#00d9ff' },
  { key: '4', label: 'quarter', v: 1, color: '#4f7dff' },
  { key: '4.', label: 'dotted quarter', v: 1.5, color: '#b45cff' },
  { key: '2', label: 'half', v: 2, color: '#ff4fd8' },
  { key: '2.', label: 'dotted half or longer', v: 3, color: '#ffffff' },
  { key: 'tuplet', label: 'triplet / tuplet', color: '#c6ff00' },
  { key: 'grace', label: 'grace note', color: '#8d96a3' },
];
const BY_KEY = new Map(RHYTHMS.map(r => [r.key, r]));
const DYADIC = RHYTHMS.filter(r => r.v);

/** the rhythm class of a note (one of RHYTHMS) */
export function rhythmOf(n) {
  if (n.grace && n.orn !== 'tr') return BY_KEY.get('grace');
  const v = n.v ?? n.d;
  if (v <= 0.1875) return BY_KEY.get('32');
  const in32 = v * 32;
  if (Math.abs(in32 - Math.round(in32)) > 0.02) return BY_KEY.get('tuplet');   // thirds, fifths ... of a beat
  if (v >= 3) return BY_KEY.get('2.');
  let best = DYADIC[0];
  for (const r of DYADIC) if (Math.abs(r.v - v) < Math.abs(best.v - v)) best = r;  // tied sums go to the nearest value
  return best;
}

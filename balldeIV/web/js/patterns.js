// Repeated figures ("patterns") of a piece: a cell A, then B = A moved by some octaves, C = B moved again, ...
// The score file lists them per hand (score.patterns, found offline by omr/patterns.py). Here every cell gets a
// letter and a colour, and every note a link to its cell. Chains that sound together form a "patch" and share
// one run of colours; the next patch starts three colours further on so neighbouring patches look different.

export const PALETTE = ['#4d9dff', '#ffb020', '#3fdc9a', '#ff5d8f', '#b794ff', '#33d4e8'];

/** hex colour mixed towards white (amt > 0) or black (amt < 0) */
export function mix(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  const h = v => f(v).toString(16).padStart(2, '0');
  return '#' + h((n >> 16) & 255) + h((n >> 8) & 255) + h(n & 255);
}

const OCT = { 1: 'one octave', 2: 'two octaves', 3: 'three octaves' };

function describe(shift) {
  if (!shift) return 'repeated unchanged';
  const o = Math.abs(shift) / 12;
  return `each repeat ${OCT[o] || o + ' octaves'} ${shift > 0 ? 'higher' : 'lower'}`;
}

/** adds .cell to every note that belongs to a pattern and fills in letters, colours and descriptions */
export function indexPatterns(score) {
  const byId = new Map(score.notes.map(n => [n.id, n]));
  const pats = score.patterns || [];
  pats.forEach(p => {
    p.cells.forEach(c => { c.list = c.notes.map(id => byId.get(id)).filter(Boolean); });
    p.t0 = Math.min(...p.cells.map(c => c.t0));
    p.t1 = Math.max(...p.cells.flatMap(c => c.list.map(n => n.end)));
    p.desc = describe(p.shift);
  });
  // patches: chains whose time spans touch
  let patch = -1, until = -Infinity;
  for (const p of [...pats].sort((a, b) => a.t0 - b.t0)) {
    if (p.t0 > until - 0.02) patch++;                          // (cell starts are stored to 1 ms)
    until = Math.max(until, p.t1);
    p.patch = patch;
  }
  const used = new Map();       // letters continue along a hand within a patch: A B C, then D E F
  pats.forEach((p, pi) => {
    p.index = pi;
    const key = p.patch + p.hand;
    const k0 = p.shift ? (used.get(key) || 0) : 0;
    if (p.shift) used.set(key, k0 + p.cells.length);
    p.cells.forEach((c, ci) => {
      const idx = p.shift ? k0 + ci : ci % 2;                       // unchanged repeats just alternate two colours
      const col = PALETTE[(p.patch * 3 + idx) % PALETTE.length];
      Object.assign(c, {
        p, i: ci, letter: p.shift ? String.fromCharCode(65 + idx % 26) : (ci % 2 ? 'b' : 'a'),
        tag: p.shift ? String.fromCharCode(65 + idx % 26) : (ci === 0 ? `×${p.cells.length}` : ''),
        color: { R: col, L: mix(col, -0.22) }, base: col,
      });
      const first = c.list.reduce((a, n) => (!a || n.t < a.t - 1e-6 || (Math.abs(n.t - a.t) < 1e-6 && n.midi > a.midi) ? n : a), null);
      c.anchor = first;
      c.list.forEach(n => { n.cell = c; });
    });
  });
  score.patchCount = patch + 1;
  return pats;
}

/** patterns that have a note sounding in `notes` -> [{p, cell}] (right hand first) */
export function activePatterns(notes) {
  const m = new Map();
  for (const n of notes) if (n.cell && !m.has(n.cell.p)) m.set(n.cell.p, n.cell);
  return [...m].sort((a, b) => (a[0].hand === b[0].hand ? a[0].t0 - b[0].t0 : a[0].hand === 'R' ? -1 : 1))
    .map(([p, cell]) => ({ p, cell }));
}

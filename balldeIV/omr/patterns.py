"""Find repeated figures in the notes of chosen measures: a *cell* of consecutive onsets, repeated at a whole number of
octaves (or unchanged), as in the cadenzas of Liebestraum No. 3.

Per hand, notes are grouped into frames (all pitches struck at one onset). A *chain* is a run of cells of L frames where
each cell is the previous one moved by s semitones (s a multiple of 12): A, B = A shifted, C = B shifted, ... Cells may
differ from their predecessor in a few frames (the score varies a note now and then), so a cell counts as a repeat when
at least MIN_SAME of its frames agree exactly. Chains that cover the most onsets win, then the shorter cell. A stretch
next to a chain that echoes the cell (a pickup that lacks one note, or the note a run lands on) is added as a partial
cell.
"""
from math import ceil

MIN_SAME = 0.6       # share of a cell's frames that must repeat the previous cell exactly
MAX_LEN = 24         # longest cell, in onsets
TOL = 0.04           # onsets closer than this (in quarters) belong to one frame
SHIFTS = (0, 12, -12, 24, -24, 36, -36)


def frames_of(notes):
    """[(t, frozenset(midi), [note ids], measure)] for one hand, in time order"""
    out = []
    for n in sorted(notes, key=lambda n: (n["t"], n["midi"])):
        if out and n["t"] - out[-1][0] < TOL:
            out[-1][1].add(n["midi"])
            out[-1][2].append(n["id"])
        else:
            out.append([n["t"], {n["midi"]}, [n["id"]], n["measure"]])
    return [(t, frozenset(p), ids, m) for t, p, ids, m in out]


def _shift(f, s):
    return frozenset(p + s for p in f)


def _same(fr, i, j, L, s):
    """frames of fr[j:j+L] that equal fr[i:i+L] moved by s"""
    return sum(_shift(fr[i + k][1], s) == fr[j + k][1] for k in range(L))


def _chain(fr, i, L, s, blocked):
    """number of cells starting at frame i, each repeating the previous one; cells stop at blocked frames"""
    need = ceil(MIN_SAME * L - 1e-9)
    n = 1
    while i + (n + 1) * L <= len(fr) and not any(blocked[i + n * L: i + (n + 1) * L]) \
            and _same(fr, i + (n - 1) * L, i + n * L, L, s) >= need:
        n += 1
    return n


def _best(fr, blocked):
    """(key, groups, s) of the best chain with at least two cells, or None. groups = [(first frame, frames)]"""
    best = None
    for L in range(2, min(MAX_LEN, len(fr) // 2) + 1):
        for i in range(0, len(fr) - 2 * L + 1):
            if any(blocked[i:i + L]):
                continue
            for s in SHIFTS:
                nc = _chain(fr, i, L, s, blocked)
                if nc < 2:
                    continue
                same = sum(_same(fr, i + k * L, i + (k + 1) * L, L, s) for k in range(nc - 1))
                groups = _extend(fr, [(i + k * L, L) for k in range(nc)], blocked, s, L)
                cover = sum(ln for _, ln in groups)
                lead = _shift(fr[i][1], s) == fr[i + L][1]      # the cell starts on a note that comes back
                split = sum(len({f[3] for f in fr[a: a + ln]}) > 1 for a, ln in groups)   # cells running over a barline
                # most exactly repeated onsets, then cells that stay inside a bar, then cells that start on a note that
                # comes back, then most onsets covered, then the shortest cell, then the earliest start
                key = (same, -split, lead, cover, -L, -i)
                if best is None or key > best[0]:
                    best = (key, groups, s, L)
    return best


def _lcs(x, y):
    t = [[0] * (len(y) + 1) for _ in range(len(x) + 1)]
    for a in range(len(x)):
        for b in range(len(y)):
            t[a + 1][b + 1] = t[a][b] + 1 if x[a] == y[b] else max(t[a][b + 1], t[a + 1][b])
    return t[-1][-1]


def _trim(fr, groups, s):
    """drop leading frames of the first cell that the second cell does not echo (they belong to what came before);
    one differing first frame is a variant, so this needs at least two in a row"""
    (a, ln), (b, lb) = groups[0], groups[1]
    x = [f[1] for f in fr[a: a + ln]]
    y = [_shift(f[1], -s) for f in fr[b: b + lb]]
    if not (len(x) > 2 and x[0] != y[0] and x[1] != y[1]):
        return groups
    base = _lcs(x, y)
    while len(x) > 2 and _lcs(x[1:], y) == base:
        x, a, ln = x[1:], a + 1, ln - 1
    groups[0] = (a, ln)
    return groups


def _extend(fr, groups, blocked, s, L):
    """a partial cell after the chain (the frames that start another repeat) and one before it (the end of a repeat,
    possibly missing a note)"""
    groups = _trim(fr, groups, s)
    trimmed = groups[0][1] < L
    i0 = groups[0][0]
    j1 = groups[-1][0] + groups[-1][1]
    last = fr[groups[-1][0]: j1]
    k = 0
    while j1 + k < len(fr) and k < L - 1 and not blocked[j1 + k] and _shift(last[k][1], s) == fr[j1 + k][1]:
        k += 1
    if k >= 2 or (k == 1 and j1 + 1 == len(fr)):
        groups.append((j1, k))
    first = [_shift(f[1], -s) for f in fr[i0: i0 + L]]
    for m in range(0 if trimmed else min(L - 1, i0), 1, -1):
        if any(blocked[i0 - m: i0]):
            continue
        x = [f[1] for f in fr[i0 - m: i0]]
        if _lcs(x, first[-(m + 1):]) >= m - (m >= 5):
            groups.insert(0, (i0 - m, m))
            break
    return groups


def _find_in(notes, hand):
    fr = frames_of([n for n in notes if n["hand"] == hand])
    blocked = [False] * len(fr)
    out = []
    while True:
        b = _best(fr, blocked)
        if not b:
            break
        _, groups, s, L = b
        cells = []
        for a, ln in groups:
            for k in range(a, a + ln):
                blocked[k] = True
            cells.append(dict(t0=fr[a][0], t1=fr[a + ln - 1][0], frames=ln, notes=[x for f in fr[a: a + ln] for x in f[2]]))
        out.append(dict(hand=hand, shift=s, length=L, cells=cells))
    return out


def find(notes, ranges, hands=("R", "L")):
    """notes: score note dicts; ranges: [(first, last)] measure numbers, each searched on its own. Returns a list of
    patterns {hand, shift, length, cells:[{t0, t1, frames, notes}]}, ordered by time."""
    patterns = []
    for lo, hi in ranges:
        sel = [n for n in notes if lo <= n["measure"] <= hi and not n.get("grace")]
        for hand in hands:
            patterns += _find_in(sel, hand)
    patterns.sort(key=lambda p: (p["cells"][0]["t0"], p["hand"]))
    return patterns


def annotate(score, ranges):
    """store the patterns of score["notes"] in score["patterns"], in the form the web app reads: each has a hand, the
    repeat shift in semitones, the cell length in onsets and its cells (start beat and note ids)"""
    score["patterns"] = [
        dict(hand=p["hand"], shift=p["shift"], length=p["length"],
             cells=[dict(t0=round(c["t0"], 3), notes=c["notes"]) for c in p["cells"]])
        for p in find(score["notes"], ranges)
    ]
    return score["patterns"]


def parse_ranges(text):
    """'23-31,64-73' -> [(23, 31), (64, 73)]"""
    return [tuple(int(x) for x in r.split("-")) for r in text.split(",") if r.strip()]

"""Per-measure onset solver (voice based).

Sibelius aligns most events in columns, but a second voice is often engraved shifted sideways to clear stems,
and secondary voices usually have hidden rests. So onsets come from voice *tiling* (durations add up to the bar),
and x is only used to anchor/validate:

  1. every staff is split into voices (single voice if its events tile the bar; otherwise up-stem / down-stem voices)
  2. voices that tile the bar define a reference timeline (x <-> time)
  3. voices with gaps are placed by continuity (next event starts where the previous one ended) unless x says
     the event is far from there, in which case it snaps to the reference column nearest in x
  4. the tuplet scale of every beam group (1, 2/3, ...) is searched to minimise inconsistencies
"""
from fractions import Fraction

BAR = Fraction(3, 4)
SCALES = [Fraction(1), Fraction(2, 3)]
COL_EPS = 2.2
DISPLACE_MAX = 17.0


def beam_groups(events):
    parent = {}

    def find(a):
        while parent.setdefault(a, a) != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    owner = {}
    for e in events:
        find(("e", e.id))
        for p in getattr(e, "beam_polys", []):
            k = ("p", id(p))
            if k in owner:
                parent[find(("e", e.id))] = find(owner[k])
            else:
                owner[k] = ("e", e.id)
    groups = {}
    for e in events:
        groups.setdefault(find(("e", e.id)), []).append(e)
    return list(groups.values())


def split_voices(staff_events, length, bar):
    """Return list of voices (lists of events, x ordered). Single voice when the staff tiles on its own."""
    evs = sorted(staff_events, key=lambda e: (e.x, e.id))
    if not evs:
        return []
    # single voice? every event in its own column and the lengths sum to the bar
    cols_ok = all(b.x - a.x >= COL_EPS for a, b in zip(evs, evs[1:]))
    tot = sum((length[e.id] for e in evs), Fraction(0))
    if cols_ok and tot == bar:
        return [evs]
    # beamed events stay together; split by stem direction (rests follow vertical position)
    up, down = [], []
    for e in evs:
        if e.kind == "note":
            (up if e.stem_dir == "up" else down).append(e)
        else:
            g = e.rest_glyph
            mid = (g.bbox[1] + g.bbox[3]) / 2
            # staff geometry is not known here; filled in by caller via e.rest_up
            (up if getattr(e, "rest_up", False) else down).append(e)
    # beam groups must not be split between voices
    voices = [v for v in (up, down) if v]
    return voices


def build_ref(voices, length, bar):
    """Time/x map from voices that tile the bar exactly (onsets from cumulative lengths)."""
    onset = {}
    ref = {}                       # t -> list of x
    for v in voices:
        tot = sum((length[e.id] for e in v), Fraction(0))
        if tot == bar:
            t = Fraction(0)
            for e in v:
                onset[e.id] = t
                ref.setdefault(t, []).append(e.x)
                t += length[e.id]
    return onset, ref


def x_at(ref_x, t):
    """x position at time t from reference columns (linear interpolation)."""
    ts = sorted(ref_x)
    if not ts:
        return None
    if t in ref_x:
        return ref_x[t]
    lo = [u for u in ts if u < t]
    hi = [u for u in ts if u > t]
    if not lo:
        return ref_x[hi[0]]
    if not hi:
        return ref_x[lo[-1]]
    a, b = lo[-1], hi[0]
    return ref_x[a] + (ref_x[b] - ref_x[a]) * float((t - a) / (b - a))


def evaluate(evs, groups, assign, bar):
    length = {e.id: e.dur for e in evs}
    for g, s in zip(groups, assign):
        for e in g:
            length[e.id] = e.dur * s
    cost = 0.0
    voices = []
    for st in (0, 1):
        voices += split_voices([e for e in evs if e.staff == st], length, bar)
    onset, ref = build_ref(voices, length, bar)
    ref_x = {t: sum(xs) / len(xs) for t, xs in ref.items()}
    if not ref_x:
        cost += 20
    # place gappy voices
    for v in voices:
        if all(e.id in onset for e in v):
            continue
        cur = Fraction(0)
        for e in v:
            t_c = cur
            xc = x_at(ref_x, t_c) if ref_x else None
            if xc is not None and abs(e.x - xc) <= DISPLACE_MAX and t_c + length[e.id] <= bar:
                t = t_c
            elif ref_x:
                # snap to the reference column nearest in x that fits
                best = None
                for tt, xx in ref_x.items():
                    if tt >= cur and tt + length[e.id] <= bar:
                        d = abs(e.x - xx)
                        if best is None or d < best[0]:
                            best = (d, tt)
                if best is None:
                    t = cur
                    cost += 3
                else:
                    t = best[1]
                    cost += 0.5          # a gap was assumed
            else:
                t = cur
            onset[e.id] = t
            cur = t + length[e.id]
        if cur > bar:
            cost += 3
    # voice totals
    for v in voices:
        tot = sum((length[e.id] for e in v), Fraction(0))
        if tot > bar:
            cost += 3
    # cross-staff same-column consistency + coarse monotonicity
    es = [e for e in evs if e.id in onset]
    for i, a in enumerate(es):
        for b in es[i + 1:]:
            dx = b.x - a.x
            if abs(dx) < COL_EPS and onset[a.id] != onset[b.id]:
                cost += 1.0
            elif dx > DISPLACE_MAX and onset[a.id] > onset[b.id]:
                cost += 1.0
            elif dx < -DISPLACE_MAX and onset[a.id] < onset[b.id]:
                cost += 1.0
    pen = sum(0 if s == 1 else 0.1 for s in assign)
    return cost + pen, onset, length


def solve_measure(events, bar=BAR, sy=None):
    evs = [e for e in events if not e.grace]
    if not evs:
        return {}, {}, (0,)
    groups = [g for g in beam_groups(evs) if len(g) > 1]
    n = len(groups)
    gstaff = [0 if sum(1 for e in g if e.staff == 0) * 2 >= len(g) else 1 for g in groups]
    seeds = []
    for s0 in (SCALES[0], SCALES[1]):
        for s1 in (SCALES[0], SCALES[1]):
            seeds.append(tuple(s0 if gs == 0 else s1 for gs in gstaff))
    best = None
    for seed in seeds:
        cur = seed
        cur_val = evaluate(evs, groups, cur, bar)
        improved = True
        while improved:
            improved = False
            for gi in range(n):
                for s in SCALES:
                    if s == cur[gi]:
                        continue
                    cand = cur[:gi] + (s,) + cur[gi + 1:]
                    v = evaluate(evs, groups, cand, bar)
                    if v[0] < cur_val[0] - 1e-9:
                        cur, cur_val = cand, v
                        improved = True
        if best is None or cur_val[0] < best[0][0]:
            best = (cur_val, cur)
    (val, onset, length), assign = best
    return onset, length, (val,)

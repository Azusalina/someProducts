"""Onset solver for one bar, from the engraving alone (no MIDI).

Sibelius lays notes out left to right in time order, almost linearly (an eighth is about half a quarter's width, plus a
little extra before accidentals), and several voices may share a staff. The notated values give exact relations (a
voice's next event starts where the previous one ends) and the x positions say which times are plausible.

The bar is solved as a beam search over its columns (events at the same x share an onset). A column may start

  * where a pending event ends (the voice continues),
  * at the previous column's time (a voice engraved sideways to clear a collision),
  * or at a free grid point near the estimate (an unwritten rest), at a cost.

A path is scored by how well ONE linear layout, x = b + a*T + k*(accidental room), explains the x of its columns
(robust residuals, a mild prior on the slope from the bar's width), plus penalties for events that start off their own
metric grid, for pending ends that nothing continues, for overrunning the bar, and for uncovered time on a staff.
Tuplet scale (1 or 2/3) is chosen per beam group. Everything is in quarter notes (Fractions).
"""
from dataclasses import dataclass
from fractions import Fraction
import numpy as np

COL_TOL = 1.5          # pt: same x = same onset
DISP_MAX = 10.0        # pt: a sideways-displaced voice may share the previous column's onset
GRID = Fraction(1, 12)
SCALES = (Fraction(1), Fraction(2, 3))
BEAM = 64
TRACE = []             # per-column cost parts of a forced hypothesis (debugging aid)
# search costs (tuned on bars whose single voice tiles exactly, then checked on audited bars)
P = dict(off=3.5, same=1.0, twin=1.5, skip=2.0, tail=1.0, cover=1.5, grid=0.5, align=1.5,
         sx=1.2, cap=9.0, sa=0.4, sk=0.3, p=0.6, window=0.6)


@dataclass
class Col:
    x: float
    events: list
    acc: float = 0.0


def columns(evs):
    cols = []
    for e in sorted(evs, key=lambda e: (e.x, e.staff, e.id)):
        if cols and e.x - cols[-1].x <= COL_TOL:
            cols[-1].events.append(e)
        else:
            cols.append(Col(e.x, [e]))
    for c in cols:
        c.x = float(np.median([e.x for e in c.events]))
        for e in c.events:
            if e.kind == "note":
                for h in e.heads:
                    if h.acc is not None and not h.grace:
                        c.acc = max(c.acc, h.x - h.acc.x)
    return cols


def quarters(e, L):
    return L if getattr(e, "bar_rest", False) else e.dur * 4


def group_ids(evs):
    """beam group id per event id; lone events are their own group"""
    from .timing import beam_groups
    gid, groups = {}, {}
    for i, g in enumerate(beam_groups(evs)):
        for e in g:
            gid[e.id] = i
        groups[i] = g
    return gid, groups


def twins(cols, L):
    """twin[i]: column i holds a long note (>= 1 quarter) that duplicates one of column i-1 within DISP_MAX in staff,
    stem direction and value: a chord whose head is engraved sideways, so both must start together."""
    out = [False] * len(cols)
    for i in range(1, len(cols)):
        if cols[i].x - cols[i - 1].x > DISP_MAX:
            continue
        for e in cols[i].events:
            if e.kind == "note" and quarters(e, L) >= 1:
                if any(f.kind == "note" and f.staff == e.staff and f.stem_dir == e.stem_dir and f.dur == e.dur
                       for f in cols[i - 1].events):
                    out[i] = True
    return out


class Layout:
    """Cost of the spacing implied by the columns chosen so far.

    Engraved gaps follow the time between neighbouring columns sub-linearly (Sibelius gives short notes relatively
    more room): gap_i = c * dT_i**p + k * accidental_room_i. c and k are fitted per bar (ridge towards a prior from
    the bar's width); residuals are robust. Gaps, not absolute x, are compared, so one odd column cannot shift the rest.
    """

    def __init__(self, a0, x_first):
        self.p = P["p"]
        c0 = a0 * 0.5 ** (1.0 - self.p)
        self.scale = np.array([P["sa"] * c0, P["sk"]])
        self.mu = np.array([c0, 0.3])
        self.prior = np.diag((P["sx"] / self.scale) ** 2)

    def cost(self, obs):
        """obs: tuple of (T, x, accidental room) at strictly increasing T. 0 until there is a gap to look at."""
        if len(obs) < 2:
            return 0.0
        T = np.array([o[0] for o in obs])
        X = np.array([o[1] for o in obs])
        acc = np.array([o[2] for o in obs])
        gap = np.diff(X)
        A = np.stack([np.diff(T) ** self.p, acc[1:]], axis=1)
        w = np.ones(len(gap))
        for _ in range(3):                                   # iteratively reweighted: one odd gap must not drag c
            Aw = A * w[:, None]
            th = np.linalg.solve(Aw.T @ A + self.prior, Aw.T @ gap + self.prior @ self.mu)
            r = (gap - A @ th) / P["sx"]
            w = np.minimum(1.0, 2.0 / np.maximum(np.abs(r), 1e-9))
        d = (th - self.mu) / self.scale
        return float(0.5 * np.minimum(r * r, P["cap"]).sum() + 0.5 * (d * d).sum())


def solve_bar(evs, x_first, x_right, L, beam=BEAM):
    """Return (onset {event id: Fraction}, length {event id: Fraction}, info dict)."""
    evs = [e for e in evs if not e.grace]
    # a whole-bar rest is centred in its bar: it spans the bar from 0 whatever its x
    whole = [e for e in evs if getattr(e, "bar_rest", False)]
    evs = [e for e in evs if not getattr(e, "bar_rest", False)]
    if not evs:
        return {e.id: Fraction(0) for e in whole}, {e.id: L for e in whole}, dict(cost=0.0, times=[], cols=[])
    cols = columns(evs)
    gid, groups = group_ids(evs)
    first_x = cols[0].x
    a0 = max((x_right - first_x) / float(L), 4.0)
    accum = np.array([c.acc for c in cols])
    est = [(c.x - first_x - 0.3 * np.sum(accum[1:i + 1])) / a0 for i, c in enumerate(cols)]
    best = _search(cols, evs, gid, groups, est, L, beam, Layout(a0, first_x), accum, twin=twins(cols, L))
    if best is None:
        return {}, {}, dict(cost=1e9, failed=True, times=[], cols=[])
    onset, length, cost, times = best
    for e in whole:
        onset[e.id], length[e.id] = Fraction(0), L
    return onset, length, dict(cost=cost, est=est, cols=[c.x for c in cols], times=[float(t) for t in times])


def _search(cols, evs, gid, groups, est, L, beam, layout, accum, force=None, twin=None):
    twin = twin or [False] * len(cols)
    # path: (cost, times, pending ends, scales, layout observations, layout cost so far)
    paths = [(0.0, (), (), (), (), 0.0)]
    group_seen = set()
    for ci, col in enumerate(cols):
        new_groups = []
        for e in col.events:
            g = gid[e.id]
            if g not in group_seen and e.kind == "note" and len(groups[g]) in (3, 6, 9, 12):
                new_groups.append(g)
        for e in col.events:
            group_seen.add(gid[e.id])
        scale_opts = [dict()]
        for g in new_groups:
            scale_opts = [{**o, g: s} for o in scale_opts for s in SCALES]
        nxt = {}
        for cost, times, pend, scl, obs, lcost in paths:
            Tp = times[-1] if times else None
            for so in scale_opts:
                scl2 = scl + tuple(sorted(so.items()))
                sd = dict(scl2)
                if ci == 0:
                    cands = [(Fraction(0), 0.0)]
                else:
                    cset = {}
                    gap = col.x - cols[ci - 1].x
                    if gap <= DISP_MAX:
                        cset[Tp] = 0.0 if twin[ci] else P["same"]
                    for E in pend:
                        if E > Tp and E < L and abs(float(E) - est[ci]) <= 1.5:
                            cset[E] = min(cset.get(E, 9), 0.0)
                    lo = max(Tp + GRID, Fraction(int((est[ci] - P["window"]) * 12), 12) if est[ci] > P["window"] else GRID)
                    t = lo
                    while float(t) <= est[ci] + P["window"] and t < L:
                        if t > Tp and t not in cset:
                            cset[t] = P["off"] + (0.0 if (t * 2).denominator == 1 else (P["grid"] if (t * 4).denominator == 1 else 2 * P["grid"]))
                        t += GRID
                    cands = [(t, b + (P["twin"] if twin[ci] and t != Tp else 0.0)) for t, b in cset.items()]
                if force is not None and ci in force:
                    cands = [(force[ci], 0.0 if (force[ci] in pend or force[ci] == Tp or ci == 0) else P["off"])]
                for T, base in cands:
                    if ci > 0 and T == Tp:
                        # a voice displaced sideways at the same instant: of the two x values only the one that
                        # fits the layout better is evidence about time
                        swap = obs[:-1] + ((float(T), cols[ci].x, float(accum[ci])),)
                        nl_swap = layout.cost(swap)
                        nobs, nl = (swap, nl_swap) if nl_swap < lcost else (obs, lcost)
                    else:
                        nobs = obs + ((float(T), cols[ci].x, float(accum[ci])),)
                        nl = layout.cost(nobs)
                    dev = nl - lcost
                    skipc = P["skip"] * sum(1 for E in pend if Tp < E < T) if ci > 0 else 0.0
                    c = cost + base + dev + skipc
                    ends = list(pend)
                    mis = 0
                    for e in col.events:
                        s = sd.get(gid[e.id], Fraction(1))
                        d = quarters(e, L) * (s if e.kind == "note" else 1)
                        if e.kind == "note":
                            u = min(d, Fraction(1, 2))          # a note starts on a multiple of its own value (up to an eighth)
                            if u > 0 and (T / u).denominator != 1:
                                mis += 1
                        end = T + d
                        if end > L + Fraction(1, 100):
                            c += 6.0 * float(end - L) + 2.0
                        ends.append(end)
                    c += P["align"] * min(mis, 2)
                    if force is not None:
                        TRACE.append((ci, str(T), round(base, 2), round(dev, 2), round(skipc, 2), mis, round(c - cost, 2)))
                    ends = tuple(sorted(E for E in ends if E > T and E < L))
                    key = (T, ends, scl2)
                    cur = nxt.get(key)
                    if cur is None or c < cur[0]:
                        nxt[key] = (c, times + (T,), ends, scl2, nobs, nl)
        paths = sorted(nxt.values(), key=lambda p: p[0])[:beam]
        if not paths:
            return None
    # final scoring: staff coverage over [0, L)
    best = None
    for cost, times, pend, scl, obs, lcost in paths:
        sd = dict(scl)
        iv = {0: [], 1: []}
        for T, col in zip(times, cols):
            for e in col.events:
                s = sd.get(gid[e.id], Fraction(1))
                d = quarters(e, L) * (s if e.kind == "note" else 1)
                iv[e.staff].append((T, T + d))
        c = cost + P["tail"] * len(set(pend))          # ends before the barline that nothing continues
        for st, lst in iv.items():
            if not lst:
                continue
            lst.sort()
            cov, end = Fraction(0), Fraction(0)
            for s0, s1 in lst:
                s0 = max(s0, end)
                if s1 > s0:
                    cov += s1 - s0
                    end = s1
            c += P["cover"] * float(L - min(cov, L))
        if best is None or c < best[0]:
            best = (c, times, scl)
    c, times, scl = best
    sd = dict(scl)
    onset, length = {}, {}
    for T, col in zip(times, cols):
        for e in col.events:
            s = sd.get(gid[e.id], Fraction(1))
            onset[e.id] = T
            length[e.id] = quarters(e, L) * (s if e.kind == "note" else 1)
    return onset, length, c, times

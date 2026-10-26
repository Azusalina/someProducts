"""Build the score JSON from a vector PDF alone (rhythm solved from the engraving, see rhythm.py).

Used for pieces that come without a MIDI file. Time is in quarter notes. Bars are of three kinds:

  normal  a measure of `bar` quarters; onsets come from the beam search in rhythm.py
  pickup  the first measure when its notated values add up to less than the metre (its length is that sum)
  free    cadenza rows written in small notes with no usable metre; columns are spread by x at a fixed speed
          (`free_step` quarters per column spacing), a documented assumption, not a reading of the score
"""
import os
import statistics
import multiprocessing
from concurrent.futures import ProcessPoolExecutor
from fractions import Fraction
from .score import parse_document
from .rhythm import solve_bar, columns

NAME12 = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
FREE_MIN_SMALL = 8          # a bar with at least this many small-size notes is a free-time cadenza bar


def bar_kind(evs):
    small = sum(1 for e in evs if e.kind == "note" and e.grace)
    return "free" if small >= FREE_MIN_SMALL else "normal"


def solve_free(evs, x_right, free_step):
    """Spread the columns of a cadenza bar by x. Returns onset/length dicts (Fractions) and the bar length."""
    cols = columns(evs)
    xs = [c.x for c in cols]
    gaps = [b - a for a, b in zip(xs, xs[1:]) if b - a > 1.5]
    g = min(max(statistics.median(gaps) if gaps else 10.0, 3.0), 20.0)
    onset, length = {}, {}
    for c in cols:
        t = Fraction((c.x - xs[0]) / g * float(free_step)).limit_denominator(48)
        for e in c.events:
            onset[e.id] = t
    for st in (0, 1):
        seq = sorted([e for e in evs if e.staff == st], key=lambda e: (onset[e.id], e.id))
        for i, e in enumerate(seq):
            nxt = next((f for f in seq[i + 1:] if onset[f.id] > onset[e.id]), None)
            nominal = (e.nominal if e.grace else e.dur) * 4
            if e.kind == "rest" or not e.grace:
                length[e.id] = nominal if nominal else free_step
            else:                                      # small run note: sounds until the next one on its staff
                length[e.id] = min(max((onset[nxt.id] - onset[e.id]) if nxt else 2 * free_step, free_step), Fraction(1))
    end = max(onset[e.id] + length[e.id] for e in evs)
    return onset, length, end


_JOBS = []


def _solve(i):
    kind, real, x0, x1, L, free_step = _JOBS[i]
    if not real:
        return {}, {}, L, 0.0
    if kind == "free":
        onset, length, L = solve_free(real, x1, free_step)
        return onset, length, L, 0.0
    onset, length, info = solve_bar(real, x0, x1, L)
    return onset, length, L, info.get("cost", 0.0)


def build(pdf_path, bar=6, free_step=Fraction(1, 4), first_measure=None, last_measure=None, jobs=None):
    doc, pages, warns = parse_document(pdf_path)
    systems = [(pi, sy) for pi, ss in enumerate(pages) for sy in ss]
    L_full = Fraction(bar)
    plan = []                      # one entry per bar, in reading order
    _JOBS.clear()
    for si_, (pi, sy) in enumerate(systems):
        nbars = len(sy.barlines) - 1
        nxt_first = systems[si_ + 1][1].first_measure if si_ + 1 < len(systems) else None
        for k in range(nbars):
            evs = [e for e in sy.events if e.measure == k]
            kind = bar_kind(evs)
            m = sy.first_measure + k
            if (first_measure and m < first_measure) or (last_measure and m > last_measure):
                continue
            real = [e for e in evs if kind == "free" or not e.grace]
            L = L_full
            if kind == "normal" and pi == 0 and sy.index == 0 and k == 0:
                # an anacrusis: as long as its fullest staff (notated values), if that is shorter than the metre
                fill = max(sum((e.dur * 4 for e in real if e.staff == st and not e.bar_rest), Fraction(0))
                           for st in (0, 1))
                if 0 < fill < L_full:
                    L, kind = fill, "pickup"
            # a free (cadenza) row stands for the printed numbers up to the next row's first one
            span = max(1, nxt_first - m) if (kind == 'free' and k == nbars - 1 and nxt_first is not None) else 1
            plan.append((pi, sy, k, m, span, kind, real))
            _JOBS.append((kind, real, sy.barlines[k], sy.barlines[k + 1], L, free_step))
    jobs = jobs or os.cpu_count() or 1
    if jobs > 1 and len(_JOBS) > 1 and "fork" in multiprocessing.get_all_start_methods():
        with ProcessPoolExecutor(max_workers=min(jobs, len(_JOBS)), mp_context=multiprocessing.get_context("fork")) as ex:
            solved = list(ex.map(_solve, range(len(_JOBS))))
    else:
        solved = [_solve(i) for i in range(len(_JOBS))]

    measures_out, report, notes = [], [], []
    t_start = Fraction(0)
    nid = 0
    for (pi, sy, k, m, span, kind, real), (onset, length, L, cost) in zip(plan, solved):
        x0, x1 = sy.barlines[k], sy.barlines[k + 1]
        measures_out.append(dict(n=m, n2=m + span - 1, page=pi, system=sy.index, index=k, kind=kind,
                                 start=float(t_start), length=float(L),
                                 x0=round(x0, 2), x1=round(x1, 2), y0=round(sy.y0, 2), y1=round(sy.y1, 2)))
        heads = 0
        for e in real:                  # (events in the parent process are not touched by the workers)
            e.onset_q = onset.get(e.id)
            e.len_q = length.get(e.id)
        for e in real:
            if e.kind != "note" or e.onset_q is None:
                continue
            for h in e.heads:
                heads += 1
                if h.tie_prev:
                    continue
                notes.append(dict(
                    id=nid, measure=m, hand="R" if h.staff == 0 else "L", midi=h.midi,
                    name=f"{NAME12[h.midi % 12]}{h.midi // 12 - 1}",
                    t=float(t_start + e.onset_q), d=float(e.len_q), grace=False, tieNext=bool(h.tie_next),
                    page=pi, x=round(h.x, 2), y=round(h.y, 2), src="pdf", _h=h, _e=e))
                nid += 1
        gaps = {}
        for st, name in ((0, "R"), (1, "L")):
            iv = sorted((e.onset_q, e.onset_q + e.len_q) for e in real
                        if e.staff == st and getattr(e, "onset_q", None) is not None and not e.grace)
            if not iv:
                continue
            cov, end = Fraction(0), Fraction(0)
            for a_, b_ in iv:
                a_ = max(a_, end)
                if b_ > a_:
                    cov += b_ - a_
                    end = b_
            if L - cov > 0:
                gaps[name] = float(L - min(cov, L))
        report.append(dict(measure=m, kind=kind, heads=heads, cost=round(cost, 2), length=float(L), gaps=gaps))
        t_start += L
    merge_ties(notes, pages)
    for n in notes:
        n.pop("_h", None)
        n.pop("_e", None)
    return dict(notes=notes, measures=measures_out, report=report, warnings=warns)


def merge_ties(notes, pages):
    """Add the length of every tied continuation to the first note of its chain."""
    nxt = {}
    ev_of = {}
    for ss in pages:
        for sy in ss:
            for h in sy.heads:
                if h.tie_prev and h.tie_from is not None:
                    nxt[id(h.tie_from)] = h
            for e in sy.events:
                if e.kind == "note":
                    for h in e.heads:
                        ev_of[id(h)] = e
    for n in notes:
        cur = n["_h"]
        while id(cur) in nxt:
            cur = nxt[id(cur)]
            e = ev_of.get(id(cur))
            ln = getattr(e, "len_q", None) if e is not None else None
            if ln is None:
                break
            n["d"] += float(ln)
            n["tied"] = True

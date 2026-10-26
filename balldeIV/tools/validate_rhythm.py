"""Check the rhythm solver against bars that carry their own proof.

usage: validate_rhythm.py pdf [bar_quarters=6] [param=value ...]

A bar qualifies when one voice (a staff's notes and rests of one stem direction, one event per column) adds up to
exactly one measure: its onsets are then known from the notated values alone. The solver is run on the whole bar
without that information and compared event by event. Known limit: a few bars pass this test only because two voices
share a stem direction; that shows up as a mismatch with a very low solver cost (check those by eye).
"""
import sys, time, os
from fractions import Fraction
from concurrent.futures import ProcessPoolExecutor
import multiprocessing
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from omr.score import parse_document
import omr.rhythm as R

args = [a for a in sys.argv[1:] if "=" not in a]
PDF = args[0]
L = Fraction(int(args[1]) if len(args) > 1 else 6)
BAR_WHOLE = L / 4
for kv in [a for a in sys.argv[1:] if "=" in a]:
    k, v = kv.split("=")
    R.P[k] = eval(v)
doc, pages, warns = parse_document(PDF)
JOBS = []
for pi, ss in enumerate(pages):
    for sy in ss:
        for k in range(len(sy.barlines) - 1):
            evs = [e for e in sy.events if e.measure == k and not e.grace]
            truth = {}
            for st in (0, 1):
                for sd in ("up", "down"):
                    v = sorted([e for e in evs if e.staff == st and not e.bar_rest and
                                (e.stem_dir == sd if e.kind == "note" and e.stem_dir else (("up" if getattr(e, "rest_up", False) else "down") == sd))],
                               key=lambda e: e.x)
                    if len(v) < 4 or sum((e.dur for e in v), Fraction(0)) != BAR_WHOLE:
                        continue
                    if any(b.x - a.x < 1.5 for a, b in zip(v, v[1:])):
                        continue
                    t = Fraction(0)
                    for e in v:
                        truth[e.id] = t
                        t += e.dur * 4
            if truth:
                JOBS.append((pi + 1, sy.index, sy.first_measure + k, evs, truth, sy.barlines[k], sy.barlines[k + 1]))


def run(i):
    pi, si, m, evs, truth, x0, x1 = JOBS[i]
    onset, length, info = R.solve_bar(evs, x0, x1, L)
    wrong = sum(1 for e in evs if e.id in truth and onset.get(e.id) != truth[e.id])
    return (pi, si, m, wrong, len(truth), round(info.get("cost", 0), 1))


if __name__ == "__main__":
    t0 = time.time()
    with ProcessPoolExecutor(max_workers=os.cpu_count(), mp_context=multiprocessing.get_context("fork")) as ex:
        res = list(ex.map(run, range(len(JOBS))))
    tot = sum(r[4] for r in res)
    wrong = sum(r[3] for r in res)
    print("bars", len(res), "events", tot, "correct %.1f%%" % (100 * (tot - wrong) / tot),
          "bars fully right", sum(1 for r in res if r[3] == 0), "time %.0fs" % (time.time() - t0))
    for r in res:
        if r[3]:
            print("  p%d s%d m%d wrong %d/%d cost %s" % r)

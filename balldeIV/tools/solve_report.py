import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pymupdf
from omr.primitives import load_page
from omr.analyze import analyze_page
from omr.pitch import compute_pitches
from omr.timing import solve_measure

d = pymupdf.open(sys.argv[1])
p0, p1 = int(sys.argv[2]), int(sys.argv[3])
good = bad = 0
for pi in range(p0 - 1, p1):
    pg = load_page(d, pi)
    systems, _ = analyze_page(pg)
    for sy in systems:
        compute_pitches(sy)
        row = []
        for m in range(len(sy.barlines) - 1):
            evs = [e for e in sy.events if e.measure == m]
            onset, length, val = solve_measure(evs)
            cost = val[0] if isinstance(val, tuple) else val
            row.append(f"{cost:.1f}")
            if cost < 0.5:
                good += 1
            else:
                bad += 1
        print(f"p{pi+1} s{sy.index}:", " ".join(row))
print("measures ok", good, "bad", bad)

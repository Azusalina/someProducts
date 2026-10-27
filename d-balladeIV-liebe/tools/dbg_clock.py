import sys, os
from fractions import Fraction
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pymupdf
from omr.primitives import load_page
from omr.analyze import analyze_page
from omr.timing import beam_groups, cluster_columns, run_clock, BAR

d = pymupdf.open(sys.argv[1])
pg = load_page(d, int(sys.argv[2]) - 1)
systems, _ = analyze_page(pg)
sy = systems[int(sys.argv[3])]
m = int(sys.argv[4])
evs = [e for e in sy.events if e.measure == m and not e.grace]
length = {e.id: e.dur for e in evs}
for g in beam_groups(evs):
    if len(g) > 1 and g[0].staff == 1:
        for e in g:
            length[e.id] = e.dur * Fraction(2, 3)
cols = cluster_columns(evs)
onset, cost = run_clock(cols, length, BAR)
print("cost", cost)
for c in cols:
    print(f"x={c[0].x:7.2f}", [(('RL'[e.staff]) + e.stem_dir[:1], str(onset[e.id]), str(length[e.id])) for e in c])

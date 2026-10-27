import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pymupdf
from omr.primitives import load_page
from omr.analyze import analyze_page
from omr.timing import beam_groups, cluster_columns

d = pymupdf.open(sys.argv[1])
pg = load_page(d, int(sys.argv[2]) - 1)
systems, _ = analyze_page(pg)
sy = systems[int(sys.argv[3])]
m = int(sys.argv[4])
evs = [e for e in sy.events if e.measure == m and not e.grace]
gs = beam_groups(evs)
print("groups", [(len(g), 'RL'[g[0].staff]) for g in gs])
for e in evs[:6]:
    print(e.id, e.x, len(e.beam_polys), [tuple(round(v, 1) for v in p.bbox) for p in e.beam_polys])
print("columns", len(cluster_columns(evs)))

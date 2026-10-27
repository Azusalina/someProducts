import sys, os, collections
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pymupdf
from omr.primitives import load_page
from omr.analyze import analyze_page
from omr.pitch import compute_pitches

d = pymupdf.open(sys.argv[1])
p0, p1 = int(sys.argv[2]), int(sys.argv[3])
for pi in range(p0 - 1, p1):
    pg = load_page(d, pi)
    systems, _ = analyze_page(pg)
    for sy in systems:
        compute_pitches(sy)
        row = []
        for m in range(len(sy.barlines) - 1):
            parts = []
            for st in (0, 1):
                evs = [e for e in sy.events if e.measure == m and e.staff == st and not e.grace]
                tot = sum((e.dur for e in evs), 0)
                parts.append(f"{'RL'[st]}={tot}")
            row.append(" ".join(parts))
        print(f"p{pi+1} s{sy.index}:", " | ".join(row))

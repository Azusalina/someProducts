import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pymupdf
from omr.primitives import load_page
from omr.analyze import analyze_page
from omr.pitch import compute_pitches
from omr.timing import solve_measure, beam_groups

d = pymupdf.open(sys.argv[1])
pg = load_page(d, int(sys.argv[2]) - 1)
systems, _ = analyze_page(pg)
sy = systems[int(sys.argv[3])]
compute_pitches(sy)
m = int(sys.argv[4])
evs = [e for e in sy.events if e.measure == m]
onset, length, val = solve_measure(evs)
print("cost", val[0] if isinstance(val, tuple) else val)
for e in sorted(evs, key=lambda e: (e.x, e.staff)):
    nm = " ".join(h.name() for h in sorted(e.heads, key=lambda h: -h.midi)) if e.kind == "note" else "REST"
    o = onset.get(e.id)
    L = length.get(e.id)
    print(f"x={e.x:7.2f} {'RL'[e.staff]} {e.stem_dir:4s} raw={str(e.dur):>5s} len={str(L):>5s} on={str(o):>6s} b={e.beams} f={getattr(e,'flags',0)} {'G ' if e.grace else ''}{nm}")

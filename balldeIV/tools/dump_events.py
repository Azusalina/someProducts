import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pymupdf
from omr.primitives import load_page
from omr.analyze import analyze_page
from omr.pitch import compute_pitches

d = pymupdf.open(sys.argv[1])
pi = int(sys.argv[2]) - 1
only_sys = int(sys.argv[3]) if len(sys.argv) > 3 else None
pg = load_page(d, pi)
systems, _ = analyze_page(pg)
for sy in systems:
    if only_sys is not None and sy.index != only_sys:
        continue
    compute_pitches(sy)
    print(f"== p{pi+1} system {sy.index} bars={sy.barlines} ks={[(k[0], k[1]) for k in sy.ks.values()]}")
    for m in range(len(sy.barlines) - 1):
        print(f" -- measure idx {m}")
        evs = sorted([e for e in sy.events if e.measure == m], key=lambda e: (e.x, e.staff))
        tot = {0: 0, 1: 0}
        for e in evs:
            nm = " ".join(h.name() for h in sorted(e.heads, key=lambda h: -h.midi)) if e.kind == "note" else "REST"
            print(f"   x={e.x:7.2f} st={'RL'[e.staff]} {e.kind:4s} {str(e.dur):>6s} dots={e.dots} b={e.beams} f={getattr(e,'flags',0)} "
                  f"{e.stem_dir:4s}{' G' if e.grace else ''} {nm}")

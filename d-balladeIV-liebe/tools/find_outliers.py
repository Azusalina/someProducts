import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pymupdf
from omr.primitives import load_page
from omr.analyze import analyze_page
from omr.pitch import compute_pitches

d = pymupdf.open(sys.argv[1])
for pi in range(len(d)):
    pg = load_page(d, pi)
    systems, _ = analyze_page(pg)
    for sy in systems:
        compute_pitches(sy)
        for h in sy.heads:
            if h.midi < 21 or h.midi > 108:
                st = sy.staves[h.staff]
                print(f"p{pi+1} s{sy.index} staff={'RL'[h.staff]} x={h.x:.1f} y={h.y:.1f} size={h.g.size} midi={h.midi} step={h.step:.1f} "
                      f"staffTop={st.top:.1f} staffBot={st.bottom:.1f} clef={h.clef}")

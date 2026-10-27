import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from omr.score import parse_document
doc, pages, _ = parse_document(sys.argv[1])
m = int(sys.argv[2])
for ss in pages:
    for sy in ss:
        for k in range(len(sy.barlines) - 1):
            if sy.first_measure + k != m:
                continue
            for si, st in enumerate(sy.staves):
                print("staff", si, "lines", [round(v, 1) for v in st.lines], "clefs", [(round(x), c) for x, c in sy.clefs[si]], "ks", [(round(x), k, n) for x, k, n, _ in sy.ks[si]])
            for e in sorted([e for e in sy.events if e.measure == k and e.kind == "note"], key=lambda e: e.x)[:int(sys.argv[3]) if len(sys.argv) > 3 else 12]:
                for h in e.heads:
                    print(f"  x={h.x:.1f} y={h.y:.1f} staff={h.staff} step={h.step:.1f} dia={h.dia} clef={h.clef} alter={h.alter} midi={h.midi} {h.name()} shift={h.shift}")

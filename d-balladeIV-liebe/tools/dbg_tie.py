import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from omr.score import parse_document

doc, pages, _ = parse_document(sys.argv[1])
mnum = int(sys.argv[2])
for ss in pages:
    for sy in ss:
        for k in range(len(sy.barlines) - 1):
            if sy.first_measure + k != mnum:
                continue
            print("system", sy.page + 1, sy.index, "bars", [round(b, 1) for b in sy.barlines])
            for e in sy.events:
                if e.measure == k and e.kind == "note":
                    for h in e.heads:
                        print(f"  head {h.name()} staff={h.staff} x={h.x:.1f} y={h.y:.1f} tie_prev={h.tie_prev} tie_next={h.tie_next}")
            pg = None
            import pymupdf
            from omr.primitives import load_page
            pg = load_page(doc, sy.page)
            for c in pg.curves:
                mid = (c["bbox"][1] + c["bbox"][3]) / 2
                if sy.y0 - 40 <= mid <= sy.y1 + 40 and sy.barlines[k] - 60 <= c["p0"][0] <= sy.barlines[k + 1] + 60:
                    print("  curve bbox", [round(v, 1) for v in c["bbox"]], "p0", [round(v, 1) for v in c["p0"]],
                          "p1", [round(v, 1) for v in c["p1"]], "w", round(c["width"], 2), "n", c["n"], "filled", c["filled"])

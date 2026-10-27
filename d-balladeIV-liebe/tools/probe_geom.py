import sys, os, collections
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pymupdf
from omr.primitives import load_page, U
from omr.staves import build_systems

d = pymupdf.open(sys.argv[1])
pi, si = int(sys.argv[2]) - 1, int(sys.argv[3])
pg = load_page(d, pi)
sy = build_systems(pg)[si]
print("system", sy.y0, sy.y1, "barlines", sy.barlines)
print("vline widths", collections.Counter(round(v.w, 2) for v in pg.vlines))
print("hline widths", collections.Counter(round(v.w, 2) for v in pg.hlines))
# stems in system
x0, x1 = sy.barlines[0], sy.barlines[1]
vs = [v for v in pg.vlines if sy.y0 - 60 < v.y0 < sy.y1 + 60 and x0 < v.x0 < x1 and v.w < 0.6]
heads = [g for g in pg.glyphs if g.u == 339 and sy.y0 - 40 < g.y < sy.y1 + 40 and x0 < g.x < x1]
print(len(vs), "stems;", len(heads), "heads")
for v in sorted(vs, key=lambda v: v.x0)[:12]:
    ya, yb = sorted((v.y0, v.y1))
    near = [h for h in heads if abs(h.x - v.x0) < 12 and ya - 3 < h.y < yb + 3]
    print(f"stem x={v.x0:.2f} y={ya:.1f}..{yb:.1f} w={v.w}",
          [(round(h.x - v.x0, 2), round(h.y, 1), round(h.bbox[2] - v.x0, 2)) for h in near])
print("beams in system:")
for b in pg.beams:
    if sy.y0 - 60 < b.bbox[1] < sy.y1 + 60 and x0 < b.bbox[0] < x1:
        print([(round(a, 1), round(b_, 1)) for a, b_ in b.pts])
        break
print("head bbox width", heads[0].bbox[2] - heads[0].bbox[0], "origin->bbox", heads[0].x - heads[0].bbox[0])

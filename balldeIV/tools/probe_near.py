import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pymupdf
from omr.primitives import load_page

d = pymupdf.open(sys.argv[1])
pg = load_page(d, int(sys.argv[2]) - 1)
x0, x1, y0, y1 = map(float, sys.argv[3:7])
print("glyphs")
for g in pg.glyphs:
    if x0 <= g.x <= x1 and y0 <= g.y <= y1:
        print("  u", g.u, g.size, round(g.x, 2), round(g.y, 2), [round(b, 1) for b in g.bbox])
print("vlines")
for v in pg.vlines:
    if x0 <= v.x0 <= x1 and (y0 - 40 <= min(v.y0, v.y1) <= y1 + 40):
        print("  ", round(v.x0, 2), round(v.y0, 2), round(v.y1, 2), v.w)
print("hlines")
for v in pg.hlines:
    if x0 <= v.x0 <= x1 and y0 <= v.y0 <= y1 and abs(v.x1 - v.x0) < 60:
        print("  ", round(v.x0, 2), round(v.x1, 2), round(v.y0, 2), v.w)
print("beams")
for b in pg.beams:
    if x0 <= b.bbox[2] and b.bbox[0] <= x1 and y0 - 30 <= b.bbox[1] <= y1 + 30:
        print("  ", [(round(a, 1), round(c, 1)) for a, c in b.pts])

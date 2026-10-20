import sys, os, collections
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pymupdf
from omr.primitives import load_page, U

d = pymupdf.open(sys.argv[1])
hist = collections.Counter()
for pi in range(len(d)):
    pg = load_page(d, pi)
    stems = [(v.x0, min(v.y0, v.y1), max(v.y0, v.y1)) for v in pg.vlines if v.w < 0.6 and abs(v.y1 - v.y0) >= 9]
    for g in pg.glyphs:
        if g.u not in (339, 729) or g.size < 15:
            continue
        for sx, ya, yb in stems:
            if ya - 1.5 <= g.y <= yb + 1.5 and -1 < sx - g.x < 11:
                hist[round(sx - g.x, 1)] += 1
for k, v in sorted(hist.items()):
    if v > 15:
        print(k, v)

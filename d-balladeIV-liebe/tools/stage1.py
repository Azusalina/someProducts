import sys, os, collections
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pymupdf
from omr.primitives import load_page, U
from omr.staves import build_systems

d = pymupdf.open(sys.argv[1])
for pi in range(len(d)):
    pg = load_page(d, pi)
    sy = build_systems(pg)
    print(f"p{pi+1}: systems={len(sy)}", [(round(s.y0), len(s.barlines)) for s in sy],
          "hl", len(pg.hlines), "vl", len(pg.vlines), "beams", len(pg.beams), "curves", len(pg.curves))
pg = load_page(d, 0)
sy = build_systems(pg)[0]
print(sy.staves[0].lines, sy.staves[0].space, sy.barlines)
heads = [g for g in pg.glyphs if g.u == U["HEAD"]][:6]
for h in heads:
    st = sy.staves[0] if abs(h.y - sy.staves[0].bottom) < abs(h.y - sy.staves[1].bottom) else sy.staves[1]
    print(h.x, h.y, h.bbox, round(st.step_of(h.y), 3))

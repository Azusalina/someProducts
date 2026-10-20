import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pymupdf
from omr.primitives import load_page

d = pymupdf.open(sys.argv[1])
for pi in range(len(d)):
    p = d[pi]
    pg = load_page(d, pi)
    gl = [g for g in pg.glyphs if g.u in (8220, 8221, 58, 59)]
    for g in gl:
        print(f"p{pi+1} glyph u{g.u} {g.font[:12]} size={g.size} x={g.x:.1f} y={g.y:.1f}")
    dashed = [x for x in p.get_drawings() if x.get("dashes") and x["dashes"] not in ("[] 0", "")]
    for x in dashed:
        r = x["rect"]
        print(f"p{pi+1} dashed {x['dashes']} rect=({r.x0:.1f},{r.y0:.1f},{r.x1:.1f},{r.y1:.1f}) w={x.get('width')} items={len(x['items'])}")

import sys, os, collections
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pymupdf
from omr.primitives import load_page, U

d = pymupdf.open(sys.argv[1])
dxs = collections.Counter()
dys = collections.Counter()
flagdx = collections.Counter()
flagdy = collections.Counter()
rest_dot = collections.Counter()
for pi in range(len(d)):
    pg = load_page(d, pi)
    heads = [g for g in pg.glyphs if g.u == U["HEAD"] and g.size > 15]
    rests = [g for g in pg.glyphs if g.u in (U["REST_Q"], U["REST_8"], U["REST_16"], U["REST_32"])]
    dots = [g for g in pg.glyphs if g.u in (U["DOT"], U["DOT_SPECIAL"]) and g.size > 15]
    stems = [v for v in pg.vlines if v.w < 0.6 and abs(v.y1 - v.y0) > 9]
    for dt in dots:
        best = None
        for h in heads:
            dx = dt.x - h.bbox[2]
            dy = dt.y - h.y
            if -1 < dx < 14 and abs(dy) < 6:
                if best is None or abs(dy) < abs(best[1]):
                    best = (dx, dy)
        if best:
            dxs[(dt.u, round(best[0]))] += 1
            dys[(dt.u, round(best[1], 1))] += 1
        for r in rests:
            dx = dt.x - r.bbox[2]
            dy = dt.y - r.y
            if -1 < dx < 12 and abs(dy) < 12:
                rest_dot[(r.u, round(dx), round(dy))] += 1
    for g in pg.glyphs:
        if g.u in (U["FLAG_UP8"], U["FLAG_DN8"], U["FLAG_16"]):
            best = min(stems, key=lambda v: abs(v.x0 - g.x) + 0.0 * abs(v.y0 - g.y)) if stems else None
            near = [v for v in stems if abs(v.x0 - g.x) < 3 and (min(v.y0, v.y1) - 3 < g.y < max(v.y0, v.y1) + 3)]
            for v in near:
                ya, yb = sorted((v.y0, v.y1))
                flagdx[(g.u, round(g.x - v.x0, 1))] += 1
                flagdy[(g.u, 'top' if abs(g.y - ya) < abs(g.y - yb) else 'bot', round(min(abs(g.y - ya), abs(g.y - yb))))] += 1
print("dot dx (u,dx from head right edge):", sorted(dxs.items()))
print("dot dy:", sorted(dys.items())[:40])
print("rest dot (restglyph,dx,dy):", sorted(rest_dot.items()))
print("flag dx:", sorted(flagdx.items()))
print("flag dy:", sorted(flagdy.items()))

"""Render a system of the PDF at high zoom with the parsed events drawn on top.
usage: overlay.py pdf page system out.png [measure]"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pymupdf
from PIL import Image, ImageDraw
from omr.primitives import load_page
from omr.analyze import analyze_page
from omr.pitch import compute_pitches
from omr.timing import solve_measure

pdf, pageno, sysno, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
only_m = int(sys.argv[5]) if len(sys.argv) > 5 else None
d = pymupdf.open(pdf)
pg = load_page(d, pageno - 1)
systems, _ = analyze_page(pg)
sy = systems[sysno]
compute_pitches(sy)
Z = 4
x0, x1 = sy.barlines[0] - 20, sy.barlines[-1] + 10
if only_m is not None:
    x0, x1 = sy.barlines[only_m] - 5, sy.barlines[only_m + 1] + 5
clip = pymupdf.Rect(x0, sy.y0 - 45, x1, sy.y1 + 40)
pix = d[pageno - 1].get_pixmap(matrix=pymupdf.Matrix(Z, Z), clip=clip)
im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
dr = ImageDraw.Draw(im)


def P(x, y):
    return ((x - clip.x0) * Z, (y - clip.y0) * Z)


for m in range(len(sy.barlines) - 1):
    if only_m is not None and m != only_m:
        continue
    evs = [e for e in sy.events if e.measure == m]
    onset, length, val = solve_measure(evs)
    for e in evs:
        col = (200, 0, 0) if e.staff == 0 else (0, 0, 220)
        o = onset.get(e.id)
        lab = f"{o}" if o is not None else "?"
        if e.kind == "note":
            ytop = min(h.y for h in e.heads)
            for h in e.heads:
                px, py = P(h.x, h.y)
                dr.text((px - 2, py - 5), h.name(), fill=(0, 120, 0))
            px, py = P(e.x, ytop - 12 if e.staff == 0 else max(h.y for h in e.heads) + 14)
            dr.text((px, py), f"{lab}", fill=col)
            dr.text((px, py + 10), f"d{e.dur}", fill=(120, 120, 120))
        else:
            g = e.rest_glyph
            px, py = P(g.x, g.y - 12)
            dr.text((px, py), f"R {lab} d{e.dur}", fill=col)
im.save(out)
print(im.size)

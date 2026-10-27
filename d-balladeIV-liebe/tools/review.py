"""Draw a built score on top of its PDF page, for visual audit.

usage: review.py pdf score.json page(1-based) system out.png [zoom [xlo xhi]]   (x range in PDF points)

Every note head gets its name (green) and its onset inside the bar in quarter notes (red); measure boundaries are
blue lines with the measure number. Compare against the engraving: pitch, ties, and that columns that look
simultaneous share an onset.
"""
import sys, json
import pymupdf
from PIL import Image, ImageDraw

pdf, js, page, system, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
Z = float(sys.argv[6]) if len(sys.argv) > 6 else 3.0
sc = json.load(open(js))
ms = [m for m in sc["measures"] if m["page"] == page - 1 and m["system"] == system]
if not ms:
    raise SystemExit("no such system")
start = {m["n"]: m["start"] for m in sc["measures"]}
x0, x1 = min(m["x0"] for m in ms) - 12, max(m["x1"] for m in ms) + 8
if len(sys.argv) > 8:   # (argv[6] = zoom)
    x0, x1 = float(sys.argv[7]), float(sys.argv[8])
y0, y1 = ms[0]["y0"] - 22, ms[0]["y1"] + 26
clip = pymupdf.Rect(x0, y0, x1, y1)
d = pymupdf.open(pdf)
pix = d[page - 1].get_pixmap(matrix=pymupdf.Matrix(Z, Z), clip=clip)
im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
dr = ImageDraw.Draw(im)
P = lambda x, y: ((x - x0) * Z, (y - y0) * Z)
for m in ms:
    a = P(m["x0"], m["y0"] - 14)
    dr.line([a, P(m["x0"], m["y1"] + 8)], fill=(40, 90, 255), width=2)
    dr.text((a[0] + 3, a[1] - 2), f"m{m['n']}" + (f"-{m['n2']}" if m["n2"] != m["n"] else "") + f" [{m['kind']} {m['length']:g}q]", fill=(40, 90, 255))
for n in sc["notes"]:
    if n["page"] != page - 1 or not any(m["n"] == n["measure"] for m in ms):
        continue
    if not x0 <= n["x"] <= x1:
        continue
    px, py = P(n["x"], n["y"])
    t = n["t"] - start[n["measure"]]
    up = n["hand"] == "R"
    dr.text((px - 3, py - 17 if up else py + 6), n["name"], fill=(0, 130, 0))
    dr.text((px - 3, py - 8 if up else py + 15), f"{t:.2f}".rstrip("0").rstrip("."), fill=(220, 0, 0))
im.save(out)
print(im.size)

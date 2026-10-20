"""Contact sheet: one tile per distinct Opus glyph (by unicode+size), cropped around its first occurrence.
Each tile highlights the glyph bbox in red so it can be told apart from neighbours."""
import sys
import pymupdf
from PIL import Image, ImageDraw

pdf, out = sys.argv[1], sys.argv[2]
d = pymupdf.open(pdf)
seen = {}
for pi, p in enumerate(d):
    for tr in p.get_texttrace():
        if "Opus" not in tr["font"] or "Special" in tr["font"] and False:
            continue
        for uni, gid, origin, bbox in tr["chars"]:
            if uni == 32:
                continue
            k = (tr["font"][:9], uni, round(tr["size"]))
            if k not in seen:
                seen[k] = (pi, bbox)
Z = 5
tiles = []
for k, (pi, bb) in sorted(seen.items()):
    p = d[pi]
    cx, cy = (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2
    r = pymupdf.Rect(cx - 22, cy - 22, cx + 22, cy + 22)
    pix = p.get_pixmap(matrix=pymupdf.Matrix(Z, Z), clip=r)
    im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    dr = ImageDraw.Draw(im)
    dr.rectangle([(bb[0] - r.x0) * Z, (bb[1] - r.y0) * Z, (bb[2] - r.x0) * Z, (bb[3] - r.y0) * Z], outline=(255, 0, 0))
    dr.text((3, 3), f"{k[0]} u{k[1]} '{chr(k[1]) if 32 < k[1] < 127 else ''}' s{k[2]} p{pi+1}", fill=(0, 0, 255))
    tiles.append(im)
W = 6
tw, th = tiles[0].size
rows = (len(tiles) + W - 1) // W
sheet = Image.new("RGB", (W * tw, rows * th), "white")
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % W) * tw, (i // W) * th))
# split in 2 images to keep them readable
half = rows // 2 + 1
sheet.crop((0, 0, W * tw, half * th)).save(out + "_a.png")
sheet.crop((0, half * th, W * tw, rows * th)).save(out + "_b.png")
print(len(tiles), sheet.size)

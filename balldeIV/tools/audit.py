"""Audit sheet: for every measure where the PDF parse and the MIDI disagree, render the measure with parsed pitch
names, box the heads that the MIDI does not contain, and print what the MIDI has instead.
usage: audit.py pdf midi first last outdir [per_sheet=3]"""
import sys, os, collections
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pymupdf
from PIL import Image, ImageDraw
from omr.score import parse_document
from omr.midi_io import read_midi

NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
nm = lambda p: f"{NAMES[p % 12]}{p // 12 - 1}"
pdf, midi, lo, hi, outdir = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
per = int(sys.argv[6]) if len(sys.argv) > 6 else 3
os.makedirs(outdir, exist_ok=True)
doc, pages, _ = parse_document(pdf)
div, notes, _, _ = read_midi(midi)
bar = 3 * div
midi_by = collections.defaultdict(collections.Counter)
for s, e, p, tr in notes:
    midi_by[(s + 40) // bar + 1][p] += 1
where = {}
for ss in pages:
    for sy in ss:
        for k in range(len(sy.barlines) - 1):
            where[sy.first_measure + k] = (sy, k)
tiles = []
Z = 3
for m in range(lo, hi + 1):
    sy, k = where[m]
    heads = [h for e in sy.events if e.measure == k and e.kind == "note" for h in e.heads if not h.tie_prev]
    a = collections.Counter(h.midi for h in heads)
    only_pdf = a - midi_by[m]
    only_mid = midi_by[m] - a
    if not only_pdf and not only_mid:
        continue
    x0, x1 = sy.barlines[k] - 8, sy.barlines[k + 1] + 6
    clip = pymupdf.Rect(x0, sy.y0 - 40, x1, sy.y1 + 40)
    pix = doc[sy.page].get_pixmap(matrix=pymupdf.Matrix(Z, Z), clip=clip)
    im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    d = ImageDraw.Draw(im)
    left = collections.Counter(only_pdf)
    for e in sy.events:
        if e.measure != k or e.kind != "note":
            continue
        for h in e.heads:
            px, py = (h.x - clip.x0) * Z, (h.y - clip.y0) * Z
            flag = (not h.tie_prev) and left[h.midi] > 0
            if flag:
                left[h.midi] -= 1
                d.rectangle([px - 4, py - 16, px + 26, py + 16], outline=(255, 0, 0), width=2)
            d.text((px - 2, py - 30 if h.staff == 0 else py + 18), nm(h.midi) + ("~" if h.tie_prev else ""), fill=(200, 0, 0) if h.staff == 0 else (0, 0, 220))
    head = f"m.{m}  p{sy.page + 1}   PDF-only (boxed): {[nm(p) for p in sorted(only_pdf.elements())]}   MIDI-only: {[nm(p) for p in sorted(only_mid.elements())]}"
    banner = Image.new("RGB", (im.width, 22), (255, 255, 200))
    ImageDraw.Draw(banner).text((4, 4), head, fill=(0, 0, 0))
    tile = Image.new("RGB", (im.width, im.height + 22), "white")
    tile.paste(banner, (0, 0)); tile.paste(im, (0, 22))
    tiles.append((m, tile))
print(len(tiles), "measures with differences")
for i in range(0, len(tiles), per):
    group = tiles[i:i + per]
    W = max(t.width for _, t in group)
    H = sum(t.height for _, t in group)
    sheet = Image.new("RGB", (W, H), "white")
    y = 0
    for _, t in group:
        sheet.paste(t, (0, y)); y += t.height
    sheet.save(os.path.join(outdir, f"audit_{group[0][0]}-{group[-1][0]}.png"))
    print("wrote", f"audit_{group[0][0]}-{group[-1][0]}.png", [m for m, _ in group])

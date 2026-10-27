"""Render a measure with parsed pitch names overlaid + list MIDI notes of that bar.
usage: viewm.py pdf midi measure out.png"""
import sys, os, collections
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
import pymupdf
from PIL import Image, ImageDraw
from omr.score import parse_document
from omr.midi_io import read_midi

pdf, midi, mnum, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
doc, pages, _ = parse_document(pdf)
NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
target = None
for systems in pages:
    for sy in systems:
        for k in range(len(sy.barlines) - 1):
            if sy.first_measure + k == mnum:
                target = (sy, k)
sy, k = target
Z = 4
x0, x1 = sy.barlines[k] - 8, sy.barlines[k + 1] + 6
clip = pymupdf.Rect(x0, sy.y0 - 50, x1, sy.y1 + 45)
pix = doc[sy.page].get_pixmap(matrix=pymupdf.Matrix(Z, Z), clip=clip)
im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
dr = ImageDraw.Draw(im)
for e in sy.events:
    if e.measure != k or e.kind != "note":
        continue
    for h in e.heads:
        px, py = (h.x - clip.x0) * Z, (h.y - clip.y0) * Z
        col = (200, 0, 0) if h.staff == 0 else (0, 0, 220)
        lab = f"{NAMES[h.midi % 12]}{h.midi // 12 - 1}"
        if h.tie_prev:
            lab += "~"
        dr.text((px - 4, py - 22), lab, fill=col)
im.save(out)
div, notes, _, _ = read_midi(midi)
bar = 3 * div
ns = [n for n in notes if (n[0] + 40) // bar + 1 == mnum]
by = collections.defaultdict(list)
for s, e, p, tr in ns:
    by[round((s - (mnum - 1) * bar) / div / 4, 3)].append(f"{NAMES[p % 12]}{p // 12 - 1}t{tr}")
print("MIDI bar", mnum)
for t in sorted(by):
    print(f"  {t:6.3f}", " ".join(by[t]))
print("size", im.size)

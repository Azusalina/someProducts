"""Compare, per measure, the multiset of pitches parsed from the PDF with those in the Mutopia MIDI."""
import sys, os, collections
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
from omr.score import parse_document
from omr.midi_io import read_midi

pdf, midi = sys.argv[1], sys.argv[2]
lo = int(sys.argv[3]) if len(sys.argv) > 3 else 1
hi = int(sys.argv[4]) if len(sys.argv) > 4 else 239
quiet = len(sys.argv) > 5
doc, pages, warns = parse_document(pdf)
for w in warns:
    print("warn", w)
div, notes, ts, tp = read_midi(midi)
bar = 3 * div
mid_by_bar = collections.defaultdict(collections.Counter)
for s, e, p, tr in notes:
    mid_by_bar[(s + 40) // bar + 1][p] += 1      # tolerate early (grace-shifted) onsets
pdf_by_bar = collections.defaultdict(collections.Counter)
for systems in pages:
    for sy in systems:
        for e in sy.events:
            if e.kind != "note":
                continue
            m = sy.first_measure + e.measure
            for h in e.heads:
                if h.tie_prev:
                    continue
                pdf_by_bar[m][h.midi] += 1
tot_match = tot_pdf = tot_mid = 0
perfect = 0
for m in range(lo, min(hi, 239) + 1):
    a, b = pdf_by_bar[m], mid_by_bar[m]
    common = sum((a & b).values())
    tot_match += common
    tot_pdf += sum(a.values())
    tot_mid += sum(b.values())
    only_pdf = a - b
    only_mid = b - a
    if not only_pdf and not only_mid:
        perfect += 1
    if quiet and not only_pdf and not only_mid:
        continue
    flag = "" if not only_pdf and not only_mid else "  <-- pdf-only %s  midi-only %s" % (
        sorted(only_pdf.elements()), sorted(only_mid.elements()))
    print(f"m{m}: pdf {sum(a.values())} midi {sum(b.values())} common {common}{flag}")
print(f"TOTAL pdf {tot_pdf} midi {tot_mid} common {tot_match}; bars identical {perfect}/{min(hi,239)-lo+1}")

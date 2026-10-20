"""Measure RH-vs-LH onset offset inside PDF columns shared by both hands (using MIDI timing)."""
import sys, os, statistics
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
from omr.score import parse_document
from omr.midi_align import pair_measure
from omr.midi_io import read_midi

pdf, midi = sys.argv[1], sys.argv[2]
lo, hi = int(sys.argv[3]), int(sys.argv[4])
doc, pages, _ = parse_document(pdf)
div, notes, _, _ = read_midi(midi)
bar = 3 * div
for systems in pages:
    for sy in systems:
        for k in range(len(sy.barlines) - 1):
            m = sy.first_measure + k
            if not lo <= m <= hi:
                continue
            start = (m - 1) * bar
            mn = [n for n in notes if start - 40 <= n[0] < start + bar - 40]
            heads = [h for e in sy.events if e.measure == k and e.kind == "note" and not e.grace
                     for h in e.heads if not h.tie_prev]
            pairs, left = pair_measure(heads, sy.barlines[k], sy.barlines[k + 1], mn, start, bar)
            # columns: heads with the same stem-column x (rounded) on both staves
            cols = {}
            for h in heads:
                n = pairs.get(id(h))
                if n is None:
                    continue
                cols.setdefault(round(h.x / 2.0), []).append((h.staff, n[0]))
            diffs = []
            for c, lst in cols.items():
                r = [t for s, t in lst if s == 0]
                l = [t for s, t in lst if s == 1]
                if r and l:
                    diffs.append(statistics.median(r) - statistics.median(l))
            unm = sum(1 for h in heads if pairs.get(id(h)) is None)
            print(f"m{m}: heads {len(heads)} unmatched_pdf {unm} unmatched_midi {len(left)} shared_cols {len(diffs)} "
                  f"RH-LH median {statistics.median(diffs) if diffs else None} spread "
                  f"{(min(diffs), max(diffs)) if diffs else None}")

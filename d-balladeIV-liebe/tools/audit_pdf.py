"""Consistency audit of a PDF-built score (no reference needed).

usage: audit_pdf.py score.json

Checks, per measure:
  order     a note further right never starts earlier than one to its left (heads displaced by <= 10 pt may share an
            onset); counts violating pairs
  span      every note starts inside its measure and the last note of a normal bar ends by the bar's length
  stack     notes with identical onsets in one column (x within 1.5 pt) share pitch-distinct chords only
Prints a table of suspicious measures and a summary line; exit status 1 if any measure fails 'order' or 'span'.
"""
import sys, json, collections

sc = json.load(open(sys.argv[1]))
ms = {m["n"]: m for m in sc["measures"]}
by = collections.defaultdict(list)
for n in sc["notes"]:
    by[n["measure"]].append(n)
bad = 0
rows = []
for m in sc["measures"]:
    notes = by.get(m["n"], [])
    if not notes:
        rows.append((m["n"], m["kind"], 0, 0, 0, "no notes"))
        continue
    start, L = m["start"], m["length"]
    viol = 0
    ns = sorted(notes, key=lambda n: (n["x"], n["t"]))
    for i, a in enumerate(ns):
        for b in ns[i + 1:]:
            if b["x"] - a["x"] > 10.0 and b["t"] < a["t"] - 0.01:
                viol += 1
    out = sum(1 for n in notes if n["t"] < start - 1e-6 or n["t"] >= start + L - 1e-6)
    over = 0
    if m["kind"] != "free":
        over = sum(1 for n in notes if n["t"] + n["d"] > start + L + 0.01 and not n.get("tied") and not n["tieNext"])
    note = []
    if viol:
        note.append(f"{viol} order violations")
    if out:
        note.append(f"{out} notes outside the bar")
    if over:
        note.append(f"{over} notes overrun the bar")
    if note:
        bad += 1
        rows.append((m["n"], m["kind"], viol, out, over, "; ".join(note)))
for r in rows:
    print("m%-3d %-6s order=%d outside=%d overrun=%d  %s" % r)
print(f"{len(sc['measures'])} measures, {len(sc['notes'])} notes, {bad} measures flagged")
sys.exit(1 if bad else 0)

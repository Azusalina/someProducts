"""Print the repeated figures omr/patterns.py finds in a built score.

usage: show_patterns.py score.json 23-31,64-73   (print only; add_patterns.py stores them)
"""
import sys, os
import json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from omr.patterns import find, parse_ranges

NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
nm = lambda m: f"{NAMES[m % 12]}{m // 12 - 1}"

sc = json.load(open(sys.argv[1]))
bars = parse_ranges(sys.argv[2])
by_id = {n["id"]: n for n in sc["notes"]}
pats = find(sc["notes"], bars)
for pi, p in enumerate(pats):
    ms = sorted({by_id[i]["measure"] for c in p["cells"] for i in c["notes"]})
    print(f"\n#{pi} {p['hand']}  cell {p['length']} onsets, repeat shift {p['shift']:+d}, {len(p['cells'])} cells, m.{ms[0]}-{ms[-1]}")
    for ci, c in enumerate(p["cells"]):
        ns = sorted((by_id[i] for i in c["notes"]), key=lambda n: (n["t"], n["midi"]))
        print(f"  {chr(65 + ci) if ci < 26 else ci} t={c['t0']:.2f} ({c['frames']} fr): " + " ".join(nm(n["midi"]) for n in ns))

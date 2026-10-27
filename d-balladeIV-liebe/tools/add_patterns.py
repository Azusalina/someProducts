"""Find the repeated figures in chosen measures of a built score and store them in it (no rebuild needed).

usage: add_patterns.py score.json 23-31,64-73
"""
import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from omr.patterns import annotate, parse_ranges

path = sys.argv[1]
sc = json.load(open(path))
pats = annotate(sc, parse_ranges(sys.argv[2]))
json.dump(sc, open(path, "w"), separators=(",", ":"))
print(f"{len(pats)} patterns, {sum(len(p['cells']) for p in pats)} cells -> {path}")

import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from omr.build_score import build

pdf, midi, out = sys.argv[1], sys.argv[2], sys.argv[3]
lo = int(sys.argv[4]) if len(sys.argv) > 4 else 168
hi = int(sys.argv[5]) if len(sys.argv) > 5 else 239
score = build(pdf, midi, lo, hi)
json.dump(score, open(out, "w"), indent=0)
n = score["notes"]
print("notes", len(n), "grace", sum(1 for x in n if x["grace"]), "interp", sum(1 for x in n if x["src"] != "midi"),
      "tied-merged", sum(1 for x in n if x.get("tied")))
bad = [r for r in score["report"] if r["unmatched_pdf"] or r["unmatched_midi"]]
print("measures with unmatched:", [(r["measure"], r["unmatched_pdf"], r["unmatched_midi"]) for r in bad])

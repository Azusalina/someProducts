"""Export a piece built from a vector PDF alone (no MIDI) for the web app.

usage: export_piece.py pdf web_dir id title composer [--time 6/4] [--bar 6] [--tempo 92] [--sheet-from 0] [--section Name]
                       [--patterns 23-31,64-73]

Writes web/assets/<id>/pNN.png (page images), web/data/<id>.json (score) and registers the piece in
web/data/pieces.json. Rhythm is solved from the engraving (omr/rhythm.py); see description.md for its limits.
"""
import sys, os, json, argparse
import multiprocessing
from concurrent.futures import ProcessPoolExecutor
from fractions import Fraction
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
import pymupdf
from omr.build_pdf import build
from omr.patterns import annotate, parse_ranges
from export_web import render_page, SCALE


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("web")
    ap.add_argument("id")
    ap.add_argument("title")
    ap.add_argument("composer")
    ap.add_argument("--time", default="6/4")
    ap.add_argument("--bar", type=int, default=6, help="quarter notes per full measure")
    ap.add_argument("--tempo", type=int, default=92, help="default tempo, quarter notes per minute")
    ap.add_argument("--sheet-from", type=int, default=0, help="first page index shown when 'section only' is chosen")
    ap.add_argument("--section", default="", help="name of that section, e.g. Coda")
    ap.add_argument("--patterns", default="", help="measure ranges to search for repeated figures, e.g. 23-31,64-73")
    a = ap.parse_args()

    pdir = os.path.join(a.web, "assets", a.id)
    os.makedirs(pdir, exist_ok=True)
    os.makedirs(os.path.join(a.web, "data"), exist_ok=True)
    n = len(pymupdf.open(a.pdf))
    jobs = [(a.pdf, i, os.path.join(pdir, f"p{i + 1:02d}.png")) for i in range(n)]
    ctx = multiprocessing.get_context("fork")
    with ProcessPoolExecutor(max_workers=os.cpu_count(), mp_context=ctx) as ex:
        dims = list(ex.map(render_page, jobs))

    score = build(a.pdf, bar=a.bar)
    score["pages"] = [dict(index=i, w=w, h=h, scale=SCALE, src=f"assets/{a.id}/p{i + 1:02d}.png") for i, w, h in dims]
    ms = score["measures"]
    score["meta"] = dict(title=a.title, composer=a.composer, timeSignature=a.time, beatsPerMeasure=a.bar,
                         firstMeasure=ms[0]["n"], lastMeasure=ms[-1]["n"], defaultTempo=a.tempo,
                         source=f"{os.path.basename(a.pdf)} (vector-parsed); rhythm solved from the engraving, no MIDI")
    rep = score.pop("report")
    score.pop("warnings", None)
    kinds = {}
    for r in rep:
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
    gappy = [r["measure"] for r in rep if r["kind"] != "free" and r["gaps"]]
    costly = [f"m{r['measure']}({r['cost']:g})" for r in rep if r["kind"] != "free" and r["cost"] > 12]
    print("bars by kind:", kinds)
    print("normal bars with an uncovered stretch on a staff (look at these):", gappy or "none")
    print("normal bars the solver found costly (>12, look at these):", " ".join(costly) or "none")
    if a.patterns:
        pats = annotate(score, parse_ranges(a.patterns))
        print("repeated figures:", len(pats), "chains,", sum(len(p["cells"]) for p in pats), "cells")
    out = os.path.join(a.web, "data", f"{a.id}.json")
    json.dump(score, open(out, "w"), separators=(",", ":"))

    idx_path = os.path.join(a.web, "data", "pieces.json")
    pieces = json.load(open(idx_path)) if os.path.exists(idx_path) else []
    entry = dict(id=a.id, title=a.title, composer=a.composer, data=f"data/{a.id}.json",
                 sheetFrom=a.sheet_from, section=a.section, tempo=a.tempo)
    pieces = [p for p in pieces if p["id"] != a.id] + [entry]
    json.dump(pieces, open(idx_path, "w"), indent=1)
    print("pages", n, "measures", len(ms), "notes", len(score["notes"]), "->", out)


if __name__ == "__main__":
    main()

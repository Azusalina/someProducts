"""Export everything the web app needs: page images (parallel) + score.json.

usage: export_web.py pdf midi web_dir [first_measure last_measure]
"""
import sys, os, json
import multiprocessing
from concurrent.futures import ProcessPoolExecutor
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pymupdf
from omr.build_score import build

SCALE = 2.4          # px per pt  (~173 dpi)


def render_page(args):
    pdf, pi, out = args
    doc = pymupdf.open(pdf)
    pix = doc[pi].get_pixmap(matrix=pymupdf.Matrix(SCALE, SCALE), alpha=False)
    pix.save(out)
    return pi, pix.width, pix.height


def main():
    pdf, midi, web = sys.argv[1], sys.argv[2], sys.argv[3]
    lo = int(sys.argv[4]) if len(sys.argv) > 4 else 168
    hi = int(sys.argv[5]) if len(sys.argv) > 5 else 239
    os.makedirs(os.path.join(web, "assets", "pages"), exist_ok=True)
    os.makedirs(os.path.join(web, "data"), exist_ok=True)
    n = len(pymupdf.open(pdf))
    jobs = [(pdf, i, os.path.join(web, "assets", "pages", f"p{i + 1:02d}.png")) for i in range(n)]
    ctx = multiprocessing.get_context("fork")
    with ProcessPoolExecutor(max_workers=os.cpu_count(), mp_context=ctx) as ex:
        dims = list(ex.map(render_page, jobs))
    score = build(pdf, midi, lo, hi)
    score["pages"] = [dict(index=i, w=w, h=h, scale=SCALE, src=f"assets/pages/p{i + 1:02d}.png") for i, w, h in dims]
    score["meta"] = dict(title="Ballade No. 4 in F minor, Op. 52 - coda", composer="F. Chopin",
                         timeSignature="6/8", beatsPerMeasure=3, firstMeasure=lo, lastMeasure=hi,
                         source="ballde4.pdf (vector-parsed); rhythm from Mutopia MIDI")
    for k in ("report", "warnings"):
        score.pop(k, None) if k == "warnings" else None
    json.dump(score, open(os.path.join(web, "data", "score.json"), "w"), separators=(",", ":"))
    print("pages", len(dims), "notes", len(score["notes"]))


if __name__ == "__main__":
    main()

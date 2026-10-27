"""Global measure numbering: printed numbers at system starts + barline counts."""
import re
import pymupdf


def printed_numbers(page):
    out = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                t = s["text"].strip()
                if "Italic" in s["font"] and re.fullmatch(r"\d+", t) and s["bbox"][0] < 60:
                    out.append(((s["bbox"][1] + s["bbox"][3]) / 2, int(t)))
    return sorted(out)


def number_systems(doc, per_page_systems):
    """per_page_systems: list (page index) of lists of System. Sets sy.first_measure; returns list of warnings."""
    warn = []
    nxt = 1
    for pi, systems in enumerate(per_page_systems):
        printed = printed_numbers(doc[pi])
        for sy in systems:
            n = None
            for y, num in printed:
                if sy.y0 - 45 <= y <= sy.y0 + 8:
                    n = num
            if n is None:
                n = nxt
            elif n != nxt:
                warn.append(f"p{pi+1} system {sy.index}: printed {n} but running count {nxt}")
            sy.first_measure = n
            nxt = n + len(sy.barlines) - 1
    return warn

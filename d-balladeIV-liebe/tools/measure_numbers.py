import sys, re
import pymupdf

d = pymupdf.open(sys.argv[1])
for pi, p in enumerate(d):
    out = []
    for b in p.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                t = s["text"].strip()
                if "Italic" in s["font"] and re.fullmatch(r"\d+", t) and s["bbox"][0] < 60:
                    out.append((round(s["bbox"][1]), int(t)))
    print(pi + 1, sorted(out))

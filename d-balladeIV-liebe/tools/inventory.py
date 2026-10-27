import sys, collections
import pymupdf

d = pymupdf.open(sys.argv[1])
c = collections.Counter()
first = {}
for pi, p in enumerate(d):
    t = p.get_text("rawdict")
    for b in t["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                if "Opus" not in s["font"]:
                    continue
                for ch in s["chars"]:
                    k = (s["font"], hex(ord(ch["c"])), round(s["size"], 1))
                    c[k] += 1
                    first.setdefault(k, (pi + 1, [round(x) for x in ch["origin"]]))
for k, v in sorted(c.items()):
    print(k, v, first[k])

import sys, collections
import pymupdf

d = pymupdf.open(sys.argv[1])
pg = int(sys.argv[2]) if len(sys.argv) > 2 else 0
p = d[pg]
print(p.rect)
t = p.get_text("rawdict")
c = collections.Counter()
for b in t["blocks"]:
    for l in b.get("lines", []):
        for s in l["spans"]:
            c[s["font"]] += len(s["chars"])
print(c)
n = 0
for b in t["blocks"]:
    for l in b.get("lines", []):
        for s in l["spans"]:
            if "Opus" in s["font"] and n < 30:
                print(s["font"], round(s["size"], 1),
                      [(hex(ord(ch["c"])), [round(x, 1) for x in ch["origin"]]) for ch in s["chars"]][:4])
                n += 1
dr = p.get_drawings()
print("drawings", len(dr))
print(collections.Counter((x["type"], round(x.get("width") or 0, 2)) for x in dr).most_common(10))
for x in dr[:5]:
    print(x["rect"], x["type"], x.get("width"), len(x["items"]))

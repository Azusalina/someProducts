import sys, collections
import pymupdf

d = pymupdf.open(sys.argv[1])
p = d[int(sys.argv[2])]
y0, y1 = float(sys.argv[3]), float(sys.argv[4])
dr = [x for x in p.get_drawings() if y0 <= x["rect"].y0 <= y1 or y0 <= x["rect"].y1 <= y1]
kinds = collections.defaultdict(list)
for x in dr:
    its = x["items"]
    sig = (x["type"], round(x.get("width") or 0, 2), tuple(sorted(set(i[0] for i in its))))
    kinds[sig].append(x)
for sig, xs in sorted(kinds.items(), key=lambda kv: -len(kv[1])):
    print(sig, len(xs))
    for x in xs[:4]:
        r = x["rect"]
        print("   ", [round(v, 1) for v in (r.x0, r.y0, r.x1, r.y1)], "fill", x.get("fill"), "n", len(x["items"]))

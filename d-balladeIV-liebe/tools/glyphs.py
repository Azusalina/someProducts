"""List distinct (font, glyph id) pairs used for music glyphs, with counts and a sample position."""
import sys, collections
import pymupdf

d = pymupdf.open(sys.argv[1])
c = collections.Counter()
first = {}
for pi, p in enumerate(d):
    for tr in p.get_texttrace():
        f = tr["font"]
        if "Opus" not in f:
            continue
        for ch in tr["chars"]:
            uni, gid, origin, bbox = ch
            k = (f, gid, round(tr["size"], 1))
            c[k] += 1
            first.setdefault(k, (pi + 1, [round(origin[0]), round(origin[1])], uni))
for k, v in sorted(c.items(), key=lambda kv: (kv[0][0], kv[0][1], kv[0][2])):
    print(k, v, first[k])

# dump fonts
seen = set()
for pi, p in enumerate(d):
    for f in p.get_fonts(full=True):
        xref, ext, typ, name = f[0], f[1], f[2], f[3]
        if "Opus" in name and xref not in seen:
            seen.add(xref)
            n, e, t, content = d.extract_font(xref)
            out = f"{sys.argv[2]}/{name}_{xref}.{e}"
            open(out, "wb").write(content)
            print("font", xref, name, e, len(content), out)

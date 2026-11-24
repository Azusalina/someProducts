"""Page primitives read straight from the PDF's vector content (no raster OMR).

Sibelius exports glyphs from the Opus fonts and draws staff lines, stems, barlines,
ledger lines and beams as plain paths, so every symbol position is exact.
"""
from dataclasses import dataclass, field
import pymupdf

# Opus glyph codes (unicode as reported by the font's ToUnicode map)
U = dict(
    TREBLE=38, BASS=63, TS6=54, TS8=56,
    HEAD=339, HEAD_HALF=729, HEAD_WHOLE=119,
    FLAT=98, NATURAL=110, SHARP=35, DFLAT=8747, DSHARP=8249,
    DOT=46, DOT_SPECIAL=8482,
    ACCENT=62,
    FLAG_UP8=74, FLAG_DN8=106, FLAG_16=114,
    REST_Q=338, REST_8=8240, REST_16=8776, REST_32=174, REST_HALF=211, REST_WHOLE=8721,       # Opus: 0xEE half rest, 0xB7 whole rest
    FERMATA=85, TRILL_A=126, TRILL_B=376, ARPEGGIO=8719,
    BRACE=123, LEDGER_E=101,
    PAREN_L=60, PAREN_R=62, OTTAVA_8=8220, OTTAVA_VA=8221,
)
ACCIDENTALS = {U["FLAT"]: -1, U["NATURAL"]: 0, U["SHARP"]: 1, U["DFLAT"]: -2, U["DSHARP"]: 2}
HEADS = (U["HEAD"], U["HEAD_HALF"], U["HEAD_WHOLE"])


@dataclass
class Glyph:
    u: int
    font: str
    size: float
    x: float
    y: float
    bbox: tuple

    @property
    def cx(self):
        return (self.bbox[0] + self.bbox[2]) / 2

    @property
    def cy(self):
        return (self.bbox[1] + self.bbox[3]) / 2


@dataclass
class Seg:
    x0: float
    y0: float
    x1: float
    y1: float
    w: float


@dataclass
class Poly:
    pts: list
    bbox: tuple


@dataclass
class Page:
    index: int
    width: float
    height: float
    glyphs: list = field(default_factory=list)
    hlines: list = field(default_factory=list)   # horizontal strokes (staff, ledger)
    vlines: list = field(default_factory=list)   # vertical strokes (stems, barlines)
    slants: list = field(default_factory=list)   # other straight strokes (hairpins ...)
    beams: list = field(default_factory=list)    # filled polygons
    curves: list = field(default_factory=list)   # slurs/ties (bbox + endpoints)
    full: float = 19.8                            # point size of ordinary (full-size) noteheads on this page
    small_bands: list = field(default_factory=list)   # areas of ossia / footnote staves left out

    @property
    def small_below(self):
        """glyphs smaller than this are grace / cue size"""
        return self.full * 0.85


def opus_code(uni):
    """Some exports (e.g. mfiles.co.uk) report Opus glyphs as private-use 0xF0xx where xx is the Mac Roman byte;
    others already give the decoded character. Normalise both to the decoded code point used in U."""
    if 0xF020 <= uni <= 0xF0FF:
        return ord(bytes([uni & 0xFF]).decode("mac_roman"))
    return uni


def load_page(doc, index):
    p = doc[index]
    pg = Page(index=index, width=p.rect.width, height=p.rect.height)
    for tr in p.get_texttrace():
        if "Opus" not in tr["font"] and "Maestro" not in tr["font"]:   # Sibelius (Opus) or Finale (Maestro): same Sonata layout
            continue
        for uni, gid, origin, bbox in tr["chars"]:
            if uni == 32:
                continue
            pg.glyphs.append(Glyph(opus_code(uni), tr["font"], round(tr["size"], 1), origin[0], origin[1], tuple(bbox)))
    for dr in p.get_drawings():
        items = dr["items"]
        w = dr.get("width") or 0
        fill = dr.get("fill")
        stroke = dr.get("color")
        if all(i[0] == "l" for i in items) and stroke is not None and fill is None and len(items) == 1:
            a, b = items[0][1], items[0][2]
            s = Seg(a.x, a.y, b.x, b.y, w)
            if abs(a.y - b.y) < 0.05:
                pg.hlines.append(s)
            elif abs(a.x - b.x) < 0.05:
                pg.vlines.append(s)
            else:
                pg.slants.append(s)
        elif fill is not None and len(items) == 1 and items[0][0] == "re":
            r = items[0][1]                      # flat beams drawn as filled rectangles
            if r.height < 4.0 and r.width > 3.0:
                pg.beams.append(Poly([(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)],
                                     (r.x0, r.y0, r.x1, r.y1)))
        elif fill is not None and all(i[0] in ("l",) for i in items):
            pts = []
            for i in items:
                pts.append((i[1].x, i[1].y))
            end = (items[-1][2].x, items[-1][2].y)      # Finale leaves the path open (implicit close): keep its last corner
            if abs(end[0] - pts[0][0]) > 1e-3 or abs(end[1] - pts[0][1]) > 1e-3:
                pts.append(end)
            r = dr["rect"]
            pg.beams.append(Poly(pts, (r.x0, r.y0, r.x1, r.y1)))
        elif any(i[0] == "c" for i in items):
            r = dr["rect"]
            first = items[0]
            last = items[-1]
            p0, p1 = (first[1].x, first[1].y), (last[-1].x, last[-1].y)
            if abs(p0[0] - p1[0]) < 0.5 and abs(p0[1] - p1[1]) < 0.5:
                # Finale draws a tie/slur as a closed filled outline (out along one edge, back along the other):
                # its ends are the leftmost and rightmost points, not the path's first and last
                pts = [(it[1].x, it[1].y) for it in items] + [(it[-1].x, it[-1].y) for it in items]
                p0, p1 = min(pts), max(pts)
            pg.curves.append(dict(bbox=(r.x0, r.y0, r.x1, r.y1), width=w, p0=p0, p1=p1, n=len(items),
                                  filled=fill is not None))
    drop_small_staves(pg)
    sizes = [g.size for g in pg.glyphs if g.u == U["HEAD"]]
    if sizes:
        # full size is the largest notehead size that occurs more than a stray few times (grace/cue notes are smaller)
        common = [s for s in set(sizes) if sizes.count(s) >= 8]
        pg.full = max(common) if common else max(set(sizes), key=sizes.count)
    return pg


def small_staves(pg):
    """Five-line staves engraved smaller than the music (ossia variants above a system, music examples in
    footnotes; critical editions have them): staves spaced under 85% of the page's widest staff spacing.
    Returns [(x0, x1, top, bottom, space)]."""
    hs = sorted((s for s in pg.hlines if abs(s.x1 - s.x0) > 25), key=lambda s: s.y0)
    out, used = [], set()
    for i, a in enumerate(hs):
        if id(a) in used:
            continue
        grp = [a]
        for b in hs[i + 1:]:
            if b.y0 - grp[-1].y0 > 6:
                break
            if abs(b.x0 - a.x0) < 1 and abs(b.x1 - a.x1) < 1 and 2.0 < b.y0 - grp[-1].y0 < 6.5:
                grp.append(b)
        if len(grp) == 5:
            d = [grp[k + 1].y0 - grp[k].y0 for k in range(4)]
            if max(d) - min(d) < 0.3:
                used.update(id(g) for g in grp)
                out.append((min(a.x0, a.x1), max(a.x0, a.x1), grp[0].y0, grp[-1].y0, sum(d) / 4))
    if not out:
        return []
    main = max(s[4] for s in out)
    return [s for s in out if s[4] < 0.85 * main]


def drop_small_staves(pg):
    """Remove everything drawn on small staves, so only the main text is read."""
    bands = [(x0 - 30, x1 + 3, top - 3.5 * sp, bot + 3.5 * sp) for x0, x1, top, bot, sp in small_staves(pg)]
    if not bands:
        return
    pg.small_bands = bands

    def inside(x, y):
        return any(xa <= x <= xb and ya <= y <= yb for xa, xb, ya, yb in bands)
    pg.glyphs = [g for g in pg.glyphs if not inside(g.cx, g.cy)]
    pg.hlines = [s for s in pg.hlines if not inside((s.x0 + s.x1) / 2, s.y0)]
    pg.vlines = [s for s in pg.vlines if not inside(s.x0, (s.y0 + s.y1) / 2)]
    pg.slants = [s for s in pg.slants if not inside((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2)]
    pg.beams = [b for b in pg.beams if not inside((b.bbox[0] + b.bbox[2]) / 2, (b.bbox[1] + b.bbox[3]) / 2)]
    pg.curves = [c for c in pg.curves if not inside((c["bbox"][0] + c["bbox"][2]) / 2, (c["bbox"][1] + c["bbox"][3]) / 2)]

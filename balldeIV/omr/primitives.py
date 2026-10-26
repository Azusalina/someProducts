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
        if "Opus" not in tr["font"]:
            continue
        for uni, gid, origin, bbox in tr["chars"]:
            if uni == 32:
                continue
            pg.glyphs.append(Glyph(opus_code(uni), tr["font"], round(tr["size"], 1), origin[0], origin[1], tuple(bbox)))
    sizes = [g.size for g in pg.glyphs if g.u == U["HEAD"]]
    if sizes:
        # full size is the largest notehead size that occurs more than a stray few times (grace/cue notes are smaller)
        common = [s for s in set(sizes) if sizes.count(s) >= 8]
        pg.full = max(common) if common else max(set(sizes), key=sizes.count)
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
            r = dr["rect"]
            pg.beams.append(Poly(pts, (r.x0, r.y0, r.x1, r.y1)))
        elif any(i[0] == "c" for i in items):
            r = dr["rect"]
            first = items[0]
            last = items[-1]
            pg.curves.append(dict(bbox=(r.x0, r.y0, r.x1, r.y1), width=w,
                                  p0=(first[1].x, first[1].y), p1=(last[-1].x, last[-1].y), n=len(items),
                                  filled=fill is not None))
    return pg

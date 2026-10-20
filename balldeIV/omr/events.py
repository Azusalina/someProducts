"""Accidentals, stems, chords, rests, dots, durations."""
import bisect
from fractions import Fraction
from .primitives import U, ACCIDENTALS
from .analyze import (Head, Event, quad_span_at, staff_for, REST_BASE, BAR, HEAD_W)

STEM_DOWN = 0.2     # stem x - head x for a down stem (stem on the head's left edge)
STEM_UP = 6.7       # stem x - head x for an up stem (stem on the head's right edge)
FLAGS = {U["FLAG_UP8"]: 1, U["FLAG_DN8"]: 1, U["FLAG_16"]: 2}
DOT_GLYPHS = (U["DOT"], U["DOT_SPECIAL"])


def attach_accidentals(sy, gl, heads):
    ks_ids = set()
    for si, (_, _, seq) in sy.ks.items():
        for g in seq:
            ks_ids.add(id(g))
    for g in gl:
        if g.u not in ACCIDENTALS or id(g) in ks_ids:
            continue
        if g.size < 11:
            continue
        si = staff_for(sy, g.y)
        best = None
        for h in heads:
            if h.staff != si and abs(h.y - g.y) > 0.7:
                continue
            if (h.grace) != (g.size < 15):
                continue
            dy = abs(h.y - g.y)
            dx = h.x - g.x
            if dy < 0.7 and 0 < dx < 26:
                if best is None or dx < best[0]:
                    best = (dx, h)
        if best:
            h = best[1]
            if h.acc is None:
                h.acc = g
                h.alter = ACCIDENTALS[g.u]
                h.explicit = True


def find_stems(page, sy):
    xa, xb = sy.barlines[0] - 1, sy.barlines[-1] + 1
    out = []
    for v in page.vlines:
        if v.w >= 0.6:
            continue
        ya, yb = sorted((v.y0, v.y1))
        if yb - ya < 9:
            continue
        if not (sy.y0 - 60 <= ya and yb <= sy.y1 + 60):
            continue
        if not (xa <= v.x0 <= xb):
            continue
        out.append((v.x0, ya, yb))
    return out


def build_note_events(page, sy, gl, heads, stems):
    events = []
    used = set()
    by_stem = {}
    for hi, h in enumerate(heads):
        s = h.g.size / 19.8
        cands = []
        for si_, (sx, ya, yb) in enumerate(stems):
            if not (ya - 1.5 <= h.y <= yb + 1.5):
                continue
            dl = abs(sx - h.x - STEM_DOWN * s)    # stem at left edge -> down stem
            dr = abs(sx - h.x - STEM_UP * s)      # stem at right edge -> up stem
            d = min(dl, dr)
            if d < 0.6:
                cands.append((d, si_))
        if cands:
            cands.sort()
            by_stem.setdefault(cands[0][1], []).append(hi)
            used.add(hi)
    ev_id = 0
    flags = [g for g in gl if g.u in FLAGS]
    for si_, hidx in by_stem.items():
        sx, ya, yb = stems[si_]
        hs = [heads[i] for i in hidx]
        hmin, hmax = min(h.y for h in hs), max(h.y for h in hs)
        up = (hmin - ya) > (yb - hmax)
        # heads on the "normal" side decide the column x
        grace = all(h.grace for h in hs)
        s = hs[0].g.size / 19.8
        x = sx - (STEM_UP if up else STEM_DOWN) * s
        e = Event(id=-1, system=sy.index, staff=majority_staff(hs), kind="note", x=x, heads=hs,
                  stem=(sx, ya, yb), stem_dir="up" if up else "down", grace=grace)
        tipy = ya if up else yb
        # beams
        n = 0
        spans = []
        for poly in page.beams:
            bx0, by0, bx1, by1 = poly.bbox
            if not (bx0 - 0.3 <= sx <= bx1 + 0.3):
                continue
            sp = quad_span_at(poly, min(max(sx, bx0), bx1))
            if sp is None:
                continue
            t, b = sp
            if t >= ya - 1.0 and b <= yb + 1.0 and (b - t) < 4.5:
                # must be at the tip side
                if abs((t + b) / 2 - tipy) <= 12:
                    spans.append((t, b, poly))
        n = len(spans)
        e.beams = n
        e.beam_polys = [s[2] for s in spans]
        # flags
        fl = 0
        for g in flags:
            if abs(g.x - sx) < 1.0 and abs(g.y - tipy) < 8:
                fl = max(fl, FLAGS[g.u])
        e.flags = fl
        events.append(e)
    # stemless heads -> grouped by column
    stemless = [heads[i] for i in range(len(heads)) if i not in used]
    cols = {}
    for h in stemless:
        key = (h.staff, round(h.x / 1.0))
        cols.setdefault(key, []).append(h)
    for (_, _), hs in cols.items():
        e = Event(id=-1, system=sy.index, staff=majority_staff(hs), kind="note", x=min(h.x for h in hs), heads=hs,
                  stem=None, stem_dir="", grace=all(h.grace for h in hs))
        e.beams = 0
        e.flags = 0
        e.beam_polys = []
        events.append(e)
    return events


def majority_staff(hs):
    n0 = sum(1 for h in hs if h.staff == 0)
    return 0 if n0 * 2 >= len(hs) else 1


def build_rests(sy, gl):
    out = []
    for g in gl:
        if g.u in REST_BASE or g.u in (U["REST_HALF"], U["REST_WHOLE"]):
            si = staff_for(sy, g.y)
            st = sy.staves[si]
            e = Event(id=-1, system=sy.index, staff=si, kind="rest", x=g.x, rest_glyph=g)
            e.beams = 0
            e.flags = 0
            e.beam_polys = []
            e.rest_up = (g.bbox[1] + g.bbox[3]) / 2 < st.lines[2]
            if g.u in REST_BASE:
                e.dur = REST_BASE[g.u]
            else:
                # block rest: sits on a line -> half rest; hangs from a line -> whole (= full bar here)
                on_line = any(abs(g.bbox[3] - ly) < 0.7 for ly in st.lines)
                hang = any(abs(g.bbox[1] - ly) < 0.7 for ly in st.lines)
                if on_line and not hang:
                    e.dur = Fraction(1, 2)
                else:
                    e.dur = BAR
            out.append(e)
    return out


def attach_dots(sy, gl, events):
    dots = [g for g in gl if g.u in DOT_GLYPHS and g.size > 15]
    heads = [(h, e) for e in events if e.kind == "note" for h in e.heads]
    for d in dots:
        best = None
        for h, e in heads:
            if h.grace:
                continue
            dx = d.x - h.g.bbox[2]
            dy = d.y - h.y
            if d.u == U["DOT_SPECIAL"] and -0.5 < dx < 14 and abs(dy) < 3.1:
                score = (abs(dx - 2.0), abs(dy))
                if best is None or score < best[0]:
                    best = (score, ("head", h, e))
        for e in events:
            if e.kind != "rest" or e.rest_glyph is None:
                continue
            g = e.rest_glyph
            dx = d.x - g.bbox[2]
            if -0.5 < dx < 6 and abs(d.y - g.y) < 8:
                score = (abs(dx - 1), abs(d.y - g.y) / 4)
                if best is None or score < best[0]:
                    best = (score, ("rest", None, e))
        if best:
            kind, h, e = best[1]
            if kind == "head":
                h.dots += 1
            else:
                e.dots += 1


def finish_duration(e):
    if e.kind == "note":
        if e.grace:
            e.dur = Fraction(0)
            return
        e.dots = max([h.dots for h in e.heads] or [0])
        hollow = any(h.hollow for h in e.heads)
        n = e.beams + e.flags if e.beams < 1 else e.beams
        if hollow:
            base = Fraction(1, 2) if e.stem else Fraction(1)
        else:
            base = Fraction(1, 4) / (2 ** n)
        e.dur = base * (2 - Fraction(1, 2 ** e.dots))
    else:
        if e.rest_glyph is not None and e.rest_glyph.u in REST_BASE:
            e.dur = e.dur * (2 - Fraction(1, 2 ** e.dots))
        elif e.dur != BAR:
            e.dur = e.dur * (2 - Fraction(1, 2 ** e.dots))


def assign_measures(sy, events):
    bars = sy.barlines
    for e in events:
        k = bisect.bisect_right(bars, e.x + 0.01) - 1
        e.measure = max(0, min(k, len(bars) - 2))

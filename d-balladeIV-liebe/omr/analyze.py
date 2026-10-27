"""Turn page primitives into musical events (chords/notes/rests with notated durations and pitches)."""
from dataclasses import dataclass, field
from fractions import Fraction
from .primitives import U, ACCIDENTALS
from .staves import build_systems
from .pitch import CLEF_BOTTOM, LETTER_SEMI, FLAT_ORDER, SHARP_ORDER, NAMES

HEAD_W = 8.39
HEAD_W_GRACE = 5.0
BAR = Fraction(3, 4)   # 6/8 measure

REST_BASE = {U["REST_Q"]: Fraction(1, 4), U["REST_8"]: Fraction(1, 8), U["REST_16"]: Fraction(1, 16),
             U["REST_32"]: Fraction(1, 32)}


@dataclass
class Head:
    g: object
    staff: int
    step: float
    dia: int = 0
    acc: object = None
    alter: int = 0
    explicit: bool = False
    midi: int = 0
    grace: bool = False
    hollow: bool = False
    dots: int = 0
    tie_next: bool = False
    tie_prev: bool = False
    tie_from: object = None
    shift: int = 0
    x: float = 0
    y: float = 0
    clef: str = "treble"
    id: int = -1

    def name(self):
        l = self.dia % 7
        a = {-2: "bb", -1: "b", 0: "", 1: "#", 2: "x"}[self.alter]
        return f"{NAMES[l]}{a}{self.dia // 7}"


@dataclass
class Event:
    id: int
    system: int
    staff: int
    kind: str                     # note | rest
    x: float                      # column x (left edge of the main head column)
    heads: list = field(default_factory=list)
    stem: tuple = None            # (x, ya, yb)
    stem_dir: str = ""
    beams: int = 0
    dur: Fraction = Fraction(0)
    dots: int = 0
    grace: bool = False
    measure: int = -1             # index within system
    rest_glyph: object = None
    tuplet: object = None
    beam_group: int = -1
    onset: Fraction = None
    scale: Fraction = Fraction(1)
    hidden: bool = False
    bar_rest: bool = False        # whole-bar rest: lasts the measure whatever its length
    nominal: Fraction = Fraction(0)  # notated value of a small-size note (its dur is 0 unless it is a real cadenza note)

    @property
    def length(self):
        return self.dur * self.scale


def quad_span_at(poly, x):
    """vertical extent of a (possibly slanted) filled polygon at x, or None."""
    pts = poly.pts
    ys = []
    n = len(pts)
    for i in range(n):
        (xa, ya), (xb, yb) = pts[i], pts[(i + 1) % n]
        if xa == xb:
            if abs(xa - x) < 1e-6:
                ys += [ya, yb]
            continue
        if min(xa, xb) - 1e-6 <= x <= max(xa, xb) + 1e-6:
            t = (x - xa) / (xb - xa)
            ys.append(ya + t * (yb - ya))
    if len(ys) < 2:
        return None
    return min(ys), max(ys)


def in_system(sy, y, pad=70):
    return sy.y0 - pad <= y <= sy.y1 + pad


def nearest_system(systems, y):
    best, bd = None, 1e9
    for s in systems:
        c = (s.y0 + s.y1) / 2
        d = abs(y - c)
        if d < bd:
            best, bd = s, d
    return best


def staff_for(sy, y):
    """0/1 staff for a y. inside a staff (+0.6 space) -> that staff; else nearest by distance to its edges."""
    for si, st in enumerate(sy.staves):
        if st.top - 0.6 * st.space <= y <= st.bottom + 0.6 * st.space:
            return si
    d = []
    for si, st in enumerate(sy.staves):
        d.append((0 if st.top <= y <= st.bottom else min(abs(y - st.top), abs(y - st.bottom)), si))
    d.sort()
    return d[0][1]


def system_distance(sy, y):
    if sy.y0 <= y <= sy.y1:
        return 0.0
    return min(abs(y - sy.y0), abs(y - sy.y1))


def analyze_page(page):
    systems = build_systems(page)
    owned = {s.index: [] for s in systems}
    for g in page.glyphs:
        best = min(systems, key=lambda s: system_distance(s, g.y), default=None)
        if best is not None:
            owned[best.index].append(g)
    out = []
    for sy in systems:
        out.append(analyze_system(page, sy, owned[sy.index]))
    return systems, out


def analyze_system(page, sy, gl):
    # --- clefs ---
    clefs = {0: [], 1: []}
    for g in gl:
        if g.u in (U["TREBLE"], U["BASS"]):
            si = staff_for(sy, g.y)
            clefs[si].append((g.x, "treble" if g.u == U["TREBLE"] else "bass"))
    for si in clefs:
        clefs[si].sort()
    # --- heads ---
    heads = []
    for g in gl:
        if g.u in (U["HEAD"], U["HEAD_HALF"], U["HEAD_WHOLE"]):
            si = staff_for(sy, g.y)
            st = sy.staves[si]
            h = Head(g=g, staff=si, step=st.step_of(g.y), grace=g.size < page.small_below, hollow=g.u in (U["HEAD_HALF"], U["HEAD_WHOLE"]),
                     x=g.x, y=g.y)
            h.clef = clef_at(clefs[si], g.x, st.kind)
            h.dia = CLEF_BOTTOM[h.clef] + int(round(h.step))
            heads.append(h)
    sy.full = page.full
    sy.small = page.small_below
    sy.clefs = clefs
    sy.glyphs = gl
    sy.heads = heads
    sy.ks = key_signature(sy, gl, clefs, heads)
    from . import events as ev
    ev.attach_accidentals(sy, gl, heads)
    stems = ev.find_stems(page, sy)
    events = ev.build_note_events(page, sy, gl, heads, stems)
    rests = ev.build_rests(sy, gl)
    events += rests
    ev.attach_dots(sy, gl, events)
    for e in events:
        ev.finish_duration(e)
    ev.assign_measures(sy, events)
    for i, e in enumerate(events):
        e.id = i
    sy.events = events
    sy.stems = stems
    return events


def staff_range_ok(sy, g):
    return True


def clef_at(clef_list, x, default):
    cur = default
    for cx, kind in clef_list:
        if cx < x - 1:
            cur = kind
    return cur


def key_signature(sy, gl, clefs, heads):
    """Key signature segments per staff: {staff: [(x_from, kind, count, glyphs)]}.

    One segment sits after the system's first clef; more follow each double barline when the key changes mid-system.
    A cluster is a run of full-size accidentals (spacing <= 0.36 x notehead size) whose letters follow the flat/sharp order, optionally
    led by naturals that cancel the previous key. A cluster of naturals only means C major. Accidentals past the
    matching prefix, and a lone accidental that belongs to a notehead, are not part of the signature."""
    res = {}
    for si, st in enumerate(sy.staves):
        clef_x = min([c[0] for c in clefs[si]] or [st.x0])
        accs = sorted([g for g in gl if g.u in ACCIDENTALS and g.size > sy.full * 0.95 and staff_for(sy, g.y) == si],
                      key=lambda g: g.x)
        segs = []
        for anchor, limit in [(clef_x, 32)] + [(x, 14) for x in sy.double]:
            run = []
            for g in accs:
                if g.x <= anchor + 0.5 or g.x > anchor + 75:
                    continue
                if not run and g.x - anchor > limit:
                    break
                if run and g.x - run[-1].x > sy.full * 0.36:
                    break
                run.append(g)
            naturals = []
            for g in run:
                if g.u != U["NATURAL"]:
                    break
                naturals.append(g)
            body = run[len(naturals):]
            kind = ACCIDENTALS[body[0].u] if body else 0
            order = FLAT_ORDER if kind < 0 else SHARP_ORDER
            kept = []
            for g in body:
                letter = (CLEF_BOTTOM[clef_at(clefs[si], g.x, st.kind)] + int(round(st.step_of(g.y)))) % 7
                if ACCIDENTALS[g.u] != kind or len(kept) >= 7 or letter != order[len(kept)]:
                    break
                kept.append(g)
            if len(kept) == 1 and any(h.staff == si and abs(h.y - kept[0].y) < 0.7 and 0 < h.x - kept[0].x < 26
                                      for h in heads):
                kept = []
            if kept:
                segs.append((anchor, kind, len(kept), naturals + kept))
            elif len(naturals) >= 2 or (naturals and anchor == clef_x):
                segs.append((anchor, 0, 0, naturals))
            elif anchor == clef_x:
                segs.append((anchor, 0, 0, []))
        res[si] = sorted(segs, key=lambda t: t[0])
    return res

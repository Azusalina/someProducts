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
        if g.u in (U["HEAD"], U["HEAD_HALF"]):
            si = staff_for(sy, g.y)
            st = sy.staves[si]
            h = Head(g=g, staff=si, step=st.step_of(g.y), grace=g.size < 15, hollow=g.u == U["HEAD_HALF"],
                     x=g.x, y=g.y)
            h.clef = clef_at(clefs[si], g.x, st.kind)
            h.dia = CLEF_BOTTOM[h.clef] + int(round(h.step))
            heads.append(h)
    sy.clefs = clefs
    sy.glyphs = gl
    sy.heads = heads
    sy.ks = key_signature(sy, gl, clefs)
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


def key_signature(sy, gl, clefs):
    """Count key-signature accidentals directly after the system's first clef on each staff."""
    res = {}
    for si, st in enumerate(sy.staves):
        clef_x = min([c[0] for c in clefs[si]] or [st.x0])
        accs = sorted([g for g in gl if g.u in ACCIDENTALS and g.size > 19 and staff_for(sy, g.y) == si
                       and clef_x < g.x < clef_x + 60], key=lambda g: g.x)
        kind = None
        seq = []
        for g in accs:
            if kind is None:
                kind = g.u
            if g.u != kind:
                break
            if seq and g.x - seq[-1].x > 9.5:
                break
            if not seq and g.x - clef_x > 32:
                break
            seq.append(g)
        res[si] = (ACCIDENTALS[kind] if kind else 0, len(seq), seq)
    return res

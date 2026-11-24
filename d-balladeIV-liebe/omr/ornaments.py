"""Trills: the "tr" sign over or under a note, with an optional small accidental above it for the upper note.

Sonata-layout fonts (Opus, Maestro) give the "tr" sign code 376; the wavy extension (126) only shows how far it runs,
which is the note's own length (with ties), so it is not needed. Maestro prints the trill's accidental as a small
glyph: "I" (73) is a sharp. A double trill (in thirds or sixths) has one sign above the chord and one below it, each
belonging to the nearest head on its side.
"""
import bisect
from fractions import Fraction
from .pitch import key_alters, key_at, midi_of

TR = 376
TR_ACCIDENTALS = {73: 1}            # Maestro small sharp over a trill sign
TRILL_STEP = Fraction(1, 8)         # quarters per trill note (32nds)


def find_trills(page, systems):
    """Mark the head each trill sign belongs to: head.trill = {"alter": accidental of the upper note or None}."""
    for g in page.glyphs:
        if g.u != TR:
            continue
        best = None
        for sy in systems:                                    # the staff the sign is nearest to (inside counts as 0)
            for si, st in enumerate(sy.staves):
                d = 0.0 if st.top <= g.cy <= st.bottom else min(abs(g.cy - st.top), abs(g.cy - st.bottom))
                if best is None or d < best[0]:
                    best = (d, sy, si)
        if best is None or best[0] > 60:
            continue
        _, sy, si = best
        # the sign is centred near the head; a chord with accidentals can push the head up to ~8 pt right of it
        cands = [h for h in sy.heads if h.staff == si and not h.grace and -9 <= g.x - h.x <= 14]
        if not cands:
            continue
        h = min(cands, key=lambda h: abs(h.y - g.cy))         # above a chord: its top head; below: its bottom head
        if abs(h.y - g.cy) > 60:
            continue
        acc = None
        for a in page.glyphs:
            if a.u in TR_ACCIDENTALS and abs(a.cx - g.cx) < 10 and 0 < g.cy - a.cy < 20:
                acc = TR_ACCIDENTALS[a.u]
        h.trill = dict(alter=acc)


def move_to_tie_start(pages):
    """A sign printed over a tied continuation belongs to the tie chain's first note (the one that is exported).
    Run after tie detection."""
    for ss in pages:
        for sy in ss:
            for h in sy.heads:
                tr = getattr(h, "trill", None)
                if tr and h.tie_prev and h.tie_from is not None:
                    root = h
                    while root.tie_prev and root.tie_from is not None:
                        root = root.tie_from
                    if not getattr(root, "trill", None):
                        root.trill = tr
                    else:
                        # the tied note already trills: the sign makes its chord a double trill, so it is the chord's
                        # newly struck note(s) that start trilling (m.23: A#4 held under the sign, Cx5 struck)
                        for o in sy.heads:
                            if (o is not h and o.staff == h.staff and abs(o.x - h.x) < 1.0 and not o.tie_prev
                                    and not o.grace and not getattr(o, "trill", None)):
                                o.trill = tr
                    h.trill = None


def upper_midi(sy, h):
    """The trill's upper note: the next letter up, sharpened or flattened by the sign's own accidental, else by an
    accidental earlier in the bar on that letter, else by the key signature; the head's ottava applies."""
    dia = h.dia + 1
    alt = (getattr(h, "trill", None) or {}).get("alter")
    if alt is None:
        bar = bisect.bisect_right(sy.barlines, h.x + 0.01)
        prev = [o for o in sy.heads if o.staff == h.staff and o.dia == dia and o.explicit and o.x < h.x
                and bisect.bisect_right(sy.barlines, o.x + 0.01) == bar]
        alt = max(prev, key=lambda o: o.x).alter if prev else key_alters(*key_at(sy.ks[h.staff], h.x)).get(dia % 7, 0)
    return midi_of(dia, alt) + h.shift


def realise(t, d, main, upper):
    """Alternate main and upper note over [t, t+d): an odd number (at least 3) of equal notes about TRILL_STEP long,
    starting and ending on the main note. Yields (onset, length, midi)."""
    k = max(3, round(d / float(TRILL_STEP)))
    if k % 2 == 0:
        k -= 1
    step = d / k
    for i in range(k):
        yield t + i * step, step, main if i % 2 == 0 else upper

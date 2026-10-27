"""Pitch resolution: key signature + accidentals remembered until the barline."""
import bisect

LETTER_SEMI = [0, 2, 4, 5, 7, 9, 11]
NAMES = ["C", "D", "E", "F", "G", "A", "B"]
FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3]      # B E A D G C F  (letter index)
SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]     # F C G D A E B

# diatonic number (octave*7+letter) of the bottom staff line
CLEF_BOTTOM = {"treble": 4 * 7 + 2, "bass": 2 * 7 + 4}


def key_alters(kind, count):
    """letter index -> alteration for a key signature of `count` accidentals of `kind` (-1 flat / +1 sharp)."""
    alt = {}
    order = FLAT_ORDER if kind < 0 else SHARP_ORDER
    for l in order[:count]:
        alt[l] = kind
    return alt


def key_at(segs, x):
    """(kind, count) of the key signature in force at x, from a staff's key segments [(x_from, kind, count, glyphs)]."""
    cur = segs[0]
    for sg in segs:
        if sg[0] <= x + 0.5:
            cur = sg
    return cur[1], cur[2]


def midi_of(dia, alter):
    return 12 * (dia // 7 + 1) + LETTER_SEMI[dia % 7] + alter


def compute_pitches(sy, carry=None):
    """Resolve alter/midi of every head in a system. carry: {(staff, dia): alter} state tied across a barline
    (applied by the caller after tie detection)."""
    bars = sy.barlines
    for si in (0, 1):
        segs = sy.ks[si]
        hs = sorted([h for h in sy.heads if h.staff == si], key=lambda h: (h.x, h.y))
        state = {}
        cur_m = None
        for h in hs:
            m = bisect.bisect_right(bars, h.x + 0.01) - 1
            if m != cur_m:
                state = {}
                cur_m = m
            if h.explicit:
                state[h.dia] = h.alter
            elif h.tie_prev and h.tie_from is not None:
                h.alter = h.tie_from.alter          # a tied note keeps its predecessor's accidental
            elif h.dia in state:
                h.alter = state[h.dia]
            else:
                h.alter = key_alters(*key_at(segs, h.x)).get(h.dia % 7, 0)
            h.midi = midi_of(h.dia, h.alter) + h.shift

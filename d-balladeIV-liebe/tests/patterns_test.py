"""Checks of omr/patterns.py on made-up figures.   python3 -I tests/patterns_test.py"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from omr.patterns import find

def line(pitches, t0=0.0, hand="R", step=0.25, measure=1, first_id=0):
    return [dict(id=first_id + i, hand=hand, midi=p, t=t0 + i * step, measure=measure) for i, p in enumerate(pitches)]

def cells(p):
    return [[n for n in c["notes"]] for c in p["cells"]]

# A, then B = A an octave lower, then C = B an octave lower
A = [77, 72, 73, 69, 70, 66, 67, 64]
notes = line(A + [x - 12 for x in A] + [x - 24 for x in A])
(p,) = find(notes, [(1, 1)])
assert (p["shift"], p["length"], len(p["cells"])) == (-12, 8, 3), p
assert cells(p) == [list(range(0, 8)), list(range(8, 16)), list(range(16, 24))]

# one note of a repeat may differ; the cells are still one chain
B = list(A); B[2] = 74
(p,) = find(line(A + [x + 12 for x in B]), [(1, 1)])
assert (p["shift"], len(p["cells"])) == (12, 2), p

# an unchanged alternation is one chain of cells of two onsets
(p,) = find(line([64, 63] * 6), [(1, 1)])
assert (p["shift"], p["length"], len(p["cells"])) == (0, 2, 6), p

# two hands are searched separately; notes outside the ranges are ignored
notes = line(A + [x - 12 for x in A], hand="R") + line(A + [x - 12 for x in A], hand="L", first_id=100) \
    + line(A + [x - 12 for x in A], first_id=200, measure=9)
ps = find(notes, [(1, 1)])
assert sorted(p["hand"] for p in ps) == ["L", "R"] and all(len(p["cells"]) == 2 for p in ps), ps

# unrelated notes make no pattern
assert find(line([60, 71, 62, 65, 70, 61, 68, 63, 66, 59]), [(1, 1)]) == []

# a leading note that does not belong to the figure is left out of cell A
notes = line([67] + [62, 63, 66, 70, 73, 74] + [62 + 12, 63 + 12, 66 + 12, 70 + 12, 73 + 12, 74 + 12])
ps = find(notes, [(1, 1)])
assert ps and 0 not in ps[0]["cells"][0]["notes"], ps
print("patterns_test: ok")

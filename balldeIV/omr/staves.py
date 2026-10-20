"""Staff / system / barline detection from stroked lines."""
from dataclasses import dataclass, field
from .primitives import U

SPACE_TOL = 0.35


@dataclass
class Staff:
    lines: list              # 5 y values, top -> bottom
    x0: float
    x1: float
    kind: str = ""           # "treble" | "bass" (initial clef)
    hand: str = ""           # "R" | "L"

    @property
    def space(self):
        return (self.lines[-1] - self.lines[0]) / 4.0

    @property
    def top(self):
        return self.lines[0]

    @property
    def bottom(self):
        return self.lines[-1]

    def step_of(self, y):
        """Half-space steps above the bottom line (bottom line = 0)."""
        return (self.bottom - y) / (self.space / 2.0)


@dataclass
class System:
    index: int
    staves: list                       # [treble, bass]
    barlines: list = field(default_factory=list)   # sorted x of system barlines
    y0: float = 0
    y1: float = 0


def find_staves(page):
    long_h = [s for s in page.hlines if abs(s.x1 - s.x0) > 150 and s.w < 0.6]
    ys = sorted({round(s.y0, 2) for s in long_h})
    # merge near-duplicates
    merged = []
    for y in ys:
        if merged and abs(y - merged[-1]) < 0.15:
            continue
        merged.append(y)
    staves = []
    i = 0
    while i + 4 < len(merged):
        grp = merged[i:i + 5]
        d = [grp[k + 1] - grp[k] for k in range(4)]
        if max(d) - min(d) < 0.6 and 4.0 < d[0] < 6.0:
            segs = [s for s in long_h if any(abs(s.y0 - g) < 0.2 for g in grp)]
            x0 = min(min(s.x0, s.x1) for s in segs)
            x1 = max(max(s.x0, s.x1) for s in segs)
            staves.append(Staff(lines=grp, x0=x0, x1=x1))
            i += 5
        else:
            i += 1
    return staves


def build_systems(page):
    staves = find_staves(page)
    systems = []
    for i in range(0, len(staves) - 1, 2):
        tr, bs = staves[i], staves[i + 1]
        tr.kind, tr.hand = "treble", "R"
        bs.kind, bs.hand = "bass", "L"
        sy = System(index=len(systems), staves=[tr, bs], y0=tr.top, y1=bs.bottom)
        # barlines: vertical strokes spanning the whole system height (thin or thick)
        xs = []
        for v in page.vlines:
            ya, yb = sorted((v.y0, v.y1))
            if ya <= tr.top + 1.5 and yb >= bs.bottom - 1.5 and v.w >= 0.5:
                xs.append(round(v.x0, 2))
        xs = sorted(set(xs))
        # collapse a thin+thick final barline pair
        out = []
        for x in xs:
            if out and x - out[-1] < 4.0:
                out[-1] = x
            else:
                out.append(x)
        sy.barlines = out
        systems.append(sy)
    return systems

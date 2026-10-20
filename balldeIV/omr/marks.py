"""Ottava lines and ties."""
import pymupdf

OTTAVA_DASH = (2.9, 2.5)


def ottava_spans(doc, page_index, page, systems):
    """Return {system index: [(staff, x0, x1, shift)]} for the dashed ottava lines of a page.
    Each dashed line is owned by exactly one staff: the nearest staff edge (a line just above a treble staff
    is an 8va for that staff; a line just below a bass staff is an 8vb)."""
    p = doc[page_index]
    labels = [g for g in page.glyphs if g.u == 8220 and g.size > 15]
    out = {sy.index: [] for sy in systems}
    for dr in p.get_drawings():
        ds = dr.get("dashes") or ""
        if "2.945" not in ds:
            continue
        r = dr["rect"]
        xa, xb, y = r.x0, r.x1, r.y0
        best = None
        for sy in systems:
            for si, st in enumerate(sy.staves):
                if si == 0 and st.top - 70 <= y <= st.top + 2:
                    d = st.top - y
                    cand = (abs(d), sy, si, 12)
                elif si == 1 and st.bottom - 2 <= y <= st.bottom + 45:
                    d = y - st.bottom
                    cand = (abs(d), sy, si, -12)
                else:
                    continue
                if best is None or cand[0] < best[0]:
                    best = cand
        if best is None:
            continue
        _, sy, si, shift = best
        lab = [g for g in labels if abs(g.y - y) < 12 and g.x < xa + 2 and xa - g.x < 40]
        start = lab[0].x if lab else sy.barlines[0]
        out[sy.index].append((si, start - 1, xb + 3, shift))
    return out


def apply_ottava(sy, spans):
    for h in sy.heads:
        h.shift = 0
        for st, x0, x1, shift in spans:
            if h.staff == st and x0 <= h.x <= x1:
                h.shift = shift


def find_ties(page, sy, pending):
    """Link tied heads. `pending`: heads whose tie runs off the previous system (to be continued here).
    Returns heads of this system whose tie runs off its right end."""
    heads = sy.heads
    x_start, x_end = sy.barlines[0], sy.barlines[-1]
    curves = [c for c in page.curves if sy.y0 - 40 <= (c["bbox"][1] + c["bbox"][3]) / 2 <= sy.y1 + 40
              and c["bbox"][0] >= x_start - 5 and c["bbox"][2] <= x_end + 10]
    out_pending = []
    used_pairs = set()

    def head_near(px, py, side, dia_hint=None):
        best = None
        for h in heads:
            if side == "right":
                dx = px - (h.x + 8.0)                    # tie leaves the head, possibly after its augmentation dot
                ok = -4.0 <= dx <= 16.0
                dxa = abs(dx) if dx < 8 else dx * 0.6
            else:
                dx = px - h.x                           # tie lands just before the head
                ok = -10.0 <= dx <= 5.0
                dxa = abs(dx)
            dy = abs(py - h.y)
            if ok and dy < 9.0:
                score = dxa * 0.35 + dy * 1.8
                if dia_hint is not None and h.dia != dia_hint:
                    continue
                if best is None or score < best[0]:
                    best = (score, h)
        return best[1] if best else None

    for c in curves:
        w = c["bbox"][2] - c["bbox"][0]
        hgt = c["bbox"][3] - c["bbox"][1]
        if hgt > 12 or w > 140 or w < 6:
            continue
        p0, p1 = c["p0"], c["p1"]
        if p0[0] > p1[0]:
            p0, p1 = p1, p0
        a = head_near(p0[0], p0[1], "right")
        if a is None:
            continue
        b = head_near(p1[0], p1[1], "left", dia_hint=a.dia)
        if b is None or b is a or b.x <= a.x or b.staff != a.staff:
            continue
        if (id(a), id(b)) in used_pairs:
            continue
        # no other head of the same pitch position between them
        mid = [h for h in heads if h is not a and h is not b and h.staff == a.staff and h.dia == a.dia and a.x < h.x < b.x]
        if mid:
            continue
        used_pairs.add((id(a), id(b)))
        a.tie_next = True
        b.tie_prev = True
        b.tie_from = a
    # open ties: a head at only one end of a short flat curve
    for c in curves:
        w = c["bbox"][2] - c["bbox"][0]
        hgt = c["bbox"][3] - c["bbox"][1]
        if hgt > 12 or w > 140 or w < 6:
            continue
        p0, p1 = c["p0"], c["p1"]
        if p0[0] > p1[0]:
            p0, p1 = p1, p0
        a = head_near(p0[0], p0[1], "right")
        b = head_near(p1[0], p1[1], "left")
        if a is not None and b is None and p1[0] >= x_end - 14:
            if not a.tie_next:
                a.tie_next = True
            if a not in out_pending:
                out_pending.append(a)
        elif b is not None and a is None and p0[0] <= x_start + 70:
            if not b.tie_prev:
                for pa in pending:
                    if pa.dia == b.dia and pa.staff == b.staff and not getattr(pa, "_linked", False):
                        b.tie_prev = True
                        b.tie_from = pa
                        pa._linked = True
                        break
    return out_pending


def curves_open(page, sy):
    """Curves starting at a head but ending beyond the last barline ('out'), or entering from before the first head ('in')."""
    res = []
    x_start, x_end = sy.barlines[0], sy.barlines[-1]
    for c in page.curves:
        mid = (c["bbox"][1] + c["bbox"][3]) / 2
        if not (sy.y0 - 40 <= mid <= sy.y1 + 40):
            continue
        hgt = c["bbox"][3] - c["bbox"][1]
        w = c["bbox"][2] - c["bbox"][0]
        if hgt > 9 or w > 60:
            continue
        p0, p1 = c["p0"], c["p1"]
        if p0[0] > p1[0]:
            p0, p1 = p1, p0
        if p1[0] >= x_end - 1 and x_start < p0[0] < x_end:
            res.append(("out", p0))
        if p0[0] <= x_start + 30 and p1[0] > x_start:
            res.append(("in", p1))
    return res

"""Ottava lines and ties."""
import collections
import pymupdf

OTTAVA_DASH = (2.9, 2.5)


def dashed_lines(doc, page_index, page):
    """Horizontal dashed ottava lines as (x0, x1, y). Two encodings occur: one stroked path with the dash pattern
    (Sibelius via some exporters) or a chain of short separate strokes at one y (mfiles.co.uk)."""
    out = []
    for dr in doc[page_index].get_drawings():
        if "2.945" in (dr.get("dashes") or ""):
            r = dr["rect"]
            out.append((r.x0, r.x1, r.y0))
    segs = collections.defaultdict(list)
    for sg in page.hlines:
        if 1.5 <= abs(sg.x1 - sg.x0) <= 4.0 and 0.6 <= sg.w <= 0.9:
            segs[round(sg.y0, 1)].append((min(sg.x0, sg.x1), max(sg.x0, sg.x1)))
    for y, lst in segs.items():
        lst.sort()
        run = [lst[0]]
        for sg in lst[1:] + [(1e9, 1e9)]:
            if sg[0] - run[-1][1] <= 3.2:
                run.append(sg)
                continue
            if len(run) >= 6:
                out.append((run[0][0], run[-1][1], y))
            run = [sg]
    return out


def ottava_spans(doc, page_index, page, systems):
    """Return {system index: [(staff, x0, x1, shift)]} for the dashed ottava lines of a page.
    Each dashed line is owned by exactly one staff: a line above a staff is an 8va for that staff (the lower staff
    included: its line runs in the gap between the staves); a line just below a bass staff is an 8vb."""
    labels = [g for g in page.glyphs if g.u == 8220 and g.size > page.full * 0.75]
    out = {sy.index: [] for sy in systems}
    for xa, xb, y in dashed_lines(doc, page_index, page):
        best = None
        for sy in systems:
            for si, st in enumerate(sy.staves):
                if si == 0 and st.top - 70 <= y <= st.top + 2:
                    cand = (abs(st.top - y), sy, si, 12)
                elif si == 1 and st.top - 45 <= y <= st.top + 2:
                    cand = (abs(st.top - y), sy, si, 12)
                elif si == 1 and st.bottom - 2 <= y <= st.bottom + 45:
                    cand = (abs(y - st.bottom), sy, si, -12)
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

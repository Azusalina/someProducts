"""Combine PDF-parsed notation with MIDI timing into the final score JSON.

Pitch, hand, ties, grace flags, notated durations and page positions come from the PDF (vector parse).
Onsets come from the Mutopia MIDI, matched head-by-head (same pitch, same order inside the bar), after removing the
constant RH-track drift measured in columns the PDF shows as simultaneous.
"""
import json, statistics
from fractions import Fraction
from .score import parse_document
from .midi_align import pair_measure
from .pitch import NAMES

TPB = 384            # MIDI ticks per quarter note
SNAP = 16            # ticks (1/24 quarter): exact for 16ths, sextuplets, 32nds, triplets
NAME12 = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]


def snap(t, g=SNAP):
    return int(round(t / g)) * g


def build(pdf_path, midi_path, first_measure=168, last_measure=239, off1_start=-30):
    from .midi_io import read_midi
    doc, pages, warns = parse_document(pdf_path)
    div, mnotes, _, _ = read_midi(midi_path)
    assert div == TPB
    bar = 3 * div
    notes_out = []
    measures_out = []
    report = []
    off1 = off1_start
    nid = 0
    systems = [(pi, sy) for pi, ss in enumerate(pages) for sy in ss]
    for pi, sy in systems:
        for k in range(len(sy.barlines) - 1):
            m = sy.first_measure + k
            if not first_measure <= m <= last_measure:
                continue
            start = (m - 1) * bar
            evs = [e for e in sy.events if e.measure == k]
            note_evs = [e for e in evs if e.kind == "note"]
            heads = [h for e in note_evs for h in e.heads if not h.tie_prev]
            ev_of = {id(h): e for e in note_evs for h in e.heads}
            # window per track, shifted by the current RH offset
            win = [n for n in mnotes if (start + off1 - 28 <= n[0] < start + off1 + bar - 28 and n[3] == 1)
                   or (start - 20 <= n[0] < start + bar - 20 and n[3] != 1)]
            pairs, left = pair_measure(heads, sy.barlines[k], sy.barlines[k + 1], win, start, bar)
            # RH-track offset from columns shared by both tracks
            cols = {}
            for h in heads:
                n = pairs.get(id(h))
                if n is not None:
                    cols.setdefault(round(h.x / 2.0), {}).setdefault(n[3], []).append(n[0])
            diffs = [statistics.median(v[1]) - statistics.median(v[2]) for v in cols.values() if 1 in v and 2 in v]
            if diffs:
                off1 = statistics.median(diffs)
            # head times
            t_of = {}
            src_of = {}
            for h in heads:
                n = pairs.get(id(h))
                if n is None:
                    continue
                t = n[0] - (off1 if n[3] == 1 else 0) - start
                t_of[id(h)] = t
                src_of[id(h)] = "midi"
            # leftovers: the editions disagree on a pitch -> pair by hand and expected position, keep the PDF pitch
            span = max(sy.barlines[k + 1] - sy.barlines[k], 1.0)
            free_h = [h for h in heads if id(h) not in t_of]
            free_m = list(left)
            cand = []
            for h in free_h:
                exp = start + (h.x - sy.barlines[k]) / span * bar
                for n in free_m:
                    tr_ok = (n[3] == 1) == (h.staff == 0)
                    d = abs(exp - n[0]) + (0 if tr_ok else 250)
                    cand.append((d, id(h), n))
            used_h, used_m = set(), set()
            for d, hid, n in sorted(cand, key=lambda c: c[0]):
                if d > 220 or hid in used_h or id(n) in used_m:
                    continue
                used_h.add(hid)
                used_m.add(id(n))
                t_of[hid] = n[0] - (off1 if n[3] == 1 else 0) - start
                src_of[hid] = "midi-pitchdiff"
            # simultaneous heads in one PDF column share the column's median time
            colmap = {}
            for h in heads:
                if id(h) in t_of and not h.grace:
                    colmap.setdefault(round(h.x / 2.2), []).append(h)
            for lst in colmap.values():
                if len(lst) > 1:
                    med = statistics.median(t_of[id(h)] for h in lst)
                    for h in lst:
                        if abs(t_of[id(h)] - med) <= 20:
                            t_of[id(h)] = med
            # unmatched heads: borrow time from the same column, else interpolate by x
            timed = [(h.x, t_of[id(h)]) for h in heads if id(h) in t_of and not h.grace]
            timed.sort()
            for h in heads:
                if id(h) in t_of:
                    continue
                same = [t for x, t in timed if abs(x - h.x) < 2.2]
                if same:
                    t_of[id(h)] = statistics.median(same)
                    src_of[id(h)] = "column"
                    continue
                lo = [(x, t) for x, t in timed if x < h.x]
                hi = [(x, t) for x, t in timed if x > h.x]
                if lo and hi:
                    (xa, ta), (xb, tb) = lo[-1], hi[0]
                    t_of[id(h)] = ta + (tb - ta) * (h.x - xa) / (xb - xa)
                elif lo:
                    t_of[id(h)] = lo[-1][1]
                elif hi:
                    t_of[id(h)] = hi[0][1]
                else:
                    t_of[id(h)] = 0.0
                src_of[id(h)] = "interp"
            for h in heads:
                t_of[id(h)] = snap(t_of[id(h)], 8 if h.grace else SNAP)
            # durations (ticks): beam-group scale inference
            scale = infer_scales(note_evs, t_of)
            unmatched = sum(1 for h in heads if src_of[id(h)] != "midi")
            report.append(dict(measure=m, heads=len(heads), unmatched_pdf=unmatched, unmatched_midi=len(left),
                               rh_offset=off1))
            measures_out.append(dict(n=m, page=pi, system=sy.index, index=k, start=(m - 1) * 3.0,
                                     x0=round(sy.barlines[k], 2), x1=round(sy.barlines[k + 1], 2),
                                     y0=round(sy.y0, 2), y1=round(sy.y1, 2)))
            for h in heads:
                e = ev_of[id(h)]
                dur_ticks = int(round(float(e.dur * scale.get(e.id, Fraction(1))) * 4 * TPB)) if not e.grace else 0
                # extend through tie chain (later heads add their duration)
                notes_out.append(dict(
                    id=nid, measure=m, hand="R" if h.staff == 0 else "L", midi=h.midi,
                    name=f"{NAME12[h.midi % 12]}{h.midi // 12 - 1}",
                    t=(m - 1) * 3.0 + t_of[id(h)] / TPB,
                    d=dur_ticks / TPB, grace=bool(h.grace), tieNext=bool(h.tie_next),
                    page=pi, x=round(h.x, 2), y=round(h.y, 2), src=src_of[id(h)],
                    _h=h, _e=e))
                nid += 1
    # tie merging: add continuation durations to the chain head
    merge_ties(notes_out, pages, first_measure, last_measure, scale_cache=None)
    for n in notes_out:
        n.pop("_h", None)
        n.pop("_e", None)
    return dict(notes=notes_out, measures=measures_out, report=report, warnings=warns)


def ev_time(e, t_of):
    ts = [t_of[id(h)] for h in e.heads if id(h) in t_of]
    return statistics.median(ts) if ts else None


def infer_scales(note_evs, t_of):
    """Tuplet scale per event (1 or 2/3) from onset gaps inside beam groups, inherited by lone events."""
    from .timing import beam_groups
    evs = [e for e in note_evs if not e.grace and ev_time(e, t_of) is not None]
    scale = {}
    for g in beam_groups(evs):
        if len(g) < 2:
            continue
        for st in (0, 1):
            gs = sorted([e for e in g if e.staff == st], key=lambda e: ev_time(e, t_of))
            if len(gs) < 2:
                continue
            votes = []
            for a, b in zip(gs, gs[1:]):
                gap = ev_time(b, t_of) - ev_time(a, t_of)
                if gap <= 0:
                    continue
                r = gap / (float(a.dur) * 4 * TPB)
                if abs(r - 1) < 0.1:
                    votes.append(Fraction(1))
                elif abs(r - 2 / 3) < 0.07:
                    votes.append(Fraction(2, 3))
            if votes:
                s = max(set(votes), key=votes.count)
                for e in gs:
                    scale[e.id] = s
    return scale


def merge_ties(notes_out, pages, first_measure, last_measure, scale_cache):
    by_head = {id(n["_h"]): n for n in notes_out}
    # also account for continuation heads (not in notes_out): walk from each chain head
    cont_next = {}
    for ss in pages:
        for sy in ss:
            for h in sy.heads:
                if h.tie_prev and h.tie_from is not None:
                    cont_next[id(h.tie_from)] = h
    # event duration of continuation heads
    ev_dur = {}
    for ss in pages:
        for sy in ss:
            for e in sy.events:
                if e.kind == "note":
                    for h in e.heads:
                        ev_dur[id(h)] = e
    for n in notes_out:
        h = n["_h"]
        total = n["d"]
        cur = h
        while id(cur) in cont_next:
            nxt = cont_next[id(cur)]
            e = ev_dur.get(id(nxt))
            if e is None:
                break
            total += float(e.dur) * 4          # notated duration of the continuation (beats)
            cur = nxt
            n["tied"] = True
        n["d"] = total

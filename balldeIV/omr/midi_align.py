"""Pair PDF heads with MIDI notes of the same bar (same pitch, same order) to read rhythm from the MIDI.

The MIDI is only used for *timing*; pitches, hands, positions and the notation always come from the PDF.
"""
import collections

TICKS_PER_WHOLE = 4 * 384


def pair_measure(heads, bar_x0, bar_x1, midi_notes, bar_start, bar_len, tol_ticks=60):
    """heads: list of Head (not tie continuations). midi_notes: list (on, off, pitch, track) of this bar.
    Returns dict id(head)->midi note tuple (or None for unmatched), and leftover midi notes."""
    by_p_h = collections.defaultdict(list)
    for h in heads:
        by_p_h[h.midi].append(h)
    by_p_m = collections.defaultdict(list)
    for n in midi_notes:
        by_p_m[n[2]].append(n)
    out = {}
    left = []
    span = max(bar_x1 - bar_x0, 1.0)
    for p in set(by_p_h) | set(by_p_m):
        A = sorted(by_p_h.get(p, []), key=lambda h: (h.x, h.y))
        B = sorted(by_p_m.get(p, []), key=lambda n: n[0])
        exp = [bar_start + (h.x - bar_x0) / span * bar_len for h in A]
        # DP: min sum |exp - onset|, skipping allowed with penalty
        INF = 1e18
        skip = 400.0
        na, nb = len(A), len(B)
        dp = [[INF] * (nb + 1) for _ in range(na + 1)]
        back = [[None] * (nb + 1) for _ in range(na + 1)]
        dp[0][0] = 0.0
        for i in range(na + 1):
            for j in range(nb + 1):
                v = dp[i][j]
                if v >= INF:
                    continue
                if i < na and v + skip < dp[i + 1][j]:
                    dp[i + 1][j] = v + skip
                    back[i + 1][j] = (i, j, "a")
                if j < nb and v + skip < dp[i][j + 1]:
                    dp[i][j + 1] = v + skip
                    back[i][j + 1] = (i, j, "b")
                if i < na and j < nb:
                    c = abs(exp[i] - B[j][0])
                    if v + c < dp[i + 1][j + 1]:
                        dp[i + 1][j + 1] = v + c
                        back[i + 1][j + 1] = (i, j, "m")
        i, j = na, nb
        while (i, j) != (0, 0):
            pi_, pj, k = back[i][j]
            if k == "m":
                out[id(A[pi_])] = B[pj]
            elif k == "a":
                out.setdefault(id(A[pi_]), None)
            else:
                left.append(B[pj])
            i, j = pi_, pj
    return out, left

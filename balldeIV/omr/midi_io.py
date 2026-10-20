"""Minimal tolerant SMF reader: returns (ticks_per_beat, notes[(on, off, pitch, track)], timesigs[(tick,num,den)])."""
import struct, sys, json


def vlq(b, i):
    v = 0
    while True:
        c = b[i]
        i += 1
        v = (v << 7) | (c & 0x7F)
        if not c & 0x80:
            return v, i


def read_midi(path):
    b = open(path, "rb").read()
    assert b[:4] == b"MThd"
    fmt, ntr, div = struct.unpack(">HHH", b[8:14])
    i = 14
    notes, tsigs, tempos = [], [], []
    for tr in range(ntr):
        assert b[i:i + 4] == b"MTrk", b[i:i + 4]
        ln = struct.unpack(">I", b[i + 4:i + 8])[0]
        j, end = i + 8, i + 8 + ln
        t, run = 0, None
        on = {}
        while j < end:
            dt, j = vlq(b, j)
            t += dt
            st = b[j]
            if st == 0xFF:
                typ = b[j + 1]
                l, j2 = vlq(b, j + 2)
                data = b[j2:j2 + l]
                if typ == 0x58:
                    tsigs.append((t, data[0], 2 ** data[1]))
                elif typ == 0x51:
                    tempos.append((t, int.from_bytes(data, "big")))
                j = j2 + l
                continue
            if st in (0xF0, 0xF7):
                l, j2 = vlq(b, j + 1)
                j = j2 + l
                continue
            if st & 0x80:
                run = st
                j += 1
            st = run
            kind = st & 0xF0
            if kind in (0x80, 0x90):
                p, v = b[j], b[j + 1]
                j += 2
                if kind == 0x90 and v > 0:
                    on.setdefault(p, []).append(t)
                else:
                    if on.get(p):
                        s = on[p].pop(0)
                        notes.append((s, t, p, tr))
            elif kind in (0xA0, 0xB0, 0xE0):
                j += 2
            else:
                j += 1
        i = end
    notes.sort()
    return div, notes, tsigs, tempos


if __name__ == "__main__":
    div, notes, ts, tempos = read_midi(sys.argv[1])
    print("tpb", div, "notes", len(notes), "tsigs", ts, "tempos", tempos[:5])
    print("last note off", max(n[1] for n in notes), "=> beats", max(n[1] for n in notes) / div)

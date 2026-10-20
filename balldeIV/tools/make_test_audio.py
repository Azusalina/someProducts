"""Synthesise a 'practice session' as a WAV: calibration scale, then the first coda steps (both hands).

The timbre deliberately differs from the app's default template: inharmonic partials, per-partial decay,
hammer noise, slightly sharp tuning (A=441.5). Writes <out>.wav and <out>.json (ground-truth onsets).
usage: make_test_audio.py score.json out_prefix [steps=24] [scale_octaves=5]
"""
import sys, json, wave
import numpy as np

SR = 48000
rng = np.random.default_rng(7)
A4 = 441.5


def midi_hz(m):
    return A4 * 2 ** ((m - 69) / 12)


def tone(m, dur, vel=0.5, seed=0):
    r = np.random.default_rng(seed + m)
    f0 = midi_hz(m)
    n = int(SR * (dur + 0.4))
    t = np.arange(n) / SR
    B = 0.00012 * 2 ** ((m - 55) / 11)
    out = np.zeros(n)
    tau0 = np.interp(m, [24, 60, 96], [6.0, 3.0, 0.9])
    H = int(min(16, 6000 / f0))
    ph = r.uniform(0, 2 * np.pi, H + 1)
    for h in range(1, H + 1):
        f = f0 * h * np.sqrt(1 + B * h * h)
        a = (h ** -1.15) * (1 + 0.45 * np.cos(h * 1.7 + m * 0.3)) * (0.35 if (h == 1 and m < 40) else 1.0)
        tau = tau0 / (1 + 0.55 * (h - 1))
        out += a * np.sin(2 * np.pi * f * t + ph[h]) * np.exp(-t / tau)
    env = np.minimum(1, t / 0.004) * np.where(t > dur, np.exp(-(t - dur) / 0.12), 1.0)
    out *= env
    k = int(SR * 0.012)
    out[:k] += r.normal(0, 0.15, k) * np.exp(-np.arange(k) / (k / 4))
    return out * vel / max(1e-6, np.max(np.abs(out)))


def mix(events, total):
    buf = np.zeros(int(SR * total))
    truth = []
    for i, (t0, m, d, v) in enumerate(events):
        s = tone(m, d, v, seed=i % 5)
        a = int(t0 * SR)
        buf[a:a + len(s)] += s[:len(buf) - a]
        truth.append(dict(t=t0, midi=m))
    return buf, truth


def main():
    score = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    nsteps = int(sys.argv[3]) if len(sys.argv) > 3 else 24
    octs = int(sys.argv[4]) if len(sys.argv) > 4 else 5
    from_m = int(sys.argv[5]) if len(sys.argv) > 5 else 0
    gap = float(sys.argv[6]) if len(sys.argv) > 6 else 0.75
    start, end = {2: (48, 72), 3: (36, 72), 5: (36, 96)}[octs]
    scale = [m for m in range(start, end + 1) if m % 12 in (0, 2, 4, 5, 7, 9, 11)]
    ev, t = [], 2.5
    cal_truth = []
    for m in scale:
        ev.append((t, m, 0.9, 0.45 + 0.1 * rng.random()))
        cal_truth.append(dict(t=t, midi=m))
        t += 1.5
    t += 2.0
    play_start = t
    # coda steps (non-grace notes grouped within 40 ms)
    notes = [n for n in score["notes"] if not n["grace"] and n["measure"] >= from_m]
    notes.sort(key=lambda n: n["t"])
    steps = []
    for n in notes:
        if steps and n["t"] - steps[-1][0]["t"] < 0.04:
            steps[-1].append(n)
        else:
            steps.append([n])
    steps = steps[:nsteps]
    play_truth = []
    for s in steps:
        v = 0.3 + 0.25 * rng.random()
        for n in s:
            ev.append((t, n["midi"], 0.7, v * (0.8 + 0.4 * rng.random())))
        play_truth.append(dict(t=t, notes=sorted({n["midi"] for n in s})))
        t += gap
    t += 1.5
    buf, _ = mix(ev, t)
    buf += rng.normal(0, 0.0015, len(buf))            # room noise
    buf *= 0.8 / max(1e-6, np.max(np.abs(buf)))
    pcm = (buf * 32767).astype("<i2")
    with wave.open(out + ".wav", "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    json.dump(dict(scale=cal_truth, play=play_truth, play_start=play_start, duration=t), open(out + ".json", "w"))
    print("wav", t, "s; scale notes", len(scale), "steps", len(steps))


if __name__ == "__main__":
    main()

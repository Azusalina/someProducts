# Ballade IV Waterfall

## What is it?

A web app for learning the coda of Chopin's Ballade No. 4 (Op. 52, from `sheet-pdf/ballde4.pdf`). The left pane shows the sheet music with the current notes highlighted, and the right pane shows a falling-notes waterfall above a piano keyboard. It has a **Display** mode and a **Learn** mode, where your piano is recognised through the microphone and the waterfall advances as you play. Notes are read from the PDF's vector data, not from images. Details are in [description.md](description.md).

## How to use

**Prerequisites:** Python 3.10+ (a venv with `pymupdf pillow numpy` is only needed to rebuild the data), Node 20+ and Chromium (only for the tests).

**Run:** `python3 -m http.server 4310 --directory web`, then open <http://localhost:4310> in Chrome or Chromium. The microphone needs `localhost` or https.

**Controls**
- **Display / Learn:** Display plays the waterfall with real grand-piano samples (loaded from `web/assets/piano/`; the 🔊 button mutes). Learn waits for you.
- **Left / Both / Right:** choose which hand is played or required, in both modes.
- **Space:** play or pause. In Learn mode, ← and → step back and forward.
- **Measure** menu and **Tempo** slider.
- **⚙ settings:** hand colours, keyboard height, waterfall zoom, key range, learn strictness, and sheet pages.
- **Learn mode:** press 🎤 and then **Calibrate**. Play the C-major scale shown, one note at a time, so the app learns your piano's tone and tuning. Then play the highlighted notes. The profile is saved in the browser.

**Rebuild the data:** `python3 -m venv .venv && .venv/bin/pip install pymupdf pillow numpy`, then `.venv/bin/python tools/export_web.py sheet-pdf/ballde4.pdf <ballade-4.mid> web 168 239`. The MIDI is the Mutopia Project file, used for rhythm only.

**Tests:** `npm install && node tests/browser.mjs` (add `--mic --wav tests/audio/short --octs 2` for the live microphone test).

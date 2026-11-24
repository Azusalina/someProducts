# Piano Waterfall (d-balladeIV-liebe)

## What is it?

A web app for learning piano pieces from their printed score: the coda of Chopin's Ballade No. 4 (Op. 52, from `sheet-pdf/ballde4.pdf`), the whole of Liszt's Liebestraum No. 3 (from `sheet-pdf/liebestraum3.pdf`) and the whole of Chopin's Barcarolle (Op. 60, from `sheet-pdf/barcarolle.pdf`, kept local only because that edition is copyrighted). The left pane shows the sheet music with the current notes highlighted, and the right pane shows a falling-notes waterfall above a piano keyboard. It has a **Display** mode and a **Learn** mode, where your piano is recognised through the microphone and the waterfall advances as you play. Notes are read from the PDF's vector data, not from images. Details are in [description.md](description.md).

## How to use

**Prerequisites:** Python 3.10+ (a venv with `pymupdf pillow numpy` is only needed to rebuild the data), Node 20+ and Chromium (only for the tests).

**Run:** `python3 -m http.server 4310 --directory web`, then open <http://localhost:4310> in Chrome or Chromium. The microphone needs `localhost` or https.

**Controls**
- **Piece** menu (top left): switch between the Ballade coda, the Liebestraum and the Barcarolle. The choice, and the tempo of each piece, are remembered. Small grace notes are drawn with a dashed outline; Display mode plays them and Learn mode does not ask for them. In the Barcarolle every trill (tr) is played as an alternation of the note and the one above it; only its first note is a Learn step.
- **Display / Learn:** Display plays the waterfall with real grand-piano samples (loaded from `web/assets/piano/`; the 🔊 button mutes). Learn waits for you.
- **Left / Both / Right:** choose which hand is played or required, in both modes.
- **Space:** play or pause. In Learn mode, ← and → step back and forward.
- **Click a measure on the sheet** to jump there. **Drag** across measures, or **Shift-click** (a range from the last clicked measure) and **Ctrl/⌘-click** (add or remove one), to select measures: they loop in Display mode and Learn mode steps round them. While measures are selected, their notes are coloured by written value (32nd, 16th, 8th, dotted values, triplets, grace notes…) on the waterfall and on the sheet, with a legend at the top of the waterfall. **Esc** (or the ✕) ends the selection.
- **Measure** menu and **Tempo** slider.
- **⚙ settings:** hand colours, keyboard height, waterfall zoom, key range, learn strictness, sheet pages, and **Repeated figures**.
- **Repeated figures (Liebestraum cadenzas, m.23–31 and m.64–73):** a figure that comes back moved by octaves is split into cells A, B, C… Each cell has its own colour on the waterfall (with its letter on the first note), on the keys, and as a tinted band on the sheet; a legend at the top right of the waterfall shows which cell is sounding. The settings switch turns the colours off.
- **Learn mode:** press 🎤 and then **Calibrate**. Play the C-major scale shown, one note at a time, so the app learns your piano's tone and tuning. Then play the highlighted notes. The profile is saved in the browser.

**Rebuild the data:** `python3 -m venv .venv && .venv/bin/pip install pymupdf pillow numpy`, then
- Ballade: `.venv/bin/python tools/export_web.py sheet-pdf/ballde4.pdf <ballade-4.mid> web 168 239`. The MIDI is the Mutopia Project file, used for rhythm only.
- Liebestraum (rhythm from the PDF alone, about a minute): `.venv/bin/python tools/export_piece.py sheet-pdf/liebestraum3.pdf web liebestraum3 "Liebestraum No. 3" "Liszt · Notturno in A♭ major" --time 6/4 --bar 6 --tempo 92`. Add `--patterns 23-31,64-73` to find the repeated figures. It prints the bars worth a look. To add the figures to an existing score without rebuilding: `.venv/bin/python tools/add_patterns.py web/data/liebestraum3.json 23-31,64-73`.
- Barcarolle (a Finale PDF, about a minute): `.venv/bin/python tools/export_piece.py sheet-pdf/barcarolle.pdf web barcarolle "Barcarolle" "Chopin · Op. 60 in F♯ major" --time 12/8 --bar 6 --tempo 66 --anchor --local-only`. `--anchor` fixes the voices whose values fill their bar before solving the rest; `--local-only` keeps the piece out of the public site.

**Tests:** `python3 -I tests/patterns_test.py` (figure finder) and `npm install && node tests/browser.mjs` cover all three pieces (add `--mic --wav tests/audio/short --octs 2` for the live microphone test, which uses the Ballade). `tools/validate_rhythm.py` and `tools/audit_pdf.py` check a PDF-built score; see the description.

**Online:** https://azusalina.github.io/someProducts/balladeIV-liebe/ . Local source lives in `d-balladeIV-liebe/`; the published route stays unchanged. Pieces marked `localOnly` in `web/data/pieces.json` (the Barcarolle) are left out of the published copy; run the app locally to use them.

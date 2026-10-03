# Little Algebra / 每天，多懂一點

## What is it?

A local, bilingual English / 繁體中文 learning site for someone who has completed HKDSE Maths Core + M1. Fourteen lessons take about 10–15 minutes each. The curriculum uses original explanations and exercises alongside the two books already in `ref/`.

## How to use

From this directory:

```bash
npm run dev
```

Visit **http://127.0.0.1:3001/**. Python 3 is the only serving requirement; all browser libraries are already included. Alternatively: `python3 -m http.server 3001 --bind 127.0.0.1`.

Serve over HTTP rather than opening a `file://` URL: browser modules and the local Three.js imports need it. Once served, the course and its local PDFs work without an internet connection. This is a static site and can also be served from any static host that supports `.js` module MIME types.

Drag 2D vector tips and regression points. Edit components or use sliders. Vectors, span, transformations, and determinants also have 3D modes using Three.js: drag to orbit, scroll or pinch to zoom, and reset the camera from the controls. In the matrix 3D mode, edit all nine entries of a 3×3 matrix and transform a unit cube. WebGL is required for 3D; the site falls back to 2D if unavailable.

Progress, successful self-checks, language, and theme are saved only in this browser's local storage. Use Field notes to clear progress. “Mark understood” is a personal bookmark, not an assessment. The language control switches between bilingual and English lesson prose; shared control labels retain both languages. Refreshing a lesson resets its experiment, while learning progress persists.

Examples are downloadable and execute in your own R/Python environment, independently of the browser sliders. There is no in-browser Python or R kernel.

```bash
python -m pip install numpy scipy matplotlib pandas
python examples/start_here.py
Rscript examples/start_here.R
```

The R examples use base R and require no extra packages. The Python notebook additionally needs a Jupyter environment.

Use `index.html` for the course, `playground.html` for standalone experiments, and `notes.html` for study guidance. Open `examples/linear_algebra_statistics.ipynb` in your Jupyter environment for the lesson notebook.

See [description.md](description.md) for background and technical details.

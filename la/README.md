# Little Algebra / 每天，多懂一點

A local, bilingual English / 繁體中文 learning site for someone who has completed HKDSE Maths Core + M1. Fourteen lessons take about 10–15 minutes each. The curriculum uses original explanations and exercises alongside the two books already in `ref/`.

## Open it

From this directory:

```bash
npm run dev
```

Visit **http://127.0.0.1:3001/**. Python 3 is the only serving requirement; all browser libraries are already included. Alternatively: `python3 -m http.server 3001 --bind 127.0.0.1`.

Serve over HTTP rather than opening a `file://` URL: browser modules and the local Three.js imports need it. Once served, the course and its local PDFs work without an internet connection. This is a static site and can also be served from any static host that supports `.js` module MIME types. No deployment was performed.

## Pages

- `index.html`: course overview, 14 lessons, bilingual explanations, LaTeX formulas, worked examples, interactive experiments, R/Python snippets, and self-checks.
- `playground.html`: the same 14 experiments without the lesson sequence.
- `notes.html`: a suggested study rhythm, book chapter guide, Python/R introductions, and a syntax comparison table.
- `examples/start_here.py` and `examples/start_here.R`: runnable starter scripts with vector/matrix operations, data tables, regression, probability, sampling, bootstrap, and plots.
- `examples/linear_algebra_statistics.ipynb`: a bilingual notebook containing every lesson's Python example and self-check, plus a pandas introduction.

Lessons: vectors; linear combinations, span and basis; dot products and projection; matrices; matrix composition; simultaneous equations; determinants and inverses; eigenvectors; descriptive statistics; binomial probability; normal distributions; sampling, the CLT and confidence intervals; least-squares regression; bootstrap.

## Interaction

Drag 2D vector tips and regression points. Edit components or use sliders. Vectors, span, transformations, and determinants also have 3D modes using Three.js: drag to orbit, scroll or pinch to zoom, and reset the camera from the controls. In the matrix 3D mode, edit all nine entries of a 3×3 matrix and transform a unit cube. WebGL is required for 3D; the site falls back to 2D if unavailable.

The blend slider is **entrywise interpolation** `A_t = (1-t)I + tA`, not a pure rotation animation. The 2D and 3D matrix editors share the upper-left 2×2 block; other 3D entries are retained while switching views. A visible span patch is finite; the mathematical span extends without bounds. Data inputs accept 2–1,000 finite values within ±1,000,000.

Progress, successful self-checks, language, and theme are saved only in this browser's local storage. Use Field notes to clear progress. “Mark understood” is a personal bookmark, not an assessment. The language control switches between bilingual and English lesson prose; shared control labels retain both languages. Refreshing a lesson resets its experiment, while learning progress persists.

## Run the code

Examples are downloadable and execute in your own R/Python environment, independently of the browser sliders. There is no in-browser Python or R kernel.

```bash
python -m pip install numpy scipy matplotlib pandas
python examples/start_here.py
Rscript examples/start_here.R
```

The R examples use base R and require no extra packages. The Python notebook additionally needs a Jupyter environment. Each language's seeded random generator is reproducible within that language; identical seeds do not produce identical sequences across JavaScript, Python and R.

## Reference books

- Gilbert Strang, *Introduction to Linear Algebra*, **4th edition**, `ref/Intro_To_Linear_Algebra.pdf`. Local title page and contents checked. Lessons point to printed pages and sections; the scanned PDF's viewer page numbering differs.
- Larry Wasserman, *All of Statistics*, `ref/all-of-statistics.pdf`. Local preface and contents checked. The book assumes calculus and a little linear algebra, so the descriptive-statistics lesson supplies an extra bridge.

The supplied book PDFs are preserved.

Implementation documentation: [Three.js OrbitControls](https://threejs.org/docs/pages/OrbitControls.html), [KaTeX auto-render](https://katex.org/docs/autorender.html), [NumPy least squares](https://numpy.org/doc/stable/reference/generated/numpy.linalg.lstsq.html), [R introduction](https://stat.ethz.ch/CRAN/doc/manuals/R-intro.html), [R linear models](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/lm.html).

## Statistical assumptions

- Sample SD uses `n-1`, equivalent to R `sd()` and NumPy `std(ddof=1)`.
- The binomial experiment assumes independent trials with the same success probability.
- The sampling experiment uses independent normal or exponential observations with **known population SD 1**. Normal-approximation intervals are exact for the normal population and approximate for the exponential population; coverage varies across simulations. Unknown-SD inference requires a different interval, usually a t interval for normal data.
- Bootstrap percentile intervals are approximate and can perform poorly with small or biased samples. More simulation repetitions cannot repair sampling bias.
- Normal areas use a numerical CDF approximation. Regression includes an intercept and minimizes squared vertical residuals. Fit does not establish causation.

## Maintain / verify

```bash
npm test
npm run test:browser         # serve the site first; needs Chromium
npm run test:examples        # needs Python scientific libraries and Rscript
npm install                 # needed if node_modules is absent
npm run vendor
node scripts/generate-notebook.mjs
```

Three.js 0.180.0 and KaTeX 0.16.22 are pinned and stored in `vendor/`, with their licenses. No remote scripts, fonts, analytics, or runtime API calls are used. Browser verification and execution of all lesson snippets are documented in `VALIDATION.md`.

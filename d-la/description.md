# Little Algebra / 每天，多懂一點 — Description

## Pages

- `index.html`: course overview, 14 lessons, bilingual explanations, LaTeX formulas, worked examples, interactive experiments, R/Python snippets, and self-checks.
- `playground.html`: the same 14 experiments without the lesson sequence.
- `notes.html`: a suggested study rhythm, book chapter guide, Python/R introductions, and a syntax comparison table.
- `examples/start_here.py` and `examples/start_here.R`: runnable starter scripts with vector/matrix operations, data tables, regression, probability, sampling, bootstrap, and plots.
- `examples/linear_algebra_statistics.ipynb`: a bilingual notebook containing every lesson's Python example and self-check, plus a pandas introduction.

Lessons: vectors; linear combinations, span and basis; dot products and projection; matrices; matrix composition; simultaneous equations; determinants and inverses; eigenvectors; descriptive statistics; binomial probability; normal distributions; sampling, the CLT and confidence intervals; least-squares regression; bootstrap.

## Interaction

The blend slider is **entrywise interpolation** `A_t = (1-t)I + tA`, not a pure rotation animation. The 2D and 3D matrix editors share the upper-left 2×2 block; other 3D entries are retained while switching views. A visible span patch is finite; the mathematical span extends without bounds. Data inputs accept 2–1,000 finite values within ±1,000,000.

## Code reproducibility

Each language's seeded random generator is reproducible within that language; identical seeds do not produce identical sequences across JavaScript, Python and R.

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

## Project status

No deployment was performed.

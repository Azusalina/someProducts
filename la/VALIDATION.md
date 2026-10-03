# Validation / 驗證紀錄

Verified on 2026-10-03 after resuming the implementation. All three test commands exited successfully.

| Check | Result |
| --- | --- |
| `npm test` | 11 math and curriculum tests passed |
| `npm run test:browser` | All 14 lessons, 3D modes, responsive layouts and touch checks passed |
| `npm run test:examples` | All 14 Python snippets, all 14 R snippets, both starter scripts and every notebook code cell executed successfully |
| First-party Git whitespace checks | Passed; upstream `vendor/` files excluded |

## Mathematical checks

Known examples establish vector lengths, perpendicular projection residuals, matrix composition order, determinant values, and real eigenvalues. System classification also covers inconsistent zero rows and entirely zero constraints. Descriptive-statistics checks distinguish the `n` and `n-1` denominators. Regression matches known coefficients and verifies residual orthogonality. Normal areas, binomial probabilities at interior and boundary parameters, histogram count conservation, bootstrap quantiles and seeded simulation results are checked numerically.

The sampling test compares 5,000 simulated normal sample means against the theoretical standard error and approximately 95% interval coverage, using a fixed seed and stated tolerances.

## Browser checks

- Each lesson renders its diagram and LaTeX formulas without formula errors. Its incorrect and correct quiz feedback and Python/R code tabs behave as expected.
- Vector dragging changes coordinates. Negative scaling updates the readout. Marking a lesson understood survives a reload and updates progress.
- Vectors, span, matrices and determinants switch into WebGL 3D, accept controls, reset the camera and switch back to 2D. The 3D matrix editor exposes nine entries.
- System presets distinguish unique, absent and infinitely many solutions. Zero-direction projection reports an undefined result; 90-degree rotation reports no real eigenvectors.
- Invalid data input is rejected. Constant data, outliers, binomial endpoint probabilities, normal areas, sample-size changes and constant-sample bootstrap intervals are exercised.
- Regression point dragging updates the fitted line. Notes, downloads and all 14 playground tabs load. Theme and language preferences survive reloads.
- The overview, every lesson, notes and playground have no page-level horizontal overflow at **320px, 390px and 768px**. Long formulas and code scroll inside their own panels. The mobile lesson menu opens and navigates correctly.
- A touch-enabled Chromium context verifies one-finger vector dragging and 3D rendering.
- No uncaught browser exceptions, failed HTTP responses or external runtime resource requests occurred during the test run.

## Code examples

Python examples ran with Matplotlib's noninteractive `Agg` backend. R plots were directed to temporary PDF devices. Notebook code cells executed as standalone examples. These checks verify executable code and calculations; they do not imply an in-browser Python/R kernel.

The books' title/preface and contents were inspected during implementation. Lesson references use their printed page numbers, rather than PDF viewer page numbers. This is an introductory companion, not coverage of either entire book.

## Reproduce

Serve the site in one terminal:

```bash
cd la
npm run dev
```

In another terminal, from `la/`:

```bash
npm install
npm test
npm run test:browser
npm run test:examples
```

Browser tests use installed Chromium at `/usr/bin/chromium` when available; alternatively set `CHROMIUM_PATH`, or install Playwright's Chromium with `npx playwright install chromium`. Screenshots default to `/tmp/little-algebra-browser`; set `LA_SCREENSHOTS` to choose a different directory. `LA_BASE_URL` overrides `http://127.0.0.1:3001/`.

Example checks require Python with NumPy, SciPy, Matplotlib and pandas, plus `Rscript`. Temporary example scripts and plots are written under the operating system's temporary directory.

Verified environment: Node.js 24.20.0, Python 3.14.7, R 4.6.1, Chromium 153.0.8010.52. Browser rendering used software WebGL. Mobile and touch checks are browser emulation, not tests on physical phones or Safari.

## Saved previews

- [Course overview](docs/preview-desktop.png)
- [390px bilingual lesson](docs/preview-mobile.png)
- [3D matrix collapse](docs/preview-3d.png)
- [Sampling and confidence intervals](docs/preview-sampling.png)

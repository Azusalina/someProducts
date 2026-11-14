## What is it?

Python and R scripts that visualize the HKDSE cutoffs in `data.csv`. `product1`
contains one chart per subject, saved as offline interactive HTML, SVG, and PNG.
Open `product1/index.html` in a browser and choose a subject. Hover, tap, or focus
a node to see its percentage and year. All six grades share one plot,
with a different color for each grade. Overall lines are darker and thicker;
paper lines use the same grade colors with lighter opacity and dashed patterns.
Paper weightings appear beside the paper names in that subject's legend.

The supplied data has overall cutoffs only, so the current images have no paper
lines. Percentage cutoffs allow comparison across years with different full marks.
`Full Mark` rows are excluded. Missing years break lines.

Each grade and series has a separate **2027 linear-trend estimate**, fitted to
the available observations. Diamonds mark estimates, thick bars show the
**95% confidence interval for the mean cutoff**, and thin bars show the wider
**95% prediction interval for a future year's cutoff**. The table also shows
the observed min–max range over the years used for fitting. Click grades to
hide them, and use the checkboxes to toggle the two interval types. Set **α (%)**
in the HTML to recalculate both intervals immediately; confidence level is
`100 − α` percent. Quick buttons select 90%, 95%, and 99% confidence. Hovered
nodes become slightly brighter with a soft glow.

The coefficient is **Student's t**, `t(1 − α/2, n − 2)`, because the regression's
residual variance is estimated from a small sample. It is not a fixed normal z
coefficient. R performs the OLS regressions (`lm`) and supplies the estimates,
standard errors, and residual degrees of freedom. Offline JavaScript recalculates
the t coefficient and the interval bounds when α changes. The actual coefficient
and degrees of freedom appear in each row of the table.

HTML edits update the displayed chart, table, and tooltips; the generated PNG,
SVG, and CSV files retain the initial confidence level selected at generation.

These are statistical extrapolations, rather than published 2027 cutoffs. The
model assumes a stable linear trend and independent, normally distributed
residuals with constant variance. It does not account for changes to exams or
assessment policy, and bounds are not clipped to 0–100%. At least three observed
years are required for a forecast; series with less data retain their history
but have no forecast. Paper weightings describe supplied historical years and
are not projected into 2027.

## How to use

```sh
python3 render_interactive.py
```

Python uses only its standard library. Required R packages: `ggplot2`, `svglite`,
and `ragg` (already installed here). The HTML charts have no external assets,
libraries, or network requirements.
Paths default to the directory containing the scripts. Python calls the R
renderer, which uses `cutoff_helpers.R` for validation, paper labels, regression,
and static plotting. `chart_template.html` supplies the interactive interface;
`statistics.js` is embedded into each HTML for offline t-quantile calculations.
`chart_data.csv` contains the normalized observations; `forecast_2027.csv`
contains estimates, both interval types, observed ranges, and fit years.

Optional selections:

```sh
python3 render_interactive.py '--grades=5**,5*,5' --subjects=English,Chinese
python3 render_interactive.py --since=2018 --level=0.95 --year=2027
python3 render_interactive.py --input=cutoff.csv --output=product1
Rscript render_cutoffs.R --format=svg
```

To include paper trends, add `Paper` and `Weighting` columns to the main CSV,
or create a separate `papers.csv` beside the scripts. It is loaded automatically
when present; another path can be selected with `--papers=your_papers.csv`.
Use exactly the same subject names and grades as the main data. For example,
this is the **schema only**, with placeholders rather than measured cutoffs:

```text
Subject,Year,Grade,Percentage,Paper,Weighting
English,<year>,5**,<paper cutoff percent>,Paper 1,<paper weighting percent>
English,<year>,5*,<paper cutoff percent>,Paper 1,<paper weighting percent>
```

`Paper` may also be called `Component`. Blank paper names or `Overall` in the
main CSV denote overall cutoffs. `Score` is allowed but not needed for plotting.
`Percentage` is the paper's own cutoff out of 100; it is not multiplied by its
weighting. `Weighting` accepts percentages such as `20` or `20%`, not fractions
such as `0.2` for 20%. It may vary by year, and changes are labeled in the legend.
Missing weightings are labeled `not supplied`. Blank percentages are treated as
missing observations. Duplicate cutoffs and conflicting paper weightings fail
with an explanatory error.

`--since` changes the regression's fit years while retaining all historical
points in the chart. `--level` changes both interval confidence levels. `--year`
must be after the latest observed year. R alone regenerates static images and
CSV files; run the Python entry point to also regenerate the HTML charts.

Rerunning replaces charts for the selected subjects and formats; other files in
the output folder are preserved. All image products go to `product1` by default.

Verification:

```sh
Rscript tests/test_forecasts.R
python3 tests/test_statistics.py
python3 tests/test_interactive.py
```

The browser checks use headless Chromium, available here as `chromium`.

## Source folder rename (2026-11-05)

The source directory was renamed from `d-todos` to `d-sba-cutoff`. The Pages
builder and workflow use the new directory; the established public route remains
`/someProducts/todos/`. Data, generated charts, and subject links are unchanged.

## Cutoff tables and admissions reference (2026-11-05)

The startup page explicitly uses a white background and a light browser color
scheme. Each subject chart now has an observed-cutoff table immediately below
the curve, before the existing forecast table. Rows are newest-first by year
and series; columns follow the visible grade buttons. Values use the same
percentage formatting as the plotted observations, and missing values show `—`.
Forecasts stay in their separate estimate table.

The startup page and all seven subject pages include **HKU JUPAS admission
marks and offers**. A real button labeled **Show** reveals the reference; it
changes to **Hide** while open. The reference starts hidden on every page load,
with `aria-expanded` and `aria-controls` for assistive technology. The tables
scroll horizontally within their region on small screens.

`admissions.json` stores the manually checked official figures and source URLs.
`admissions_reference.py` generates the source-linked table and toggle; Python
embeds these in each HTML file so no fetch, server or internet is needed to
read the reference. External source links require internet. Regeneration never
silently refreshes admissions data: update the JSON and verification date after
checking the sources, then run `python3 render_interactive.py`.

Coverage is intake years **2022–2026** for JS6729 and **2025–2026** for JS6779
and JS6298, matching the available recent JUPAS programme histories. The user
confirmed JS6298 as the intended code instead of JS6289. JS6779 was new for
2025; no predecessor programme's scores are substituted. The 2026 scores
are historical intake figures printed under **With Reference to Admissions
2026** in the **2027** admissions brochure, not predictions for 2027.

### Sources checked 2026-11-05

- Main-round offer totals: official JUPAS programme statistics for
  [JS6729](https://www.jupas.edu.hk/en/programme/hku/JS6729/),
  [JS6779](https://www.jupas.edu.hk/en/programme/hku/JS6779/), and
  [JS6298](https://www.jupas.edu.hk/en/programme/hku/JS6298/).
  Read **Offer Statistics (as at the Announcement of the Main Round Offer
  Results)**, Total column; application counts and first-year intake quotas
  are different measures.
- [HKU 2022 admissions scores](https://www.jupas.edu.hk/f/page/13825/HKU_2022.pdf#page=4):
  JS6729, UQ/median/LQ = 34/31/30.
- [HKU 2023 admissions scores](https://www.jupas.edu.hk/f/page/13825/HKU_2023.pdf#page=4):
  JS6729, UQ/median/LQ = 34/32/31.
- [HKU 2024 admissions scores](https://www.jupas.edu.hk/f/page/3667/af_2024_JUPAS.pdf):
  JS6729, UQ/median/LQ = 34/33/31.
- [HKU 2025 admissions scores](https://www.jupas.edu.hk/f/page/3667/af_2025_JUPAS.pdf):
  JS6729 = 36/35/35; JS6779 = 33/33/31; JS6298 = 44/42/42,
  all in UQ/median/LQ order.
- [HKU 2027 brochure, reference scores for 2026](https://admissions.hku.hk/sites/default/files/2026-09/HKU-JUPAS-Admissions-Information-2027.pdf):
  JS6298, PDF page 2 = 47/45/44; JS6729 and JS6779, PDF page 6 =
  38/36/36 and 37/36/36, respectively, in UQ/median/LQ order.

The UI presents **LQ / median / UQ** in ascending order. These are weighted
admission score quartiles, not exam percentages or the minimum score admitted.
Scores remain as published, without trying to infer hidden decimals. Offer
totals are not confirmed enrolment counts. Year-to-year deltas compare adjacent
intakes within a programme and the historical formulas shown. Missing preceding
years show `—`; missing numeric values show `Unavailable`, never zero.

JS6298's published 2025–2026 formula weights English by 2, Mathematics by 1.5,
and two eligible elective subjects by 1.5, plus one other subject. The eligible
weighted subjects are Biology, Chemistry, Physics, Economics, ICT and M1/M2.
Its 2027 formula is English + Mathematics + Best 3 Subjects. The table keeps
the historical weighted scores and explicitly warns against comparing those
values directly with scores computed under the new formula. Programme entry
requirements and interviews remain separate from these reference statistics.

### Validation

The existing headless Chromium checks now also verify every cutoff table value
against its plotted observation, cutoff placement and grade filtering, initial
admissions hiding, repeated Show/Hide state and accessibility attributes,
official source domains, all three 2026 rows and deltas, and the white startup
background. Both closed and expanded references are checked for page overflow
at desktop and mobile widths. Existing chart and interval checks are retained.

Validation passed after regeneration: `node tests/check_static.mjs` checked all
seven offline charts and static assets; `python3 tests/test_interactive.py`
passed 16 page/viewport combinations (seven subjects plus startup page at
1280px and an actual Chromium viewport of 500px). Chromium's minimum headless
window width was 500px even though 420px was requested. Browser tests required
running outside the filesystem sandbox because the sandboxed Chromium launch
terminated with SIGTRAP. Python compilation checks also passed. No statistical
model or source cutoff data was changed.


## Default grades, axis zoom and focus (2026-11-14)

Interactive charts now start with only `5**`, `5*` and `5` visible. All six
grades remain available through their existing toggle buttons. Both reference
tables follow the visible grades. Static PNG/SVG and forecast CSV outputs retain
all generated grades; regression fits and admissions figures are unchanged.

The X (year) and Y (percentage) bounds can be edited independently. X/Y + and −
buttons zoom around the current axis midpoint. Scroll zoom is opt-in (Off by
default, then X only, Y only or X + Y) and anchors the zoom to the pointer inside
the plot. Editing the bounds also allows moving the viewed range. Reset zoom
restores the full historical/forecast view, including currently computed
intervals. Invalid, nonfinite, reversed or equal bounds are rejected while
keeping the last valid chart. Manual axis spans must be 0.1–1,000,000. Plot
contents are clipped to the viewing rectangle; ticks adapt to the selected
range. Zoom changes only the viewport, never the observations or regression.

Click a historical curve, or choose its grade/series in Focus line, to emphasize
one line and dim the others. A transparent wider hit target makes thin curves
easier to select. Choosing a hidden grade's curve makes that grade visible.
Hiding the focused grade clears that line focus. Focus year highlights its
points and draws a vertical guide, dims other years, and highlights the matching
cutoff table rows. Select a year using the dropdown, a chart point, or a year
axis label. Point clicks retain the tooltip. A year selected outside the
current X window recenters that window without changing its span. Focus line
and Focus year can be combined, survive interval changes, and are cleared by
Clear focus. Reset zoom preserves focus and visible-grade choices.

`chart_interactions.js` supplies view state and control handlers, embedded by
`render_interactive.py` into each chart for offline use. The template renders
scaled axes, clipped curves and focus emphasis. The startup page is unchanged.
Browser regression checks cover default visibility, independent axis zoom,
manual bounds and rejection, wheel zoom, reset, direct curve/point focus,
year guides/table rows, tooltip continuity, and focus during alpha changes,
alongside the existing chart and admissions interactions.

Validation: all 16 Chromium page/viewport checks passed (seven subjects and the
startup page, at actual widths 1280px and 500px); static validation also passed
for all seven offline chart pages and their assets. The browser checks include
the new zoom, focus and default-grade assertions. No deployment was performed.

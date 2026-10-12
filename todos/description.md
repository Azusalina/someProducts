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

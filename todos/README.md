## What is it?

HKDSE cutoff charts for seven subjects, with colored grade trends, interactive
node tooltips, adjustable confidence intervals, and 2027 linear-regression
estimates. Paper trends and weightings are included when supplied.

See [description.md](description.md) for methods, assumptions, file structure,
paper-data format, and validation details.

## How to use

Open `product1/index.html` in a browser to choose a subject. Hover or focus a
node for its percentage and year. Enter α (%) to recalculate confidence and
prediction intervals, or use the 90%, 95%, and 99% buttons. Click grades to
hide them and use the checkboxes to toggle intervals.

The public version is https://azusalina.github.io/someProducts/todos/.

To regenerate HTML, PNG/SVG, and CSV outputs:

```sh
python3 render_interactive.py
```

Requires Python 3, R, and the R packages `ggplot2`, `svglite`, and `ragg`.
Python uses its standard library. The generated HTML works offline.
Use `--since=2018`, `--level=0.95`, `--year=2027`, `--subjects=English,Chinese`,
or `--output=product1` as needed. Add `papers.csv` for paper data; its schema
is documented in [description.md](description.md).

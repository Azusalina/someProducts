#!/usr/bin/env python3
"""Generate offline hover charts using R's validated data and forecast outputs."""
import argparse
import csv
import html
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent
GRADES = ["5**", "5*", "5", "4", "3", "2"]


def read_rows(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def number(value):
    return float(value) if value else None


def paper_label(rows, series):
    if series == "Overall":
        return series
    by_year = {}
    for row in rows:
        if row["Series"] == series:
            year, weight = int(row["Year"]), number(row["Weighting"])
            if weight is not None or year not in by_year:
                by_year[year] = weight
    years = sorted(by_year)
    runs = []
    for year in years:
        weight = by_year[year]
        if runs and runs[-1][2] == weight and year == runs[-1][1] + 1:
            runs[-1][1] = year
        else:
            runs.append([year, year, weight])
    def weight_text(weight):
        return f"{weight:g}%" if weight is not None else "not supplied"
    if len(set(by_year.values())) == 1:
        text = weight_text(by_year[years[0]])
    else:
        text = "; ".join(f"{weight_text(w)} in {start}" + (f"–{end}" if end != start else "") for start, end, w in runs)
    return f"{series} (weight: {text})"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default="data.csv")
    parser.add_argument("--papers", default=None)
    parser.add_argument("--output", default="product1")
    parser.add_argument("--year", type=int, default=2027)
    parser.add_argument("--level", type=float, default=0.95)
    parser.add_argument("--since", type=int, default=None)
    parser.add_argument("--subjects", default=None)
    parser.add_argument("--grades", default=",".join(GRADES))
    args = parser.parse_args()
    # R owns CSV validation, colors, OLS fits, and the t-based interval calculations.
    command = ["Rscript", str(ROOT / "render_cutoffs.R"), f"--input={args.input}",
               f"--output={args.output}", f"--year={args.year}", f"--level={args.level}",
               f"--grades={args.grades}"]
    for key in ("papers", "since", "subjects"):
        value = getattr(args, key)
        if value is not None:
            command.append(f"--{key}={value}")
    subprocess.run(command, cwd=ROOT, check=True)
    output = Path(args.output)
    if not output.is_absolute():
        output = ROOT / output
    data = read_rows(output / "chart_data.csv")
    forecasts = read_rows(output / f"forecast_{args.year}.csv")
    template = (ROOT / "chart_template.html").read_text(encoding="utf-8")
    template = template.replace("__STATISTICS_JS__", (ROOT / "statistics.js").read_text(encoding="utf-8"))
    subjects = list(dict.fromkeys(row["Subject"] for row in data))
    # Match R's filename normalization for the same subject.
    def filename(subject):
        import re
        return re.sub(r"[^\w-]+", "_", subject) + ".html"
    links = []
    for subject in subjects:
        rows = [row for row in data if row["Subject"] == subject]
        predictions = [row for row in forecasts if row["Subject"] == subject]
        series = list(dict.fromkeys(row["Series"] for row in rows))
        series = (["Overall"] if "Overall" in series else []) + sorted(set(series) - {"Overall"})
        payload = {
            "subject": subject, "year": args.year, "level": args.level,
            "grades": [grade.strip() for grade in args.grades.split(",")],
            "colors": {row["Grade"]: row["Color"] for row in rows},
            "series": series, "labels": {s: paper_label(rows, s) for s in series},
            "observations": [{"year": int(row["Year"]), "grade": row["Grade"], "series": row["Series"],
                              "value": number(row["Percentage"]), "weight": number(row["Weighting"])} for row in rows],
            "forecasts": [{key: value if key in ("Subject", "Grade", "Series") else number(value)
                           for key, value in row.items()} for row in predictions],
        }
        # Prevent CSV strings from terminating the inline script or HTML elements.
        safe_json = json.dumps(payload, ensure_ascii=True, allow_nan=False).replace("<", "\\u003c")
        navigation = "".join(f'<a href="{html.escape(filename(s), quote=True)}"'
                             + (' aria-current="page"' if s == subject else '')
                             + f'>{html.escape(s)}</a>' for s in subjects)
        document = template.replace("__SUBJECT__", html.escape(subject)).replace("__NAVIGATION__", navigation).replace("__CHART_DATA__", safe_json)
        path = output / filename(subject)
        path.write_text(document, encoding="utf-8")
        links.append(f'<li><a href="{html.escape(path.name, quote=True)}">{html.escape(subject)}</a></li>')
        print(f"Saved {path}")
    (output / "index.html").write_text(
        '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>HKDSE cutoff charts</title><style>body{font:17px system-ui;max-width:760px;margin:60px auto;padding:24px;color:#182230}'
        'li{margin:16px 0}a{color:#365f9b}</style><h1>HKDSE cutoff charts</h1>'
        f'<p>Hover over a node for its year and percentage. Each chart includes {args.year} estimates, '
        f'{args.level:.1%} initial confidence level, adjustable α, and prediction ranges. Works offline.</p><ul>'
        + "".join(links) + '</ul><p>PNG and SVG copies and the forecast CSV are saved alongside these charts.</p></html>', encoding="utf-8")


if __name__ == "__main__":
    main()

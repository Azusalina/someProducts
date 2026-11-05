"""Render the checked-in, source-linked JUPAS history into offline HTML."""
import html


def render_admissions(data):
    escape = html.escape
    rows, formulas = [], []

    def change(current, previous):
        if current is None or previous is None:
            return "—"
        difference = current - previous
        return f"{difference:+g}" if difference else "0"

    for programme in data["programmes"]:
        code = escape(programme["code"])
        formulas.append(
            f'<p class="note"><strong>{code}</strong>: {escape(programme["formula"])}. '
            f'{escape(programme["formula_note"])}</p>'
        )
        previous = None
        for row in sorted(programme["rows"], key=lambda row: row["year"]):
            prior = previous if previous and previous["year"] == row["year"] - 1 else {}
            source = data["sources"][row["scores_source"]]
            scores_url = source["url"]
            if row["year"] == 2026:
                scores_url += "#page=2" if programme["code"] == "JS6298" else "#page=6"
            cells = [
                f'<th scope="row">{code}<small>{escape(programme["name"])}</small></th>',
                f'<td>{row["year"]}</td>',
                f'<td>{row["offers"] if row["offers"] is not None else "Unavailable"}</td>',
                f'<td>{change(row["offers"], prior.get("offers"))}</td>',
            ]
            for key in ("lq", "median", "uq"):
                cells.append(f'<td>{row[key] if row[key] is not None else "Unavailable"}</td>')
            delta = " / ".join(change(row[key], prior.get(key)) for key in ("lq", "median", "uq"))
            cells.append(f'<td>{delta}</td>')
            cells.append(
                f'<td><a href="{escape(programme["offers_source"], quote=True)}">Offers</a> · '
                f'<a href="{escape(scores_url, quote=True)}" title="{escape(source["title"], quote=True)}">Scores</a></td>'
            )
            rows.append("<tr>" + "".join(cells) + "</tr>")
            previous = row

    return '''<section class="card" aria-labelledby="admissions-heading">
<div class="toolbar"><h2 id="admissions-heading">HKU JUPAS admission marks and offers</h2>
<button class="preset" type="button" id="admissions-toggle" aria-expanded="false" aria-controls="admissions-reference">Show</button></div>
<div id="admissions-reference" hidden>
<p class="note">Main-round offers are offer counts at results announcement, not programme intake quotas or confirmed enrolments. LQ = lower quartile (25th percentile); median = 50th percentile; UQ = upper quartile (75th percentile). Scores are programme-weighted admission points, not percentages or minimum cutoffs.</p>
<div class="table-wrap" role="region" aria-label="Admission history" tabindex="0"><table>
<thead><tr><th scope="col">Programme</th><th scope="col">Intake year</th><th scope="col">Main-round offers</th><th scope="col">Δ offers</th><th scope="col">LQ</th><th scope="col">Median</th><th scope="col">UQ</th><th scope="col">Δ LQ / median / UQ</th><th scope="col">Sources</th></tr></thead>
<tbody id="admissions-table">''' + "".join(rows) + '''</tbody></table></div>
<p class="note">Δ compares the previous intake year within the same programme and historical formula. — means no comparable previous year is included. Historical scores are references, not admissions guarantees. The 2026 scores come from the “With Reference to Admissions 2026” columns in HKU’s 2027 brochure.</p>
''' + "".join(formulas) + f'<p class="note">Official HKU / JUPAS sources checked {escape(data["checked"])}. This saved reference works offline; source links require internet.</p>' + '''
</div></section>'''


ADMISSIONS_SCRIPT = """<script>
(() => {
  const button = document.getElementById('admissions-toggle');
  const reference = document.getElementById('admissions-reference');
  button.addEventListener('click', () => {
    reference.hidden = !reference.hidden;
    button.textContent = reference.hidden ? 'Show' : 'Hide';
    button.setAttribute('aria-expanded', String(!reference.hidden));
  });
})();
</script>"""

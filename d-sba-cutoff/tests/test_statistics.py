"""Compare the offline JavaScript t quantile implementation against R's qt()."""
import csv
import io
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
r_script = """
cases <- expand.grid(Alpha = c(0.001, 0.1, 1, 5, 10, 25, 50, 90, 99.9, 99.999),
                     DF = c(1, 2, 3, 5, 12, 13, 50, 100, 1000))
cases$Critical <- qt(1 - cases$Alpha / 200, cases$DF)
write.csv(cases, stdout(), row.names = FALSE)
"""
result = subprocess.run(["Rscript", "-"], input=r_script, capture_output=True, text=True, check=True)
cases = [{key: float(value) for key, value in row.items()} for row in csv.DictReader(io.StringIO(result.stdout))]
script = (root / "statistics.js").read_text() + "\nconst cases=" + json.dumps(cases) + ";\n"
script += "console.log(JSON.stringify(cases.map(c=>studentTCritical(c.Alpha,c.DF))));"
result = subprocess.run(["node", "-"], input=script, capture_output=True, text=True, check=True)
actual = json.loads(result.stdout)
for case, critical in zip(cases, actual, strict=True):
    expected = case["Critical"]
    assert abs(critical - expected) < max(1e-8, abs(expected) * 1e-9), (case, critical)
print(f"PASS: {len(cases)} browser t critical values match R qt(), including extreme α and small samples.")

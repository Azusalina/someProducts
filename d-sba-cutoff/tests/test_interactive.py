"""Exercise generated chart scripts in headless Chromium, including node hover."""
import csv
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "product1"
chromium = shutil.which("chromium")
if not chromium:
    raise SystemExit("Headless checks require Chromium in PATH.")

HARNESS = r"""
<script>
try {
  const check=(condition,message)=>{if(!condition)throw Error(message)};
  const instant=document.createElement('style');instant.textContent='svg .node{transition:none!important}';document.head.append(instant);
  check(svg.querySelectorAll('circle[data-year]').length===DATA.observations.filter(d=>d.value!==null).length,'Historical point count');
  for(const d of DATA.observations.filter(d=>d.value!==null)){
    const node=[...svg.querySelectorAll('circle[data-year]')].find(n=>Number(n.dataset.year)===d.year&&n.dataset.grade===d.grade&&n.dataset.series===d.series);
    node.dispatchEvent(new PointerEvent('pointerenter',{clientX:250,clientY:250}));
    check(!tip.hidden&&tip.textContent.includes(`Year: ${d.year}`)&&tip.textContent.includes(`Cutoff: ${pct(d.value)}`),'Hover mismatch');
    check(node.classList.contains('is-active')&&getComputedStyle(node).filter.includes('brightness(1.14)'),'Node hover highlight');
    node.dispatchEvent(new PointerEvent('pointerleave'));
    check(tip.hidden&&!node.classList.contains('is-active'),'Node highlight reset');
  }
  for(const f of DATA.forecasts){
    const node=[...svg.querySelectorAll('path[data-year]')].find(n=>Number(n.dataset.year)===DATA.year&&n.dataset.grade===f.Grade&&n.dataset.series===f.Series);
    node.focus();check(!tip.hidden&&tip.textContent.includes(`${DATA.year} estimate: ${pct(f.Estimate)}`),'Keyboard forecast tooltip');
    check(tip.textContent.includes(range(f.ConfidenceLow,f.ConfidenceHigh))&&tip.textContent.includes(range(f.PredictionLow,f.PredictionHigh)),'Forecast intervals in tooltip');
  }
  const first=DATA.grades[0],button=[...document.querySelectorAll('.grade-button')].find(b=>b.textContent===first);
  button.click();check(![...svg.querySelectorAll('[data-grade]')].some(n=>n.dataset.grade===first),'Grade filter');
  check(!document.querySelector(`#cutoff-table [data-grade="${first}"]`),'Cutoff table grade filter');
  button.click();check(button.getAttribute('aria-pressed')==='true','Grade restore');
  confidence.click();check(svg.querySelectorAll('[data-interval=confidence]').length===0,'CI toggle');
  confidence.click();check(svg.querySelectorAll('[data-interval=confidence]').length===DATA.forecasts.length,'CI restore');
  prediction.click();check(svg.querySelectorAll('[data-interval=prediction]').length===0,'Prediction toggle');prediction.click();
  check(document.querySelectorAll('#forecast-table tr').length===DATA.forecasts.length,'Forecast table count');
  const expectedRows=new Set(DATA.observations.map(d=>JSON.stringify([d.year,d.series])));
  check(document.querySelectorAll('#cutoff-table tr').length===expectedRows.size,'Cutoff table year/series count');
  for(const observation of DATA.observations){
    const row=[...document.querySelectorAll('#cutoff-table tr')].find(row=>Number(row.dataset.year)===observation.year&&row.dataset.series===observation.series);
    const cell=[...row.querySelectorAll('[data-grade]')].find(cell=>cell.dataset.grade===observation.grade);
    check(cell.textContent===(observation.value===null?'—':pct(observation.value)),'Cutoff table value matches plotted observation');
  }
  check(document.getElementById('chart').compareDocumentPosition(document.getElementById('cutoff-table'))&Node.DOCUMENT_POSITION_FOLLOWING,'Cutoff table below curve');
  const initialWidths=forecasts.map(f=>f.ConfidenceHigh-f.ConfidenceLow);
  alphaInput.value='10';alphaInput.dispatchEvent(new Event('input'));
  check(document.getElementById('ci-heading').textContent.startsWith('90%'),'Alpha updates labels');
  check(forecasts.every((f,i)=>f.ConfidenceHigh-f.ConfidenceLow<initialWidths[i]),'90% intervals narrower');
  alphaInput.value='1';alphaInput.dispatchEvent(new Event('input'));
  check(forecasts.every((f,i)=>f.ConfidenceHigh-f.ConfidenceLow>initialWidths[i]),'99% intervals wider');
  check(forecasts.every((f,i)=>f.Estimate===DATA.forecasts[i].Estimate),'Alpha preserves regression estimates');
  check(document.getElementById('forecast-table').textContent.includes(range(forecasts[0].ConfidenceLow,forecasts[0].ConfidenceHigh)),'Adjusted table bounds');
  const changedNode=[...svg.querySelectorAll('path[data-year]')].find(n=>n.dataset.grade===forecasts[0].Grade);
  changedNode.dispatchEvent(new PointerEvent('pointerenter',{clientX:250,clientY:250}));
  check(tip.textContent.includes('99% CI')&&tip.textContent.includes(range(forecasts[0].ConfidenceLow,forecasts[0].ConfidenceHigh)),'Adjusted tooltip bounds');
  const validBound=forecasts[0].ConfidenceLow;
  for(const invalid of ['', '0', '100', '-5']){
    alphaInput.value=invalid;alphaInput.dispatchEvent(new Event('input'));
    check(alphaInput.getAttribute('aria-invalid')==='true'&&forecasts[0].ConfidenceLow===validBound,'Invalid alpha preserves valid intervals');
  }
  for(const extreme of ['0.001','99.999']){
    alphaInput.value=extreme;alphaInput.dispatchEvent(new Event('input'));
    check(forecasts.every(f=>Number.isFinite(f.ConfidenceLow)&&Number.isFinite(f.PredictionHigh)),'Extreme valid alpha');
  }
  document.querySelector('[data-alpha="5"]').click();
  check(alphaInput.value==='5'&&!alphaInput.hasAttribute('aria-invalid'),'95% preset restore');
  check(forecasts.every((f,i)=>Math.abs(f.ConfidenceLow-DATA.forecasts[i].ConfidenceLow)<1e-8&&Math.abs(f.PredictionHigh-DATA.forecasts[i].PredictionHigh)<1e-8),'Browser restored bounds match R');
  check(document.documentElement.scrollWidth<=innerWidth,'Page overflow');
  document.body.dataset.testResult=JSON.stringify({pass:true,subject:DATA.subject,points:DATA.observations.length,forecasts:DATA.forecasts.length,width:innerWidth});
} catch(error){document.body.dataset.testResult=JSON.stringify({pass:false,error:String(error)})}
</script>
"""

REFERENCE_CHECKS = r"""
  const reference=document.getElementById('admissions-reference'),toggle=document.getElementById('admissions-toggle');
  check(reference.hidden&&getComputedStyle(reference).display==='none'&&toggle.textContent==='Show'&&toggle.getAttribute('aria-expanded')==='false','Admissions initially hidden');
  toggle.click();
  check(!reference.hidden&&getComputedStyle(reference).display!=='none'&&toggle.textContent==='Hide'&&toggle.getAttribute('aria-expanded')==='true','Admissions show');
  check(document.querySelectorAll('#admissions-table tr').length===9,'Admissions nine sourced intake rows');
  const admissionRows=[...document.querySelectorAll('#admissions-table tr')];
  const row6729=admissionRows.find(row=>row.cells[0].textContent.startsWith('JS6729')&&row.cells[1].textContent==='2026');
  check([...row6729.cells].slice(2,8).map(cell=>cell.textContent).join('|')==='48|+4|36|36|38|+1 / +1 / +2','2026 actuarial scores, offers and trend');
  const row6779=admissionRows.find(row=>row.cells[0].textContent.startsWith('JS6779')&&row.cells[1].textContent==='2026');
  check([...row6779.cells].slice(2,8).map(cell=>cell.textContent).join('|')==='23|-15|36|36|37|+5 / +3 / +4','2026 SDS scores, offers and trend');
  const row6298=admissionRows.find(row=>row.cells[0].textContent.startsWith('JS6298')&&row.cells[1].textContent==='2026');
  check([...row6298.cells].slice(2,8).map(cell=>cell.textContent).join('|')==='11|-1|44|45|47|+2 / +3 / +3','2026 AI scores, offers and trend');
  check(reference.textContent.includes('2027 formula is different'),'Historical formula warning');
  check([...reference.querySelectorAll('a')].every(link=>/^https:\/\/(www\.jupas\.edu\.hk|admissions\.hku\.hk)\//.test(link.href)),'Official source links');
  check(document.documentElement.scrollWidth<=innerWidth,'Expanded admissions mobile overflow');
  toggle.click();check(reference.hidden&&toggle.textContent==='Show'&&toggle.getAttribute('aria-expanded')==='false','Admissions hide');
"""
HARNESS = HARNESS.replace("  const instant=", REFERENCE_CHECKS + "\n  const instant=")
INDEX_HARNESS = '<script>try {const check=(condition,message)=>{if(!condition)throw Error(message)};' + REFERENCE_CHECKS + r"""
  check(getComputedStyle(document.body).backgroundColor==='rgb(255, 255, 255)'&&getComputedStyle(document.documentElement).backgroundColor==='rgb(255, 255, 255)','White startup background');
  document.body.dataset.testResult=JSON.stringify({pass:true,subject:'index',width:innerWidth});
} catch(error){document.body.dataset.testResult=JSON.stringify({pass:false,error:String(error)})}</script>
"""

with tempfile.TemporaryDirectory(prefix="todos-chart-tests-") as temp:
    temp = Path(temp)
    for file in sorted(OUTPUT.glob("*.html")):
        document = file.read_text(encoding="utf-8")
        is_chart = "const DATA = " in document
        if is_chart:
            json_data = re.search(r"const DATA = (.*?);\n", document).group(1)
            data = json.loads(json_data)
            assert len(data["forecasts"]) == 6
        for script in re.findall(r"<script>(.*?)</script>", document, re.S):
            js_file = temp / "chart.js"
            js_file.write_text(script, encoding="utf-8")
            subprocess.run(["node", "--check", str(js_file)], check=True)
        test_page = temp / file.name
        test_page.write_text(document.replace("</body>", (HARNESS if is_chart else INDEX_HARNESS) + "</body>"), encoding="utf-8")
        for width in (1280, 420):
            result = subprocess.run([chromium, "--headless", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
                                     "--no-first-run", "--no-default-browser-check", f"--user-data-dir={temp / 'profile'}",
                                     f"--window-size={width},900", "--virtual-time-budget=1000", "--dump-dom", test_page.as_uri()],
                                    capture_output=True, text=True, check=True, timeout=30)
            from html import unescape
            match = re.search(r'data-test-result="([^"]+)"', result.stdout)
            assert match, f"Browser script did not run: {file.name}: {result.stderr[-1000:]}"
            report = json.loads(unescape(match.group(1)))
            assert report["pass"], (file.name, report)
            print("PASS", report)
    for file in OUTPUT.glob("*.svg"):
        ET.parse(file)
    with (OUTPUT / "forecast_2027.csv").open(newline="") as stream:
        assert len(list(csv.DictReader(stream))) == 42
print("PASS: seven charts and startup page; sourced admissions toggle/trends, cutoff tables, white startup background, hover, alpha/intervals, filters and R-matching bounds.")

"""Dashboard number formatting, run through node against the shipped index.html (skipped without node)."""

from __future__ import annotations

import json
import shutil
import subprocess

import pytest

from autotrader.server import INDEX_PATH

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node is not installed")


def _definition(html: str, name: str) -> str:
    """The source of a top-level ``const name = ...`` or ``function name(...)`` definition."""
    lines = html.splitlines()
    start = next(i for i, line in enumerate(lines)
                 if line.startswith((f"const {name} = ", f"function {name}(")))
    if not lines[start].rstrip().endswith("{"):
        return lines[start]
    end = next(i for i in range(start + 1, len(lines)) if lines[i] in ("}", "};"))
    return "\n".join(lines[start:end + 1])


def _run(expr: str) -> object:
    html = INDEX_PATH.read_text(encoding="utf-8")
    script = "\n".join(_definition(html, n) for n in ("num", "priceDp", "stepDp", "price", "niceStep"))
    script += f"\nprocess.stdout.write(JSON.stringify({expr}));"
    out = subprocess.run([NODE, "-e", script], capture_output=True, text=True, timeout=30, check=True)  # type: ignore[list-item]
    return json.loads(out.stdout)


def test_prices_keep_four_significant_digits() -> None:
    got = _run('[2.4012, 0.98765, 0.00001234, 187.254, 64250.5, 9.87654, 0, -2.4012, null]'
               '.map((v) => price(v))')
    assert got == ["2.401", "0.9877", "0.00001234", "187.25", "64,250.50", "9.877", "0.00", "-2.401", "—"]


def test_axis_tick_labels_are_distinct_for_narrow_ranges() -> None:
    labels = _run("""(() => {
      let lo = 2.401, hi = 2.411; const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
      const step = niceStep(hi - lo, 4), dp = stepDp(step), out = [];
      for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(price(v, dp));
      return out;
    })()""")
    assert isinstance(labels, list) and len(labels) >= 2
    assert len(set(labels)) == len(labels), labels

#!/usr/bin/env bash
set -euo pipefail
monitor_core="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
python -m venv --system-site-packages "$monitor_core/.venv"
"$monitor_core/.venv/bin/python" -m pip install --disable-pip-version-check -r "$monitor_core/requirements.txt"

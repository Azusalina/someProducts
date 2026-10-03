#!/usr/bin/env bash
set -euo pipefail
monitor_core="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
python - "$monitor_core" <<'PY'
from pathlib import Path
import sys
from zipfile import ZipFile, ZIP_DEFLATED
core = Path(sys.argv[1])
output = core / 'monitor.plasmoid'
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for path in sorted((core / 'plasmoid').rglob('*')):
        if path.is_file():
            archive.write(path, path.relative_to(core / 'plasmoid'))
print(output)
PY

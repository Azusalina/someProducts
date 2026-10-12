#!/usr/bin/env bash
set -euo pipefail
monitor_core="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$(dirname -- "$monitor_core")"
exec "$monitor_core/.venv/bin/python" "$monitor_core/backend/monitor_service.py" "$@"

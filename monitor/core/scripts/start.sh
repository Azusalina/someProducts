#!/usr/bin/env bash
set -euo pipefail
monitor_core="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
exec python "$monitor_core/backend/monitor_service.py" "$@"

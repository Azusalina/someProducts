#!/usr/bin/env bash
set -euo pipefail
monitor_cli_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
exec python3 "$monitor_cli_root/scripts/install.py" "$@"

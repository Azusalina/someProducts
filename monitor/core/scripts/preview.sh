#!/usr/bin/env bash
set -euo pipefail
monitor_core="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
monitor_qml="${MONITOR_QT_BIN:-/usr/lib/qt6/bin}/qml"
exec "$monitor_qml" --transparent "$monitor_core/Preview.qml" "$@"

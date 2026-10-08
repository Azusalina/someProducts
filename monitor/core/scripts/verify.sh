#!/usr/bin/env bash
set -euo pipefail
monitor_core="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$monitor_core"
monitor_qt_bin="${MONITOR_QT_BIN:-/usr/lib/qt6/bin}"
monitor_python="$monitor_core/.venv/bin/python"
monitor_bridge_pid=""
monitor_fixture_pid=""
monitor_cleanup() {
    if test -n "$monitor_fixture_pid"; then kill "$monitor_fixture_pid" 2>/dev/null || true; wait "$monitor_fixture_pid" 2>/dev/null || true; fi
    if test -n "$monitor_bridge_pid"; then kill "$monitor_bridge_pid" 2>/dev/null || true; wait "$monitor_bridge_pid" 2>/dev/null || true; fi
}
trap monitor_cleanup EXIT
"$monitor_qt_bin/qmllint" plasmoid/contents/ui/*.qml plasmoid/contents/ui/config/*.qml plasmoid/contents/config/config.qml Preview.qml > ../docs/qmllint.log 2>&1
"$monitor_python" -m unittest discover -s tests -p 'test_*.py' -v > ../docs/backend-tests.log 2>&1
if ! "$monitor_python" - <<'PY'
import urllib.request
request = urllib.request.Request('http://127.0.0.1:17341/snapshot', headers={'X-Monitor-Client':'plasma-widget'})
try:
    urllib.request.urlopen(request, timeout=2).close()
except Exception:
    raise SystemExit(1)
PY
then
    "$monitor_python" backend/monitor_service.py > ../docs/bridge-test.log 2>&1 &
    monitor_bridge_pid="$!"
fi
# Integration fixture requires Arch packages python-dbus and python-gobject.
"$monitor_python" tests/mpris_fixture.py > ../docs/mpris-test.log 2>&1 &
monitor_fixture_pid="$!"
# Use the scene-graph RHI renderer: Qt's software renderer drops grab alpha
# after a Canvas terminal is rendered. Keep the alpha assertions below strict.
QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=rhi QSG_RHI_BACKEND=opengl "$monitor_qt_bin/qmltestrunner" -input tests/tst_configuration.qml > ../docs/qml-tests.log 2>&1
QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=rhi QSG_RHI_BACKEND=opengl "$monitor_qt_bin/qmltestrunner" -input tests/tst_dashboard.qml >> ../docs/qml-tests.log 2>&1
QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=rhi QSG_RHI_BACKEND=opengl "$monitor_qt_bin/qmltestrunner" -input tests/tst_power_timers.qml >> ../docs/qml-tests.log 2>&1
"$monitor_python" tests/preview_configuration.py > ../docs/preview-configuration-test.log 2>&1
"$monitor_python" tests/keep_awake_fixture.py > ../docs/keep-awake-test.log 2>&1
"$monitor_python" tests/cava_playback_fixture.py > ../docs/cava-playback-test.log 2>&1
"$monitor_python" - <<'PY'
from PIL import Image
for name in ('preview-transparent', 'preview-connectivity', 'preview-media-terminal', 'preview-power-timers'):
    image = Image.open('../docs/' + name + '.png')
    assert image.mode == 'RGBA', 'Expected alpha-channel image'
    assert image.getpixel((image.width - 1, image.height - 1))[3] == 0, 'Background must be fully transparent'
colored = Image.open('../docs/preview-colored.png')
assert colored.getpixel((12, colored.height - 12)) == (16, 32, 48, 255), 'Configured background must preserve RGB and opacity'
print('QML, backend and alpha-channel checks passed. Logs and previews: monitor/docs/')
PY

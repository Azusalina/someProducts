#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cmake -S "$root/native" -B "$root/build" -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=ON
cmake --build "$root/build" --parallel 2
ctest --test-dir "$root/build" --output-on-failure
if command -v qtpaths6 >/dev/null; then
    qt_bin="$(qtpaths6 --query QT_INSTALL_BINS)"
elif [[ -x /usr/lib/qt6/bin/qtpaths ]]; then
    qt_bin="$(/usr/lib/qt6/bin/qtpaths --query QT_INSTALL_BINS)"
else
    printf 'Qt 6 qtpaths tool not found
' >&2
    exit 1
fi
"$qt_bin/qmllint" "$root/plasmoid/contents/ui/main.qml"
QT_QPA_PLATFORM=offscreen QT_QPA_PLATFORMTHEME=generic QT_QUICK_BACKEND=software QML_DISABLE_DISK_CACHE=1 \
  "$qt_bin/qmltestrunner" -input "$root/tests"

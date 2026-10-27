#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "${1:-}" == "--remove" ]]; then
    kpackagetool6 --type Plasma/Applet --remove local.filex.navigator
    exit
fi
cmake -S "$root/native" -B "$root/build" -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=OFF
cmake --build "$root/build" --parallel 2
if kpackagetool6 --type Plasma/Applet --show local.filex.navigator >/dev/null 2>&1; then
    kpackagetool6 --type Plasma/Applet --upgrade "$root/plasmoid"
else
    kpackagetool6 --type Plasma/Applet --install "$root/plasmoid"
fi
printf 'Add Widgets → filex. No Plasma restart is performed.\n'

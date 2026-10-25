#!/usr/bin/env bash
set -euo pipefail
monitor_core="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cmake -S "$monitor_core/native" -B "$monitor_core/build/native" -DCMAKE_BUILD_TYPE=Release -DMONITOR_NATIVE_TESTS=OFF
cmake --build "$monitor_core/build/native" -j2

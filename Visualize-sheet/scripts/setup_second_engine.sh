#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
export UV_CACHE_DIR="$PWD/.runtime/uv-cache"
export UV_PYTHON_INSTALL_DIR="$PWD/.runtime/python"
export UV_TOOL_DIR="$PWD/.runtime/uv-tools"
export UV_TOOL_BIN_DIR="$PWD/.runtime/bin"
uv tool install --python 3.12 'homr==0.7.0'
.runtime/bin/homr --init

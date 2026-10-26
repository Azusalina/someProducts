#!/usr/bin/env bash
# Install filex-gui for the current user: command, app-launcher entry, icon.
# --remove undoes exactly these three files. Nothing outside ~/.local is touched.
set -euo pipefail
root="$(dirname -- "$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")")"
bin="$HOME/.local/bin/filex-gui"
data="${XDG_DATA_HOME:-$HOME/.local/share}"
desktop="$data/applications/filex-gui.desktop"
icon="$data/icons/hicolor/scalable/apps/filex-gui.svg"

refresh() {
    command -v update-desktop-database >/dev/null && update-desktop-database -q "$data/applications" || true
    command -v kbuildsycoca6 >/dev/null && kbuildsycoca6 --noincremental >/dev/null 2>&1 || true
    command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q -t "$data/icons/hicolor" 2>/dev/null || true
}

if [[ "${1:-}" == "--remove" ]]; then
    rm -f -- "$bin" "$desktop" "$icon"
    refresh
    printf 'filex-gui removed (config in ~/.config/fileX kept)\n'
    exit 0
fi

# A release archive ships the binary at its top level; a checkout builds it.
source_bin="$root/target/release/filex-gui"
if [[ ! -f "$root/Cargo.toml" && -x "$root/filex-gui" ]]; then
    source_bin="$root/filex-gui"
elif [[ ! -x "$source_bin" || "${1:-}" == "--rebuild" ]]; then
    command -v cargo >/dev/null || { printf 'filex-gui: needs Rust/Cargo 1.88+\n' >&2; exit 1; }
    cargo build --release --locked --manifest-path "$root/Cargo.toml"
fi
install -Dm755 "$source_bin" "$bin"
install -Dm644 "$root/assets/filex-gui.svg" "$icon"
mkdir -p -- "$(dirname -- "$desktop")"
cat > "$desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=filex
GenericName=File Tree
Comment=Horizontal tree file explorer
Exec=$bin %f
Icon=filex-gui
Terminal=false
Categories=Utility;FileTools;
Keywords=files;folders;tree;explorer;filex;
StartupWMClass=filex-gui
DESKTOP
refresh
printf 'Installed: %s\nLauncher:  %s\n' "$bin" "$desktop"

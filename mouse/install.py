#!/usr/bin/env python3
"""Install/remove only this app's user launchers. Onboard bindings are untouched."""
import argparse
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def install(remove=False):
    home = Path.home()
    target = home / ".local/bin/g502x-mouse"
    desktop = Path(os.environ.get("XDG_DATA_HOME", home / ".local/share")) / "applications/g502x-mouse.desktop"
    if remove:
        if target.is_symlink() and target.resolve() == ROOT / "mouse":
            target.unlink()
        if desktop.exists() and "X-G502X-Mouse=true" in desktop.read_text():
            desktop.unlink()
        print("User launcher removed. Mouse bindings and backups retained.")
        return
    if target.exists() and (not target.is_symlink() or target.resolve() != ROOT / "mouse"):
        raise RuntimeError(f"Refusing to replace unrelated file: {target}")
    if desktop.exists() and "X-G502X-Mouse=true" not in desktop.read_text():
        raise RuntimeError(f"Refusing to replace unrelated file: {desktop}")
    target.parent.mkdir(parents=True, exist_ok=True)
    desktop.parent.mkdir(parents=True, exist_ok=True)
    if not target.is_symlink():
        target.symlink_to(ROOT / "mouse")
    # Desktop Exec quoting uses double quotes, not shell single quotes.
    quoted = str(ROOT / "mouse").replace("\\", "\\\\").replace('"', '\\"').replace("`", "\\`").replace("$", "\\$").replace("%", "%%")
    desktop.write_text(f'[Desktop Entry]\nType=Application\nName=Mouse · G502 X\nComment=Read and configure Logitech G502 X onboard buttons\nExec="{quoted}"\nIcon=input-mouse\nTerminal=false\nCategories=Settings;HardwareSettings;\nStartupWMClass=app.py\nX-G502X-Mouse=true\n')
    print("Installed: application menu → Mouse · G502 X, command g502x-mouse")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--remove", action="store_true")
    install(parser.parse_args().remove)

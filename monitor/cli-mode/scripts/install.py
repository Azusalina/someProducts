#!/usr/bin/env python3
"""Install an independent, user-local command; only replace our marked files."""
import argparse
import os
from pathlib import Path
import shutil
import sys
import tempfile

MARKER = "monitor-cli-managed-v1\n"


def owned(path):
    try:
        return not path.is_symlink() and (path / ".monitor-cli-install").read_text() == MARKER
    except OSError:
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prefix", type=Path, default=Path.home() / ".local")
    parser.add_argument("--uninstall", action="store_true")
    args = parser.parse_args()
    if sys.version_info < (3, 11):
        parser.error("Python 3.11 or newer is required")
    prefix = args.prefix.expanduser().resolve()
    app = prefix / "share/monitor-cli"
    binary = prefix / "bin/monitor-cli"
    target = app / "monitor-cli"
    linked = binary.is_symlink() and os.readlink(binary) == str(target)
    if (binary.exists() or binary.is_symlink()) and not linked:
        parser.error(f"Refusing to replace an unrelated command: {binary}")
    if (app.exists() or app.is_symlink()) and not owned(app):
        parser.error(f"Refusing to change an unmarked installation: {app}")
    if args.uninstall:
        if linked:
            binary.unlink()
        if app.exists():
            shutil.rmtree(app)
        print("Removed monitor-cli. Configuration and notes were preserved.")
        return 0
    source = Path(__file__).resolve().parents[1]
    app.parent.mkdir(parents=True, exist_ok=True)
    binary.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".monitor-cli-", dir=app.parent))
    backup = stage.with_name(stage.name + ".old")
    try:
        for name in ("monitor_cli", "scripts"):
            shutil.copytree(source / name, stage / name, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        for name in ("monitor-cli", "config.example.toml", "README.md", "description.md", "LICENSE"):
            shutil.copy2(source / name, stage / name)
        (stage / "monitor-cli").chmod(0o755)
        (stage / ".monitor-cli-install").write_text(MARKER)
        if app.exists():
            app.rename(backup)
        try:
            stage.rename(app)
        except OSError:
            if backup.exists():
                backup.rename(app)
            raise
        try:
            if not linked:
                binary.symlink_to(target)
        except OSError:
            shutil.rmtree(app)
            if backup.exists():
                backup.rename(app)
            raise
        if backup.exists():
            shutil.rmtree(backup)
    finally:
        if stage.exists():
            shutil.rmtree(stage)
    print(f"Installed {binary}\nRun: monitor-cli\nConfigure: monitor-cli --init-config")
    if str(binary.parent) not in os.environ.get("PATH", "").split(os.pathsep):
        print(f"Add {binary.parent} to your PATH, or run the full command path above.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except OSError as error:
        print(f"monitor-cli installer: {error}", file=sys.stderr)
        raise SystemExit(2)

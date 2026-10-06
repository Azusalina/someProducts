#!/usr/bin/env python3
"""Optional per-user Linux autostart. Keeps the archive on uninstall."""
import argparse
import os
import subprocess
import sys
from pathlib import Path

MARKER = "# Managed by Track local footprint archive"


def quote(value):
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"'


def main():
    parser = argparse.ArgumentParser(description="Install/remove Track user service (Linux systemd)")
    parser.add_argument("--uninstall", action="store_true")
    parser.add_argument("--lan-ip", help="Optional fixed PC LAN address")
    args = parser.parse_args()
    if not sys.platform.startswith("linux"):
        parser.error("This installer is for Linux systemd; use start.bat on Windows.")
    root = Path(__file__).resolve().parents[1]
    unit = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "systemd/user/track.service"
    if unit.exists() and MARKER not in unit.read_text():
        parser.error("Existing track.service is not managed by Track; it was left untouched.")
    if args.uninstall:
        if unit.exists():
            subprocess.run(["systemctl", "--user", "disable", "--now", "track.service"], check=True)
            unit.unlink()
            subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
        print("Track autostart removed. Your database and certificates were preserved.")
        return
    command = f"{quote(sys.executable)} {quote(root / 'track.py')}"
    if args.lan_ip:
        import ipaddress
        ipaddress.IPv4Address(args.lan_ip)
        command += f" --lan-ip {quote(args.lan_ip)}"
    content = f"""{MARKER}
[Unit]
Description=Track local Overland footprint archive
After=network-online.target

[Service]
Type=simple
WorkingDirectory={root}
ExecStart={command}
Restart=on-failure
RestartSec=15
UMask=0077

[Install]
WantedBy=default.target
"""
    unit.parent.mkdir(parents=True, exist_ok=True)
    unit.write_text(content)
    subprocess.run(["systemd-analyze", "--user", "verify", str(unit)], check=True)
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "--user", "enable", "--now", "track.service"], check=True)
    print("Track user service installed. Open http://127.0.0.1:4188 after login.")


if __name__ == "__main__":
    main()

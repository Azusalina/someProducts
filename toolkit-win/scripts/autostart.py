"""Install/remove the current user's toolkit login service."""
from pathlib import Path
import argparse
import os
import shutil
import subprocess

MARKER = '# Managed by Toolkit Win autostart'
ROOT = Path(__file__).resolve().parents[1]

def quoted(value):
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"'

def unit_text(root, node):
    return f'''{MARKER}
[Unit]
Description=Local Toolkit
After=network.target

[Service]
Type=simple
WorkingDirectory={str(root).replace('%', '%%')}
ExecStart={quoted(node)} {quoted(root / 'src/cli.js')}
Restart=on-failure
RestartSec=3
TimeoutStopSec=20

[Install]
WantedBy=default.target
'''

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['install', 'uninstall'])
    args = parser.parse_args()
    config = Path(os.environ.get('XDG_CONFIG_HOME') or Path.home() / '.config')
    target = config / 'systemd/user/toolkit-win.service'
    if target.exists() and MARKER not in target.read_text():
        raise SystemExit('An existing toolkit-win.service is not managed by this script; preserve it and configure that service directly.')
    if args.action == 'install':
        node = shutil.which('node')
        if not node:
            raise SystemExit('Install Node.js 22 or newer first.')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(unit_text(ROOT, Path(node)))
        subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
        subprocess.run(['systemctl', '--user', 'enable', 'toolkit-win.service'], check=True)
        print('Enabled toolkit-win.service for login. Start with: systemctl --user start toolkit-win.service')
    elif target.exists():
        subprocess.run(['systemctl', '--user', 'disable', '--now', 'toolkit-win.service'], check=True)
        target.unlink()
        subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
        print('Removed toolkit login service. Product files and documents are unchanged.')

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Install only this product's systemd user service; keep the user's data on removal."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
UNIT = Path.home() / '.config/systemd/user/skill-manager.service'
MARKER = '# Managed by local-skill-manager'

def arg(value):
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"'

def control(*args, check=True):
    return subprocess.run(['systemctl', '--user', *args], check=check)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['install', 'remove', 'status'])
    parser.add_argument('--port', type=int, default=4380)
    parser.add_argument('--print', dest='print_only', action='store_true', help='Print the generated unit without installing')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('port must be 1–65535')
    if args.action == 'status':
        control('status', 'skill-manager.service', '--no-pager', check=False)
        return
    if UNIT.exists() and MARKER not in UNIT.read_text():
        raise SystemExit('Refusing to overwrite a service not managed by this product.')
    if args.action == 'remove':
        if UNIT.exists():
            control('disable', '--now', 'skill-manager.service')
            UNIT.unlink()
            control('daemon-reload')
        print('Service removed. Skills, plugins and .data settings are preserved.')
        return
    node = shutil.which('node')
    if not node or not (ROOT / 'node_modules').is_dir():
        raise SystemExit('Install Node.js >=22 and run npm install first.')
    extra_environment = ''.join('Environment=' + arg(key + '=' + os.environ[key]) + '\n' for key in ['CODEX_HOME', 'CLAUDE_CONFIG_DIR'] if key in os.environ)
    content = f'''{MARKER}
[Unit]
Description=Local Skill Manager on 127.0.0.1

[Service]
Type=simple
WorkingDirectory={str(ROOT).replace('%', '%%')}
ExecStart={arg(node)} {arg(ROOT / 'src/server.mjs')}
Environment={arg('PORT=' + str(args.port))}
Environment={arg('PATH=' + os.environ.get('PATH', '/usr/local/bin:/usr/bin:/bin'))}
{extra_environment}Restart=on-failure
RestartSec=3
TimeoutStopSec=10
UMask=0077

[Install]
WantedBy=default.target
'''
    if args.print_only:
        print(content, end='')
        return
    UNIT.parent.mkdir(parents=True, exist_ok=True)
    UNIT.write_text(content)
    control('daemon-reload')
    control('enable', 'skill-manager.service')
    control('restart', 'skill-manager.service')
    control('is-active', 'skill-manager.service')
    print(f'http://127.0.0.1:{args.port}')

if __name__ == '__main__':
    main()

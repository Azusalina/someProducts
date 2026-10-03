#!/usr/bin/env python3
"""Install a loopback-only, socket-activated Mediator service on Linux."""
import argparse
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
MARKER = '# Managed by Mediator installer'


def unit_path(value):
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"'


def build_units(user, node, root=ROOT):
    socket = f'''{MARKER}
[Unit]
Description=Mediator localhost port directory

[Socket]
ListenStream=127.0.0.1:80
ListenStream=[::1]:80
BindIPv6Only=ipv6-only
NoDelay=true
Service=mediator.service

[Install]
WantedBy=sockets.target
'''
    service = f'''{MARKER}
[Unit]
Description=Mediator local service discovery
Requires=mediator.socket
After=mediator.socket

[Service]
Type=simple
User={user}
ExecStart={unit_path(node)} {unit_path(root / 'server.mjs')} --systemd
WorkingDirectory={str(root).replace('%', '%%')}
Restart=on-failure
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK
UMask=0077
'''
    return socket, service


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--user')
    parser.add_argument('--node')
    parser.add_argument('--print-units', action='store_true')
    parser.add_argument('--uninstall', action='store_true')
    args = parser.parse_args()
    user = args.user or os.environ.get('SUDO_USER') or pwd.getpwuid(os.getuid()).pw_name
    if user == 'root':
        parser.error('Choose the normal account with --user; Mediator must not run as root.')
    pwd.getpwnam(user)
    node = args.node or ('/usr/bin/node' if Path('/usr/bin/node').exists() else shutil.which('node'))
    if not node or not Path(node).is_file():
        parser.error('Install Node.js 22 or later first.')
    major = int(subprocess.check_output([node, '--version'], text=True).strip().lstrip('v').split('.')[0])
    if major < 22:
        parser.error('Node.js 22 or later is required.')
    if not Path('/usr/bin/ss').exists():
        parser.error('Install iproute2 (ss) first.')
    units = build_units(user, node)
    if args.print_units:
        for unit in units:
            print(unit)
        return
    # Validate both units before requesting authentication or touching system configuration.
    with tempfile.TemporaryDirectory(prefix='mediator-units-') as directory:
        paths = [Path(directory) / 'mediator.socket', Path(directory) / 'mediator.service']
        for path, content in zip(paths, units):
            path.write_text(content)
        subprocess.run(['systemd-analyze', 'verify', *map(str, paths)], check=True, timeout=15)
    if os.geteuid() != 0:
        pkexec = shutil.which('pkexec')
        if not pkexec:
            parser.error('Run this installer using sudo, preserving your normal account with --user.')
        print('Administrator authentication is required to reserve localhost port 80.', flush=True)
        argv = [pkexec, '/usr/bin/python3', str(Path(__file__).resolve()), '--user', user, '--node', node]
        if args.uninstall:
            argv.append('--uninstall')
        os.execv(pkexec, argv)
    destinations = [Path('/etc/systemd/system/mediator.socket'), Path('/etc/systemd/system/mediator.service')]
    for target in destinations:
        if target.exists() and not target.read_text().startswith(MARKER):
            parser.error(f'{target} is not owned by this installer; leaving it untouched.')
    managed = destinations[0].exists()
    if args.uninstall:
        if managed:
            subprocess.run(['systemctl', 'disable', '--now', 'mediator.socket'], check=True)
            subprocess.run(['systemctl', 'stop', 'mediator.service'], check=True)
        for target in destinations:
            target.unlink(missing_ok=True)
        subprocess.run(['systemctl', 'daemon-reload'], check=True)
        print('Mediator removed from system startup. Project files are preserved.')
        return
    listeners = subprocess.check_output(['/usr/bin/ss', '-H', '-lnt', 'sport = :80'], text=True)
    active = subprocess.run(['systemctl', 'is-active', '--quiet', 'mediator.socket']).returncode == 0
    if listeners.strip() and not (managed and active):
        parser.error('Port 80 is already in use. Mediator will not replace the existing service.')
    if managed:
        for unit in ['mediator.service', 'mediator.socket']:
            if subprocess.run(['systemctl', 'is-active', '--quiet', unit]).returncode == 0:
                subprocess.run(['systemctl', 'stop', unit], check=True)
    for target, content in zip(destinations, units):
        target.write_text(content)
        target.chmod(0o644)
    subprocess.run(['systemctl', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', 'enable', '--now', 'mediator.socket'], check=True)
    print('Mediator is ready at http://localhost and http://127.0.0.1. It will be available after reboot.')


if __name__ == '__main__':
    main()

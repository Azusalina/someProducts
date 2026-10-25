#!/usr/bin/env python3
"""Install only this integration's per-user launchers, service and effect."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent
MARK = '# Managed by Toolkit Desktop'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def quoted(path):
    text = str(path)
    for char in ['\\', '"', '`', '$']: text = text.replace(char, '\\' + char)
    return '"' + text.replace('%', '%%') + '"'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['install', 'remove', 'status'])
    parser.add_argument('--prefix', type=Path, help='Isolated install root for validation; does not activate desktop services')
    args = parser.parse_args()
    prefix = args.prefix.resolve() if args.prefix else Path.home() / '.local'
    config = prefix / 'config' if args.prefix else Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config'))
    data = prefix / 'share' if args.prefix else Path(os.environ.get('XDG_DATA_HOME', prefix / 'share'))
    statefile = config / 'toolkit-desktop/install.json'
    state = json.loads(statefile.read_text()) if statefile.exists() else {'files': {}}
    if args.action == 'status':
        for path, expected in state['files'].items():
            p = Path(path)
            print(('OK' if p.exists() and digest(p) == expected else 'MISSING / CHANGED'), path)
        if not args.prefix:
            subprocess.run(['systemctl', '--user', 'status', 'toolkit-desktop.service', '--no-pager'])
            subprocess.run(['qdbus6', 'org.kde.KWin', '/Effects', 'org.kde.kwin.Effects.isEffectLoaded', 'toolkitgesture'])
        return
    if args.action == 'remove':
        if not args.prefix:
            subprocess.run(['systemctl', '--user', 'disable', '--now', 'toolkit-desktop.service'], check=False)
            daemon = prefix / 'lib/toolkit-desktop/toolkit-hotkeys'
            if daemon.exists(): subprocess.run([str(daemon), '--remove-shortcuts'], check=False)
            subprocess.run(['qdbus6', 'org.kde.KWin', '/Effects', 'org.kde.kwin.Effects.unloadEffect', 'toolkitgesture'], check=False)
            subprocess.run(['kwriteconfig6', '--file', 'kwinrc', '--group', 'Plugins', '--key', 'toolkitgestureEnabled', 'false'], check=True)
        for path, expected in state['files'].items():
            p = Path(path)
            if p.exists() and digest(p) == expected: p.unlink()
            elif p.exists(): print('Preserved modified file:', p)
        if statefile.exists(): statefile.unlink()
        if not args.prefix:
            subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
            subprocess.run(['kbuildsycoca6'], check=True)
        print('Removed managed integration files. gesture.conf and original documents are preserved.')
        return
    required = ['toolkit-hotkeys', 'libtoolkit-glass.so', 'libtoolkitgesture.so']
    for name in required:
        if not (ROOT / 'build' / name).is_file(): raise SystemExit('Build native components first: cmake -S native -B build && cmake --build build')
    launcher = prefix / 'bin/toolkit-desktop'
    daemon = prefix / 'lib/toolkit-desktop/toolkit-hotkeys'
    effect = data / 'kwin/effects/toolkitgesture'
    service = config / 'systemd/user/toolkit-desktop.service'
    desktop = f'''{MARK}
[Desktop Entry]
Type=Application
Name=Toolkit Desktop
Comment=Local tools for your files
Icon=document-edit
Exec={quoted(launcher)} --radial -- %F
Terminal=false
Categories=Utility;
MimeType=text/markdown;text/x-tex;application/pdf;image/png;image/jpeg;audio/mpeg;audio/flac;
'''
    menu = f'''{MARK}
[Desktop Entry]
Type=Service
MimeType=text/markdown;text/x-markdown;text/x-tex;application/pdf;image/*;audio/*;video/*;
Actions=toolkit;
X-KDE-ServiceTypes=KonqPopupMenu/Plugin
X-KDE-Protocol=file
X-KDE-Priority=TopLevel

[Desktop Action toolkit]
Name=Toolkit…
Icon=document-edit
Exec={quoted(launcher)} --radial -- %F
'''
    unit = f'''{MARK}
[Unit]
Description=Toolkit Desktop file gesture and keyboard shortcut
PartOf=graphical-session.target
After=graphical-session.target

[Service]
Type=simple
ExecStart={quoted(daemon)} {quoted(launcher)}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=graphical-session.target
'''
    files = {
        launcher: (f'#!/usr/bin/env bash\n{MARK}\nexec {shlex.quote(str(ROOT / "toolkit-desktop"))} "$@"\n'.encode(), 0o755),
        daemon: ((ROOT / 'build/toolkit-hotkeys').read_bytes(), 0o755),
        data / 'applications/toolkit-desktop.desktop': (desktop.encode(), 0o644),
        data / 'kio/servicemenus/toolkit-desktop.desktop': (menu.encode(), 0o755),
        service: (unit.encode(), 0o644),
        effect / 'metadata.json': ((ROOT / 'native/gesture.json').read_bytes(), 0o644),
        effect / 'contents/ui/main.qml': ((ROOT / 'native/main.qml').read_bytes(), 0o644),
        effect / 'contents/code/qmldir': ((ROOT / 'native/qmldir').read_bytes(), 0o644),
        effect / 'contents/code/libtoolkitgesture.so': ((ROOT / 'build/libtoolkitgesture.so').read_bytes(), 0o755),
    }
    # Preflight every path before changing anything. Updates own only prior hashes.
    for path in files:
        if path.is_symlink() or (path.exists() and state['files'].get(str(path)) != digest(path)):
            raise SystemExit(f'Refusing to overwrite an unmanaged or edited file: {path}')
    for path, (content, mode) in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(prefix='.toolkit-install-', dir=path.parent, delete=False) as handle:
            temporary = Path(handle.name)
            try:
                handle.write(content); handle.flush(); os.fchmod(handle.fileno(), mode)
                os.replace(temporary, path)
            finally:
                if temporary.exists(): temporary.unlink()
        state['files'][str(path)] = digest(path)
    conf = config / 'toolkit-desktop/gesture.conf'
    conf.parent.mkdir(parents=True, exist_ok=True)
    if not conf.exists(): shutil.copyfile(ROOT / 'gesture.conf.example', conf)
    statefile.parent.mkdir(parents=True, exist_ok=True)
    statefile.write_text(json.dumps(state, indent=2) + '\n')
    if not args.prefix:
        subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
        subprocess.run(['systemctl', '--user', 'enable', '--now', 'toolkit-desktop.service'], check=True)
        subprocess.run(['systemctl', '--user', 'restart', 'toolkit-desktop.service'], check=True)
        subprocess.run(['kbuildsycoca6'], check=True)
        # File-click activation is explicit: it requires an available accessibility
        # provider. Installation does not enable session-wide accessibility.
        print('Installed. Enable Toolkit file gesture in KDE Desktop Effects after accessibility is available.')
    print('Configuration:', conf)


if __name__ == '__main__':
    main()

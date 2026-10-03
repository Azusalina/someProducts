#!/usr/bin/env python3
"""Connect the official status-line feed while preserving unrelated Claude settings."""
import json
import os
from pathlib import Path
import shlex
import shutil
import sys
import tempfile

config_dir = Path(os.environ.get('CLAUDE_CONFIG_DIR', str(Path.home() / '.claude')))
settings_path = config_dir / 'settings.json'
script = Path(os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local/share'))) / 'monitor-dashboard/claude_statusline.py'
if '--disconnect' in sys.argv:
    if settings_path.is_file():
        settings = json.loads(settings_path.read_text())
        configured = settings.get('statusLine') or {}
        if configured.get('command') == shlex.join([sys.executable, str(script)]):
            backup = config_dir / 'settings.pre-monitor-statusline.json'
            previous = json.loads(backup.read_text()).get('statusLine') if backup.is_file() else None
            if previous is None: settings.pop('statusLine', None)
            else: settings['statusLine'] = previous
            with tempfile.NamedTemporaryFile(mode='w', dir=config_dir, prefix='.monitor-settings-', delete=False) as output:
                json.dump(settings, output, indent=2); output.write('\n'); filename = output.name
            os.chmod(filename, 0o600); os.replace(filename, settings_path)
    print('Monitor status-line connection removed; other Claude settings preserved.')
    raise SystemExit(0)
if not script.is_file():
    raise SystemExit('Run scripts/install.sh first')
config_dir.mkdir(parents=True, exist_ok=True)
settings = json.loads(settings_path.read_text()) if settings_path.is_file() else {}
command = shlex.join([sys.executable, str(script)])
previous = settings.get('statusLine')
if previous and previous.get('command') != command:
    raise SystemExit('An existing statusLine is configured. See docs/USAGE.md to connect without replacing it.')
backup = config_dir / 'settings.pre-monitor-statusline.json'
if settings_path.is_file() and not backup.exists():
    shutil.copy2(settings_path, backup)
    os.chmod(backup, 0o600)
settings['statusLine'] = {**(previous or {}), 'type': 'command', 'command': command, 'refreshInterval': 30}
with tempfile.NamedTemporaryFile(mode='w', dir=config_dir, prefix='.monitor-settings-', delete=False) as output:
    json.dump(settings, output, indent=2)
    output.write('\n')
    filename = output.name
os.chmod(filename, 0o600)
os.replace(filename, settings_path)
print('Claude Code status feed connected. Data arrives after a subscription response in Claude Code.')

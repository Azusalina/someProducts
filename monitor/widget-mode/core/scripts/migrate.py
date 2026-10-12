"""Remove only Monitor's retired Claude status line, preserving all other settings."""
import json
import os
from pathlib import Path
import shlex
import tempfile

config = Path(os.environ.get('CLAUDE_CONFIG_DIR', str(Path.home()/'.claude')))
settings_path = config/'settings.json'
legacy = Path(os.environ.get('XDG_DATA_HOME', str(Path.home()/'.local/share')))/'monitor-dashboard/claude_statusline.py'
if settings_path.is_file():
    settings = json.loads(settings_path.read_text())
    status = settings.get('statusLine') or {}
    try:
        command = shlex.split(status.get('command', '')) if isinstance(status, dict) else []
    except ValueError:
        command = []
    if len(command) == 2 and Path(command[0]).name.startswith('python') and command[1] == str(legacy):
        backup = config/'settings.pre-monitor-statusline.json'
        previous = json.loads(backup.read_text()).get('statusLine') if backup.is_file() else None
        if previous is None:
            settings.pop('statusLine', None)
        else:
            settings['statusLine'] = previous
        with tempfile.NamedTemporaryFile(mode='w', dir=config, prefix='.monitor-settings-', delete=False) as output:
            json.dump(settings, output, indent=2); output.write('\n'); temporary = output.name
        os.chmod(temporary, 0o600)
        os.replace(temporary, settings_path)

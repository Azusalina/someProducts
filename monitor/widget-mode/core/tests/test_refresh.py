"""A failed native package upgrade must still restore the desktop service."""
from importlib.machinery import SourceFileLoader
from pathlib import Path
import json
import os
import subprocess
import tempfile
import unittest
from unittest.mock import patch

m = SourceFileLoader('monitor_refresh_test', str(Path(__file__).parents[1]/'scripts/refresh-desktop.py')).load_module()

class RefreshTests(unittest.TestCase):
    def run_upgrade(self, fail=False):
        with tempfile.TemporaryDirectory() as directory:
            rows = [{'id': 12, 'settings': {'noteText': 'fixture "quoted" \\ text'}, 'geometry': {'x': 1, 'y': 2, 'width': 300, 'height': 400}}]
            calls = []
            def run(args, **kwargs):
                calls.append(args)
                if fail and args[0] == 'kpackagetool6':
                    raise subprocess.CalledProcessError(1, args)
            with patch.dict(os.environ, {'XDG_STATE_HOME': directory}), patch.object(m, 'evaluate', return_value=rows), patch.object(m.subprocess, 'run', side_effect=run), patch('sys.argv', ['refresh', '--package', directory]):
                if fail:
                    with self.assertRaises(subprocess.CalledProcessError):
                        m.main()
                else:
                    m.main()
            backup = next((Path(directory)/'monitor-dashboard').glob('*.json'))
            self.assertEqual(json.loads(backup.read_text()), rows)
            self.assertEqual(backup.stat().st_mode & 0o777, 0o600)
            self.assertEqual(calls[-1], ['systemctl', '--user', 'start', 'plasma-plasmashell.service'])
            self.assertEqual(calls[-3], ['systemctl', '--user', 'stop', 'plasma-plasmashell.service'])
            self.assertEqual(calls[-2][0], 'kpackagetool6')
    def test_successful_upgrade_preserves_private_backup_and_restores_shell(self):
        self.run_upgrade()
    def test_failed_upgrade_also_restores_shell(self):
        self.run_upgrade(fail=True)

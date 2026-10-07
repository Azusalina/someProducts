"""Verify real Track restart and child supervision with an offline fake tunnel."""
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(sys.platform.startswith('linux'), 'Executable fake connector uses Linux shebang')
class RelayLifecycleTests(unittest.TestCase):
    def test_restart_remembers_relay_and_recreates_connector(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            counter = folder / 'counter'
            fake = folder / 'cloudflared'
            fake.write_text(f'''#!{sys.executable}
import os,time,signal
from pathlib import Path
counter=Path(os.environ['TRACK_TEST_COUNTER'])
n=int(counter.read_text())+1 if counter.exists() else 1
counter.write_text(str(n))
print('https://restart-'+str(n)+'.trycloudflare.com',flush=True)
print('Registered tunnel connection',flush=True)
signal.signal(signal.SIGTERM,lambda *_:exit(0))
while True:time.sleep(1)
''')
            fake.chmod(0o700)
            environment = {**os.environ, 'PATH': str(folder)+os.pathsep+os.environ['PATH'], 'TRACK_TEST_COUNTER': str(counter)}
            archive = folder / 'archive'
            for run in [1, 2]:
                with (folder / f'run-{run}.log').open('w+') as log:
                    command = [sys.executable, str(ROOT / 'track.py'), '--lan-ip', '127.0.0.1', '--port', '0', '--ingest-port', '0', '--trust-port', '0', '--data-dir', str(archive)]
                    if run == 1:
                        command.append('--relay')
                    process = subprocess.Popen(command, cwd=ROOT, env=environment, stdout=log, stderr=log)
                    try:
                        deadline = time.monotonic()+25
                        setup = None
                        while time.monotonic() < deadline:
                            text = (folder / f'run-{run}.log').read_text()
                            import re
                            match = re.search(r'Track ready · (http://\S+)', text)
                            if match:
                                setup = json.load(urllib.request.urlopen(match.group(1)+'/api/setup', timeout=2))
                                if setup['relay_active']:
                                    break
                            self.assertIsNone(process.poll(), text)
                            time.sleep(.1)
                        self.assertIsNotNone(setup)
                        self.assertTrue(setup['relay_active'])
                        self.assertTrue(setup['relay_enabled'])
                        self.assertEqual(setup['receiver'], f'https://restart-{run}.trycloudflare.com/api/overland')
                    finally:
                        process.terminate()
                        try:
                            self.assertEqual(process.wait(timeout=15), 0)
                        except subprocess.TimeoutExpired:
                            process.kill()
                            process.wait()
                            self.fail('Track did not cleanly stop its relay child')
                self.assertEqual(json.loads((archive/'relay-settings.json').read_text())['public_url'], f'https://restart-{run}.trycloudflare.com')

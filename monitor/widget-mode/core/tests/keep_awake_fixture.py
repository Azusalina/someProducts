"""Verify real KDE inhibition ownership, expiry and abrupt parent disconnect."""
import json
from pathlib import Path
import subprocess
import sys
import time
sys.path.insert(0, str(Path(__file__).parents[1] / 'backend'))
from power import AwakeManager
from connectivity import unbox


def monitor_inhibitions():
    output = subprocess.check_output(['busctl', '--user', '--json=short', 'get-property',
        'org.kde.Solid.PowerManagement.PolicyAgent', '/org/kde/Solid/PowerManagement/PolicyAgent',
        'org.kde.Solid.PowerManagement.PolicyAgent', 'RequestedInhibitions'], text=True)
    return {tuple(row) for row in unbox(json.loads(output)) if row[1] == 'someProducts-monitor'}


def eventually(predicate):
    until = time.monotonic() + 4
    while time.monotonic() < until:
        if predicate(): return
        time.sleep(0.05)
    raise AssertionError('Inhibition lifecycle did not settle')

baseline = monitor_inhibitions()
manager = AwakeManager()
try:
    first = manager.control('enable')['token']
    second = manager.control('enable')['token']
    eventually(lambda: len(monitor_inhibitions() - baseline) >= 1)
    own = monitor_inhibitions() - baseline
    assert any('sleep' in row[0].split(':') for row in own), own
    assert any('idle' in row[0].split(':') for row in own), own
    manager.control('disable', first)
    assert own <= monitor_inhibitions()
    manager.TTL = 0.1
    time.sleep(0.15); manager.sweep()
    eventually(lambda: not (own & monitor_inhibitions()))
finally:
    manager.shutdown()

backend = Path(__file__).parents[1] / 'backend'
code = "import sys,os;sys.path.insert(0,sys.argv[1]);from power import AwakeManager;m=AwakeManager();m.control('enable');print('ready',flush=True);sys.stdin.readline();os._exit(0)"
process = subprocess.Popen([sys.executable, '-c', code, str(backend)], stdin=subprocess.PIPE,
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
try:
    assert process.stdout.readline().strip() == 'ready'
    own = monitor_inhibitions() - baseline
    assert own, 'No crash-test inhibition was created'
    process.stdin.write('\n'); process.stdin.flush()
    process.wait(timeout=3)
    eventually(lambda: not (own & monitor_inhibitions()))
finally:
    if process.poll() is None:
        process.terminate(); process.wait(timeout=3)
    process.stdin.close(); process.stdout.close(); process.stderr.close()
print('Live KDE sleep/screen inhibition: two owners, expiry and abrupt bridge death release only their own requests.')

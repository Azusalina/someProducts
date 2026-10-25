"""Estimate incremental QML memory separately from the shared Plasma process."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


def usage(pid):
    fields = {}
    for line in Path(f'/proc/{pid}/smaps_rollup').read_text().splitlines():
        parts = line.split()
        if parts[0].rstrip(':') in ('Rss', 'Pss', 'Private_Clean', 'Private_Dirty'):
            fields[parts[0].rstrip(':')] = int(parts[1])
    return {key + '_MiB': round(value / 1024, 2) for key, value in fields.items()}

parser = argparse.ArgumentParser()
parser.add_argument('--mode', choices=('blank', 'widget'))
args = parser.parse_args()
if args.mode:
    os.environ['QT_QPA_PLATFORM'] = 'offscreen'
    os.environ['QT_QUICK_BACKEND'] = 'software'
    with tempfile.TemporaryDirectory(prefix='monitor-memory-') as temp:
        os.environ['XDG_CONFIG_HOME'] = temp
        from PySide6.QtCore import QTimer, QUrl
        from PySide6.QtQml import QQmlApplicationEngine
        from PySide6.QtWidgets import QApplication
        app = QApplication([])
        engine = QQmlApplicationEngine()
        if args.mode == 'widget':
            engine.load(QUrl.fromLocalFile(str(Path(__file__).parents[1] / 'Preview.qml')))
        else:
            engine.loadData(b'import QtQuick\nimport QtQuick.Controls\nApplicationWindow { visible: true; width: 320; height: 380; color: "transparent" }')
        if not engine.rootObjects():
            raise SystemExit('Memory probe QML failed to load')
        QTimer.singleShot(8000, app.quit)
        app.exec()
        print(json.dumps(usage(os.getpid())))
else:
    result = {}
    for mode in ('blank', 'widget'):
        output = subprocess.check_output([sys.executable, __file__, '--mode', mode], text=True)
        result[mode] = json.loads(output.strip().splitlines()[-1])
    result['incremental_preview_Pss_MiB'] = round(result['widget']['Pss_MiB'] - result['blank']['Pss_MiB'], 2)
    result['shared_processes'] = []
    for proc in Path('/proc').glob('[0-9]*'):
        try:
            if proc.stat().st_uid != os.getuid():
                continue
            comm = (proc/'comm').read_text().strip()
            name = None
            if comm == 'plasmashell':
                name = 'whole Plasma desktop (not attributable to this widget)'
            elif comm.startswith('python') and b'/monitor-dashboard/monitor_service.py' in (proc/'cmdline').read_bytes():
                name = 'Monitor bridge'
            if name:
                result['shared_processes'].append({'pid': int(proc.name), 'name': name, **usage(proc.name)})
        except (OSError, ValueError):
            pass
    result['monitor_helpers'] = []
    roots = [row['pid'] for row in result['shared_processes'] if row['name'] == 'Monitor bridge']
    seen = set(roots)
    while roots:
        pid = roots.pop()
        try:
            children = sorted({child for task in Path(f'/proc/{pid}/task').glob('*/children') for child in task.read_text().split()})
        except OSError:
            continue
        for child in children:
            if int(child) in seen:
                continue
            seen.add(int(child)); roots.append(int(child))
            try:
                result['monitor_helpers'].append({'pid': int(child), 'program': Path(f'/proc/{child}/comm').read_text().strip(), **usage(child)})
            except OSError:
                pass
    result['estimated_incremental_plus_bridge_helpers_Pss_MiB'] = round(result['incremental_preview_Pss_MiB'] + sum(row['Pss_MiB'] for row in result['shared_processes'] if row['name'] == 'Monitor bridge') + sum(row['Pss_MiB'] for row in result['monitor_helpers']), 2)
    result['method'] = '8s offscreen software preview minus blank Qt window; PSS includes apportioned shared pages. This is an estimate, not a per-applet Plasma measurement.'
    print(json.dumps(result, indent=2))

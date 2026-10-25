"""Isolated offscreen UI CPU/PSS; never saves real widget preferences."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

OUT=Path(__file__).parent
CORE=Path.cwd()
parser=argparse.ArgumentParser();parser.add_argument('--mode',choices=('blank','widget'));args=parser.parse_args()
if not args.mode:
    result={}
    for mode in ('blank','widget'):
        output=subprocess.check_output([sys.executable,__file__,'--mode',mode],text=True)
        result[mode]=json.loads(output.strip().splitlines()[-1])
        (OUT/'gui.json').write_text(json.dumps(result,indent=2)+'\n')
        print(mode,json.dumps(result[mode]),flush=True)
    result['incremental_widget_Pss_MiB']=round(result['widget']['Pss_MiB_end']-result['blank']['Pss_MiB_end'],2)
    result['incremental_widget_CPU_one_core']=round(result['widget']['cpu_percent_one_core']-result['blank']['cpu_percent_one_core'],2)
    result['method']='Software/offscreen Qt preview at live widget size/rates/modules; empty notes/tasks; 35s warmup + 15s measurement (blank 3s+10s). This is not a native per-applet CPU/VRAM measurement.'
    (OUT/'gui.json').write_text(json.dumps(result,indent=2)+'\n')
    raise SystemExit

os.environ['QT_QPA_PLATFORM']='offscreen';os.environ['QT_QUICK_BACKEND']='software'
with tempfile.TemporaryDirectory(prefix='monitor-resource-gui-') as temp:
    os.environ['XDG_CONFIG_HOME']=temp
    from PySide6.QtCore import QObject,QMetaObject,QUrl,QTimer,Q_ARG
    from PySide6.QtQml import QQmlApplicationEngine,QJSValue
    from PySide6.QtWidgets import QApplication
    from PySide6.QtQuick import QQuickWindow
    from PySide6.QtTest import QTest
    import time
    app=QApplication([]);app.setOrganizationName('MonitorResourceAudit');app.setApplicationName('IsolatedProbe')
    config=json.loads((OUT/'live.json').read_text())['widget_config'][0]
    engine=QQmlApplicationEngine();warnings=[]
    engine.warnings.connect(lambda values:warnings.extend(str(v) for v in values))
    if args.mode=='blank':
        engine.loadData(b'import QtQuick\nimport QtQuick.Controls\nApplicationWindow { visible:true; color:"transparent" }')
    else:
        engine.load(QUrl.fromLocalFile(str(CORE/'Preview.qml')))
    assert engine.rootObjects()
    root=engine.rootObjects()[0];root.setProperty('width',config['width']);root.setProperty('height',config['height'])
    if args.mode!='blank':
        prefs=root.findChild(QObject,'previewPreferences')
        for key in ('flowRefreshMs','audioRefreshMs','flowHistorySeconds','columns'):
            prefs.setProperty(key,int(config[key]))
        prefs.setProperty('enabledModules',','.join(config['modules']))
        enabled=config['cavaEnabled'];prefs.setProperty('cavaEnabled',enabled is True or str(enabled).lower()=='true')
        # One local synthetic ping target: do not copy private URLs or notes.
        if config['pingTargetCount']:
            prefs.setProperty('targetsText','Audit localhost | 127.0.0.1 | network-wireless')
    warmup=3 if args.mode=='blank' else 35;measurement=10 if args.mode=='blank' else 15
    def counters():
        data=Path('/proc/self/stat').read_text();v=data[data.rindex(')')+2:].split();hz=os.sysconf('SC_CLK_TCK')
        mem={}
        for line in Path('/proc/self/smaps_rollup').read_text().splitlines():
            p=line.split();key=p[0].rstrip(':')
            if key in ('Pss','Rss','Private_Dirty'):mem[key]=int(p[1])/1024
        return (int(v[11])+int(v[12]))/hz,mem
    first={}
    def start():
        first['cpu'],first['memory']=counters();first['time']=time.monotonic()
        QTimer.singleShot(measurement*1000,finish)
    def finish():
        cpu,mem=counters();duration=time.monotonic()-first['time']
        result={'cpu_percent_one_core':round((cpu-first['cpu'])/duration*100,2),'Pss_MiB_start':round(first['memory']['Pss'],2),'Pss_MiB_end':round(mem['Pss'],2),'RSS_MiB_end':round(mem['Rss'],2),'measurement_seconds':round(duration,2),'warnings':warnings}
        print(json.dumps(result),flush=True);app.quit()
    QTimer.singleShot(warmup*1000,start);app.exec()
    root.close();engine.deleteLater();app.processEvents()

#!/usr/bin/env python
"""Back up this widget's settings, then reload Plasma's cached desktop QML."""
import argparse
import datetime
import json
import os
from pathlib import Path
import subprocess


def evaluate(script):
    value = subprocess.run(['busctl', '--user', '--json=short', 'call', 'org.kde.plasmashell', '/PlasmaShell',
                            'org.kde.PlasmaShell', 'evaluateScript', 's', script],
                           check=True, capture_output=True, text=True, timeout=10).stdout.strip()
    envelope = json.loads(value)
    return json.loads(envelope['data'][0])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', type=Path, help='Safely upgrade this package while Plasma is stopped')
    parser.add_argument('--reveal-media-terminal', action='store_true',
                        help='Place media immediately after Terminal in existing instances')
    parser.add_argument('--reveal-power-timers', action='store_true',
                        help='Enable Battery and Timers in existing monitor instances')
    args = parser.parse_args()
    subprocess.run(['systemctl', '--user', 'is-active', '--quiet', 'plasma-plasmashell.service'], check=True)
    records = evaluate('''var rows=[];
        for(var d of desktops()) for(var w of d.widgets()) if(w.type==="local.monitor.dashboard") {
            w.currentConfigGroup=["General"]; var settings={};
            for(var key of w.configKeys) settings[key]=w.readConfig(key);
            rows.push({desktop:d.id,id:w.id,version:w.version,settings:settings,
                geometry:{x:w.geometry.x,y:w.geometry.y,width:w.geometry.width,height:w.geometry.height}});
        } print(JSON.stringify(rows));''')
    if not records and not args.package:
        print('No desktop someProducts-monitor instance to refresh.')
        return
    state = Path(os.environ.get('XDG_STATE_HOME', str(Path.home()/'.local/state')))/'monitor-dashboard'
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    backup = state/f'widget-refresh-{stamp}.json'
    descriptor = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as output:
        json.dump(records, output, indent=2)
    if args.reveal_media_terminal:
        evaluate('''var changed=[];
            for(var d of desktops()) for(var w of d.widgets()) if(w.type==="local.monitor.dashboard") {
                w.currentConfigGroup=["General"];
                var order=w.readConfig("moduleOrder","cpu,ram,ping,gpu,media,note,proton,wifi,bluetooth,terminal").split(",");
                var at=order.indexOf("terminal");
                if(at>=0) { order=order.filter(key=>key!=="media");
                    order.splice(order.indexOf("terminal")+1,0,"media");
                    w.writeConfig("moduleOrder",order.join(",")); }
                changed.push(w.id);
            } print(JSON.stringify(changed));''')
    if args.reveal_power_timers:
        evaluate('''var changed=[];
            for(var d of desktops()) for(var w of d.widgets()) if(w.type==="local.monitor.dashboard") {
                w.currentConfigGroup=["General"];
                var enabled=w.readConfig("enabledModules","cpu,ram,ping,gpu,media,note,proton,wifi,bluetooth,terminal").split(",");
                for(var key of ["battery","timers"]) if(enabled.indexOf(key)<0) enabled.push(key);
                w.writeConfig("enabledModules",enabled.join(",")); changed.push(w.id);
            } print(JSON.stringify(changed));''')
    if args.package:
        # Replacing a mapped native .so while Plasma is running can crash it.
        subprocess.run(['systemctl', '--user', 'stop', 'plasma-plasmashell.service'], check=True)
        try:
            subprocess.run(['kpackagetool6', '--type', 'Plasma/Applet', '--upgrade', str(args.package.resolve())], check=True)
        finally:
            subprocess.run(['systemctl', '--user', 'start', 'plasma-plasmashell.service'], check=True)
    else:
        subprocess.run(['systemctl', '--user', 'restart', 'plasma-plasmashell.service'], check=True)
    print(f'Reloaded Plasma for {len(records)} monitor instance(s). Private settings backup: {backup}')


if __name__ == '__main__':
    main()

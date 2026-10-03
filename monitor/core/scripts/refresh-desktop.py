#!/usr/bin/env python
"""Back up this widget's settings, then reload Plasma's cached desktop QML."""
import argparse
import datetime
import json
import os
from pathlib import Path
import subprocess


def evaluate(script):
    value = subprocess.run(['busctl', '--user', 'call', 'org.kde.plasmashell', '/PlasmaShell',
                            'org.kde.PlasmaShell', 'evaluateScript', 's', script],
                           check=True, capture_output=True, text=True, timeout=10).stdout.strip()
    return json.loads(json.loads(value.removeprefix('s ')))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reveal-media-terminal', action='store_true',
                        help='Place media immediately after Terminal in existing instances')
    args = parser.parse_args()
    subprocess.run(['systemctl', '--user', 'is-active', '--quiet', 'plasma-plasmashell.service'], check=True)
    records = evaluate('''var rows=[];
        for(var d of desktops()) for(var w of d.widgets()) if(w.type==="local.monitor.dashboard") {
            w.currentConfigGroup=["General"]; var settings={};
            for(var key of w.configKeys) settings[key]=w.readConfig(key);
            rows.push({desktop:d.id,id:w.id,version:w.version,settings:settings,
                geometry:{x:w.geometry.x,y:w.geometry.y,width:w.geometry.width,height:w.geometry.height}});
        } print(JSON.stringify(rows));''')
    if not records:
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
    subprocess.run(['systemctl', '--user', 'restart', 'plasma-plasmashell.service'], check=True)
    print(f'Reloaded Plasma for {len(records)} monitor instance(s). Private settings backup: {backup}')


if __name__ == '__main__':
    main()

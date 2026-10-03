"""Read-only connectivity adapted from monitor/core; see ../LICENSE."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import threading
import time



def run(args):
    return subprocess.run(args,capture_output=True,text=True,timeout=3,check=True,
                          env={**os.environ,'LC_ALL':'C'}).stdout.strip()


def unbox(value):
    if isinstance(value,dict):
        if 'type' in value and 'data' in value:
            return unbox(value['data'])
        return {key:unbox(item) for key,item in value.items()}
    if isinstance(value,list):
        return [unbox(item) for item in value]
    return value


def dbus(*args):
    value = unbox(json.loads(run(['busctl','--system','--json=short','--timeout=1',*args])))
    return value[0] if isinstance(value,list) and len(value) == 1 else value


def split_nmcli(line):
    """NetworkManager's terse format escapes both colons and backslashes."""
    parts = []
    text = ''
    escaped = False
    for character in line:
        if escaped:
            text += character
            escaped = False
        elif character == '\\':
            escaped = True
        elif character == ':':
            parts.append(text); text = ''
        else:
            text += character
    parts.append(text)
    return parts


def parse_active(text):
    vpn = None
    wifi = None
    for line in text.splitlines():
        fields = split_nmcli(line)
        if len(fields) < 4:
            continue
        name, uuid, kind, device = fields[:4]
        if kind in ('vpn','wireguard') and name.lower().startswith('protonvpn'):
            vpn = {'connected':True,'server':name.removeprefix('ProtonVPN ').strip()}
        elif kind == '802-11-wireless':
            wifi = {'connected':True,'network':name,'device':device}
    return vpn or {'connected':False,'server':''}, wifi or {'connected':False,'network':''}


def proton_settings():
    path = Path(os.environ.get('XDG_CONFIG_HOME', str(Path.home()/'.config'))) / 'Proton/VPN/settings.json'
    try:
        if path.stat().st_size > 100_000:
            return None
        data = json.loads(path.read_text())
        value = data.get('killswitch')
        return {0:'Off',1:'Standard',2:'Advanced'}.get(value)
    except (OSError,ValueError,AttributeError):
        return None


def network_state():
    proton = {'connected':None,'server':'','kill_switch':proton_settings(),
              'can_open':bool(shutil.which('protonvpn-app'))}
    wifi = {'enabled':None,'connected':None,'network':'','can_open':bool(shutil.which('kcmshell6'))}
    try:
        active = run(['nmcli','-t','-f','NAME,UUID,TYPE,DEVICE','connection','show','--active'])
        vpn, wireless = parse_active(active)
        proton.update(vpn)
        wifi.update(wireless)
        wifi['enabled'] = dbus('get-property','org.freedesktop.NetworkManager','/org/freedesktop/NetworkManager',
                               'org.freedesktop.NetworkManager','WirelessEnabled')
    except (OSError,subprocess.SubprocessError,ValueError,TypeError):
        pass
    return proton,wifi


def parse_bluetooth(objects):
    adapters = []
    connected = []
    for path,interfaces in objects.items():
        if 'org.bluez.Adapter1' in interfaces:
            props = interfaces['org.bluez.Adapter1']
            adapters.append({'name':props.get('Alias') or 'Bluetooth','enabled':bool(props.get('Powered'))})
        if 'org.bluez.Device1' in interfaces:
            props = interfaces['org.bluez.Device1']
            if props.get('Connected'):
                connected.append(props.get('Alias') or props.get('Name') or 'Connected device')
    return {'enabled': any(a['enabled'] for a in adapters) if adapters else None,
            'adapters':len(adapters),'devices':connected}


def bluetooth_state():
    result = {'enabled':None,'adapters':0,'devices':[], 'can_open':bool(shutil.which('kcmshell6'))}
    try:
        result.update(parse_bluetooth(dbus('call','org.bluez','/','org.freedesktop.DBus.ObjectManager','GetManagedObjects')))
    except (OSError,subprocess.SubprocessError,ValueError,TypeError,AttributeError):
        pass
    return result


class ConnectivityCollector:
    def __init__(self):
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.snapshot = {'proton':{},'wifi':{},'bluetooth':{},'checked_at':None,'stale':True}
        self.thread = threading.Thread(target=self.collect,daemon=True,name='connectivity')

    def collect(self):
        while not self.stop.is_set():
            started = time.monotonic()
            proton,wifi = network_state()
            bluetooth = bluetooth_state()
            with self.lock:
                self.snapshot = {'proton':proton,'wifi':wifi,'bluetooth':bluetooth,'checked_at':time.time(),'stale':False}
            self.stop.wait(max(1,5-(time.monotonic()-started)))

    def get(self):
        with self.lock:
            value = json.loads(json.dumps(self.snapshot))
        value['stale'] = not value['checked_at'] or time.time()-value['checked_at'] > 20
        return value

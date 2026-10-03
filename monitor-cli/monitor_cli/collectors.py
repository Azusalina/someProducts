"""Linux telemetry adapted from monitor/core; see ../LICENSE."""
from __future__ import annotations
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
from urllib.parse import urlsplit

MPRIS = 'org.mpris.MediaPlayer2'
PLAYER = MPRIS + '.Player'
OBJECT = '/org/mpris/MediaPlayer2'


def read(path: Path) -> str:
    try:
        return path.read_text().strip()
    except (OSError, UnicodeError):
        return ''


def command(args, timeout=2):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout,
                          check=True, env={**os.environ, 'LC_ALL': 'C'}).stdout.strip()


def unbox(value):
    if isinstance(value, dict):
        if 'type' in value and 'data' in value:
            return unbox(value['data'])
        return {key: unbox(item) for key, item in value.items()}
    if isinstance(value, list):
        return [unbox(item) for item in value]
    return value


def bus(*args):
    value = unbox(json.loads(command(['busctl', '--user', '--json=short', '--timeout=1', *args])))
    return value[0] if isinstance(value, list) and len(value) == 1 else value


def player_names():
    names = bus('call', 'org.freedesktop.DBus', '/org/freedesktop/DBus',
                'org.freedesktop.DBus', 'ListNames')
    return sorted(name for name in names if name.startswith(MPRIS + '.'))


def media_snapshot():
    players = []
    try:
        for name in player_names()[:12]:
            try:
                props = bus('call', name, OBJECT, 'org.freedesktop.DBus.Properties',
                            'GetAll', 's', PLAYER)
                meta = props.get('Metadata', {})
                def number(value, default=None):
                    if isinstance(value, bool):
                        return default
                    try:
                        value = float(value)
                        return value if math.isfinite(value) and value >= 0 else default
                    except (TypeError, ValueError):
                        return default
                duration = number(meta.get('mpris:length'))
                position = number(props.get('Position'))
                artists = meta.get('xesam:artist', [])
                players.append({'service': name, 'name': name.split('.')[3],
                                'title': str(meta.get('xesam:title', '')),
                                'artist': ', '.join(str(a) for a in artists) if isinstance(artists, list) else str(artists),
                                'duration': duration / 1_000_000 if duration and duration > 0 else None,
                                'position': position / 1_000_000 if position is not None else None,
                                'rate': number(props.get('Rate'), 1),
                                'observed_at': time.time(),
                                'status': props.get('PlaybackStatus', 'Stopped'),
                                'can_control': bool(props.get('CanControl', False)),
                                'can_pause': bool(props.get('CanPause', False)),
                                'can_play': bool(props.get('CanPlay', False))})
            except (OSError, subprocess.SubprocessError, ValueError, TypeError, AttributeError):
                continue
        players.sort(key=lambda p: {'Playing': 0, 'Paused': 1}.get(p['status'], 2))
        return {'players': players, 'error': None}
    except (OSError, subprocess.SubprocessError, ValueError, TypeError):
        return {'players': [], 'error': 'Session media bus unavailable'}


def toggle_media(service):
    """Re-check the live player and capabilities before issuing PlayPause."""
    if service not in player_names():
        raise ValueError('Selected media player is no longer available')
    props = bus('call', service, OBJECT, 'org.freedesktop.DBus.Properties', 'GetAll', 's', PLAYER)
    capability = 'CanPause' if props.get('PlaybackStatus') == 'Playing' else 'CanPlay'
    if not props.get('CanControl') or not props.get(capability):
        raise ValueError('Selected media player does not allow this action')
    command(['busctl', '--user', '--timeout=1', 'call', service, OBJECT, PLAYER, 'PlayPause'])


def normalize_host(target):
    target = target.strip()
    if not target or len(target) > 2048 or any(c.isspace() for c in target):
        raise ValueError('Enter a URL or hostname')
    parsed = urlsplit(target if '://' in target else '//' + target)
    if parsed.scheme and parsed.scheme not in ('http', 'https'):
        raise ValueError('Use http(s) or a hostname')
    if parsed.username or parsed.password or not parsed.hostname:
        raise ValueError('Invalid host')
    host = parsed.hostname.encode('idna').decode('ascii')
    if host.startswith('-') or not re.fullmatch(r'[A-Za-z0-9.:_-]+', host):
        raise ValueError('Invalid host')
    return host


def ping_target(target):
    try:
        host = normalize_host(target)
        result = command(['ping', '-n', '-c', '1', '-W', '2', '--', host], timeout=3)
        match = re.search(r'time([=<])([\d.]+)\s*ms', result)
        if not match:
            raise ValueError('No latency returned')
        return {'host': host, 'ms': float(match[2]), 'less_than': match[1] == '<',
                'status': 'reachable', 'checked_at': time.time()}
    except ValueError as error:
        return {'ms': None, 'status': str(error), 'checked_at': time.time()}
    except FileNotFoundError:
        return {'ms': None, 'status': 'Install iputils', 'checked_at': time.time()}
    except (OSError, subprocess.SubprocessError):
        return {'ms': None, 'status': 'No ICMP reply', 'checked_at': time.time()}


class Cpu:
    def __init__(self):
        self.previous = None

    def sample(self):
        values = list(map(int, read(Path('/proc/stat')).splitlines()[0].split()[1:9]))
        total, idle = sum(values), values[3] + values[4]
        percent = None
        if self.previous:
            dt, di = total - self.previous[0], idle - self.previous[1]
            if dt > 0:
                percent = round(max(0, min(100, 100 * (dt - di) / dt)), 1)
        self.previous = total, idle
        temps = []
        for hw in Path('/sys/class/hwmon').glob('hwmon*'):
            if read(hw / 'name') in ('coretemp', 'k10temp', 'zenpower'):
                for sensor in hw.glob('temp*_input'):
                    try:
                        temps.append(int(read(sensor)) / 1000)
                    except ValueError:
                        pass
        return {'percent': percent, 'cores': os.cpu_count(),
                'temperature': max(temps) if temps else None}


def memory_snapshot():
    mem = {line.split(':')[0]: int(line.split()[1]) * 1024
           for line in read(Path('/proc/meminfo')).splitlines()}
    total = mem['MemTotal']
    used = total - mem.get('MemAvailable', mem.get('MemFree', 0))
    return {'percent': round(used / total * 100, 1), 'used': used, 'total': total,
            'swap_used': mem.get('SwapTotal', 0) - mem.get('SwapFree', 0)}


class Gpu:
    def __init__(self):
        self.previous = {}
        self.last_time = None
        self.nvidia = bool(shutil.which('nvidia-smi'))

    def clients(self):
        clients = {}
        for proc in Path('/proc').iterdir():
            if not proc.name.isdigit():
                continue
            try:
                if proc.stat().st_uid != os.getuid():
                    continue
                for fd in (proc / 'fdinfo').iterdir():
                    text = read(fd)
                    if 'drm-client-id:' not in text:
                        continue
                    fields = dict(line.split(':', 1) for line in text.splitlines() if ':' in line)
                    device = fields.get('drm-pdev', '').strip()
                    client = fields.get('drm-client-id', '').strip()
                    engines = {key.removeprefix('drm-engine-'): int(value.split()[0])
                               for key, value in fields.items() if key.startswith('drm-engine-')}
                    clients[(device, client)] = engines
            except (OSError, ValueError):
                continue
        return clients

    def sample(self):
        result = []
        nvidia_ids = set()
        if self.nvidia:
            try:
                rows = command(['nvidia-smi', '--query-gpu=pci.bus_id,name,utilization.gpu,memory.used,memory.total,temperature.gpu',
                                '--format=csv,noheader,nounits'])
                for row in rows.splitlines():
                    pci, name, load, used, total, temp = [v.strip() for v in row.split(',')]
                    def number(v):
                        try:
                            value = float(v)
                            return value if math.isfinite(value) and value >= 0 else None
                        except ValueError:
                            return None
                    result.append({'name': name, 'percent': number(load),
                                   'memory_used_mib': number(used), 'memory_total_mib': number(total),
                                   'temperature': number(temp), 'scope': 'Device utilization'})
                    nvidia_ids.add(pci.lower()[-12:])
            except (OSError, subprocess.SubprocessError, ValueError):
                pass
        now = time.monotonic()
        clients = self.clients()
        elapsed = (now - self.last_time) * 1e9 if self.last_time else None
        for card in sorted(Path('/sys/class/drm').glob('card[0-9]*')):
            if not re.fullmatch(r'card\d+', card.name):
                continue
            device = card / 'device'
            pci = device.resolve().name
            if pci.lower() in nvidia_ids:
                continue
            driver = (device / 'driver').resolve().name
            if not (device / 'driver').exists():
                continue
            name = {'i915': 'Intel Graphics', 'xe': 'Intel Graphics',
                    'amdgpu': 'AMD Graphics', 'nouveau': 'NVIDIA Graphics'}.get(driver, driver)
            percent = None
            scope = 'Utilization unavailable'
            busy = read(device / 'gpu_busy_percent')
            if busy.isdigit():
                percent, scope = float(busy), 'Device utilization'
            elif driver in ('i915', 'xe'):
                engines = {}
                matched = False
                for key, current in clients.items():
                    if key[0] != pci:
                        continue
                    matched = True
                    for engine, value in current.items():
                        previous = self.previous.get(key, {}).get(engine)
                        if previous is not None and elapsed:
                            engines[engine] = engines.get(engine, 0) + max(0, value - previous) / elapsed * 100
                if engines:
                    percent = round(min(100, max(engines.values())), 1)
                scope = 'User-session engines' if matched else 'Engine counters unavailable'
            temps = [read(path) for path in device.glob('hwmon/hwmon*/temp1_input')]
            temp = next((int(t) / 1000 for t in temps if t.isdigit()), None)
            def mib(filename):
                value = read(device / filename)
                return round(int(value) / 1048576) if value.isdigit() else None
            result.append({'name': name, 'percent': percent, 'scope': scope,
                           'temperature': temp, 'memory_used_mib': mib('mem_info_vram_used'),
                           'memory_total_mib': mib('mem_info_vram_total')})
        self.previous, self.last_time = clients, now
        return result

#!/usr/bin/env python3
"""Local, unprivileged telemetry bridge for the Monitor Plasma widget."""
from __future__ import annotations
import argparse
from collections import OrderedDict
import copy
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import threading
import time
from urllib.parse import parse_qs, urlsplit

from connectivity import ConnectivityCollector, open_settings
from cava_audio import AudioCollector
from terminal_sessions import TerminalManager
from power import PowerCollector
from timers import TimerManager

MPRIS = 'org.mpris.MediaPlayer2'
PLAYER = MPRIS + '.Player'
OBJECT = '/org/mpris/MediaPlayer2'
SAMPLE_INTERVAL = 0.5


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
                players.append({'service': name, 'name': name.split('.')[3],
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
                            return float(v)
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


class Telemetry:
    def __init__(self):
        self.lock = threading.RLock()
        self.connectivity = ConnectivityCollector()
        self.audio = AudioCollector()
        self.terminals = TerminalManager()
        self.power = PowerCollector()
        self.timers = TimerManager()
        self.snapshot = {'cpu': {}, 'ram': {}, 'gpus': [], 'media': {'players': []}}
        self.pings = OrderedDict()
        self.pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix='ping')
        self.stop = threading.Event()
        self.thread = threading.Thread(target=self.collect, daemon=True)
        self.media_thread = threading.Thread(target=self.collect_media, daemon=True)
        self.ping_thread = threading.Thread(target=self.collect_pings, daemon=True)

    def collect(self):
        cpu, gpu = Cpu(), Gpu()
        while not self.stop.is_set():
            started = time.monotonic()
            try:
                snapshot = {'cpu': cpu.sample(), 'ram': memory_snapshot(),
                            'gpus': gpu.sample(), 'sampled_at': time.time()}
                with self.lock:
                    snapshot['media'] = self.snapshot.get('media', {'players': []})
                    self.snapshot = snapshot
            except (OSError, ValueError, IndexError) as error:
                with self.lock:
                    self.snapshot['error'] = str(error)
            self.stop.wait(max(0.01, SAMPLE_INTERVAL - (time.monotonic() - started)))

    def collect_media(self):
        # Session-bus timeouts must not stall the faster system-stat samples.
        while not self.stop.is_set():
            started = time.monotonic()
            value = media_snapshot()
            with self.lock:
                self.snapshot['media'] = value
            self.stop.wait(max(0.1, 2 - (time.monotonic() - started)))

    def get(self, targets):
        with self.lock:
            snapshot = copy.deepcopy(self.snapshot)
            now = time.monotonic()
            values = []
            for target in targets[:8]:
                if not isinstance(target, str) or len(target) > 2048:
                    continue
                entry = self.pings.get(target)
                if entry is None:
                    if len(self.pings) >= 32:
                        self.pings.popitem(last=False)
                    entry = {'value': {'ms': None, 'status': 'Checking…'}, 'time': 0, 'pending': False}
                    self.pings[target] = entry
                self.pings.move_to_end(target)
                entry['requested'] = now
                if not entry['pending'] and now - entry['time'] >= SAMPLE_INTERVAL:
                    self.start_ping(target, entry, now)
                values.append({'target': target, **entry['value']})
            snapshot['pings'] = values
            snapshot['connectivity'] = self.connectivity.get()
            snapshot['power'] = self.power.get()
            return snapshot

    def start_ping(self, target, entry, now):
        entry['pending'] = True
        entry['time'] = now
        self.pool.submit(self.update_ping, target, entry)

    def collect_pings(self):
        # Probe cadence is independent of the widget poll's timing/phase.
        while not self.stop.is_set():
            now = time.monotonic()
            with self.lock:
                for target, entry in self.pings.items():
                    if now - entry.get('requested', 0) <= 2 and not entry['pending'] and now - entry['time'] >= SAMPLE_INTERVAL:
                        self.start_ping(target, entry, now)
            self.stop.wait(0.025)

    def update_ping(self, target, entry):
        value = ping_target(target)
        with self.lock:
            entry.update(value=value, pending=False)


class Handler(BaseHTTPRequestHandler):
    server_version = 'Monitor/1.0'

    def log_message(self, *args):
        pass

    def reply(self, code, value):
        payload = json.dumps(value, allow_nan=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def allowed(self):
        # QML sends no Origin. Reject browser origins and DNS-rebinding hostnames.
        return (not self.headers.get('Origin') and
                self.headers.get('Host') == f'127.0.0.1:{self.server.server_port}' and
                self.headers.get('X-Monitor-Client') == 'plasma-widget')

    def do_GET(self):
        if not self.allowed():
            self.reply(403, {'error': 'Native local client required'})
            return
        parsed = urlsplit(self.path)
        if parsed.path == '/timers/state':
            try:
                self.reply(200, self.server.telemetry.timers.state(parse_qs(parsed.query).get('session', [''])[0]))
            except KeyError:
                self.reply(410, {'error': 'Timer session ended'})
            return
        if parsed.path == '/audio':
            self.reply(200, self.server.telemetry.audio.get())
            return
        if parsed.path == '/terminal/screen':
            try:
                query = parse_qs(parsed.query)
                session = self.server.telemetry.terminals.session(query.get('session', [''])[0])
                revision = int(query.get('revision', ['-1'])[0])
                self.reply(200, session.get(revision))
            except (ValueError, TypeError):
                self.reply(400, {'error': 'Invalid terminal request'})
            except KeyError:
                self.reply(410, {'error': 'Terminal session ended'})
            return
        if parsed.path != '/snapshot':
            self.reply(404, {'error': 'Not found'})
            return
        try:
            targets = json.loads(parse_qs(parsed.query).get('targets', ['[]'])[0])
            if not isinstance(targets, list) or len(targets) > 8:
                raise ValueError('Use at most eight targets')
            self.reply(200, self.server.telemetry.get(targets))
        except (ValueError, TypeError):
            self.reply(400, {'error': 'Invalid targets'})

    def do_POST(self):
        if not self.allowed():
            self.reply(403, {'error': 'Native local client required'})
            return
        if self.path.startswith(('/power/', '/timers/')):
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 2048:
                    raise ValueError('Invalid payload size')
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict):
                    raise ValueError('Invalid payload')
                telemetry = self.server.telemetry
                if self.path == '/power/profile':
                    value = telemetry.power.set_profile(payload.get('profile'))
                elif self.path == '/power/awake':
                    value = telemetry.power.awake.control(payload.get('action'), payload.get('token'))
                elif self.path == '/timers/create':
                    value = telemetry.timers.create(payload.get('duration'), payload.get('offset'))
                elif self.path == '/timers/control':
                    value = telemetry.timers.control(payload.get('session'), payload.get('kind'), payload.get('action'), payload.get('seconds'))
                elif self.path == '/timers/close':
                    telemetry.timers.close(payload.get('session'))
                    value = {'ok': True}
                else:
                    self.reply(404, {'error': 'Not found'})
                    return
                self.reply(200, value)
            except (ValueError, TypeError):
                self.reply(400, {'error': 'Invalid power or timer request'})
            except KeyError:
                self.reply(410, {'error': 'Session expired'})
            except (OSError, RuntimeError, subprocess.SubprocessError):
                self.reply(503, {'error': 'Power control unavailable or permission denied'})
            return
        if self.path.startswith('/terminal/'):
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 65536:
                    raise ValueError('Invalid payload size')
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict):
                    raise ValueError('Invalid terminal payload')
                manager = self.server.telemetry.terminals
                if self.path == '/terminal/start':
                    self.reply(200, manager.create(payload.get('columns'), payload.get('rows')))
                    return
                token = payload.get('session')
                session = manager.session(token)
                if self.path == '/terminal/input':
                    session.input(payload.get('text'), payload.get('paste') is True)
                elif self.path == '/terminal/resize':
                    session.resize(payload.get('columns'), payload.get('rows'))
                elif self.path == '/terminal/scroll':
                    session.scroll(payload.get('direction'))
                elif self.path == '/terminal/close':
                    manager.close(token)
                else:
                    self.reply(404, {'error': 'Not found'})
                    return
                self.reply(200, {'ok': True})
            except (ValueError, TypeError):
                self.reply(400, {'error': 'Invalid terminal request'})
            except KeyError:
                self.reply(410, {'error': 'Terminal session ended'})
            except (OSError, RuntimeError):
                self.reply(503, {'error': 'Terminal could not be opened'})
            return
        if self.path == '/settings/open':
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 1024:
                    raise ValueError('Invalid payload size')
                target = json.loads(self.rfile.read(length)).get('target')
                open_settings(target)
                self.reply(200, {'ok': True})
            except (ValueError, TypeError, AttributeError):
                self.reply(400, {'error': 'Invalid settings target'})
            except (OSError, RuntimeError):
                self.reply(503, {'error': 'Native settings could not be opened'})
            return
        if self.path != '/media/toggle':
            self.reply(404, {'error': 'Not found'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 4096:
                raise ValueError('Invalid payload size')
            value = json.loads(self.rfile.read(length))
            service = value.get('service', '')
            if service not in player_names():
                self.reply(409, {'error': 'Player is no longer available'})
                return
            props = bus('call', service, OBJECT, 'org.freedesktop.DBus.Properties', 'GetAll', 's', PLAYER)
            capability = 'CanPause' if props.get('PlaybackStatus') == 'Playing' else 'CanPlay'
            if not props.get('CanControl') or not props.get(capability):
                self.reply(409, {'error': 'Player does not allow this control'})
                return
            command(['busctl', '--user', '--timeout=1', 'call', service, OBJECT, PLAYER, 'PlayPause'])
            self.reply(200, {'ok': True})
        except (ValueError, TypeError, AttributeError):
            self.reply(400, {'error': 'Invalid payload'})
        except (OSError, subprocess.SubprocessError):
            self.reply(503, {'error': 'Media player did not respond'})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=17341)
    args = parser.parse_args()
    telemetry = Telemetry()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    server.daemon_threads = True
    server.telemetry = telemetry
    telemetry.thread.start()
    telemetry.media_thread.start()
    telemetry.ping_thread.start()
    telemetry.connectivity.thread.start()
    telemetry.audio.thread.start()
    telemetry.power.thread.start()
    telemetry.terminals.thread.start()
    def stop_requested(*_):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, stop_requested)
    print(f'Monitor bridge listening on 127.0.0.1:{args.port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        telemetry.stop.set()
        telemetry.connectivity.stop.set()
        telemetry.audio.stop.set()
        telemetry.terminals.shutdown()
        telemetry.power.stop.set()
        telemetry.power.thread.join(timeout=3)
        telemetry.power.awake.shutdown()
        telemetry.ping_thread.join(timeout=1)
        server.server_close()
        telemetry.pool.shutdown(wait=False, cancel_futures=True)


if __name__ == '__main__':
    main()

"""UPower battery, power profiles and per-widget, expiring keep-awake leases."""
import copy
import math
from pathlib import Path
import secrets
import select
import subprocess
import sys
import threading
import time
from connectivity import dbus, run

PROFILE_SERVICE = 'org.freedesktop.UPower.PowerProfiles'
PROFILE_PATH = '/org/freedesktop/UPower/PowerProfiles'
PROFILES = ('power-saver', 'balanced', 'performance')


def number(value, maximum=None):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(value) or value < 0 or (maximum is not None and value > maximum):
        return None
    return value


def battery_reading(props):
    present = props.get('IsPresent') is True and props.get('Type') == 2
    state = props.get('State')
    seconds = props.get('TimeToFull') if state in (1, 5) else props.get('TimeToEmpty')
    return {'present': present,
            'percent': number(props.get('Percentage'), 100) if present else None,
            'watts': number(props.get('EnergyRate')) if present else None,
            'state': {1: 'Charging', 2: 'Discharging', 3: 'Empty', 4: 'Full',
                      5: 'Pending charge', 6: 'Pending discharge'}.get(state, 'Unknown') if present else 'No battery',
            'remaining_seconds': number(seconds) if present and number(seconds) else None}


class AwakeManager:
    TTL = 10
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.lock = threading.RLock()
        self.leases = {}
        self.process = None

    def _stop(self):
        if self.process is not None:
            if self.process.poll() is None:
                self.process.terminate()
                try:
                    self.process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    self.process.wait(timeout=1)
            self.process.stdout.close()
            self.process.stdin.close()
            self.process = None

    def _sweep(self):
        now = self.clock()
        self.leases = {key: seen for key, seen in self.leases.items() if now - seen < self.TTL}
        if self.process is not None and self.process.poll() is not None:
            self.leases.clear()
        if not self.leases:
            self._stop()

    def sweep(self):
        with self.lock:
            self._sweep()

    def control(self, action, token=None):
        with self.lock:
            self._sweep()
            if action == 'enable':
                if len(self.leases) >= 16:
                    raise ValueError('Too many keep-awake owners')
                if self.process is None:
                    self.process = subprocess.Popen([sys.executable, str(Path(__file__).with_name('awake_helper.py'))],
                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
                    ready, _, _ = select.select([self.process.stdout], [], [], 10)
                    if not ready or self.process.stdout.readline(32).strip() != b'ready':
                        self._stop()
                        raise RuntimeError('Plasma keep-awake unavailable')
                token = secrets.token_urlsafe(24)
                self.leases[token] = self.clock()
                return {'token': token, 'active': True}
            if action not in ('heartbeat', 'disable'):
                raise ValueError('Unknown keep-awake action')
            if not isinstance(token, str) or token not in self.leases:
                raise KeyError('Keep-awake lease expired')
            if action == 'disable':
                del self.leases[token]
                self._sweep()
                return {'active': False}
            self.leases[token] = self.clock()
            return {'token': token, 'active': True}

    def shutdown(self):
        with self.lock:
            self.leases.clear()
            self._stop()


class PowerCollector:
    def __init__(self):
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.awake = AwakeManager()
        self.snapshot = {'battery': {}, 'profiles': [], 'profile': None, 'stale': True}
        self.thread = threading.Thread(target=self.collect, daemon=True, name='power')

    def collect(self):
        while not self.stop.is_set():
            self.awake.sweep()
            value = {'battery': {}, 'profiles': [], 'profile': None, 'stale': False, 'checked_at': time.time()}
            try:
                props = dbus('call', 'org.freedesktop.UPower', '/org/freedesktop/UPower/devices/DisplayDevice',
                    'org.freedesktop.DBus.Properties', 'GetAll', 's', 'org.freedesktop.UPower.Device')
                value['battery'] = battery_reading(props)
            except (OSError, subprocess.SubprocessError, ValueError, TypeError, AttributeError):
                value['battery'] = {'present': False, 'state': 'Battery unavailable'}
            try:
                props = dbus('call', PROFILE_SERVICE, PROFILE_PATH, 'org.freedesktop.DBus.Properties', 'GetAll', 's', PROFILE_SERVICE)
                value['profiles'] = [p['Profile'] for p in props.get('Profiles', []) if p.get('Profile') in PROFILES]
                value['profile'] = props.get('ActiveProfile') if props.get('ActiveProfile') in value['profiles'] else None
                value['degraded'] = str(props.get('PerformanceDegraded', ''))[:160]
            except (OSError, subprocess.SubprocessError, ValueError, TypeError, AttributeError):
                pass
            with self.lock:
                self.snapshot = value
            self.stop.wait(2)
        self.awake.shutdown()

    def get(self):
        with self.lock:
            value = copy.deepcopy(self.snapshot)
        value['stale'] = not value.get('checked_at') or time.time() - value['checked_at'] > 10
        return value

    def set_profile(self, profile):
        if profile not in PROFILES or profile not in self.get()['profiles']:
            raise ValueError('Power profile unavailable')
        run(['busctl', '--system', '--timeout=2', 'set-property', PROFILE_SERVICE, PROFILE_PATH,
             PROFILE_SERVICE, 'ActiveProfile', 's', profile])
        # Confirm the daemon accepted it. Do not optimistically change the UI.
        active = dbus('get-property', PROFILE_SERVICE, PROFILE_PATH, PROFILE_SERVICE, 'ActiveProfile')
        if active != profile:
            raise RuntimeError('Power profile did not change')
        with self.lock:
            self.snapshot['profile'] = active
        return {'profile': active}

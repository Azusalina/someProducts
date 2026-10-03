"""Subscription quota readers. No inference calls, credential extraction, or resets."""
from __future__ import annotations
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import selectors
import shutil
import subprocess
import threading
import time


def state_dir():
    return Path(os.environ.get('XDG_STATE_HOME', str(Path.home() / '.local/state'))) / 'monitor-dashboard'


def numeric(value):
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None


def quota(label, used, reset, observed, now=None):
    now = time.time() if now is None else now
    used = numeric(used)
    reset = numeric(reset)
    if used is not None and not 0 <= used <= 100:
        used = None
    expired = reset is not None and reset <= now
    stale = now - observed > 300 or observed > now + 60
    return {'label': label, 'used_percent': used,
            'remaining_percent': None if expired or stale or used is None else round(100 - used, 1),
            'resets_at': reset, 'expired': expired, 'stale': stale}


def parse_codex(data, observed, now=None):
    buckets = data.get('rateLimitsByLimitId') or {'codex': data.get('rateLimits') or {}}
    windows = []
    for key, bucket in buckets.items():
        for field in ('primary', 'secondary', 'individualLimit'):
            window = bucket.get(field)
            if not isinstance(window, dict):
                continue
            minutes = numeric(window.get('windowDurationMins'))
            label = '5h' if minutes == 300 else '7d' if minutes == 10080 else f'{minutes:g}m' if minutes else field.title()
            if key != 'codex':
                label = str(bucket.get('limitName') or key) + ' · ' + label
            windows.append(quota(label, window.get('usedPercent'), window.get('resetsAt'), observed, now))
    resets = data.get('rateLimitResetCredits') or {}
    # Only expose display fields, never account IDs, auth tokens or redemption IDs.
    expirations = [numeric(row.get('expiresAt')) for row in (resets.get('credits') or []) if row.get('status') == 'available']
    return {'name': 'Codex', 'source': 'Account · online', 'observed_at': observed,
            'windows': windows, 'available_resets': resets.get('availableCount'),
            'reset_expirations': sorted(value for value in expirations if value is not None),
            'message': '' if windows else 'No subscription quota returned'}


def read_codex(timeout=15):
    executable = shutil.which('codex')
    if not executable:
        # GUI/user-systemd PATH need not include the interactive shell's local bin.
        fallback = Path.home() / '.local/bin/codex'
        executable = str(fallback) if fallback.is_file() else None
    if not executable:
        raise RuntimeError('Install Codex CLI and sign in with ChatGPT')
    process = subprocess.Popen([executable, 'app-server', '--stdio'], stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ)
    deadline = time.monotonic() + timeout
    buffer = b''

    def send(value):
        process.stdin.write((json.dumps(value) + '\n').encode())
        process.stdin.flush()

    def response(request_id):
        nonlocal buffer
        while time.monotonic() < deadline:
            while b'\n' in buffer:
                line, buffer = buffer.split(b'\n', 1)
                try:
                    value = json.loads(line)
                except ValueError:
                    continue
                if value.get('id') == request_id:
                    if 'error' in value:
                        # Server errors can contain account details; do not expose the raw text.
                        raise RuntimeError('Codex account read failed · check CLI sign-in')
                    return value.get('result') or {}
            if not selector.select(max(0, deadline - time.monotonic())):
                break
            chunk = os.read(process.stdout.fileno(), 65536)
            if not chunk:
                break
            buffer += chunk
            if len(buffer) > 2_000_000:
                raise RuntimeError('Unexpected Codex response size')
        raise RuntimeError('Codex account read timed out')

    try:
        send({'id': 1, 'method': 'initialize', 'params': {'clientInfo': {'name': 'monitor_dashboard', 'version': '1.1.0'}}})
        response(1)
        send({'method': 'initialized'})
        send({'id': 2, 'method': 'account/rateLimits/read'})
        return parse_codex(response(2), time.time())
    finally:
        selector.close()
        if process.poll() is None:
            process.terminate()
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        process.stdin.close()
        process.stdout.close()


def parse_claude(data, observed, now=None):
    rates = data.get('rate_limits') or {}
    windows = []
    for key, label in [('five_hour', '5h'), ('seven_day', '7d')]:
        window = rates.get(key)
        if isinstance(window, dict):
            windows.append(quota(label, window.get('used_percentage'), window.get('resets_at'), observed, now))
    return {'name': 'Claude Code', 'source': 'Claude Code · local status', 'observed_at': observed,
            'windows': windows, 'available_resets': None,
            'message': '' if windows else 'Waiting for subscription status · open Claude Code'}


def read_claude():
    path = state_dir() / 'claude-usage.json'
    try:
        if path.stat().st_size > 100_000:
            raise ValueError('Status too large')
        payload = json.loads(path.read_text())
        observed = numeric(payload.get('observed_at'))
        if observed is None:
            raise ValueError('Missing timestamp')
        return parse_claude(payload, observed)
    except (OSError, ValueError, TypeError, AttributeError):
        return {'name': 'Claude Code', 'source': 'Claude Code · local status', 'windows': [],
                'observed_at': None, 'available_resets': None,
                'message': 'Waiting for subscription status · open Claude Code'}


class UsageCollector:
    def __init__(self):
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.codex = {'name': 'Codex', 'source': 'Account · online', 'windows': [],
                      'observed_at': None, 'available_resets': None, 'message': 'Reading account…'}
        self.thread = threading.Thread(target=self.collect, daemon=True, name='subscription-usage')

    def collect(self):
        while not self.stop.is_set():
            try:
                result = read_codex()
                with self.lock:
                    self.codex = result
            except (OSError, RuntimeError, ValueError, TypeError, AttributeError):
                with self.lock:
                    self.codex = {**self.codex, 'message': 'Account unavailable · check Codex sign-in'}
            self.stop.wait(60)

    def get(self):
        with self.lock:
            result = json.loads(json.dumps(self.codex))
        now = time.time()
        observed = result.get('observed_at') or 0
        result['windows'] = [quota(w['label'], w['used_percent'], w['resets_at'], observed, now) for w in result['windows']]
        return {'codex': result, 'claude': read_claude()}

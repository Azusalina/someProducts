"""Independent countdown/stopwatch pairs measured with the monotonic clock."""
import secrets
import threading
import time

class TimerManager:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.lock = threading.RLock()
        self.sessions = {}

    @staticmethod
    def seconds(value):
        if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 86400:
            raise ValueError('Time must be an integer between 0 and 86400 seconds')
        return value

    def create(self, duration, offset):
        duration, offset = self.seconds(duration), self.seconds(offset)
        if duration == 0:
            raise ValueError('Countdown must be at least one second')
        with self.lock:
            now = self.clock()
            self.sessions = {key: pair for key, pair in self.sessions.items() if now - pair['seen'] < 60}
            if len(self.sessions) >= 16:
                raise ValueError('Too many timer sessions')
            token = secrets.token_urlsafe(24)
            self.sessions[token] = {'seen': now, 'countdown': {'base': duration, 'initial': duration, 'start': None},
                                    'stopwatch': {'base': offset, 'initial': offset, 'start': None}}
            return self.state(token)

    def _pair(self, token):
        if not isinstance(token, str) or token not in self.sessions:
            raise KeyError('Timer session ended')
        pair = self.sessions[token]
        if self.clock() - pair['seen'] >= 60:
            del self.sessions[token]
            raise KeyError('Timer session expired')
        pair['seen'] = self.clock()
        return pair

    def _value(self, timer, kind):
        elapsed = self.clock() - timer['start'] if timer['start'] is not None else 0
        value = max(0, timer['base'] - elapsed) if kind == 'countdown' else timer['base'] + elapsed
        if kind == 'countdown' and value == 0:
            timer['base'], timer['start'] = 0, None
        return value

    def state(self, token):
        with self.lock:
            pair = self._pair(token)
            result = {'session': token}
            for kind in ('countdown', 'stopwatch'):
                timer = pair[kind]
                value = self._value(timer, kind)
                result[kind] = {'seconds': value, 'initial': timer['initial'], 'running': timer['start'] is not None,
                                'finished': kind == 'countdown' and value == 0}
            return result

    def control(self, token, kind, action, seconds=None):
        with self.lock:
            if kind not in ('countdown', 'stopwatch') or action not in ('start', 'pause', 'reset', 'configure'):
                raise ValueError('Invalid timer action')
            timer = self._pair(token)[kind]
            value = self._value(timer, kind)
            if action == 'configure':
                seconds = self.seconds(seconds)
                if kind == 'countdown' and seconds == 0:
                    raise ValueError('Countdown must be at least one second')
                timer.update(initial=seconds, base=seconds, start=None)
            elif action == 'reset':
                timer.update(base=timer['initial'], start=None)
            elif action == 'pause':
                timer.update(base=value, start=None)
            elif timer['start'] is None and not (kind == 'countdown' and value == 0):
                timer['start'] = self.clock()
            return self.state(token)

    def close(self, token):
        with self.lock:
            if isinstance(token, str):
                self.sessions.pop(token, None)

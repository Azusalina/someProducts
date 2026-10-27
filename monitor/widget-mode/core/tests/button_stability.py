"""Delay background replies to expose button flicker/lost clicks, without real power changes."""
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit
sys.path.insert(0, str(Path(__file__).parents[1] / 'backend'))
from timers import TimerManager


class Fixture(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def reply(self, data):
        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass  # The QML owner may abort its last background read on cleanup.

    def do_GET(self):
        parsed = urlsplit(self.path)
        if parsed.path != '/timers/state':
            self.send_error(404)
            return
        time.sleep(0.35)
        try:
            data = self.server.timers.state(parse_qs(parsed.query)['session'][0])
        except KeyError:
            self.send_error(410)
            return
        self.reply(data)

    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if self.path == '/timers/create':
            self.reply(self.server.timers.create(data['duration'], data['offset']))
        elif self.path == '/timers/control':
            time.sleep(0.05)
            self.server.commands.append((data['kind'], data['action']))
            self.reply(self.server.timers.control(data['session'], data['kind'], data['action'], data.get('seconds')))
        elif self.path == '/timers/close':
            self.server.timers.close(data['session'])
            self.reply({'closed': True})
        elif self.path == '/power/awake':
            if data['action'] == 'heartbeat':
                time.sleep(0.5)
            self.reply({'active': data['action'] != 'disable', 'token': '' if data['action'] == 'disable' else 'fixture-awake'})
        elif self.path == '/power/profile':
            self.server.profiles.append(data['profile'])
            self.reply({'profile': data['profile']})
        else:
            self.send_error(404)


server = ThreadingHTTPServer(('127.0.0.1', 17343), Fixture)
server.daemon_threads = True
server.timers = TimerManager()
server.commands = []
server.profiles = []
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
try:
    env = dict(os.environ, QT_QPA_PLATFORM='offscreen', QT_QUICK_BACKEND='software')
    subprocess.run(['/usr/lib/qt6/bin/qmltestrunner', '-input', 'tests/tst_button_stability.qml'],
                   cwd=Path(__file__).parents[1], env=env, check=True, timeout=45)
    assert server.commands == [('stopwatch', 'start'), ('stopwatch', 'pause')], server.commands
    assert server.profiles == ['balanced'], server.profiles
    print('Delayed polls/heartbeats keep buttons stable; queued clicks execute exactly once. No real power changes.')
finally:
    server.shutdown()
    server.server_close()

"""Per-widget PTY sessions and VT screen snapshots; no commands or output logged."""
import fcntl
import copy
import os
from pathlib import Path
import pty
import secrets
import selectors
import signal
import struct
import subprocess
import sys
import termios
import threading
import time

import pyte

PALETTE = {'black': '#242424', 'red': '#e06c75', 'green': '#98c379', 'brown': '#e5c07b',
           'blue': '#61afef', 'magenta': '#c678dd', 'cyan': '#56b6c2', 'white': '#eeeeee',
           'brightblack': '#666666', 'brightred': '#ff858d', 'brightgreen': '#b5e795',
           'brightbrown': '#ffdc93', 'brightblue': '#8ecbff', 'brightmagenta': '#e4a5ff',
           'brightcyan': '#85dfeb', 'brightwhite': '#ffffff'}


def dimensions(columns, rows):
    if type(columns) is not int or type(rows) is not int or not 20 <= columns <= 160 or not 6 <= rows <= 60:
        raise ValueError('Invalid terminal size')
    return columns, rows


def color(value):
    if value in PALETTE:
        return PALETTE[value]
    if isinstance(value, str) and len(value) == 6 and all(ch in '0123456789abcdefABCDEF' for ch in value):
        return '#' + value
    return ''


class Screen(pyte.HistoryScreen):
    def __init__(self, columns, rows, writer):
        self.writer = writer
        self.main_screen = None
        super().__init__(columns, rows, history=500)

    def write_process_input(self, data):
        self.writer(data.encode('utf-8'))

    def set_mode(self, *modes, **kwargs):
        if kwargs.get('private') and any(mode in (47, 1047, 1049) for mode in modes) and self.main_screen is None:
            self.main_screen = copy.deepcopy((self.buffer, self.cursor, self.margins, self.savepoints))
            self.erase_in_display(2)
            self.cursor_position()
        super().set_mode(*modes, **kwargs)

    def reset_mode(self, *modes, **kwargs):
        super().reset_mode(*modes, **kwargs)
        if kwargs.get('private') and any(mode in (47, 1047, 1049) for mode in modes) and self.main_screen is not None:
            self.buffer, self.cursor, self.margins, self.savepoints = self.main_screen
            self.main_screen = None
            self.cursor.x = min(self.cursor.x, self.columns - 1)
            self.cursor.y = min(self.cursor.y, self.lines - 1)
            self.dirty.update(range(self.lines))

    def index(self):
        if self.main_screen is not None:
            pyte.Screen.index(self)
        else:
            super().index()

    def reverse_index(self):
        if self.main_screen is not None:
            pyte.Screen.reverse_index(self)
        else:
            super().reverse_index()


class Session:
    def __init__(self, columns, rows, cwd, shell):
        dimensions(columns, rows)
        self.lock = threading.RLock()
        self.closed = threading.Event()
        self.last_seen = time.monotonic()
        self.revision = 0
        self.pending_input = bytearray()
        self.master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', rows, columns, 0, 0))
        self.screen = Screen(columns, rows, self.write_bytes)
        self.stream = pyte.ByteStream(self.screen)
        try:
            self.process = subprocess.Popen([sys.executable, str(Path(__file__).with_name('terminal_child.py')), shell],
                                            stdin=slave, stdout=slave, stderr=slave, cwd=cwd,
                                            start_new_session=True,
                                            env={**os.environ, 'TERM': 'xterm-256color', 'COLORTERM': 'truecolor'})
        except Exception:
            os.close(self.master)
            raise
        finally:
            os.close(slave)
        os.set_blocking(self.master, False)
        self.thread = threading.Thread(target=self.read, daemon=True, name='terminal-pty')
        self.thread.start()

    def write_bytes(self, data):
        if not self.closed.is_set():
            with self.lock:
                if len(self.pending_input) + len(data) > 131072:
                    raise ValueError('Terminal input buffer is full')
                self.pending_input.extend(data)

    def input(self, text, paste=False):
        if not isinstance(text, str) or len(text.encode('utf-8')) > 8192:
            raise ValueError('Input is limited to 8 KiB')
        self.last_seen = time.monotonic()
        with self.lock:
            if paste and 2004 << 5 in self.screen.mode:
                text = '\x1b[200~' + text + '\x1b[201~'
            self.write_bytes(text.encode('utf-8'))

    def read(self):
        selector = selectors.DefaultSelector()
        try:
            selector.register(self.master, selectors.EVENT_READ)
            while not self.closed.is_set():
                with self.lock:
                    if self.pending_input:
                        try:
                            sent = os.write(self.master, self.pending_input)
                            del self.pending_input[:sent]
                        except BlockingIOError:
                            pass
                if selector.select(0.03):
                    chunk = os.read(self.master, 65536)
                    if not chunk:
                        break
                    with self.lock:
                        self.stream.feed(chunk)
                        self.revision += 1
                elif self.process.poll() is not None:
                    break
        except OSError:
            pass
        finally:
            selector.close()

    def resize(self, columns, rows):
        dimensions(columns, rows)
        with self.lock:
            if (columns, rows) != (self.screen.columns, self.screen.lines):
                fcntl.ioctl(self.master, termios.TIOCSWINSZ, struct.pack('HHHH', rows, columns, 0, 0))
                self.screen.resize(lines=rows, columns=columns)
                self.revision += 1

    def scroll(self, direction):
        if direction not in (-1, 1):
            raise ValueError('Invalid scroll direction')
        with self.lock:
            (self.screen.prev_page if direction < 0 else self.screen.next_page)()
            self.revision += 1

    def get(self, revision=-1):
        self.last_seen = time.monotonic()
        with self.lock:
            base = {'alive': self.process.poll() is None, 'revision': self.revision}
            if revision == self.revision:
                return {**base, 'unchanged': True}
            lines = []
            for y in range(self.screen.lines):
                runs = []
                for x in range(self.screen.columns):
                    cell = self.screen.buffer[y][x]
                    style = (color(cell.fg), color(cell.bg), cell.bold, cell.italics, cell.underscore, cell.reverse)
                    if runs and runs[-1]['style'] == style:
                        runs[-1]['text'] += cell.data
                        runs[-1]['width'] += 1
                    else:
                        runs.append({'x': x, 'width': 1, 'text': cell.data, 'style': style})
                lines.append(runs)
            return {**base, 'columns': self.screen.columns, 'rows': self.screen.lines,
                    'lines': lines, 'plain': self.screen.display,
                    'cursor': {'x': self.screen.cursor.x, 'y': self.screen.cursor.y,
                               'visible': pyte.modes.DECTCEM in self.screen.mode},
                    'application_cursor': 1 << 5 in self.screen.mode}

    def close(self):
        if self.closed.is_set():
            return
        self.closed.set()
        try:
            os.close(self.master)
        except OSError:
            pass
        if self.process.poll() is None:
            try:
                os.killpg(self.process.pid, signal.SIGHUP)
                self.process.wait(timeout=0.5)
            except subprocess.TimeoutExpired:
                os.killpg(self.process.pid, signal.SIGKILL)
                self.process.wait(timeout=0.5)
            except ProcessLookupError:
                self.process.wait()


class TerminalManager:
    def __init__(self, cwd=None, shell=None):
        self.cwd = str(cwd or os.getcwd())
        self.shell = shell or os.environ.get('SHELL') or '/usr/bin/bash'
        self.sessions = {}
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.thread = threading.Thread(target=self.collect, daemon=True, name='terminal-cleanup')

    def create(self, columns, rows):
        dimensions(columns, rows)
        with self.lock:
            if len(self.sessions) >= 8:
                raise RuntimeError('Eight terminal sessions are already open')
            token = secrets.token_urlsafe(32)
            self.sessions[token] = Session(columns, rows, self.cwd, self.shell)
        return {'session': token}

    def session(self, token):
        if not isinstance(token, str):
            raise ValueError('Invalid terminal session')
        with self.lock:
            session = self.sessions.get(token)
        if not session:
            raise KeyError('Terminal session ended')
        return session

    def close(self, token):
        with self.lock:
            session = self.sessions.pop(token, None)
        if session:
            session.close()

    def collect(self):
        while not self.stop.wait(10):
            with self.lock:
                expired = [token for token, session in self.sessions.items() if time.monotonic() - session.last_seen > 300]
            for token in expired:
                self.close(token)

    def shutdown(self):
        self.stop.set()
        with self.lock:
            tokens = list(self.sessions)
        for token in tokens:
            self.close(token)

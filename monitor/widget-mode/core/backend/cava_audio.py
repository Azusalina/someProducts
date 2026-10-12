"""On-demand CAVA frames from the playback monitor, never a microphone."""
import os
import re
import selectors
import shutil
import subprocess
import tempfile
import threading
import time

BAR_COUNT = 32


def parse_frame(line):
    fields = line.strip().rstrip(';').split(';')
    if len(fields) != BAR_COUNT:
        raise ValueError('Invalid CAVA frame')
    values = [int(value) for value in fields]
    if any(value < 0 or value > 1000 for value in values):
        raise ValueError('Invalid CAVA amplitude')
    return [value / 1000 for value in values]


def playback_monitor():
    value = subprocess.run(['pactl', 'get-default-sink'], capture_output=True, text=True,
                           check=True, timeout=2).stdout.strip()
    if not re.fullmatch(r'[A-Za-z0-9_.:-]{1,256}', value):
        raise ValueError('No playback monitor available')
    return value + '.monitor'


def config_text(source):
    if not re.fullmatch(r'[A-Za-z0-9_.:-]{1,264}', source) or not source.endswith('.monitor'):
        raise ValueError('Only playback monitor sources are supported')
    return f'''[general]
framerate = 20
bars = {BAR_COUNT}
[input]
method = pulse
source = {source}
[output]
method = raw
raw_target = /dev/stdout
data_format = ascii
ascii_max_range = 1000
channels = mono
bar_delimiter = 59
frame_delimiter = 10
'''


class AudioCollector:
    def __init__(self):
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.demand = 0
        self.frame = {'bars': [], 'available': False, 'sampled_at': None, 'error': 'Waiting for playback monitor'}
        self.thread = threading.Thread(target=self.collect, daemon=True, name='cava-audio')

    def get(self):
        with self.lock:
            self.demand = time.monotonic()
            value = {**self.frame, 'bars': list(self.frame['bars'])}
        if not value['sampled_at'] or time.time() - value['sampled_at'] > 2:
            value['bars'] = []
            value['available'] = False
        return value

    def collect(self):
        while not self.stop.is_set():
            if time.monotonic() - self.demand > 5:
                self.stop.wait(0.2)
                continue
            if not shutil.which('cava') or not shutil.which('pactl'):
                with self.lock:
                    self.frame.update(bars=[], available=False, error='Install cava and pipewire-pulse')
                self.stop.wait(5)
                continue
            process = None
            try:
                source = playback_monitor()
                with tempfile.TemporaryDirectory(prefix='monitor-cava-') as directory:
                    config = os.path.join(directory, 'config')
                    with open(config, 'w') as output:
                        output.write(config_text(source))
                    process = subprocess.Popen(['cava', '-p', config], stdin=subprocess.DEVNULL,
                                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
                    os.set_blocking(process.stdout.fileno(), False)
                    selector = selectors.DefaultSelector()
                    selector.register(process.stdout, selectors.EVENT_READ)
                    pending = b''
                    next_source_check = time.monotonic() + 5
                    try:
                        while not self.stop.is_set() and time.monotonic() - self.demand <= 5:
                            if time.monotonic() >= next_source_check:
                                if playback_monitor() != source:
                                    break
                                next_source_check = time.monotonic() + 5
                            if not selector.select(0.2):
                                if process.poll() is not None:
                                    raise RuntimeError('Playback audio is unavailable')
                                continue
                            chunk = os.read(process.stdout.fileno(), 65536)
                            if not chunk:
                                raise RuntimeError('Playback audio is unavailable')
                            pending = (pending + chunk)[-131072:]
                            while b'\n' in pending:
                                line, pending = pending.split(b'\n', 1)
                                bars = parse_frame(line.decode('ascii'))
                                with self.lock:
                                    self.frame = {'bars': bars, 'available': True, 'sampled_at': time.time(), 'error': None}
                    finally:
                        selector.close()
            except (OSError, subprocess.SubprocessError, ValueError, UnicodeError, RuntimeError):
                with self.lock:
                    self.frame.update(bars=[], available=False, error='Playback audio is unavailable')
                self.stop.wait(2)
            finally:
                if process:
                    if process.poll() is None:
                        process.terminate()
                        try:
                            process.wait(timeout=1)
                        except subprocess.TimeoutExpired:
                            process.kill(); process.wait()
                    process.stdout.close()

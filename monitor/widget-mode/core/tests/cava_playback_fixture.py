"""Prove real CAVA responds to a test tone in an isolated, silent playback sink."""
import math
import os
from pathlib import Path
import selectors
import struct
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).parents[1]/'backend'))
from cava_audio import config_text, parse_frame


def pactl(*args):
    return subprocess.run(['pactl',*args],text=True,capture_output=True,check=True,timeout=3).stdout.strip()


original = pactl('get-default-sink')
sink = 'monitor_dashboard_test_' + str(os.getpid())
module = pactl('load-module','module-null-sink','sink_name='+sink,'sink_properties=device.description=MonitorTest')
visualizer = None
tone = None
try:
    assert pactl('get-default-sink') == original, 'Test must not change the default playback route'
    with tempfile.TemporaryDirectory(prefix='monitor-audio-test-') as directory:
        config = Path(directory)/'cava-config'
        config.write_text(config_text(sink+'.monitor'))
        signal_path = Path(directory)/'tone.raw'
        signal_path.write_bytes(b''.join(struct.pack('<f',0.2*math.sin(2*math.pi*440*n/48000)) for n in range(144000)))
        visualizer = subprocess.Popen(['cava','-p',str(config)],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
        os.set_blocking(visualizer.stdout.fileno(),False)
        with signal_path.open('rb') as stream:
            tone = subprocess.Popen(['paplay','--raw','--format=float32le','--rate=48000','--channels=1','--device='+sink],stdin=stream,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        selector = selectors.DefaultSelector()
        selector.register(visualizer.stdout,selectors.EVENT_READ)
        pending = b''
        peak = 0
        deadline = time.monotonic()+5
        try:
            while time.monotonic()<deadline and peak<0.05:
                if selector.select(.2):
                    pending += os.read(visualizer.stdout.fileno(),65536)
                    while b'\n' in pending:
                        line,pending = pending.split(b'\n',1)
                        peak = max(peak,max(parse_frame(line.decode('ascii'))))
        finally:
            selector.close()
        assert peak>=0.05, 'CAVA did not respond to isolated playback audio'
        print(f'Real CAVA responded to silent test-sink playback: peak {peak:.3f}; default output unchanged.')
finally:
    for process in [tone,visualizer]:
        if process:
            if process.poll() is None:process.terminate()
            process.wait(timeout=3)
    pactl('unload-module',module)
    assert pactl('get-default-sink') == original, 'Original playback route must be preserved'

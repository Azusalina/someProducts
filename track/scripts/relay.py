#!/usr/bin/env python3
"""Opt-in temporary relay: expose only the authenticated upload listener."""
import argparse
import json
import queue
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4188, help='Track local UI port')
    parser.add_argument('--cloudflared', help='Path to cloudflared executable')
    parser.add_argument('--public-url', help='Fixed HTTPS origin for an existing locally-managed Named Tunnel')
    parser.add_argument('--tunnel-config', help='Named Tunnel cloudflared configuration file')
    args = parser.parse_args()
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    bundled = Path(__file__).resolve().parents[1] / '.tools' / ('cloudflared.exe' if sys.platform == 'win32' else 'cloudflared')
    executable = args.cloudflared or shutil.which('cloudflared') or (str(bundled) if bundled.exists() else None)
    if not executable:
        parser.error('Install cloudflared or supply --cloudflared. See description.md.')
    base = f'http://127.0.0.1:{args.port}'
    def get(route):
        with urllib.request.urlopen(base + route, timeout=5) as response:
            return response.read()
    try:
        setup = json.loads(get('/api/setup'))
        csrf = re.search(r'<meta name="track-csrf" content="([^"]+)"', get('/').decode()).group(1)
    except Exception:
        print('Start Track first; cannot access its local UI.', file=sys.stderr)
        return 1
    def register(url, **extra):
        csrf = re.search(r'<meta name="track-csrf" content="([^\"]+)"', get('/').decode()).group(1)
        request = urllib.request.Request(base + '/api/relay', data=json.dumps({'url': url, **extra}).encode(),
            headers={'Content-Type': 'application/json', 'X-Track-CSRF': csrf}, method='POST')
        with urllib.request.urlopen(request, timeout=5) as response:
            response.read()
    # Authenticate the existing origin certificate; do not disable TLS verification.
    receiver = f"https://{setup['lan_receiver'].split('/')[2]}"
    if setup.get('relay_active'):
        print('A relay is already active. Stop it before starting another.', file=sys.stderr)
        return 1
    if bool(args.public_url) != bool(args.tunnel_config):
        parser.error('--public-url and --tunnel-config must be supplied together')
    if args.public_url:
        register(None, configure={'mode': 'named', 'public_url': args.public_url,
                                  'tunnel_config': str(Path(args.tunnel_config).resolve())})
    settings_path = Path(setup['data_dir']) / 'relay-settings.json'
    settings = json.loads(settings_path.read_text()) if settings_path.exists() else {'mode': 'quick'}
    named = settings.get('mode') == 'named'
    if named:
        command = [executable, 'tunnel', '--config', settings['tunnel_config'], '--protocol', 'http2', 'run']
    else:
        command = [executable, 'tunnel', '--url', receiver, '--protocol', 'http2',
            '--origin-ca-pool', str(Path(setup['data_dir']) / 'ca.pem'), '--origin-server-name', 'localhost']
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    lines = queue.Queue()
    def read_output():
        for line in process.stdout:
            lines.put(line)
    threading.Thread(target=read_output, daemon=True).start()
    url, heartbeat, connected = settings.get('public_url') if named else None, 0, False
    deadline = time.monotonic() + 90
    print('Starting Cloudflare HTTPS relay. Traffic passes through Cloudflare; archive stays on PC.', flush=True)
    try:
        while process.poll() is None:
            try:
                line = lines.get(timeout=1)
                match = re.search(r'https://[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com', line)
                if match and not named:
                    url = match.group(0)
                if 'Registered tunnel connection' in line:
                    connected = True
                if re.search(r'\bERR\b', line):
                    print(line.strip(), file=sys.stderr, flush=True)
            except queue.Empty:
                pass
            now = time.monotonic()
            if url and connected and now >= heartbeat:
                register(url)
                if heartbeat == 0:
                    print(f'Relay ready: {url}/api/overland\nRefresh {base}, open Connect iPhone and scan the Overland code.\nNo iPhone certificate installation needed. Keep this terminal open; Ctrl+C stops the relay.', flush=True)
                heartbeat = now + 15
            if not connected and now > deadline:
                raise RuntimeError('Relay could not connect within 90 seconds; VPN may block tunnel traffic.')
        raise RuntimeError(f'cloudflared exited with status {process.returncode}')
    except KeyboardInterrupt:
        return 0
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        process.stdout.close()
        try:
            register(None)
        except Exception:
            pass  # Registration expires after 45 seconds if Track is unreachable.


if __name__ == '__main__':
    raise SystemExit(main())

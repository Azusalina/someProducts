#!/usr/bin/env python3
"""Run Track with only Python 3.11+ and OpenSSL."""
import argparse
import ipaddress
import json
import signal
import socket
import subprocess
import sys
import threading
import webbrowser
from trackapp.server import App
from trackapp.tls import data_directory
from trackapp import relay as relay_config
from pathlib import Path
import time


def detect_lan_ip():
    candidates = []
    if sys.platform.startswith("linux"):
        try:
            result = subprocess.run(["ip", "-j", "-4", "address", "show"], capture_output=True, text=True, check=True)
            for interface in json.loads(result.stdout):
                if interface.get("operstate") != "UP" or "POINTOPOINT" in interface.get("flags", []):
                    continue
                if interface["ifname"].startswith(("docker", "br-", "virbr", "veth", "tun", "wg")):
                    continue
                candidates.extend(a["local"] for a in interface.get("addr_info", []) if a.get("scope") == "global")
        except (OSError, subprocess.SubprocessError, ValueError):
            pass
    if not candidates:
        try:
            candidates = list(dict.fromkeys(row[4][0] for row in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)))
        except OSError:
            pass
    candidates = [c for c in candidates if ipaddress.ip_address(c).is_private and not ipaddress.ip_address(c).is_loopback]
    if len(candidates) != 1:
        raise RuntimeError("Specify --lan-ip with this PC's Wi-Fi/Ethernet IPv4 address; could not select one unambiguously.")
    return candidates[0]


def main():
    parser = argparse.ArgumentParser(description="Track — local Overland footprint archive")
    parser.add_argument("--lan-ip", help="PC LAN IPv4 address, e.g. 192.168.1.20")
    parser.add_argument("--port", type=int, default=4188, help="Local browser port (4188)")
    parser.add_argument("--ingest-port", type=int, default=4189, help="LAN HTTPS upload port (4189)")
    parser.add_argument("--trust-port", type=int, default=8080, help="Public certificate download port (8080)")
    parser.add_argument("--data-dir", default=str(data_directory()), help="Private archive directory")
    parser.add_argument("--open", action="store_true", help="Open local browser")
    parser.add_argument("--relay", action="store_true", help="Enable and remember automatic Quick Tunnel startup")
    parser.add_argument("--no-relay", action="store_true", help="Disable saved relay and use LAN only")
    args = parser.parse_args()
    try:
        saved = relay_config.load(Path(args.data_dir))
        use_relay = not args.no_relay and (args.relay or saved.get("enabled"))
        lan_ip = args.lan_ip or ("127.0.0.1" if use_relay else detect_lan_ip())
        app = App(args.data_dir, lan_ip, args.port, args.ingest_port, args.trust_port).start()
    except (RuntimeError, OSError, ValueError, subprocess.SubprocessError) as exc:
        print(f"Track could not start: {exc}", file=sys.stderr)
        return 1
    if args.no_relay:
        app.relay_settings = {"enabled": False, "mode": "quick"}
        relay_config.save(app.data_dir, app.relay_settings)
    elif args.relay:
        app.relay_settings["enabled"] = True
        relay_config.save(app.data_dir, app.relay_settings)
    stopped = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stopped.set())
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, lambda *_: stopped.set())
    print(f"Track ready · {app.url}\nOverland receiver · https://{lan_ip}:{app.ingest_port}/api/overland\n"
          f"Open the local browser's Connect iPhone panel to complete setup.", flush=True)
    if args.open:
        webbrowser.open(app.url)
    child = None
    retry_at = 0
    generation = app.relay_generation
    try:
        while not stopped.wait(1):
            if app.relay_generation != generation:
                if child and child.poll() is None:
                    child.terminate()
                    try:
                        child.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        child.kill()
                        child.wait()
                child = None
                app.relay = None
                generation = app.relay_generation
                retry_at = 0
            if app.relay_settings.get("enabled") and (child is None or child.poll() is not None) and time.monotonic() >= retry_at:
                child = subprocess.Popen([sys.executable, str(Path(__file__).parent / "scripts/relay.py"), "--port", str(app.ui_port)])
                retry_at = time.monotonic() + 15
            elif not app.relay_settings.get("enabled") and child and child.poll() is None:
                child.terminate()
    finally:
        if child and child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        app.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

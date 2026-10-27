"""Exercise a disposable running DEMO instance; never runs against a real wallet."""
import argparse
import json
import select
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4386)
    parser.add_argument("--launch", action="store_true", help="Launch and clean up a fresh disposable demo")
    args = parser.parse_args()
    if not args.launch:
        run_checks(f"http://127.0.0.1:{args.port}")
        return
    with tempfile.TemporaryDirectory(prefix="autotrade-http-") as directory:
        app = Path(__file__).resolve().parent.parent / "app.py"
        process = subprocess.Popen([sys.executable, str(app), "--mode", "demo", "--port", "0", "--data-dir", directory],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            if not select.select([process.stdout], [], [], 15)[0]:
                raise AssertionError("Disposable server did not become ready")
            line = process.stdout.readline()
            if "http://127.0.0.1:" not in line:
                raise AssertionError("Disposable server failed to start")
            run_checks(line.split()[-1])
        finally:
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def run_checks(base):
    token = None
    def request(path, data=None, headers=None, expected=200):
        req = urllib.request.Request(base + path, headers={**({"X-Autotrade-Token": token} if token else {}),
            "Content-Type": "application/json", **(headers or {})},
            data=json.dumps(data).encode() if data is not None else None)
        try:
            response = urllib.request.urlopen(req, timeout=15)
        except urllib.error.HTTPError as exc:
            response = exc
        assert response.code == expected, (path, response.code, expected)
        raw = response.read()
        return json.loads(raw) if response.headers["Content-Type"].startswith("application/json") else raw
    token = request("/api/session")["token"]
    assert request("/api/state")["mode"] == "demo", "Use only a disposable DEMO server"
    assert b"Crypto markets" in request("/")
    request("/api/state", headers={"Host": "attacker.example"}, expected=403)
    request("/api/state", headers={"Origin": "https://attacker.example"}, expected=403)
    request("/api/state", headers={"X-Autotrade-Token": "bad"}, expected=403)
    request("/api/settings", {"capital": -1}, expected=400)
    request("/api/settings", {"symbols": ["SPY"]}, expected=400)
    request("/api/settings", {"capital": 2500, "interval": 3600}, expected=202)
    def wait():
        for _ in range(150):
            state = request("/api/state")
            if state["operation"]["busy"] is None:
                assert state["operation"]["error"] is None, state["operation"]
                return state
            time.sleep(.02)
        raise AssertionError("Engine operation did not finish")
    assert wait()["cash"] == 2500
    request("/api/start", {}, expected=202)
    assert wait()["running"]
    request("/api/scan", {}, expected=202)
    state = wait()
    assert state["positions"] and state["orders"] and state["cash"] >= 0
    request("/api/pause", {}, expected=202)
    assert not wait()["running"]
    assert b"Hourly trend entry" in request("/api/export")
    request("/api/flatten", {"confirmation": "CLOSE ALL APP POSITIONS"}, expected=202)
    assert not wait()["positions"]
    print("HTTP checks passed: host/origin/token guards, config validation, funding, start, scan, fills, pause, CSV, close to USDC.")


if __name__ == "__main__":
    main()

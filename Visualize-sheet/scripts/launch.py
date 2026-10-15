"""Open the already-built local app and keep the server in this terminal."""
import json
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
URL = "http://127.0.0.1:4280"


def running():
    try:
        with urllib.request.urlopen(URL + "/api/health", timeout=1) as response:
            data = json.load(response)
            return data.get("app") == "sheetVis"
    except (OSError, ValueError, urllib.error.URLError):
        return False


if __name__ == "__main__":
    if not (ROOT / "dist/index.html").exists():
        subprocess.run(["npm", "run", "build"], cwd=ROOT, check=True)
    if running():
        webbrowser.open(URL)
    else:
        process = subprocess.Popen(["python", "server.py"], cwd=ROOT, start_new_session=True)
        try:
            for _ in range(30):
                if process.poll() is not None:
                    raise SystemExit("sheetVis server could not start. Check whether port 4280 is occupied.")
                if running():
                    webbrowser.open(URL)
                    break
                time.sleep(.1)
            process.wait()
        except KeyboardInterrupt:
            process.terminate()
            process.wait(timeout=15)

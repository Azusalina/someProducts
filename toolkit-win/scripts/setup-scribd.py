"""Install the local adapter dependencies, preserving the separate source repo."""
from pathlib import Path
import subprocess
import sys
import venv
root = Path(__file__).resolve().parents[1]
repo = root / 'src' / 'scribd-downloader'
if not (repo / 'scribd-downloader.py').is_file():
    raise SystemExit('Place the scribd-downloader checkout in toolkit/src/scribd-downloader first.')
folder = root / '.venv-scribd'
python = folder / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
if not python.exists() or not (folder / 'pyvenv.cfg').exists():
    venv.EnvBuilder(with_pip=True, symlinks=sys.platform != 'win32').create(folder)
subprocess.run([str(python), '-m', 'pip', 'install', 'selenium==4.51.0', 'pypdf==6.21.3'], check=True)
print('Scribd support ready. Requires matching Chrome/Chromium and ChromeDriver on this computer.')

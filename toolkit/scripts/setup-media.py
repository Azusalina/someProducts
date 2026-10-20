"""Install the optional URL media dependency in this product only."""
from pathlib import Path
import subprocess
import sys
import venv
root = Path(__file__).resolve().parents[1]
folder = root / '.venv-media'
venv.EnvBuilder(with_pip=True).create(folder)
python = folder / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
subprocess.run([str(python), '-m', 'pip', 'install', '--upgrade', 'yt-dlp'], check=True)
print('Media setup ready. FFmpeg must also be on PATH.')

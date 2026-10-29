"""Install the optional URL media dependency in this product only."""
from pathlib import Path
import subprocess
import sys
import venv
root = Path(__file__).resolve().parents[1]
folder = root / '.venv-media'
python = folder / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
if not python.exists() or not (folder / 'pyvenv.cfg').exists():
    venv.EnvBuilder(with_pip=True, symlinks=sys.platform != 'win32').create(folder)
subprocess.run([str(python), '-m', 'pip', 'install', '--upgrade', 'yt-dlp'], check=True)
print('Media setup ready. Run npm run ffmpeg:setup for project-local FFmpeg.')

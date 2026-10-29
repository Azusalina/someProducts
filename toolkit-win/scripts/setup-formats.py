"""Install the local photo converter only. Audio/video also require FFmpeg."""
from pathlib import Path
import subprocess
import sys
import venv
root = Path(__file__).resolve().parents[1]
folder = root / '.venv-formats'
python = folder / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
if not python.exists() or not (folder / 'pyvenv.cfg').exists():
    venv.EnvBuilder(with_pip=True, symlinks=sys.platform != 'win32').create(folder)
subprocess.run([str(python), '-m', 'pip', 'install', 'Pillow==13.0.0', 'rawpy==0.27.1', 'tifffile==2026.10.15', 'numpy==2.5.4'], check=True)
print('Photo formats ready. Install FFmpeg/ffprobe for audio and video formats.')

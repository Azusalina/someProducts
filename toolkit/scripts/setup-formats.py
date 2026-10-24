"""Install the local photo converter only. Audio/video also require FFmpeg."""
from pathlib import Path
import subprocess
import sys
import venv
root = Path(__file__).resolve().parents[1]
folder = root / '.venv-formats'
venv.EnvBuilder(with_pip=True).create(folder)
python = folder / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
subprocess.run([str(python), '-m', 'pip', 'install', 'Pillow==13.0.0'], check=True)
print('Photo formats ready. Install FFmpeg/ffprobe for audio and video formats.')

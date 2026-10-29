"""Install only local PDF conversion support for MarkItDown."""
from pathlib import Path
import subprocess
import sys
import venv
root = Path(__file__).resolve().parents[1]
folder = root / '.venv-markitdown'
python = folder / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
if not python.exists() or not (folder / 'pyvenv.cfg').exists():
    venv.EnvBuilder(with_pip=True, symlinks=sys.platform != 'win32').create(folder)
subprocess.run([str(python), '-m', 'pip', 'install', 'markitdown[pdf]==0.1.8'], check=True)
print('Local MarkItDown PDF support ready.')

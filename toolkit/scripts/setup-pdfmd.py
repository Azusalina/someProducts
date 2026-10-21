"""Install only local PDF conversion support for MarkItDown."""
from pathlib import Path
import subprocess
import sys
import venv
root = Path(__file__).resolve().parents[1]
folder = root / '.venv-markitdown'
venv.EnvBuilder(with_pip=True).create(folder)
python = folder / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
subprocess.run([str(python), '-m', 'pip', 'install', 'markitdown[pdf]==0.1.8'], check=True)
print('Local MarkItDown PDF support ready.')

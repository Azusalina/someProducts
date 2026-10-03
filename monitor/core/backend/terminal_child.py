"""Acquire the PTY as a controlling terminal before executing an interactive shell."""
import fcntl
import os
import sys
import termios

fcntl.ioctl(0, termios.TIOCSCTTY, 0)
shell = sys.argv[1]
arguments = ['--noprofile', '--norc', '-i'] if os.path.basename(shell) == 'bash' else ['-i']
os.execv(shell, [shell, *arguments])

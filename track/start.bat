@echo off
cd /d "%~dp0"
py -3 track.py --open %*
if errorlevel 1 pause

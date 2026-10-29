@echo off
setlocal
cd /d "%~dp0"
node src\cli.js %*
if errorlevel 1 pause

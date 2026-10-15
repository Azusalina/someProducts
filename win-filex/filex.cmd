@echo off
setlocal DisableDelayedExpansion
set "FILEX_ROOT=%~dp0"
set "FILEX_EXE=%~dp0bin\filex.exe"
if not exist "%FILEX_EXE%" set "FILEX_EXE=%~dp0target\release\filex.exe"
if not exist "%FILEX_EXE%" (
  echo filex: run powershell -NoProfile -File "%~dp0scripts\build.ps1" first. 1>&2
  exit /b 1
)
set "FILEX_CWD_FILE=%TEMP%\filex-%RANDOM%-%RANDOM%-%RANDOM%.tmp"
for /f "tokens=2 delims=:" %%C in ('chcp') do set "FILEX_CODEPAGE=%%C"
chcp 65001 >nul
"%FILEX_EXE%" %*
set "FILEX_STATUS=%ERRORLEVEL%"
set "FILEX_DIRECTORY="
if "%FILEX_STATUS%"=="0" if exist "%FILEX_CWD_FILE%" for /f "usebackq delims=" %%D in ("%FILEX_CWD_FILE%") do set "FILEX_DIRECTORY=%%D"
del /q "%FILEX_CWD_FILE%" >nul 2>&1
chcp %FILEX_CODEPAGE% >nul
if defined FILEX_DIRECTORY (
  if "%FILEX_DIRECTORY:~0,2%"=="\\" (
    endlocal & pushd "%FILEX_DIRECTORY%" & exit /b
  )
  endlocal & cd /d "%FILEX_DIRECTORY%" & exit /b
)
endlocal & exit /b %FILEX_STATUS%

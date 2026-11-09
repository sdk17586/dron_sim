@echo off
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 tools\serve.py
) else (
  python tools\serve.py
)
pause

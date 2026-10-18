@echo off
setlocal
cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 or newer is required.
  echo Download it from https://nodejs.org/
  pause
  exit /b 1
)

if not exist "DeepSeekLauncher.exe" (
  echo DeepSeekLauncher.exe is missing.
  echo Run "npm run build" before starting from source.
  pause
  exit /b 1
)

start "" "%~dp0DeepSeekLauncher.exe"


@echo off
setlocal
cd /d "%~dp0"
if not exist "desktop\node_modules\electron\dist\electron.exe" (
  echo Please run: npm --prefix desktop ci
  pause
  exit /b 1
)
if not exist "desktop\out\main\index.js" (
  call npm --prefix desktop run build
  if errorlevel 1 exit /b 1
)
set ELECTRON_RUN_AS_NODE=
start "Agent Review Loop" "desktop\node_modules\electron\dist\electron.exe" "desktop"

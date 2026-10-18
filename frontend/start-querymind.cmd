@echo off
setlocal
set "START=%~dp0scripts\start-querymind.ps1"

if not exist "%START%" (
  echo Cannot find "%START%".
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%START%" %*
if errorlevel 1 (
  echo.
  echo The launcher stopped with an error. The lines above say why.
)

echo.
pause

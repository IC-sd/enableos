@echo off
setlocal
cd /d "%~dp0"
set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" (
  for %%I in (node.exe) do set "NODE_EXE=%%~$PATH:I"
)
if not exist "%NODE_EXE%" (
  echo [EnableOS] No Node.js runtime was found.
  pause
  exit /b 1
)
"%NODE_EXE%" scripts\stop.mjs
if errorlevel 1 pause
endlocal

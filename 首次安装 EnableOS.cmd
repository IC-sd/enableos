@echo off
setlocal
cd /d "%~dp0"
set "ENABLEOS_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%ENABLEOS_NODE%" (
  for %%I in (node.exe) do set "ENABLEOS_NODE=%%~$PATH:I"
)
if not exist "%ENABLEOS_NODE%" (
  echo [EnableOS] Node.js 20 or newer is required.
  echo Download it from https://nodejs.org/ and run this installer again.
  pause
  exit /b 1
)
title EnableOS First Setup
"%ENABLEOS_NODE%" scripts\setup.mjs
set "ENABLEOS_EXIT_CODE=%ERRORLEVEL%"
if not "%ENABLEOS_EXIT_CODE%"=="0" pause
endlocal & exit /b %ENABLEOS_EXIT_CODE%

@echo off
setlocal
cd /d "%~dp0"
set "ENABLEOS_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%ENABLEOS_NODE%" (
  for %%I in (node.exe) do set "ENABLEOS_NODE=%%~$PATH:I"
)
if not exist "%ENABLEOS_NODE%" (
  echo [EnableOS] No Node.js runtime was found.
  echo Install Node.js or run this project from Codex once.
  pause
  exit /b 1
)
if not exist "dist\web\index.html" (
  echo [EnableOS] The web build is missing. Run pnpm build first.
  pause
  exit /b 1
)
title EnableOS Launcher
echo.
echo [EnableOS] Starting the background web service...
echo.
"%ENABLEOS_NODE%" scripts\launch.mjs
set "ENABLEOS_EXIT_CODE=%ERRORLEVEL%"
if not "%ENABLEOS_EXIT_CODE%"=="0" (
  echo.
  echo [EnableOS] Startup failed with exit code %ENABLEOS_EXIT_CODE%.
  echo [EnableOS] Error log: %~dp0server\enableos-error.log
  pause
)
endlocal & exit /b %ENABLEOS_EXIT_CODE%

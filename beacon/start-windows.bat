@echo off
REM Beacon launcher for Windows - double-click this file.
cd /d "%~dp0"
echo Starting Beacon...
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Node isn't installed. Install it from https://nodejs.org ^(the LTS button^),
  echo   then double-click this file again.
  echo.
  pause
  exit /b 1
)
echo   Opening http://localhost:4173 in your browser...
echo   (Leave this window open. Close it to stop Beacon.)
start "" "http://localhost:4173"
node src/server.ts
pause

@echo off
setlocal

cd /d "%~dp0"
title Syria Traders - Game Host

echo ==========================================
echo          Syria Traders Launcher
echo ==========================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Please install Node.js first:
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing root dependencies...
  call npm install
  if errorlevel 1 goto :fail
)

if not exist "server\node_modules" (
  echo Installing server dependencies...
  call npm --prefix server install
  if errorlevel 1 goto :fail
)

if not exist "client\node_modules" (
  echo Installing client dependencies...
  call npm --prefix client install
  if errorlevel 1 goto :fail
)

echo.
echo Building the latest game so old frontend files are not served...
call npm run build
if errorlevel 1 goto :fail
echo.
echo Starting the HTTPS game host. The browser opens when ready.
echo Game: https://localhost:8443
echo For friends: choose Host room and copy the LAN invite link.
echo Allow Node.js on PRIVATE networks in Windows Firewall if prompted.
echo A self-signed certificate warning is expected on each device.
echo Keep this window open while playing. Ctrl+C stops the host.
echo.

set OPEN_BROWSER=1
call npm start
if errorlevel 1 goto :fail

exit /b 0

:fail
echo.
echo [ERROR] Launcher stopped because a command failed.
echo Check messages above, then run this file again.
echo.
pause
exit /b 1

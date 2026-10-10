@echo off
setlocal

rem Same game as run-game.bat, plus a public https link through Tailscale Funnel.
rem The link is switched off when the game window closes or Ctrl+C stops it.
rem run-game.bat stays private to your Wi-Fi.
title Syria Traders - Online Game Host

echo ==========================================
echo      Syria Traders - online link
echo ==========================================
echo The ONLINE LINK box appears below once the game is running.
echo First time: install Tailscale from https://tailscale.com/download and sign in.
echo.

set ONLINE=1
call "%~dp0run-game.bat"
exit /b %errorlevel%

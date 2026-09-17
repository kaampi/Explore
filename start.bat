@echo off
setlocal
cd /d "%~dp0"

title AI Sandbox
echo AI Sandbox
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not on PATH. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
  echo.
)

where ollama >nul 2>&1
if not errorlevel 1 (
  curl.exe -s -o nul --connect-timeout 2 http://127.0.0.1:11434/api/tags >nul 2>&1
  if errorlevel 1 (
    echo Starting Ollama...
    start "Ollama" ollama serve
    timeout /t 2 /nobreak >nul
  )
)

echo Opening the app in your browser.
echo Leave this window open while you play. Close it to stop the server.
echo.
call npm start
echo.
pause

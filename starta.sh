#!/usr/bin/env bash
# Start Sandbox AI on macOS or Linux.
cd "$(dirname "$0")" || exit 1

echo ""
echo " Sandbox AI"
echo " http://localhost:5173"
echo ""

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo " Node.js and npm are required. Install Node.js from https://nodejs.org"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo " Installing dependencies (first run)..."
  npm install || exit 1
fi

echo " Starting Sandbox AI. Keep this terminal open while using the app."
npm start

@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13 or newer is required.
  pause
  exit /b 1
)
if not exist "node_modules\quickjs-emscripten\package.json" (
  echo Run npm ci --ignore-scripts --no-audit --no-fund in this folder first.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:5472/ after the server starts.
node server.mjs
pause

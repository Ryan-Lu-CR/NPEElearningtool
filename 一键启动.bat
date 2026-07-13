@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Please install Node.js 20 or later from https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules call npm install
start "" http://127.0.0.1:5173/
call npm run dev -- --host 127.0.0.1

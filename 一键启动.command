#!/bin/bash
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 Node.js，请先安装 Node.js 20 或更高版本：https://nodejs.org/"
  read -r -p "按回车键退出..."
  exit 1
fi

if command -v pnpm >/dev/null 2>&1; then
  [ -d node_modules ] || pnpm install
  (sleep 2; open "http://127.0.0.1:5173/") &
  exec pnpm dev --host 127.0.0.1
else
  [ -d node_modules ] || npm install
  (sleep 2; open "http://127.0.0.1:5173/") &
  exec npm run dev -- --host 127.0.0.1
fi

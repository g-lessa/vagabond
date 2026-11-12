#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.local/node/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js not found. Please install Node.js 20+ or add ~/.local/node/bin to PATH."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

if [ ! -d "dist/client" ] || [ ! -d "dist/server" ]; then
  echo "Building Vagabond..."
  npm run build
fi

echo "Starting Vagabond host server on http://localhost:${PORT:-3000}"
npm start

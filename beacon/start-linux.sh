#!/bin/bash
# Beacon launcher for Linux — run: bash start-linux.sh  (or double-click and "Run").
cd "$(dirname "$0")"
echo "Starting Beacon…"
if ! command -v node >/dev/null 2>&1; then
  echo "  Node isn't installed. Install Node 22.6+ (https://nodejs.org or your package manager), then run this again."
  exit 1
fi
( sleep 1.5; xdg-open "http://localhost:4173" >/dev/null 2>&1 ) &
echo "  Opening http://localhost:4173 …  (Ctrl+C to stop.)"
node src/server.ts

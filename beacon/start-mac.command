#!/bin/bash
# Beacon launcher for macOS — double-click this file in Finder.
cd "$(dirname "$0")"
echo "Starting Beacon…"
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node isn't installed. Install it from https://nodejs.org (the LTS button),"
  echo "  then double-click this file again."
  echo ""
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
NODE_MINOR=$(node -p "process.versions.node.split('.')[1]")
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 6 ]; }; then
  echo "  Your Node is $(node --version); Beacon needs v22.6 or newer. Update at https://nodejs.org"
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi
( sleep 1.5; open "http://localhost:4173" ) &
echo "  Opening http://localhost:4173 in your browser…"
echo "  (Leave this window open. Close it to stop Beacon.)"
node src/server.ts

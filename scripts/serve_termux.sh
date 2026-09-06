#!/data/data/com.termux/files/usr/bin/bash
set -e
PORT="${1:-8765}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec python -u scripts/factory_server.py "$PORT"

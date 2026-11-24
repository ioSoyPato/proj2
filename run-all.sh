#!/usr/bin/env bash
# Run the whole lab locally without Docker:
#   ./run-all.sh        -> http://localhost:8000
# Ctrl+C stops everything.
#
# Needs each project's backend venv and built frontend:
#   cd <project>/backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
#   cd <project>/frontend && npm install && npm run build
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

start() {  # dir port
  local dir="$ROOT/$1" port="$2"
  if [[ ! -x "$dir/backend/.venv/bin/uvicorn" ]]; then
    echo "!! $1: missing backend/.venv (see header of this script)"; return
  fi
  if [[ ! -f "$dir/frontend/dist/index.html" ]]; then
    echo "!! $1: missing frontend/dist; run 'npm install && npm run build' in $1/frontend"; return
  fi
  ( cd "$dir/backend" && FRONTEND_DIST="$dir/frontend/dist" exec .venv/bin/uvicorn app.api.main:app --port "$port" --log-level warning ) &
  pids+=($!)
  echo "   $1 -> http://localhost:$port"
}

echo "Starting the Sequential Decisions Lab…"
start project-a-behavioral-portfolio 8001
start project-b-dynamic-pricing      8002
start project-c-course-scheduling    8003
( cd "$ROOT/portal" && exec python3 -m http.server 8000 --bind 127.0.0.1 >/dev/null 2>&1 ) &
pids+=($!)
echo ""
echo "   Portal (all three apps) -> http://localhost:8000"
echo "   Ctrl+C to stop."
wait

#!/usr/bin/env bash
# Start the workout_app backend in the background.
# Usage: ./start-backend.sh
# Stop with:  ./stop-backend.sh
# Logs:        /tmp/uvicorn.log
# PID file:    /tmp/uvicorn.pid

set -e

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$REPO_ROOT/backend"
PY="$BACKEND/.venv/Scripts/python.exe"
LOG="/tmp/uvicorn.log"
PIDFILE="/tmp/uvicorn.pid"
PORT="${PORT:-8000}"
HOST="${HOST:-0.0.0.0}"

# If something is already listening on the port, refuse to start.
if netstat -ano 2>/dev/null | grep -E "[:.]${PORT}[[:space:]]" | grep -q LISTENING; then
    echo "ERROR: port $PORT already in use. Run ./stop-backend.sh first." >&2
    exit 1
fi

cd "$BACKEND"
echo "Starting uvicorn on $HOST:$PORT ..."
nohup "$PY" -m uvicorn app.main:app --host "$HOST" --port "$PORT" > "$LOG" 2>&1 &
echo $! > "$PIDFILE"

# Wait for the port to be listening (max 10s)
for i in $(seq 1 20); do
    sleep 0.5
    if netstat -ano 2>/dev/null | grep -E "[:.]${PORT}[[:space:]]" | grep -q LISTENING; then
        echo "Up. PID $(cat "$PIDFILE"). Log: $LOG"
        echo "Health: curl.exe http://localhost:$PORT/api/v1/health"
        exit 0
    fi
done

echo "ERROR: uvicorn did not bind to $PORT within 10s. Tail of log:" >&2
tail -n 30 "$LOG" >&2
exit 1

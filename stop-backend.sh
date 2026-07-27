#!/usr/bin/env bash
# Stop the workout_app backend by finding whichever python.exe holds port 8000.
# Usage: ./stop-backend.sh
# Also accepts PORT=8001 ./stop-backend.sh to stop a different port.

set -e

PORT="${PORT:-8000}"
KILLED=0

# 1) If a PID file is around, try that first.
if [ -f /tmp/uvicorn.pid ]; then
    SAVED=$(cat /tmp/uvicorn.pid 2>/dev/null || true)
    if [ -n "$SAVED" ]; then
        if netstat -ano 2>/dev/null | grep -E "[:.]${PORT}[[:space:]]" | grep -q "LISTENING.*$SAVED"; then
            echo "Killing PID $SAVED (from /tmp/uvicorn.pid, holding port $PORT)"
            taskkill //F //PID "$SAVED" >/dev/null 2>&1 && KILLED=1
        fi
    fi
    rm -f /tmp/uvicorn.pid
fi

# 2) Fallback: scan netstat for whatever python.exe is LISTENING on $PORT.
NETSTAT_OUT=$(netstat -ano 2>/dev/null | grep -E "[:.]${PORT}[[:space:]]" | grep LISTENING || true)
for line in $NETSTAT_OUT; do
    # Last whitespace-separated token is the PID
    PID=$(echo "$line" | awk '{print $NF}')
    if [ -n "$PID" ] && [[ "$PID" =~ ^[0-9]+$ ]]; then
        # Confirm it's python (the LISTENING process is the re-exec'd real Python)
        IMAGENAME=$(tasklist //FI "PID eq $PID" //FO CSV //NH 2>/dev/null | awk -F'","' '{print $1}' | tr -d '"' || true)
        if [ "$IMAGENAME" = "python.exe" ]; then
            echo "Killing PID $PID (holding port $PORT)"
            taskkill //F //PID "$PID" >/dev/null 2>&1 && KILLED=1
        fi
    fi
done

# 3) Last resort: nuke all python.exe that look like uvicorn workers.
if [ "$KILLED" -eq 0 ]; then
    PYPIDS=$(tasklist //FI "IMAGENAME eq python.exe" //FO CSV //NH 2>/dev/null | awk -F'","' '{print $2}' | tr -d '"' || true)
    for p in $PYPIDS; do
        CMD=$(wmic process where "ProcessId=$p" get CommandLine //value 2>/dev/null | grep CommandLine= || true)
        if echo "$CMD" | grep -q "uvicorn"; then
            echo "Killing PID $p (uvicorn worker)"
            taskkill //F //PID "$p" >/dev/null 2>&1 && KILLED=1
        fi
    done
fi

if [ "$KILLED" -eq 0 ]; then
    echo "No backend process found on port $PORT."
    exit 0
fi
echo "Stopped."

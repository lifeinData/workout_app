#!/usr/bin/env bash
# Convenience script: set up venv, install deps, seed DB, run uvicorn.
set -euo pipefail

cd "$(dirname "$0")"

VENV_DIR=".venv"
PY="${PYTHON:-python3}"

if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtualenv in $VENV_DIR ..."
    "$PY" -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

echo "Installing dependencies (editable, with dev extras) ..."
pip install --quiet --upgrade pip
pip install --quiet -e ".[dev]"

echo "Seeding database (idempotent) ..."
python -m app.seed.wger_import

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"

echo
echo "Starting uvicorn on $HOST:$PORT ..."
echo "  Swagger UI: http://localhost:$PORT/docs"
echo "  Health:     http://localhost:$PORT/api/v1/health"
echo
exec uvicorn app.main:app --host "$HOST" --port "$PORT" --reload

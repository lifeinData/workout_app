@echo off
REM Convenience script: set up venv, install deps, seed DB, run uvicorn.
setlocal enabledelayedexpansion

cd /d "%~dp0"

if not exist ".venv" (
    echo Creating virtualenv in .venv ...
    python -m venv .venv
)

call .venv\Scripts\activate.bat

echo Installing dependencies (editable, with dev extras) ...
pip install --quiet --upgrade pip
pip install --quiet -e .[dev]

echo Seeding database (idempotent) ...
python -m app.seed.wger_import

if "%HOST%"=="" set HOST=0.0.0.0
if "%PORT%"=="" set PORT=8000

echo.
echo Starting uvicorn on %HOST%:%PORT% ...
echo   Swagger UI: http://localhost:%PORT%/docs
echo   Health:     http://localhost:%PORT%/api/v1/health
echo.

uvicorn app.main:app --host %HOST% --port %PORT% --reload --timeout-graceful-shutdown 2

# Workout App Backend

FastAPI + SQLite backend for the React Native workout app (Expo Go, SDK 56).

Scope: **training only** — exercises, workouts, history, PRs, user preferences.
Community and nutrition remain in-app mocks. See [`../future_ideas.md`](../future_ideas.md).

## Prerequisites

- Python 3.11+
- pip

## Quick start

```bash
cd backend

# macOS / Linux
./run.sh

# Windows
run.bat
```

The script will:
1. Create a venv in `.venv/` if it doesn't exist
2. Install the package in editable mode with dev extras
3. Seed the database on first run (downloads exercises from wger, falls back to the bundled cache)
4. Start uvicorn on `0.0.0.0:8000`

To run without the script:

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
python -m app.seed.wger_import     # one-time seed
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## API docs

Once running, open <http://localhost:8000/docs> for the auto-generated Swagger UI.

## Endpoints

All `/me/*` routes require an `X-User-Id` header. The app generates a UUID and stores it in AsyncStorage.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Health check |
| `GET` | `/api/v1/exercises` | List exercises (filters: `muscle_group`, `equipment`, `q`, `limit`, `offset`) |
| `GET` | `/api/v1/exercises/{id}` | Get one exercise |
| `GET` | `/api/v1/workouts` | List workouts (filters: `location`, `equipment`) |
| `GET` | `/api/v1/workouts/{id}` | Get one workout with ordered exercises |
| `GET` | `/api/v1/me/preferences` | Get user preferences (mode, equipment, completed_today) |
| `PATCH` | `/api/v1/me/preferences` | Partial update of preferences |
| `GET` | `/api/v1/me/history?from=&to=` | Logged sets grouped by date → exercise |
| `POST` | `/api/v1/me/sets` | Log a new set (returns `is_pr` and the PR record if set) |
| `DELETE` | `/api/v1/me/sets/{set_id}` | Delete a set (recomputes the PR) |
| `GET` | `/api/v1/me/prs` | All personal records for this user |

## Connecting from the phone

The backend must be reachable from your phone over the network.

1. Find your laptop's LAN IP:
   - **Windows:** `ipconfig` → look for `IPv4 Address` (e.g. `192.168.1.42`)
   - **macOS / Linux:** `ifconfig` or `ip addr`
2. Update `app.json` in the React Native project root:
   ```json
   {
     "expo": {
       "extra": {
         "apiBaseUrl": "http://192.168.1.42:8000/api/v1"
       }
     }
   }
   ```
3. Restart Expo: `npx expo start --clear`
4. Make sure your phone and laptop are on the same WiFi network
5. (Android only) The app already has `usesCleartextTraffic` enabled in dev for HTTP

If you use the Android emulator instead of a physical device, the host's loopback is `10.0.2.2`, so the default `apiBaseUrl` of `http://10.0.2.2:8000/api/v1` works out of the box.

## Environment variables

All in `.env` (see `.env.example`):

| Var | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///./workout.db` | SQLAlchemy URL. For prod, swap to Postgres. |
| `HOST` | `0.0.0.0` | uvicorn bind address |
| `PORT` | `8000` | uvicorn bind port |
| `LOG_LEVEL` | `info` | Python logging level |
| `SEED_ON_STARTUP` | `true` | Auto-seed the DB on app startup if empty |

## Testing

```bash
cd backend
source .venv/bin/activate
pytest
```

Tests use an in-memory SQLite database (see `tests/conftest.py`) and the FastAPI `TestClient`.

## Data model

- `exercises` — exercise catalog (seeded from wger + 25 hand-curated)
- `workouts` — workout templates
- `workout_exercise_link` — order-preserving M2M
- `historical_sets` — every set ever logged, keyed by `(user_id, date, exercise_id)`
- `personal_records` — one row per `(user_id, exercise_id)`, recomputed on set delete
- `user_preferences` — one row per user, with auto-midnight rollover for `completed_workouts_today`

## Project layout

```
backend/
├── app/
│   ├── main.py            # FastAPI app, CORS, lifespan
│   ├── config.py          # Pydantic Settings
│   ├── db.py              # engine + get_session
│   ├── deps.py            # get_user_id
│   ├── models.py          # SQLModel tables
│   ├── schemas.py         # Pydantic request/response
│   ├── routers/
│   │   ├── exercises.py
│   │   ├── workouts.py
│   │   ├── me.py          # preferences
│   │   └── sets.py        # history, sets, PRs
│   └── seed/
│       ├── mappings.py    # wger enum IDs -> our strings
│       ├── exercise_seeds.py  # 25 hand-curated exercises
│       ├── workout_seeds.py   # 8 hand-curated workouts
│       └── wger_import.py     # main entry: `python -m app.seed.wger_import`
├── tests/
│   ├── conftest.py
│   └── test_api.py        # smoke tests
├── fixtures/
│   └── wger_cache.json    # auto-populated on first wger fetch
├── pyproject.toml
├── .env.example
├── run.sh
├── run.bat
└── README.md
```

## Design choices

- **FastAPI over Django**: lighter, modern async, type-safe Pydantic, auto OpenAPI docs. Django would be overkill for a single-purpose REST API.
- **SQLite over Postgres for dev**: zero-config, single file, same SQL when you migrate later.
- **wger for exercise catalog**: open source, MIT, ~500 exercises with muscle/equipment metadata. Falls back to a bundled cache if the API is unreachable.
- **Device UUID over real auth**: matches the single-user demo. Real auth is documented in `future_ideas.md`.
- **snake_case everywhere**: matches the DB. No camelCase conversion layer.
- **PR detection server-side**: single source of truth. The client just renders what the server says.
- **Idempotent seeds**: safe to re-run. Bundle the 25 hand-curated exercises so client IDs always resolve.

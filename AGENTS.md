# Project: workout_app

React Native (Expo SDK 56) fitness app. Four tabs (Home / Nutrition / Training / Community) with a custom warm-pastel design converted from a Figma source.

## Architecture

```
src/
├── app/                       # Expo Router file-based routing
│   ├── _layout.tsx            # NativeTabs + QueryClientProvider
│   ├── index.tsx               # Home / Dashboard tab
│   ├── training.tsx           # Training tab
│   ├── nutrition.tsx          # Nutrition tab (still mock data)
│   └── community.tsx          # Community tab (still mock data)
├── components/
│   ├── fitness/
│   │   ├── DashboardTab.tsx          # Home: macro rings, step counter, weekly bar
│   │   ├── AdherenceRing.tsx          # Floating ring overlay (Home)
│   │   ├── InterventionModal.tsx      # "Why did you skip?" sheet
│   │   ├── NutritionTab.tsx           # Calorie donut + diary + targets
│   │   ├── TrainingTab.tsx            # Mode/equipment filter, workout list, trophy room
│   │   ├── CommunityTab.tsx           # Board switcher
│   │   ├── nutrition/{CalorieDonut, NutrientTargets, AddFoodModal}.tsx
│   │   ├── community/{PostCard, PostComposer}.tsx
│   │   └── training/{TodayView, ExerciseLogger, HistoryView, WorkoutDetail, DemoVideoSheet}.tsx
│   └── animated-icon.tsx, themed-{text,view}.tsx, ui/  # legacy template bits
├── lib/                       # Shared client logic
│   ├── device.ts              # UUID v4 + AsyncStorage
│   ├── api.ts                 # Typed fetch wrapper (ApiError, NetworkError)
│   ├── queries.ts             # React Query hooks (useExercises, useLogSet, …)
│   └── dates.ts               # localDateKey, todayKeyLocal, fmtTimeLocal
├── data/                      # Legacy client-side data (keep for type re-exports)
│   ├── workoutLibrary.ts      # Hand-curated workouts/exercises (id-only, no logic)
│   ├── foodDatabase.ts        # Mock food data (to be moved to backend)
│   └── boards.ts              # Community board list (mock)
├── state/                     # Type exports only (no store, no data)
│   ├── trainingStore.ts       # Just exports `Equipment` and `Mode` types
│   └── communityStore.ts      # Legacy mock (to be removed)
├── hooks/                     # use-color-scheme, use-theme
├── constants/                 # Spacing, colors, theme tokens
└── global.css                 # Tailwind base + CSS variables for theme

backend/                       # FastAPI + SQLite + wger
├── app/
│   ├── main.py                # FastAPI app, CORS, lifespan, seed on startup
│   ├── config.py              # Pydantic Settings (DATABASE_URL, CORS_ORIGINS)
│   ├── db.py                  # engine, get_session, init_db
│   ├── deps.py                # get_user_id (X-User-Id header)
│   ├── models.py              # SQLModel tables
│   ├── schemas.py             # Pydantic request/response (snake_case on wire)
│   ├── routers/
│   │   ├── exercises.py       # GET /exercises, /exercises/{id}
│   │   ├── workouts.py        # GET /workouts, /workouts/{id}
│   │   ├── me.py              # GET/PATCH /me/preferences
│   │   └── sets.py            # GET /me/history, /me/prs; POST/DELETE /me/sets
│   └── seed/
│       ├── wger_import.py     # Main entry: `python -m app.seed.wger_import`
│       ├── mappings.py        # wger enum IDs → our strings
│       ├── exercise_seeds.py  # 27 hand-curated exercises
│       └── workout_seeds.py   # 8 workouts + their exercise links
├── tests/                     # 20 pytest tests, all passing
├── fixtures/wger_cache.json   # Cached wger response for offline seeding
├── pyproject.toml
├── run.sh / run.bat           # One-command setup + run
└── README.md

## Conventions

- **snake_case everywhere on the wire.** Backend Pydantic schemas, frontend TS interfaces, and the DB all use snake_case. No alias conversion.
- **IDs are stable strings** (e.g. `ex-bench`, `wger-9-2-handed-kettlebell-swing`). No integer IDs in the public API.
- **Server is source of truth for state.** Client uses React Query with cache invalidation; optimistic updates are best-effort and rolled back on error.
- **TypeScript strict.** No `any`. React Query hook results are fully typed via `UseQueryResult<T>` / `UseMutationResult<T, E, V>`.
- **Backend uses `snake_case` Python throughout** (PEP 8). Pydantic v2, SQLModel 0.0.22+, FastAPI 0.115+.
- **Dates are local YYYY-MM-DD on the client, UTC ISO 8601 on the server.** Conversion happens at the network boundary in `lib/dates.ts`.
- **No auth yet** — device UUID in `X-User-Id` header. See `future_ideas.md` for the plan.

## Running locally

1. Backend: `cd backend && run.bat` (or `./run.sh`). Listens on `0.0.0.0:8000`.
2. Find your laptop's LAN IP (`ipconfig` on Windows).
3. Update `app.json` → `extra.apiBaseUrl` to `http://<your-ip>:8000/api/v1`.
4. App: `npx expo start --clear`, scan QR with Expo Go.
5. Default `apiBaseUrl` of `http://10.0.2.2:8000/api/v1` works for Android emulator out of the box.

## Status

- **Phase 1 (backend):** complete, 20/20 pytest, 1,072 exercises seeded from wger + 8 workouts.
- **Phase 2 (frontend integration):** complete. Training tab fully wired to API.
- **Code review:** done, 10 issues found, 9 fixed, 1 deferred (cosmetic).
- **Deferred (in `future_ideas.md`):** auth, community scope, nutrition scope, image uploads, cross-device sync, offline queue, analytics, HealthKit, push notifications, dark mode polish.

## Open todos

- Verify on a physical device with the backend running.
- Start the dev server and confirm all 4 tabs render.
- Decide whether to build the community scope next or the nutrition scope (both are independent).

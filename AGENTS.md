# Project: workout_app

React Native (Expo SDK 56) fitness app + FastAPI/SQLite backend. Warm-pastel design
converted from Figma. Tabs: Home / Nutrition / Training / Community (+ Admin for admins).

**The Training tab is the built-out, backend-wired feature.** Nutrition and Community are
still mock data. This doc is the single source of truth for project state — read it first
so you don't re-derive context. `CLAUDE.md` just does `@AGENTS.md`, so this file IS the
context every session loads.

---

## Current status (what actually exists)

The Training tab is a **full session engine**, not the old flat set-logger. Everything
below is implemented and verified (89 backend tests pass; frontend `tsc --noEmit` + lint
clean on all touched files).

**Built:**
1. **Auth** — real. bcrypt (cost 12) + opaque Bearer session tokens (30-day TTL),
   signup/login/logout/logout-all, roles `user`/`admin`, slowapi rate limiting, CORS
   allowlist. (The old "device UUID in X-User-Id header" model is GONE.)
2. **Session engine** — `WorkoutSession` is the spine. Start a session (from a template or
   empty) → log sets on one `SessionScreen` → finish/abandon. Resumable server-side
   (survives app kill), durable, named, dated. Rest timer, per-workout prescriptions,
   lb/kg units, PR tracking (two bests: heaviest single + best Epley e1RM), warmup
   exclusion, history calendar keyed on user-local dates.
3. **Save-as-template + two tabs** (most recent feature) — finish a session → "Save as
   template" → it becomes a personal `Workout` (`owner_id` = you) that shows under the
   **My Workouts** tab on the start screen. **Coach's Playbook** tab = the owner-less
   admin/seeded catalog. Both start on the same `SessionScreen`. Sessions are renamable
   (tap the title); self-started sessions auto-title as `workout_2026_Aug_2_5:23PM`.
4. **Admin tab** — workout/exercise CRUD, exercise reorder, per-exercise prescription
   editing (`WorkoutEditorModal`).
5. **Architecture docs** — `docuemntation/` (7 chapters + 26 rendered Mermaid diagrams +
   an `index.html` browser viewer). Explains the whole session engine via user stories.

**Schema is at version 5.** Bumping `app.schema_version` in `backend/config/defaults.yaml`
triggers `seed_if_schema_changed()` → **deletes `backend/workout.db` and re-seeds** (the
project's dev "migration" mechanism; no Alembic). Seed accounts: `admin`/`admin1234`,
`user1`/`user11234`.

**Not visually verified:** the newest UI flows (My Workouts / Coach's Playbook tabs,
Save-as-template button, tap-to-rename title) pass tests but haven't been eyeballed on a
device/web. Everything before that was run on Android via Expo Go.

**Git:** substantial work may be ahead of the last commit — check `git status` / `git log`
before assuming the tree is committed.

---

## Architecture (current, accurate)

```
src/
├── app/                              # Expo Router
│   ├── _layout.tsx                   # Root: QueryClientProvider, AuthBridge, StatusBar
│   ├── (auth)/{_layout,login,signup}.tsx
│   └── (tabs)/
│       ├── _layout.tsx               # NativeTabs (native tab bar) + auth gate → /login
│       ├── index.tsx                 # Home
│       ├── nutrition.tsx  community.tsx   # still mock
│       ├── training.tsx              # renders TrainingTab
│       └── admin.tsx                 # only mounted when role === "admin"
├── components/fitness/
│   ├── TrainingTab.tsx               # thin router: activeSession ? SessionScreen : StartScreen; Train|History toggle
│   ├── ActiveSessionBar.tsx          # resume nudge (History sub-view); tab-icon badge lives in training.tsx
│   ├── SettingsSheet.tsx             # units, default rest, sign out
│   ├── DashboardTab / NutritionTab / CommunityTab / AdminTab.tsx
│   ├── AdherenceRing / InterventionModal.tsx
│   ├── admin/WorkoutEditorModal.tsx  # workout + prescription editor
│   └── training/
│       ├── StartScreen.tsx           # Start-empty btn, mode/equipment filter, phase placeholder,
│       │                             #   My Workouts / Coach's Playbook tabs, TrophyRoom
│       ├── SessionScreen.tsx         # THE logging surface (editable title, rest timer, blocks, add-exercise)
│       ├── ExerciseBlock.tsx / SetRow.tsx / RestTimerBar.tsx
│       ├── SessionSummarySheet.tsx   # post-finish recap + "Save as template"
│       ├── HistoryView.tsx           # calendar (server local_date) → session cards → read-only detail
│       └── DemoVideoSheet.tsx
├── lib/
│   ├── api.ts        # typed fetch (ApiError/NetworkError), all endpoint fns, 401 handler
│   ├── auth.ts       # Bearer token storage (AsyncStorage)
│   ├── queries.ts    # React Query hooks + `queryKeys` (add keys here, never inline)
│   ├── dates.ts      # localDateKey, fmtTimeLocal, fmtSessionDefaultName
│   ├── units.ts      # toKg/fromKg/fmtWeight/roundToIncrement
│   └── e1rm.ts       # Epley (client display only; server is authoritative)
├── hooks/            # use-rest-timer (deadline-anchored), use-color-scheme, use-theme
├── state/trainingStore.ts   # exports Equipment/Mode types only
└── global.css        # theme vars: --primary #e87d6f, --border #f0d9ce, --muted-foreground #8b7268, --secondary #fce4d8

backend/app/
├── main.py           # FastAPI app, CORS, rate-limit, lifespan seed-on-startup
├── config.py         # Pydantic Settings (nested: app/auth/database/server/seed) + defaults.yaml
├── db.py  deps.py    # engine/get_session/init_db; get_current_user/require_admin
├── models.py         # SQLModel tables (see Data model)
├── schemas.py        # Pydantic req/resp (snake_case wire)
├── units.py          # to_kg/from_kg + epley_e1rm_kg (KG_PER_LB = 0.45359237)
├── prs.py            # recompute_pr / apply_set_to_pr (warmups excluded)
├── timefmt.py        # utc_now_iso / utc_today_iso
├── rate_limit.py  auth_header.py
├── routers/{exercises, workouts, me, sessions, sets, auth, admin, _helpers}.py
└── seed/{wger_import, mappings, exercise_seeds, workout_seeds, initial_users}.py

backend/config/defaults.yaml   # schema_version, seed users, CORS allowlist, bcrypt cost, ...
backend/tests/{test_api, test_auth, test_admin, test_sessions}.py   # 89 tests
docuemntation/                 # architecture course (README.md + 7 chapters + diagrams/ + index.html)
```

---

## Data model (`backend/app/models.py`)

- **User** — id, username (unique lowercase), password_hash (bcrypt), role (`user`/`admin`),
  display_name, initials, timestamps.
- **Session** (`sessions`) — auth token PK, user_id, expires_at. *(distinct from WorkoutSession!)*
- **Exercise** — stable string id (`ex-bench`, `wger-…`), muscle_group, equipment (JSON),
  yt_id, defaults, pr_trackable.
- **Workout** (template) — id, name, tag, location, equipment, duration_min, **`owner_id`
  (nullable FK)**: `None` = coach catalog ("Coach's Playbook"); set = personal template
  ("My Workouts").
- **WorkoutExerciseLink** — (workout_id, exercise_id) PK, order_index, **prescription**:
  target_sets, target_reps_low/high, target_rest_sec, prescription_notes.
- **WorkoutSession** — `ses-…` id, user_id, workout_id (nullable = ad-hoc), name (snapshot),
  local_date (USER-local), tz_offset_min, started_at/ended_at (UTC), status
  (active|completed|abandoned). Exactly one `active` per user (router-enforced).
- **HistoricalSet** — session_id FK, local_date (copied from session, never recomputed),
  exercise_id, set_index (server-assigned), kind (`working`/`warmup`), weight (as entered)
  + weight_unit + **weight_kg (canonical, all comparisons)**, reps, rpe, was_pr, timestamp.
- **PersonalRecord** — (user_id, exercise_id) PK, two independent bests: best_weight_kg
  (heaviest single) and best_e1rm_kg (best Epley), each with reps/date.
- **UserPreference** — mode, equipment (JSON), completed_workouts_today, weight_unit,
  default_rest_sec.

---

## API surface (prefix `/api/v1`)

- **auth**: POST /auth/signup /login /logout /logout-all; GET /auth/me
- **exercises**: GET /exercises (?q= server search, muscle_group, equipment, limit); GET /exercises/{id}
- **workouts** (public): GET /workouts (coach catalog only — `owner_id IS NULL`); GET /workouts/{id}
- **me**: GET/PATCH /me/preferences
- **sessions**: POST /me/sessions (idempotent; returns existing active), GET /me/sessions/active
  (auto-abandons >24h stale), GET /me/sessions (?from&to on local_date), GET /me/sessions/{id},
  PATCH /me/sessions/{id} (status | notes | **name**), DELETE /me/sessions/{id}
- **personal templates**: GET /me/workouts (My Workouts), POST /me/workouts/from-session/{id}
  ("Save as template"; 422 if no working sets)
- **sets**: POST /me/sets (needs session_id; derives weight_kg + local_date + set_index),
  PATCH /me/sets/{id}, DELETE /me/sets/{id}, GET /me/prs, GET /me/exercises/{id}/history
- **admin** (require_admin): workout CRUD, add/remove/reorder exercises, prescription PATCH.
  Lists coach catalog only.

`SessionDetailResponse` is fat on purpose — embeds blocks (prescription + logged sets +
`last_time` from the prior session), so one request renders the whole session screen.

---

## Conventions

- **snake_case on the wire** everywhere (backend Pydantic, TS interfaces, DB). No aliasing.
- **IDs are stable strings.** (`HistoricalSet.id` int autoincrement is the one exception.)
- **Server is source of truth.** React Query + invalidation; optimistic updates roll back on
  error. Optimistic set writes target `queryKeys.activeSession`, mutating nested `blocks[].sets`.
- **TypeScript strict, no `any`.** Hooks typed via `UseQueryResult<T>` / `UseMutationResult<T,E,V>`.
- Backend: PEP 8, Pydantic v2, SQLModel, FastAPI. Explicit-allowlist patching in routers
  (do NOT use `model_dump(exclude_unset=True)` to apply patches).
- **Dates:** client sends/stores UTC ISO for timestamps; `local_date` (user's day) is a
  separate stored field for "which day". `lib/dates.ts` local helpers are display-only.

---

## Gotchas (bugs live here)

1. **`local_date`, never `date`.** A set's `local_date` is copied from its session, never
   derived from a timestamp (that reintroduces the timezone-off-by-one bug).
2. **Warmups (`kind == "warmup"`) are excluded from PRs and all volume totals.** Easiest to
   get silently wrong.
3. **Recompute `weight_kg` on every weight/unit write, including PATCH.**
4. **Order by autoincrement `id`, not `timestamp`** — `utc_now_iso()` has second resolution;
   same-second sets tie-break wrong on timestamp.
5. **`owner_id IS NULL` = coach catalog; set = personal.** `GET /workouts` and admin lists
   filter to null; personal templates only via `GET /me/workouts`.
6. **No `var(--*)` in inline RN styles** — NativeWind only compiles `className`. Use literal
   hex from `global.css`.
7. **Bumping `schema_version` wipes the dev DB.** Accept it or don't bump.
8. **Two "session" nouns:** `Session` (auth token) vs `WorkoutSession` (training). In
   `sessions.py` the DB session param is named `db` to avoid shadowing.

---

## Where to make common changes (task → files)

- **Add/change a session or set field:** `models.py` → `schemas.py` → `sessions.py`/`sets.py`
  → `src/lib/api.ts` (mirror the TS interface by hand) → `src/lib/queries.ts` (hook/cache).
  Bump `schema_version` if you touched a table (wipes dev DB).
- **New endpoint:** router in `backend/app/routers/` (register in `main.py`) → `api.ts` fn →
  `queries.ts` hook + `queryKeys` entry → consume in a component.
- **PR / e1RM / unit math:** backend is authoritative — `units.py` + `prs.py`. `src/lib/{units,e1rm}.ts`
  are display-only mirrors; keep the formulas in sync.
- **Training UI:** `src/components/fitness/training/`. The session logging screen is
  `SessionScreen.tsx`; the pre-session picker is `StartScreen.tsx`.
- **Theme colors:** `src/global.css` (light + a dark `prefers-color-scheme` block). Use the
  hex literals in RN inline styles; `className` for NativeWind.
- **Seed data / accounts / CORS / schema version:** `backend/config/defaults.yaml`
  (+ `backend/app/seed/`).
- **Types are hand-mirrored** between `schemas.py` and `api.ts` — nothing auto-generates
  them, so a backend field change silently no-ops on the client until you update `api.ts`.
  `tsc` catches *renames/removals* at consumers, not *additions*.

## Running locally

**Backend** (creates venv, installs, seeds, runs uvicorn on `0.0.0.0:8000`):
```
cd backend && run.bat          # Windows   |   ./run.sh   # macOS/Linux
curl http://localhost:8000/api/v1/health   # → {"status":"ok",...}
```
Tests: `cd backend && .venv/Scripts/python.exe -m pytest -q`  (89 passing)

**Config & env overrides:** `config.py` uses Pydantic Settings with
`env_nested_delimiter="__"`, layered over `backend/config/defaults.yaml`. Override any
nested value via env var, e.g. `DATABASE__PATH_TEMPLATE=sqlite:///:memory:` (tests use
this), `DATABASE__SEED_ON_STARTUP=false`, `AUTH__BCRYPT_COST=4` (fast tests). Sections:
`app`, `auth`, `database`, `server`, `seed`.

**Frontend — fastest, no phone (web preview):** set `app.json → extra.apiBaseUrl` to
`http://localhost:8000/api/v1`, then `npx expo start --web` → open http://localhost:8081.
Log in `admin`/`admin1234`.

**Frontend — on Android via Expo Go:** phone + laptop on same WiFi; set `apiBaseUrl` to the
laptop's **current** LAN IP (`ipconfig`; it changes with DHCP), add that IP to
`server.cors_origins` in `defaults.yaml`, `npx expo start`, scan QR. Frontend typecheck:
`npm run typecheck`. Lint: `npx expo lint` (some pre-existing warnings in untouched files).

> If you change `apiBaseUrl`, restart Metro with `--clear` (read at bundle time).

Full walkthrough + the session-engine "why" is in `docuemntation/` and `README.md`.

---

## Deferred / next candidates (`future_ideas.md`)

- Editing/deleting personal templates (reuse `WorkoutEditorModal`, gate to owner).
- Real coach↔client model + per-athlete/per-date assignments ("programs/mesocycles").
- Alembic (before any deploy where data must survive schema changes).
- Nutrition + Community backend scopes (both still mock).
- Offline queue, cross-device sync, background rest timer (needs dev build).

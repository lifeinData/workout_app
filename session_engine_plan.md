# Training Tab → Full Session Engine

Execution plan for coding agents. Written to be handed out task-by-task; each task
names its files, its acceptance criteria, and how to verify it.

---

## Context

The Training tab looks finished but is missing one entity, and nearly every gap
traces back to that absence: **there is no `WorkoutSession`.**

Sets are stored as free-floating `HistoricalSet` rows keyed by
`(user_id, date, exercise_id)`. Consequences:

- **"Finish workout" doesn't persist anything durable.** `WorkoutDetail.tsx:22`
  appends the workout id to `UserPreference.completed_workouts_today`, a list that
  **resets at midnight** (`me.py:65`). There is no record that you did *Push Day A*
  on a given date.
- **Two parallel logging surfaces write to the same undifferentiated table.**
  `TodayView` and `WorkoutDetail` both render `ExerciseLogger` against the same
  rows. Log a set in the workout modal, close it, and it reappears in Today with
  no indication it belonged to a workout. This is the most confusing thing in the
  tab today.
- **No resume.** Close the modal and all session state is gone.
- **Duration is wrong.** `TodayView.tsx:56` computes `now - firstSetTimestamp`, so
  logging at 6am and checking at 10pm reports "960 min".
- **No prescription.** `WorkoutExerciseLink` carries only `order_index`, so target
  sets/reps come from the *exercise* (`default_sets`, `default_reps_label`).
  "Bench 5×5" and "Bench 3×12" cannot coexist in two different workouts.
- **No last-time reference.** The most-used feature in Strong/Hevy — "Last: 185×8,
  185×8, 180×7" — has no endpoint and no UI.
- **No rest timer.**

Outcome: one resumable, durable session as the spine of the tab; a row-based logger
with last-time prefill; per-workout prescriptions; a correct PR model; lb/kg support.

### Locked decisions (do not re-litigate)

| Decision | Choice |
|---|---|
| Scope | Full session engine |
| Backend | **Keep FastAPI + SQLite.** No Supabase, no BaaS migration |
| Exercise catalog | **Server-backed.** `GET /exercises?q=` with debounced server-side search |
| Migration | **Bump `app.schema_version` 3 → 4**, accept the DB wipe. No Alembic |
| Prescriptions | **Per-workout** (on `WorkoutExerciseLink`) |
| Units | **lb + kg**, user preference, canonical kg for all comparisons |
| Rest timer | **Foreground only.** `expo-haptics` + `expo-keep-awake`. No `expo-notifications`, stays in Expo Go |
| Phase card | **Leave as a hardcoded placeholder** (`TrainingTab.tsx:289-304`). Do not delete, do not wire up |
| Deploy / Postgres / env-var base URL | **Out of scope** |

### Migration mechanism (important — this is why there is no Alembic work)

`wger_import.seed_if_schema_changed()` (`wger_import.py:253`) compares
`backend/.schema_version` against `settings.app.schema_version`. On mismatch it
**deletes the SQLite file**, recreates all tables via
`SQLModel.metadata.create_all`, and re-seeds exercises + workouts + users.

So: bump `schema_version: 3` → `4` in `backend/config/defaults.yaml` and every new
table and column appears on the next boot. **This destroys all logged sets and
re-creates users from YAML** (`admin` / `admin1234`, `user1` / `user11234`). That is
accepted. Alembic is listed under Deferred.

---

## Conventions (from `AGENTS.md` — agents must follow)

- **snake_case on the wire.** Backend Pydantic, frontend TS interfaces, and DB all
  use snake_case. No alias conversion anywhere.
- **IDs are stable strings.** No integer IDs in the public API (`HistoricalSet.id`
  is the one existing exception; keep it).
- **TypeScript strict, no `any`.** React Query hooks fully typed via
  `UseQueryResult<T>` / `UseMutationResult<T, E, V>`.
- **Server is source of truth.** React Query with cache invalidation; optimistic
  updates are best-effort and rolled back on error.
- Backend: PEP 8 snake_case, Pydantic v2, SQLModel, FastAPI.
- Explicit-allowlist patching in routers — see `admin.py:216-231` for the pattern
  and the reason. Do not use `model_dump(exclude_unset=True)` to apply patches.

### Reuse these — do not reimplement

| Existing | Path | Use for |
|---|---|---|
| `build_workout_detail` | `backend/app/routers/_helpers.py:20` | Any workout detail response |
| `_renormalize_order_indexes` | `backend/app/routers/admin.py:49` | Canonical `0..N-1` after link mutations |
| `_get_workout_or_404` | `backend/app/routers/admin.py:72` | Workout 404s |
| `utc_now_iso`, `utc_today_iso` | `backend/app/timefmt.py` | All server timestamps |
| `get_current_user`, `require_admin` | `backend/app/deps.py:64,77` | Auth on every new route |
| `seeded_client`, `user_bearer_headers`, `admin_bearer_headers` | `backend/tests/conftest.py:117,138,131` | All new tests |
| `getNextOptimisticId` | `src/lib/queries.ts:43` | Negative sentinel ids for optimistic sets |
| `localDateKey`, `fmtTimeLocal` | `src/lib/dates.ts:23,40` | Local date keys and time display |
| `queryKeys` | `src/lib/queries.ts:52` | Every cache key. Add new ones here, never inline |
| Theme hex values | `src/global.css:5-33` | Colors. `--primary` is `#e87d6f`, `--border` `#f0d9ce`, `--muted-foreground` `#8b7268` |

---

## Architecture

```
BEFORE                                  AFTER
                                        WorkoutSession (active | completed | abandoned)
TodayView ──┐                             │
            ├──> HistoricalSet           └──> HistoricalSet.session_id
WorkoutDetail┘    (loose rows)
                                        SessionScreen  ← one logging surface
```

Frontend routing collapses from three segments to two, driven by session state:

```
Train ─┬─ active session? → SessionScreen   (replaces TodayView + WorkoutDetail)
       └─ none            → StartScreen     (workout picker + "Start empty workout")
History → calendar (server local_date) → session list → read-only session detail
```

---

## Data model

All in `backend/app/models.py`. New table + four modified.

```python
class WorkoutSession(SQLModel, table=True):
    __tablename__ = "workout_sessions"
    id: str = Field(primary_key=True, max_length=64)          # "ses-<uuid4.hex[:12]>"
    user_id: str = Field(max_length=64, index=True)
    workout_id: Optional[str] = Field(default=None, max_length=64,
                                     foreign_key="workouts.id")  # None = ad-hoc
    name: str = Field(max_length=200)          # snapshot; workout may be renamed later
    local_date: str = Field(max_length=10, index=True)   # YYYY-MM-DD, USER-local
    tz_offset_min: int = Field(default=0)      # minutes east of UTC
    started_at: str = Field(max_length=32)     # UTC ISO
    ended_at: Optional[str] = Field(default=None, max_length=32)
    status: str = Field(default="active", max_length=12, index=True)
    notes: Optional[str] = Field(default=None, max_length=2000)
```

```python
class HistoricalSet(SQLModel, table=True):     # MODIFIED
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(max_length=64, index=True)
    session_id: str = Field(max_length=64, foreign_key="workout_sessions.id", index=True)
    local_date: str = Field(max_length=10, index=True)   # denormalized from session
    exercise_id: str = Field(max_length=64, foreign_key="exercises.id", index=True)
    set_index: int = Field(default=0)          # 0-based per (session, exercise), server-assigned
    kind: str = Field(default="working", max_length=8)   # "working" | "warmup"
    weight: float = Field(ge=0)                # AS THE USER ENTERED IT
    weight_unit: str = Field(default="lb", max_length=2)
    weight_kg: float = Field(ge=0, index=True) # canonical — ALL comparisons use this
    reps: int = Field(ge=1)
    rpe: Optional[float] = Field(default=None, ge=1, le=10)
    was_pr: bool = Field(default=False)        # snapshot at log time, for history badges
    timestamp: str = Field(max_length=32)      # UTC ISO
    # REMOVED: `date` (was UTC YYYY-MM-DD). Use `local_date`.
```

Why both `weight` and `weight_kg`: plate math is exact in its native unit — 135 lb
must display as `135`, not `61.2`. Storing the entered value keeps display lossless;
`weight_kg` keeps comparison correct across units.

```python
class PersonalRecord(SQLModel, table=True):    # REPLACED
    user_id: str = Field(primary_key=True, max_length=64)
    exercise_id: str = Field(primary_key=True, max_length=64, foreign_key="exercises.id")
    best_weight_kg: float = Field(ge=0)        # heaviest single working set
    best_weight_reps: int = Field(ge=1)
    best_weight_date: str = Field(max_length=10)
    best_e1rm_kg: float = Field(ge=0)          # best estimated 1RM (Epley)
    best_e1rm_weight_kg: float = Field(ge=0)
    best_e1rm_reps: int = Field(ge=1)
    best_e1rm_date: str = Field(max_length=10)
    updated_at: str = Field(max_length=32)
```

Replaces the old single `weight * reps` score, which made 135×20 (2700) outrank
315×3 (945) — and contradicted the trophy check at `TrainingTab.tsx:415`, which
compares `pr.weight >= threshold`.

```python
class WorkoutExerciseLink(SQLModel, table=True):   # MODIFIED — keep class + table name
    workout_id: str = Field(foreign_key="workouts.id", primary_key=True, max_length=64)
    exercise_id: str = Field(foreign_key="exercises.id", primary_key=True, max_length=64)
    order_index: int = Field(default=0)
    target_sets: int = Field(default=3, ge=1, le=20)
    target_reps_low: int = Field(default=8, ge=1, le=100)
    target_reps_high: Optional[int] = Field(default=12, ge=1, le=100)
    target_rest_sec: int = Field(default=90, ge=0, le=1800)
    prescription_notes: Optional[str] = Field(default=None, max_length=500)
```

```python
class UserPreference(SQLModel, table=True):    # MODIFIED — add two fields
    weight_unit: str = Field(default="lb", max_length=2)
    default_rest_sec: int = Field(default=90, ge=0, le=1800)
```

### New backend modules

`backend/app/units.py`
```python
KG_PER_LB = 0.45359237
def to_kg(weight: float, unit: str) -> float
def from_kg(kg: float, unit: str) -> float
def epley_e1rm_kg(weight_kg: float, reps: int) -> float   # w*(1+reps/30); reps<=1 → w
```

`backend/app/prs.py` — replaces `_recompute_pr` in `sets.py:19`
```python
def recompute_pr(session, user_id, exercise_id) -> PersonalRecord | None
    """Rebuild both bests from all remaining kind=="working" sets.
    Deletes the PR row if no working sets remain. Stages only — caller commits."""

def apply_set_to_pr(session, user_id, exercise_id, s: HistoricalSet) -> tuple[bool, PersonalRecord | None]
    """Incremental update on insert. Returns (is_pr, pr_row).
    is_pr is True if EITHER best improved. Ignores kind=="warmup" (returns (False, existing))."""
```

**Warmup sets are excluded from PRs and from all volume totals.** This is the single
easiest thing to get wrong.

---

## API contracts

`SessionDetailResponse` is the workhorse — it embeds prescriptions, logged sets, and
last-time data so the client needs **one request** to render the whole session
screen. This kills an N+1 before it exists.

```python
class SessionExerciseBlock(BaseModel):
    exercise: ExerciseResponse
    order_index: int
    target_sets: int
    target_reps_low: int
    target_reps_high: int | None
    target_rest_sec: int
    prescription_notes: str | None
    sets: list[HistoricalSetResponse]          # this session, ordered by set_index
    last_time: list[HistoricalSetResponse]     # same exercise, most recent PRIOR session

class SessionDetailResponse(BaseModel):
    id: str
    user_id: str
    workout_id: str | None
    name: str
    local_date: str
    tz_offset_min: int
    started_at: str
    ended_at: str | None
    status: str
    notes: str | None
    blocks: list[SessionExerciseBlock]
    total_sets: int                # working sets only
    total_volume_kg: float         # working sets only
    duration_sec: int | None       # ended_at - started_at, else now - started_at

class SessionSummaryResponse(BaseModel):       # for the history list
    id: str
    workout_id: str | None
    name: str
    local_date: str
    started_at: str
    ended_at: str | None
    status: str
    total_sets: int
    total_volume_kg: float
    duration_sec: int | None
    exercise_count: int
    pr_count: int                  # sets in this session with was_pr=True
```

**Block ordering:** if `workout_id` is set, blocks come from the workout's
prescriptions in `order_index` order, then any exercise with logged sets that is
*not* in the prescription is appended (ad-hoc additions), ordered by first set
timestamp. For ad-hoc sessions (`workout_id is None`), blocks are exercises with
logged sets ordered by first set timestamp.

### `backend/app/routers/sessions.py` (new)

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/v1/me/sessions` | Body `{workout_id?, local_date, tz_offset_min, name?}`. **Idempotent:** returns `200` + the existing active session if one exists, else `201`. `404` if `workout_id` given and not found. Snapshots `name` from the workout |
| `GET` | `/api/v1/me/sessions/active` | `200` → `SessionDetailResponse` or JSON `null`. **Side effect:** auto-abandons any active session with `started_at` older than `STALE_SESSION_HOURS = 24` before returning |
| `GET` | `/api/v1/me/sessions/{id}` | `404` if not owned by caller |
| `GET` | `/api/v1/me/sessions?from=&to=&limit=&offset=` | `list[SessionSummaryResponse]`. Filters on **`local_date`**. `limit` default 50, max 200 |
| `PATCH` | `/api/v1/me/sessions/{id}` | Body `{status?: "completed"\|"abandoned", notes?}`. Sets `ended_at = utc_now_iso()` on transition out of `"active"`. `409` if already terminal and `status` supplied |
| `DELETE` | `/api/v1/me/sessions/{id}` | `204`. Deletes the session **and its sets**, then `recompute_pr` for every affected exercise |

Exactly **one** active session per user. Enforce in the router by querying
`status == "active"` — do not attempt a partial unique index (dialect-specific).

### `backend/app/routers/sets.py` (rework)

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/v1/me/sets` | Body now `{session_id, exercise_id, weight, weight_unit, reps, kind?="working", rpe?, timestamp?}`. **`session_id` required.** `409` if session not `active`, `404` if not owned or exercise missing. Server assigns `set_index` and derives `weight_kg` + `local_date` |
| `PATCH` | `/api/v1/me/sets/{id}` | **NEW.** Body `{weight?, weight_unit?, reps?, kind?, rpe?}`. Re-derives `weight_kg`, calls `recompute_pr`. Returns `SetLogCreatedResponse` |
| `DELETE` | `/api/v1/me/sets/{id}` | `204`. `recompute_pr`, then renormalize `set_index` to `0..N-1` for that `(session, exercise)` |
| `GET` | `/api/v1/me/prs` | New `PersonalRecordResponse` shape |
| `GET` | `/api/v1/me/exercises/{exercise_id}/history?limit=20` | Per-session rollup for the progress chart: `{session_id, local_date, sets, best_weight_kg, best_e1rm_kg, volume_kg}` |
| — | ~~`GET /api/v1/me/history`~~ | **REMOVE.** Superseded by `GET /me/sessions`. Delete `HistoryResponse` from `schemas.py` |

### `backend/app/routers/me.py`

`PreferencesPatch` / `PreferencesResponse` gain `weight_unit` (`^(lb|kg)$`) and
`default_rest_sec` (`ge=0, le=1800`). Keep `mode`, `equipment`,
`completed_workouts_today`, `client_today` exactly as they are.

### `backend/app/routers/admin.py`

| Method | Path | Notes |
|---|---|---|
| `PATCH` | `/api/v1/admin/workouts/{workout_id}/exercises/{exercise_id}/prescription` | Body `{target_sets?, target_reps_low?, target_reps_high?, target_rest_sec?, prescription_notes?}`. Returns `WorkoutDetailResponse`. `422` if `target_reps_high` is not null and `< target_reps_low` |

`WorkoutCreate.exercise_ids` stays `list[str]`; new links get schema defaults, then
are edited via the PATCH above. Do not make `WorkoutCreate` accept nested objects.

### Additive response change — no client breakage

```python
class WorkoutExerciseResponse(ExerciseResponse):   # SUBCLASS, not a replacement
    order_index: int
    target_sets: int
    target_reps_low: int
    target_reps_high: int | None
    target_rest_sec: int
    prescription_notes: str | None
```

`WorkoutDetailResponse.exercises` becomes `list[WorkoutExerciseResponse]`. Mirror on
the TS side as `interface WorkoutExerciseResponse extends ExerciseResponse`. Because
it only *adds* fields, every existing consumer (`WorkoutEditorModal`, anything
reading `.name` / `.yt_id`) keeps compiling. Update `build_workout_detail`
(`_helpers.py:20`) to select links and populate the new fields — it already fetches
the links, so this is a small edit, not a rewrite.

---

## Frontend file map

**New**
```
src/lib/units.ts                                    lb/kg conversion + formatting
src/lib/e1rm.ts                                     Epley, client-side display
src/hooks/useRestTimer.ts                           deadline-anchored countdown
src/components/fitness/ActiveSessionBar.tsx          persistent bar across all tabs
src/components/fitness/SettingsSheet.tsx             units, default rest, sign out
src/components/fitness/training/SessionScreen.tsx    the one logging surface
src/components/fitness/training/ExerciseBlock.tsx    header + rows for one exercise
src/components/fitness/training/SetRow.tsx           one editable set row
src/components/fitness/training/RestTimerBar.tsx     sticky timer strip
src/components/fitness/training/StartScreen.tsx      picker (extracted from TrainingTab)
src/components/fitness/training/SessionSummarySheet.tsx  post-finish recap
```

**Modified**
```
src/lib/api.ts                          types + endpoint fns
src/lib/queries.ts                      hooks; retarget optimistic writes
src/components/fitness/TrainingTab.tsx  becomes a thin router
src/components/fitness/training/HistoryView.tsx   sessions instead of loose sets
src/app/(tabs)/_layout.tsx              mount ActiveSessionBar
src/components/fitness/admin/WorkoutEditorModal.tsx   prescription fields
backend/config/defaults.yaml            schema_version 3 → 4
```

**Deleted** (superseded)
```
src/components/fitness/training/TodayView.tsx
src/components/fitness/training/WorkoutDetail.tsx
src/components/fitness/training/ExerciseLogger.tsx
```

### SessionScreen composition

```
SessionScreen
├─ SessionHeader       name · elapsed · N sets · volume · [Finish]
├─ RestTimerBar        sticky, only while running:  −15s │ 1:23 │ +15s │ Skip
├─ FlatList<ExerciseBlock>
│    ├─ header    muscle group · name · "3 × 8–12" · PR chip · ▶ demo
│    ├─ SetRow[]  logged rows + greyed prescribed placeholders
│    │            cols:  #  │  last time  │  weight  │  reps  │  ✓ / ✗
│    └─ [Add set] [Add warmup]
├─ [Add exercise]  → ExercisePicker (debounced server search)
└─ SessionSummarySheet  on finish: duration, volume, PRs hit
```

`SetRow` behaviour — this interaction is the difference between "works" and "feels
like a real app":
- Prescribed-but-unlogged rows render greyed, prefilled from `last_time` as
  placeholder text. Tap **✓** to commit → `POST /me/sets`.
- Tap a logged row → inline edit → `PATCH /me/sets/{id}`.
- **✗** → `DELETE`, with an undo toast.

`StartScreen` keeps, in order: **[Start empty workout]**, the mode/equipment filter
card, the **phase placeholder card unchanged**, the workout list (tapping a workout
starts a session from it), and `TrophyRoom`.

---

## Tasks

Dependency chain: `P0` is independent. `P1 → P2 → P3`. `P4` needs `P2`.
`P5`, `P6` need `P4`. `P7` needs `P2`.

### P0 — Frontend bug fixes (no backend, no schema, shippable alone)

**T0.1 — Equipment chips actually filter.** `src/components/fitness/TrainingTab.tsx:222-228`

`eqOk` is currently `w.equipment.every((e) => e === "bodyweight" || isKnownEquipment(e))`
— it checks the token is in a known *vocabulary* and never consults the user's
selection. `equipment` is in the dep array but unused in the body.

Replace with: a workout passes if every piece of equipment it needs is `"bodyweight"`
or in the user's selected set. **When the selection is empty, do not filter** — an
empty selection means "unknown", not "I own nothing", and filtering would show an
empty list on first load. Memoize the `Set` in `TrainingTab` (line 92 rebuilds it
every render). Delete the now-unused `KNOWN_EQUIPMENT` / `isKnownEquipment`.

Vocabulary is confirmed to match `EQUIPMENT_CHIPS` ids exactly — the seeds emit only
`barbell, dumbbells, bodyweight, cable, machine, kettlebell, bands`
(`mappings.py:33`, `exercise_seeds.py`). The stray `"band"` and `"other"` in
`KNOWN_EQUIPMENT` are never produced.

*Accept:* selecting only "Bodyweight" narrows the list to bodyweight workouts;
deselecting everything restores the full list.

**T0.2 — Two `ExerciseLogger` defects.** `src/components/fitness/training/ExerciseLogger.tsx`

1. **Weight field can't be cleared** (lines 42-44). The effect has `weight` in its
   deps and fires when `weight === ''`, so backspacing to empty immediately refills
   it — once a set exists the input is locked to `lastWeight`. Fix: prefill once per
   exercise mount (or track a `hasUserEdited` flag); do not re-derive from `weight`.
2. **`backgroundColor: 'var(--primary)'` in an inline RN style** (line 209).
   NativeWind only compiles `className`; RN's colour parser does not resolve CSS
   custom properties, so the Add-set button's background is not applying. Use the
   literal `#e87d6f` / `#faeadd` from `global.css:12,16`, or move to `className`.

*Note:* this file is deleted in T5.6. Do these two fixes only if you want P0
shippable on its own — otherwise skip and let T5.2 supersede it.

**T0.3 — Add a typecheck script.** `package.json`

Add `"typecheck": "tsc --noEmit"`. Run it, fix anything it surfaces. Every later
task's acceptance depends on this being green.

**T0.4 — (Optional) Calendar dots land on the wrong day.** `src/components/fitness/training/HistoryView.tsx:59,107`

`formatDate` uses `localDateKey`, then looks the result up in `datesWithHistory`,
whose keys are the server's **UTC** dates. At UTC−5..−8 a set logged at 8pm local is
filed under tomorrow's UTC date, so the marker renders one square late.

Correct client-side fix without a schema change: every set carries a full UTC
`timestamp`, so re-bucket by `localDateKey(new Date(s.timestamp))`. Add
`groupHistoryByLocalDate` to `src/lib/dates.ts`.

**T6.1 replaces this file's data source with server-authoritative `local_date` and
removes the helper.** Do T0.4 only if P0 ships standalone; otherwise skip it.

---

### P1 — Backend schema, units, PR engine

**T1.1 — Models.** `backend/app/models.py`

Add `WorkoutSession`; modify `HistoricalSet`, `PersonalRecord`,
`WorkoutExerciseLink`, `UserPreference` exactly as specified under **Data model**.
Remove `HistoricalSet.date`.

*Accept:* `python -c "from app.models import WorkoutSession"` succeeds;
`python -c "from app.db import init_db; init_db()"` creates all tables.

**T1.2 — Units + PR engine.** `backend/app/units.py`, `backend/app/prs.py` (both new)

Signatures under **New backend modules**. Delete `_recompute_pr` from `sets.py:19`
and route all callers through `prs.recompute_pr`.

Epley: `e1rm = w * (1 + reps/30)`; for `reps <= 1` return `w` unchanged.
Both functions **must ignore `kind == "warmup"`**.

*Accept:* `to_kg(135, "lb") == 61.234...`; `from_kg(to_kg(135,"lb"), "lb")` round-trips
to `135.0` within 1e-9; `epley_e1rm_kg(100, 1) == 100`; `epley_e1rm_kg(100, 10) ≈ 133.33`.

**T1.3 — Schemas.** `backend/app/schemas.py`

Add `SessionCreate`, `SessionPatch`, `SessionExerciseBlock`, `SessionDetailResponse`,
`SessionSummaryResponse`, `WorkoutExerciseResponse`, `SetLogPatch`,
`ExerciseSessionRollup`, `PrescriptionPatch`. Modify `SetLogCreate`,
`HistoricalSetResponse`, `PersonalRecordResponse`, `PreferencesPatch`,
`PreferencesResponse`. Change `WorkoutDetailResponse.exercises` to
`list[WorkoutExerciseResponse]`. **Delete `HistoryResponse`.**

**T1.4 — Bump schema version + seed prescriptions.**

- `backend/config/defaults.yaml`: `schema_version: 3` → `4`.
- `backend/app/seed/workout_seeds.py:89-96`: the two seed workouts get real
  prescriptions instead of schema defaults. Extend each `SEED_WORKOUTS` entry with a
  per-exercise prescription list and pass it into `WorkoutExerciseLink`. Suggested:
  `w-upper-power` compound lifts `4 × 5–8 @ 150s`, accessories `3 × 10–15 @ 60s`;
  `w-home-bw` all `3 × 12–20 @ 45s`.

*Accept:* delete `backend/workout.db` and `backend/.schema_version`, run `run.bat`,
then `GET /api/v1/workouts/w-upper-power` returns per-exercise `target_sets` /
`target_reps_low` that differ between compounds and accessories.

---

### P2 — Backend routers

**T2.1 — Sessions router.** `backend/app/routers/sessions.py` (new)

All six endpoints per **API contracts**. Register in `backend/app/main.py:79`
alongside the other `/api/v1` routers (note `me.py` and `sets.py` both already use
`prefix="/me"` — follow that pattern).

Watch: idempotent `POST` (200 vs 201); the stale-session auto-abandon in
`GET /active`; `ended_at` set on terminal transition; block-ordering rules;
`DELETE` cascading to sets **then** recomputing PRs for affected exercises.

**T2.2 — Sets router rework.** `backend/app/routers/sets.py`

`session_id` required on `POST`; new `PATCH /me/sets/{id}`; server-assigned
`set_index`; `weight_kg` + `local_date` derived server-side; PR calls via
`app.prs`; add `GET /me/exercises/{id}/history`; **delete `GET /me/history`**.

`local_date` on a set is copied from its session — never recomputed from the
timestamp.

**T2.3 — Preferences.** `backend/app/routers/me.py`

Add `weight_unit` and `default_rest_sec` to both GET and PATCH. Follow the existing
explicit-allowlist patch style (`me.py:100-113`).

**T2.4 — Prescriptions + detail builder.** `backend/app/routers/admin.py`, `backend/app/routers/_helpers.py`

Add the prescription PATCH. Update `build_workout_detail` to emit
`WorkoutExerciseResponse` with the link's prescription fields (it already loads the
links at `_helpers.py:37` — populate from those, don't add a query).

---

### P3 — Backend tests

Current suite: 57 tests across `test_api.py` (20), `test_auth.py` (22),
`test_admin.py` (15). All must stay green.

**T3.1 — `backend/tests/test_sessions.py` (new).** Cover: create → 201; create again
→ 200 + same id; `GET /active` when none → `null`; log sets into a session; finish →
`ended_at` set, `GET /active` → `null`; `POST /me/sets` into a finished session →
409; another user's session → 404; stale auto-abandon (insert a session with
`started_at` 25h ago via `db_session`); `DELETE` cascades and recomputes PRs;
`blocks` ordering for both prescribed and ad-hoc sessions; `last_time` populated
from the prior session only.

**T3.2 — Update `backend/tests/test_api.py`.** New set payload shape, new PR shape,
`/me/history` gone → `/me/sessions`. Add: warmup sets excluded from PRs and volume;
`PATCH /me/sets/{id}` recomputes PRs; a heavy low-rep set beats a light high-rep set
on `best_weight_kg` (the old `weight*reps` bug); mixed-unit sets compare correctly on
`weight_kg`.

---

### P4 — Frontend data layer (no UI)

**T4.1 — `src/lib/api.ts`.** Mirror every new/changed schema as a TS interface.
`WorkoutExerciseResponse extends ExerciseResponse`. Add endpoint fns for all six
session routes, `updateSet`, `getExerciseHistory`. Remove `getHistory` and
`HistoryResponse`. Reuse the existing `request` / `toQuery` helpers unchanged.

**T4.2 — `src/lib/queries.ts`.** New `queryKeys` entries:

```ts
activeSession: ["me","sessions","active"] as const,
session: (id: string) => ["me","sessions",id] as const,
sessions: (from?: string, to?: string) => ["me","sessions","list",from??null,to??null] as const,
exerciseHistory: (id: string, limit?: number) => ["me","exercises",id,"history",limit??20] as const,
```

Hooks: `useActiveSession` (`staleTime: 0`), `useSession`, `useSessions`,
`useStartSession`, `useFinishSession`, `useAbandonSession`, `useUpdateSet`,
`useExerciseHistory`. Rework `useLogSet` / `useDeleteSet`.

⚠ **Retarget the optimistic writes.** `useLogSet` (line 193) and `useDeleteSet`
(line 252) currently patch every `["me","history"]` cache. That key is gone — they
must patch `queryKeys.activeSession` instead, mutating the right
`blocks[].sets` array. Keep the existing snapshot/rollback structure and reuse
`getNextOptimisticId` (line 43) for the negative sentinel. `onSettled` invalidates
`activeSession`, `sessions`, and `prs`.

**T4.3 — `src/lib/units.ts`, `src/lib/e1rm.ts`.**
```ts
export type WeightUnit = "lb" | "kg";
export function toKg(w: number, u: WeightUnit): number
export function fromKg(kg: number, u: WeightUnit): number
export function roundToIncrement(v: number, u: WeightUnit): number  // 2.5 lb / 1.25 kg
export function fmtWeight(kg: number, u: WeightUnit): string        // "135" / "61.2"
export function epley(weightKg: number, reps: number): number
```

---

### P5 — Frontend session UI

**T5.1 — Rest timer.** `src/hooks/useRestTimer.ts`

`npx expo install expo-haptics expo-keep-awake` (both work in Expo Go).

```ts
useRestTimer(): { remainingSec, targetSec, isRunning, start(sec), stop(), addTime(sec), skip() }
```

**Anchor on a `Date.now()` deadline, not a decrementing counter** — an interval
counter drifts badly when the app is backgrounded. `Haptics.notificationAsync(Success)`
at zero. `useKeepAwake()` while a session is active. Foreground only — no
notification code (locked decision).

**T5.2 — `SetRow.tsx` + `ExerciseBlock.tsx`.** Behaviour under **SessionScreen
composition**. Auto-start the rest timer on a successful set commit using the
block's `target_rest_sec`, falling back to `preferences.default_rest_sec`.
Guard `id < 0` before `PATCH`/`DELETE` (optimistic placeholder) — the existing
`ExerciseLogger.tsx:83` does this; keep it.

**T5.3 — `SessionScreen.tsx` + `SessionSummarySheet.tsx`.** Header with live elapsed
time from `started_at` (not from the first set — that was the old bug). Finish →
`PATCH status=completed` → summary sheet with duration, working-set volume, PRs hit.

**T5.4 — `StartScreen.tsx` + `TrainingTab.tsx` as a router.** Extract the existing
`WorkoutsView` (`TrainingTab.tsx:204-336`) into `StartScreen`, adding
**[Start empty workout]** at the top and making a workout tap call
`useStartSession({workout_id})`. **Keep the phase placeholder card byte-for-byte**
(lines 289-304). `TrainingTab` becomes: `useActiveSession()` → `SessionScreen` |
`StartScreen`, plus the History segment. The Today/Workouts/History three-way toggle
becomes a two-way Train/History toggle.

**T5.5 — `ActiveSessionBar.tsx`.** Persistent strip above the tab bar on every tab
while a session is active: `Push Day A · 12:04 · 8 sets`, tapping routes to
`/training`.

⚠ **Known-risky.** `(tabs)/_layout.tsx:122` renders `NativeTabs`, a *native* tab bar
— overlaying JS views on it is fragile. Preferred: wrap `<NativeTabs>` in a
`<View style={{flex:1}}>` and absolutely position the bar above the tab bar height.
**If that fights the native bar, fall back** to rendering the bar only inside the
Training screen plus a badge on the tab icon, and note it in `AGENTS.md`. Do not
spend more than one attempt on the overlay.

**T5.6 — Delete superseded files.** `TodayView.tsx`, `WorkoutDetail.tsx`,
`ExerciseLogger.tsx`. Confirm no remaining imports (`grep -rn "TodayView\|WorkoutDetail\|ExerciseLogger" src/`).

---

### P6 — History, settings, trophies, picker

**T6.1 — `HistoryView.tsx` reworked to sessions.** Calendar marks come from
`useSessions(from, to)` keyed on server `local_date` — **no client re-bucketing**,
and remove `groupHistoryByLocalDate` if T0.4 added it. Tap a day → list of
`SessionSummaryResponse` cards (name, duration, sets, volume, PR count) → tap a card
→ read-only session detail. Keep the existing calendar grid markup
(lines 93-145); only the data source changes.

**T6.2 — `SettingsSheet.tsx`.** Weight-unit toggle (lb/kg), default rest duration,
Sign out. Open from a gear icon in the Training header. **Remove the Sign out button
from the Training header** (`TrainingTab.tsx:125-138`) — a destructive auth action
does not belong in a content tab. Do *not* add a sixth tab.

**T6.3 — `TrophyRoom` fix.** `TrainingTab.tsx:380-473` (moves into `StartScreen`).
Store `TROPHY_DEFS` thresholds in **kg**, compare against `pr.best_weight_kg`, and
display via `fmtWeight` in the user's unit. Hide any trophy whose `exerciseId` is
absent from the catalog — the five hardcoded ids (`ex-bench`, …) are brittle now
that 1,072 exercises come from wger.

**T6.4 — Debounced server search in the exercise picker.** Replace the client-side
`filter` over 1,072 rows (`TodayView.tsx:163-167`, carried into the new picker) with
`useExercises({ search: q, limit: 50 })` behind a ~250 ms debounce. The server param
already exists (`exercises.py:22`, `q`). Also collapse the three divergent
`useExercises` call sites (`TrainingTab.tsx:86` limit 500, `TodayView.tsx:18` no
limit, `HistoryView.tsx:22` limit 500) — three cache entries over overlapping data —
onto one shared key.

---

### P7 — Admin prescription editing

**T7.1 — `WorkoutEditorModal.tsx`.** 824 lines; extend, don't rewrite. Each row in
the `draftExercises` list (state at line 124) gets editable `target_sets`,
`target_reps_low`–`target_reps_high`, `target_rest_sec`. Reuse the existing `Field`
component (line 698) and `styles` (line 724). Save via
`useAdminUpdatePrescription`. Validate `target_reps_high >= target_reps_low`
client-side to match the server's 422.

---

## Gotchas — the things agents get wrong here

1. **`local_date`, never `date`.** `HistoricalSet.date` is removed. A set's
   `local_date` is copied from its session, never derived from a timestamp.
2. **Recompute `weight_kg` on every weight or unit write**, including `PATCH`.
3. **Warmups (`kind == "warmup"`) are excluded from PRs and from every volume
   total.** Easiest thing to get silently wrong.
4. **Optimistic writes go to `queryKeys.activeSession`, not `["me","history"]`.**
5. **`WorkoutExerciseResponse` subclasses `ExerciseResponse`** so the change is
   additive. Don't "fix" it into a standalone model — that breaks
   `WorkoutEditorModal` for no gain.
6. **No `var(--*)` in inline RN styles.** Use `className` or the literal hex from
   `src/global.css`.
7. **One active session per user**, enforced in the router.
8. **`NativeTabs` overlay is fragile** — one attempt, then take the documented
   fallback (T5.5).
9. **Elapsed time comes from `session.started_at`**, never from the first set's
   timestamp.
10. **Keep the phase placeholder card exactly as-is.** It is deliberately fake.

---

## Verification

Per task:
```bash
# backend
cd backend && python -m pytest -q            # 57 existing + new, all green

# frontend
npm run typecheck                             # added in T0.3
npx expo lint
```

End-to-end, after P5:
```bash
# 1. Force the schema-4 wipe and re-seed
rm backend/workout.db backend/.schema_version
cd backend && ./run.sh          # or run.bat

# 2. Confirm the new schema landed
curl -s localhost:8000/api/v1/health
curl -s localhost:8000/api/v1/workouts/w-upper-power | python -m json.tool
#    → exercises[] carry target_sets / target_reps_low / target_rest_sec

# 3. App
npx expo start --clear
```

Manual pass on a device (`app.json → extra.apiBaseUrl` must be the laptop's LAN IP):

1. Log in as `admin` / `admin1234`.
2. Training → **Start empty workout** → add an exercise → log a set.
   Rest timer starts automatically; haptic fires at zero.
3. **Switch to the Home tab.** The active-session bar is visible. Tap it → back
   into the session with all sets intact.
4. **Force-quit and reopen.** The session is still active with its sets — this is
   the whole point of the phase.
5. Log a heavy low-rep set (e.g. 315×3) and a light high-rep set (135×20).
   `best_weight_kg` reflects **315**, not the higher-volume set.
6. Add a **warmup** set. It does not change PRs and is excluded from session volume.
7. Edit a logged set's weight → PR updates. Delete a set → PR recomputes downward.
8. **Finish** → summary sheet shows duration, volume, PRs hit → tab returns to
   StartScreen.
9. History → today's square is marked **on the correct local day** (log a set after
   7pm local to exercise the old UTC bug) → tap → session card → detail.
10. Settings → switch to **kg**. Every weight re-renders converted; logging in kg
    then switching to lb shows equivalent values.
11. Start a session from **w-upper-power**. Prescribed rows appear greyed with
    `4 × 5–8` on compounds and `3 × 10–15` on accessories, prefilled from last time.
12. Admin tab → edit a prescription → reflected in a newly started session.

---

## Deferred (add to `future_ideas.md`)

- **Alembic migrations.** The `schema_version` wipe is dev-only. Needed before any
  deploy where data must survive a schema change.
- Postgres + hosting + `EXPO_PUBLIC_API_BASE_URL` (explicitly out of scope).
- Background rest timer via `expo-notifications` (needs a dev build).
- On-device bundled SQLite exercise catalog (`expo-sqlite` + `expo-asset`).
- Programs / mesocycles — would replace the hardcoded phase card.
- Supersets, circuits, drop sets; plate calculator; per-exercise progress charts
  (`GET /me/exercises/{id}/history` already returns the series;
  `react-native-svg` is already a dependency).
- Merging `free-exercise-db` (~870 exercises, Unlicense, includes instructions and
  photos) into the wger seed — most wger rows have no `yt_id`, so `DemoVideoSheet`
  has nothing to show. Verify the licence text before redistributing.

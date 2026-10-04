@AGENTS.md

In any case of ambiguity, always ask the human clarifying questions, NEVER EVER wait to ask

---

> **New session? Read this whole file first.** `AGENTS.md` (imported above) has the deep
> data-model/API/conventions detail, but its "Current status" section is OLDER than this
> file — **where they conflict, THIS file wins.** The dated log below is the source of
> truth for what actually exists right now.

## App at a glance

Expo/React Native (Expo SDK 57) fitness app + FastAPI/SQLite backend. Tabs: **Home ·
Nutrition · Training · Community** (+ **Coach** for coaches). Only **Training** is
backend-wired; Nutrition and Community are still mock data. Warm-pastel Figma design.

**Training (the built-out feature):**
- **Auth** — real accounts (bcrypt + Bearer session tokens), roles `user`/`coach`
  (there is NO `admin` role since 2026-10-04). Dev seed accounts: `ad`/`ad` (coach, with
  athletes `a`/`a` and `user1`/`user11234`), `admin`/`admin1234` (coach, no athletes).
- **Session engine** — start a workout from Coach's Playbook or empty → log sets on one
  `SessionScreen` → finish or discard. Resumable server-side, one active session per user.
  Rest timer, lb/kg units, PR tracking (heaviest single + best Epley e1RM), warmups
  excluded from PRs/volume, per-user-local-date history calendar (completed sessions only).
- **Two lists on the Start screen:**
  - **My Workouts** (default tab) = **the user's own past completed sessions.** Tapping one
    **re-opens it for editing in place** (dates immutable, elapsed frozen). Each card has a
    **Repeat** button → starts a NEW session dated today, same exercises, empty rows.
  - **Coach's Playbook** = for athletes, ONLY workouts their current coach SENT them
    (`GET /me/playbook`), behind a coach card (DM + unread badge). No coach → coach picker
    (request → coach accepts). Coaches see the full shared library here. Prescriptions
    show as "Target 3 × 10 @ 135 lb · Rest 1:00".
- **Import from a previous workout** — from an empty session's empty state; seeds exercises
  + empty set rows (the replacement for the old "templates" concept).
- **Coach tab** — Workouts (shared library CRUD, "Added by Coach X", Send to athletes)
  · Athletes ("New requests" accept/decline vs "Your athletes" roster; each opens a DM).

## ⚠️ Big architecture fact: there are NO templates anymore

The old model had a separate `Workout` "personal template" row created when you finished
a session. **That was removed (2026-08-22).** Personal `Workout` rows no longer exist;
`GET /me/workouts` returns the user's **completed `WorkoutSession`s**. `owner_id` stays on
the `Workout` model ONLY so Coach's Playbook (`owner_id IS NULL`) keeps working — nothing
ever sets it to a user now. If you see code creating personal templates or a
`from-session` endpoint, it's dead/removed.

---

## Current state — dated progress log (newest first)

Schema is at **version 8**. Bumping `app.schema_version` in `backend/config/defaults.yaml`
**wipes + reseeds `backend/workout.db`** on next backend start (the dev "migration").
Backend tests: **167 passing**.

**2026-10-04 (late night) — remote-tester setup + mock tabs disabled**
- Home / Nutrition / Community triggers are `disabled` (still visible; tap → "Coming soon"
  info toast via `listeners.tabPress`). The app opens on Training: Home moved
  `(tabs)/index.tsx` → `(tabs)/home.tsx` (route `/home`), and a root `src/app/index.tsx`
  `<Redirect href="/training">` catches every cold start (`initialRouteName` alone did NOT
  work — `/` *was* the Home tab). Every post-login `router.replace` targets `"/training"`.
- `share.ps1` (repo root) lets a remote tester use Expo Go: Cloudflare quick tunnel to :8000
  (no account; `cloudflared` installed via winget) → `EXPO_PUBLIC_API_BASE_URL` (now the
  top-priority override in `getBaseUrl()`) → `npx expo start --tunnel --clear`
  (`@expo/ngrok` installed globally). This PC's DNS (NordVPN) is slow to resolve new
  trycloudflare hosts, so the script health-checks via 1.1.1.1.

**2026-10-04 (night) — smooth toasts** (frontend only)
- `react-native-toast-message` animated with `useNativeDriver: false` on Android, i.e. on
  the JS thread — the same moment a set log floods it (optimistic write + refetches +
  full-tree re-render), so the banner stuttered. Replaced by our own
  **`src/components/ui/Toast.tsx`** (same `Toast.show({type,text1,text2})` API;
  `<ToastHost />` mounted in `_layout.tsx` inside a new `GestureHandlerRootView`).
  Reanimated UI-thread slide (220 ms ease-out, no spring), swipe-up/tap to dismiss,
  reduced-motion = fade. Types: `success` · `pr` (coral trophy, peach surface) · `error` · `info`.
  The old package is still in `package.json` but unused.
- JS-thread load cut: the 1 s elapsed clock is its own `Elapsed` component (no more
  whole-SessionScreen re-render every second); `ExerciseBlock` is `memo`'d (ignores function
  props — SessionScreen routes them through a latest-`handlers` ref, so keep doing that
  for any new callback prop).
- Use `.get()`/`.set()` on Reanimated shared values, not `.value` — the React Compiler
  lint rules flag `.value` writes.

**2026-10-04 (evening) — unified set rows + delete-session icon** (no schema bump)
- Playbook and empty sessions now share ONE row model in `ExerciseBlock`: rows = target
  sets (prescribed) / imported / 1, changed only by "+ Add additional set" or row deletes;
  row counts live in `SessionScreen` (`rowCounts`) so they survive pending→server remounts.
  Deleting a block's last row removes it (prescribed blocks hidden client-side via `hiddenIds`).
- New response-only field `SessionExerciseBlock.is_prescribed` — the target line shows only
  when true (ad-hoc additions to a coach workout no longer show a fake "Target 3 × 10").
- Header "⋯" menu → trash `IconButton` + confirm → hard `DELETE /me/sessions/{id}` via
  `useDeleteSession`, for live AND past sessions.
- Set rows commit ONLY typed values: grey hints (coach target / last time) never fill a
  missing field. Previously blurring Weight committed the row with the hinted reps and
  yanked focus to set 1. Both fields must be typed, in every flow.

**2026-10-04 (later) — Admin → Coach: athletes, sending, DMs + bug fixes** (schema 7→8, DB wiped)
- Agenda: `agent_plans/agent_agenda_2026_10_04_coach_features.md`; QA: `manual_qa_2026_10_04_coach_features.md`.
- **Role `admin` → `coach`** everywhere (`require_coach`, `/api/v1/coach/*`, tab `coach.tsx`).
- New tables: `CoachLink` (pending|accepted|declined|cancelled|ended; one active per
  athlete), `WorkoutAssignment` (coach sends a library workout to their accepted athletes),
  `Message` (DMs, allowed only while a pending/accepted link exists; polling, no push).
  Routers: `coaching.py`, `messages.py`.
- `Workout`: dropped `tag` + `location`; `duration_min` optional; `equipment` auto-computed
  from exercises; `created_by`/`created_at` added. Prescription: `target_reps` (single) +
  `target_weight_kg` replace reps low/high; rest default 60. Target weight prefills the
  set-row weight placeholder.
- Editor (`coach/WorkoutEditorModal.tsx`) has no footer: back / backdrop / Android back =
  save + close. Reuses Training's `training/ExercisePickerSheet.tsx`.
- Fixed: invisible Sign in / Create workout / editor Save buttons + stacked Edit/Delete
  (function-form Pressable styles — see gotcha #6), SafeAreaView deprecation warning.

**2026-10-04 — SDK 56 → 57 upgrade + LAN-IP auto-detect**
- Upgraded to **Expo SDK 57** (RN 0.86.3, React 19.2.3, Reanimated 4.5.1, worklets 0.10.1)
  because Play-Store Expo Go only runs the latest SDK. `expo-doctor` 21/21.
- `android.usesCleartextTraffic` is no longer valid in `app.json` → moved to the
  `expo-build-properties` plugin (needed for dev/release builds hitting the HTTP backend).
- Verified: typecheck clean, lint identical to pre-upgrade baseline, 116 pytest, Android
  bundle export OK, and a scripted Playwright web run of login/signup → start (coach +
  empty) → log sets/PR → resume → finish/summary → My Workouts edit → Repeat → History →
  Admin editor → exercise search. Pre-upgrade backup: `../workout_app_backup_sdk56_2026_10_04/tree.tar`.
- Web-only quirks (not on device): NativeTabs render as a floating top bar that overlaps
  the session header/Finish; `Alert.alert` (discard confirm) is a no-op on web; nested
  `<button>` warning from the session ⋯ menu Modal.

**2026-08-22 evening — exercise search/data + UI polish**
- **Exercises were never deleted** (a misdiagnosis was investigated & disproven). Real bugs
  fixed: (1) search was naive `ilike '%q%'` so `pullup` found nothing — now normalized
  (strips `-`/spaces/case) + token-AND match; (2) picker had no pagination — now infinite
  scroll with a `X-Total-Count` header and "Showing N of TOTAL".
- **Foreign exercise names fixed at the import** (wger's `language` param is ignored by
  their API) AND reconciled in the existing DB **in place** (no wipe): corrected foreign
  names to English, deleted genuinely-foreign UNreferenced rows, kept any row referenced by
  a logged set. Catalog ~860. `_is_probably_english` remains a query-time safety net.
  Re-run correction via `python -m app.seed.wger_import --reconcile`.
- **Modal backdrops fixed app-wide** — see the theming gotcha below.
- Rest timer: manual-only, single compact row, edit→play now commits+starts in one press.
- Summary sheet redesigned; session cards de-noised (no more dashed-outline-on-every-row).

**2026-08-22 morning — the "no more templates" rework** (biggest change; DB was wiped, v6→7)
- Removed personal templates; My Workouts = past sessions; editing completed sessions
  allowed (set writes accept `active`|`completed`, reject `abandoned`); Repeat + Import
  added; auto-title is now `Aug 21 · 11:11 PM` (no "workout_" prefix); History shows
  completed only.

**2026-08-22 (session 2, earlier)** — rest-timer manual-only rewrite, compact header
(`‹ back · title · Finish · ⋯`), keyboard fixes (`softwareKeyboardLayoutMode: resize` +
`keyboardShouldPersistTaps`), delete rule = deleting the LAST set removes the exercise.

**2026-08-21** — Start-screen declutter, ad-hoc logging redesign (auto-commit on entry,
dashed→green rows, "Set N" pills), equipment chips moved into the Add-exercise sheet.

> The finished summary sheet is rendered by **`TrainingTab`**, not `SessionScreen` —
> finishing nulls `activeSession` which unmounts `SessionScreen`, so a sheet owned by it
> would vanish. Keep it in the parent.

---

## How we plan & execute work (the workflow the human expects)

Work comes in as **bug reports with screenshots** under `bugs/bug_reports_<date>/`
(`bugs_<date>.md` + `workoutN.jpg`). The human's repeated ask: **"make a plan so your
lesser models can execute on it."** The loop is:

1. **Read the bug report AND every referenced screenshot.** Use the Read tool on the
   `.jpg`s — several bugs are visual and the text alone misleads.
2. **Investigate before planning.** Grep/read the actual code; when a claim is checkable
   (counts, "X is broken", "you deleted Y"), verify it against the DB/running server. More
   than once the reported cause was wrong (e.g. "deleted 90% of exercises" was a search
   bug; "login broken" was the phone autocapitalizing the password). Don't plan a fix for
   a misdiagnosis.
3. **Ask clarifying questions** (AskUserQuestion) for anything ambiguous or any decision
   that changes scope — especially destructive ones (DB wipes) and product choices. Record
   the answers as "Decisions — RESOLVED" in the agenda.
4. **Write the agenda to `agent_plans/agent_agenda_<date>_<slug>.md`.** Structure that has
   worked: Ground rules → Investigation findings → Dependency map (waves) → one section per
   task (exact absolute paths, anchors/line refs, acceptance checkboxes, verify commands,
   ⚠️ do-NOT-regress notes) → Decisions resolved → Out of scope. Write tasks for
   **Sonnet-level subagents**: explicit, self-contained, no guessing.
5. **Execute in waves via the Agent tool** (`subagent_type: general-purpose`,
   `model: sonnet`). Parallelize tasks on **disjoint files**; sequence anything that shares
   a file or depends on another's output. Each subagent must run `npm run typecheck` /
   `npx expo lint` / `pytest` and report literally. The main session (you) does the final
   verification wave + writes a `manual_qa_<date>_<slug>.md` (agents can't eyeball a device).
6. **Nothing is committed** unless the human asks. Report what changed + what needs a device.

Existing artifacts to learn the format from: `agent_plans/agent_agenda_2026_08_22_*.md`
and the matching `manual_qa_*.md`.

---

## Gotchas learned this cycle (bit us; will bite you)

1. **`uvicorn --reload` does NOT pick up `defaults.yaml`** (or reliably reload on .py edits
   in this setup). A `schema_version` bump only applies on a **cold restart**. To force the
   wipe/reseed: kill the uvicorn process tree and cold-start
   `.venv/Scripts/python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000`.
   Verify via `.schema_version` file + a fresh seed-account `created_at`.
   **Stuck on "Reloading…"** = the old worker waits forever for the app's polling
   keep-alive connections. `run.bat`/`run.sh` now pass `--timeout-graceful-shutdown 2`;
   if it still hangs, kill the `multiprocessing spawn_main` python child and the reloader
   respawns a worker.
2. **Theme colors are hex CSS vars, so Tailwind opacity modifiers silently render
   transparent.** `tailwind.config.js` maps `foreground: "var(--foreground)"` and
   `--foreground` is `#3d2b26` (hex, not RGB channels). So `bg-foreground/50`,
   `bg-primary/25`, etc. compile to an invalid color = **invisible**. This caused every
   modal backdrop and the rest-timer progress bar to be invisible. Workaround in use:
   explicit `style={{ backgroundColor: 'rgba(61,43,38,0.5)' }}` at each site. **Proper fix
   (deferred): convert the theme vars to RGB-channel format** so `/NN` works natively —
   until then, never use a `/opacity` modifier on a themed color; use literal RGBA.
3. **Password `TextInput`s need `autoCapitalize="none"` + `autoCorrect={false}`.** The
   phone keyboard autocapitalized the first char, turning `a` → `A`, so seed logins 401'd
   even though the server was fine. Server lowercases usernames but NOT passwords.
4. **`schema_version` bump = data loss.** Only bump when a table changed AND the human has
   accepted the wipe. Prefer in-place reconciles for reference data (see the exercise fix).
5. **After changing `app.json` or any bundle-time config, restart Metro with `--clear`.**
   LAN-IP drift is FIXED (2026-10-04): in dev, `getBaseUrl()` in `src/lib/api.ts` derives
   the backend host from Metro's `Constants.expoConfig.hostUri` (port 8000), so DHCP
   changes no longer break the phone. `app.json → apiBaseUrl` is now only a fallback
   (release builds / tunnel mode). Phone still can't connect? → same Wi-Fi, and Windows
   Firewall allowing inbound :8000.
6. **NEVER `style={({ pressed }) => …}` on a Pressable** — NativeWind drops it on device
   (no background → invisible white text; no flexDirection → stacked buttons), *even when it
   returns StyleSheet refs*. Typecheck/lint/web all pass. Use `src/components/ui/*`
   primitives or static styles with `useState` pressed. Check: `grep -rn "style={({" src`.

---

## What we want to work on next

Roughly in priority order; see `future_ideas.md` for the full list + rationale.

- **Delete/rename UI for My Workouts entries** — a session can be deleted via
  `DELETE /me/sessions/{id}` but it's not wired to the UI.
- **Theme opacity cleanup** — convert `tailwind.config.js` colors to RGB-channel format so
  `bg-x/NN` works (removes the RGBA workarounds). See gotcha #2.
- **Workout filtering UI** — re-home the home/gym/all mode filter (removed from the Start
  screen; logged in `future_ideas.md`) and make equipment filtering server-side
  (currently client-side over loaded pages; API takes one equipment string, prefs is a set).
- **Exercise language** — a few accent-free foreign names still slip through; a real
  language-preference setting is the future fix (English-only is hardcoded for now).
- **Responsive/polish** — keep the UI fluid across phone sizes (target: Galaxy S23 Ultra),
  respect OS font scaling (cap ~1.3×); fix the Trophy Room carousel's fixed-width paging.
- **Programs / coaching** — real coach↔client model with per-athlete, per-date assignments.
- **Nutrition & Community backends** — both still mock; need real data models + endpoints.
- **Durability** — Alembic before any deploy where data must survive a schema change.
- **Offline & sync** — queue set writes when offline; cross-device sync;
  keyboard auto-scroll of the focused set row (deferred in the morning session).

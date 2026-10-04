# Workout App

React Native (Expo SDK 56) fitness app with a custom warm-pastel design and a Python/FastAPI backend.

> **TL;DR — see it running right now, no phone needed (two terminals):**
> ```bash
> # Terminal 1 (backend)
> cd backend && run.bat          # Windows   |   ./run.sh    # macOS/Linux
>
> # Terminal 2 (frontend, web preview)
> npx expo start --web
> ```
> Open **http://localhost:8081** in a browser. Log in with `admin` / `admin1234`
> (or `user1` / `user11234`). See [§0 below](#0-fastest-way-to-see-it-running-web-preview)
> for the full walkthrough, or skip to [physical-device setup](#frontend-dev-setup) if
> you want it on your phone with haptics and the real native tab bar.

---

## 0. Fastest way to see it running (web preview)

This is the loop with the least ceremony — no phone, no cable, no LAN IP juggling.
Expo can render the app straight into a browser tab, and the backend just needs to be
reachable at `localhost`.

**1. Start the backend** (first run creates the venv, installs deps, seeds the DB from
wger, then starts uvicorn — takes ~15–30s the first time, instant after):

```bash
cd backend
run.bat          # Windows
./run.sh         # macOS / Linux
```

Wait for `Application startup complete.` in the log, then sanity-check it:

```bash
curl http://localhost:8000/api/v1/health
# → {"status":"ok","version":"0.1.0"}
```

**2. Point the app at `localhost` for this preview.** `app.json → expo.extra.apiBaseUrl`
is normally set to your laptop's LAN IP for physical-device testing — for a
same-machine web preview, temporarily change it to:

```json
"apiBaseUrl": "http://localhost:8000/api/v1"
```

> Remember to change it back to your LAN IP before testing on a physical device —
> see [§2 of Frontend dev setup](#2-point-the-app-at-your-backend).

**3. Start Expo in web mode**, from the repo root:

```bash
npx expo start --web
```

Metro bundles (a few seconds), then opens **http://localhost:8081** automatically —
if it doesn't, open it yourself.

**4. Log in.** The seed creates two accounts (`backend/config/defaults.yaml`):

| Username | Password | Role |
|---|---|---|
| `admin` | `admin1234` | admin — sees the Admin tab too |
| `user1` | `user11234` | regular user |

**5. Walk the core loop** — this exercises the whole session engine in one pass:

1. **Training tab → tap a workout card** (e.g. "Upper Body Power"). This starts a
   session — the screen becomes the live logging view, with exercises pre-populated
   from that workout's prescription (compounds first at `4×5–8`, accessories after at
   `3×10–15`).
2. **Type a weight and reps into the first placeholder row, tap the checkmark.** The
   set commits, a rest timer starts automatically (150s for compounds, 60s for
   accessories), and if it's a PR you'll see a toast and a 🏆 badge on the exercise.
3. **Switch to the Home or Admin tab, then back.** A red dot appears on the Training
   tab icon the whole time a session is active — that's the cross-tab "you're mid-workout"
   indicator.
4. **Tap Finish.** You get a summary sheet (duration, volume, PRs); the tab reverts to
   the workout picker.
5. **Training → History → today's date.** The session you just finished shows up as a
   named, dated card — tap it for a read-only breakdown of every set.

If all five steps work, the whole rewrite documented in `docuemntation/` is functioning
end-to-end.

**6. When you're done**, stop both processes (`Ctrl+C` in each terminal, or see
[§5 below](#5-stop-it) for the background-process variant), and **revert `app.json`**
to your LAN IP if you changed it.

> **Heads-up on the schema version.** If this is your first run after pulling recent
> backend changes, `run.bat`/`run.sh` may delete and re-seed `backend/workout.db` (this
> happens automatically whenever `app.schema_version` in `defaults.yaml` changes — see
> `docuemntation/04-session-lifecycle.md`). That wipes any previously logged sets and
> recreates the two accounts above from scratch. This is expected in dev, not a bug.

---

## Architecture

```
workout_app/
├── src/                  # React Native app (Expo Router, NativeWind, React Query)
├── backend/              # FastAPI + SQLite + wger exercise seed
├── figma_zip/            # Reference design (read-only)
└── AGENTS.md             # Project context for opencode sessions in this folder
```

## Prerequisites

- Node.js 22+
- Python 3.11+
- Android phone with [Expo Go](https://expo.dev/go) installed (or Android emulator)
- For physical-device testing: both phone and laptop on the same WiFi

---

## Backend dev setup

The backend is a FastAPI service backed by SQLite. On first start it seeds the DB from [wger](https://wger.de) (an open-source exercise catalog with ~1,000 exercises).

### 1. Start it (pick one)

**One-command start (recommended for first run)** — creates venv, installs deps, seeds DB, runs uvicorn:

```bash
cd backend
./run.sh        # macOS / Linux
run.bat         # Windows
```

You'll see:
```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

Swagger UI: <http://localhost:8000/docs>
Health check: `curl.exe http://localhost:8000/api/v1/health`

**Run it in the background on Windows** (so you don't lose the shell):

Single-line version (paste exactly as one line, no breaks — **substitute your own
checkout path** for `<repo>`, e.g. `C:\Python Projects\react_native_projects\workout_app`):

```powershell
Start-Process -FilePath "<repo>\backend\.venv\Scripts\python.exe" -ArgumentList "-m","uvicorn","app.main:app","--host","0.0.0.0","--port","8000" -WorkingDirectory "<repo>\backend" -WindowStyle Hidden
```

If you want to break it across lines for readability, PowerShell uses the **backtick `` ` `` at the END of a line** to continue — but be careful copying multi-line backticked strings, as markdown can eat the backticks. The verified single-line version above is the safest.

> **Critical:** use `0.0.0.0`, not `127.0.0.1`, so your phone can reach the backend over WiFi. `127.0.0.1` only binds to loopback (the laptop itself) — the phone will get connection refused.

**The non-hanging pattern:** do NOT add `-RedirectStandardOutput` or `-RedirectStandardError` to `Start-Process`. Those flags create file handles that the bash tool will wait for, hanging the call. If you need logs, either:
- Use a separate process: `Get-Content C:\path\to\backend.log -Wait` (after configuring uvicorn with `--log-config`)
- Or just don't capture logs and let the window be hidden

**Manual start** (if you want to control each step):

```bash
cd backend
python -m venv .venv
# Activate:
.venv\Scripts\activate         # Windows
# source .venv/bin/activate    # macOS / Linux

pip install -e ".[dev]"

# Seed the database (~14s first time, instant after)
python -m app.seed.wger_import

# Run (note: --host 0.0.0.0 for phone access)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Verify it's running

```bash
# Health check
curl.exe http://localhost:8000/api/v1/health
# → {"status":"ok","version":"0.1.0"}

# Should return 8 workouts
curl.exe http://localhost:8000/api/v1/workouts
```

### 3. Find your LAN IP (for physical-device testing)

The phone needs to reach the backend over your local network:

```bash
ipconfig            # Windows — look for "IPv4 Address" (e.g. 192.168.1.42)
ifconfig            # macOS
ip addr             # Linux
```

Then verify the backend is reachable on that IP:
```bash
curl.exe http://192.168.1.42:8000/api/v1/health
# → {"status":"ok","version":"0.1.0"}
```

If this fails, the backend is bound to `127.0.0.1` only. Restart it with `--host 0.0.0.0`.

### 4. Run the tests

```bash
cd backend
.venv\Scripts\python.exe -m pytest        # Windows
pytest                                     # macOS / Linux
```

82 tests across four files cover auth (`test_auth.py`), the core API — exercises,
workouts, prescriptions, preferences, sets, PRs, units (`test_api.py`), admin CRUD
(`test_admin.py`), and the session lifecycle — create/resume/finish/abandon, stale
sweep, block ordering (`test_sessions.py`). See `docuemntation/07-testing.md` for what
each suite actually proves.

### 5. Stop it

If you used `run.bat` / `run.sh`: press `Ctrl+C` in the same terminal.

If you used `Start-Process` (background):
```powershell
# Find the PID holding port 8000 directly (returns the LISTENING process only)
Get-NetTCPConnection -LocalPort 8000 -State Listen | Select-Object OwningProcess
# Kill it (don't use $pid — that's a read-only built-in variable in PowerShell)
Stop-Process -Id <pid> -Force
```

One-liner version (paste as one line):

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

> **Why this is the right approach:** `Get-Process python` may show 2 PIDs for one logical uvicorn — that's a Windows venv-launcher quirk (the `venv\Scripts\python.exe` is a 256 KB shim that re-execs into the real interpreter at the path in `pyvenv.cfg`'s `home = ...` line, so Windows sees both as separate processes in the same job). `Get-NetTCPConnection` skips that and gives you the LISTENING PID directly.

Or just kill all python processes if you don't have anything else running Python:
```powershell
Get-Process python | Stop-Process -Force
```

### 6. Troubleshooting

- **Port 8000 already in use:** `netstat -ano | findstr :8000` (Windows) or `lsof -i :8000` (macOS/Linux) → kill the process holding the port.
- **wger fetch fails on first seed:** the script falls back to the bundled 27 hand-curated exercises. The 1,045 wger exercises are downloaded next time.
- **Stale SQLite:** `rm backend/workout.db` and re-run `python -m app.seed.wger_import`.
- **Phone can't reach backend:** the phone is on a different WiFi, or the backend is bound to `127.0.0.1` instead of `0.0.0.0`. Check the second one first — it's the most common cause.
- **Curl hangs after `Start-Process`:** that's a Windows bash tool quirk where the parent's stdin pipe stays open. Use `cmd /c "<command> < /dev/null"` or just don't chain `Start-Process` with `curl` in the same bash call — see the lessons-learned file.

---

## Frontend dev setup

The frontend is an Expo SDK 56 app using expo-router, NativeWind, and TanStack Query.

### 1. Install dependencies

```bash
npm install
```

### 2. Point the app at your backend

The app sends API requests to the URL in `app.json → expo.extra.apiBaseUrl`.

Edit `app.json`:
```json
{
  "expo": {
    "extra": {
      "apiBaseUrl": "http://YOUR_LAPTOP_LAN_IP:8000/api/v1"
    }
  }
}
```

- **Android emulator:** `http://10.0.2.2:8000/api/v1` (emulator maps `10.0.2.2` to the host's loopback)
- **Physical Android device:** your laptop's LAN IP (e.g. `http://192.168.1.42:8000/api/v1`). The phone and laptop must be on the same WiFi.
- **iOS simulator (macOS):** `http://localhost:8000/api/v1` works (simulator shares the host's loopback).

> **If you change `apiBaseUrl` after Metro has already started, restart with `npx expo start --clear`** — the value is read at bundle time, not at runtime.

### 3. Start the Expo dev server

```bash
npx expo start --clear
```

The first `--clear` wipes Metro's cache; you can drop it on subsequent runs.

You'll see a QR code in the terminal and a message like "Metro waiting on http://localhost:8081".

To start it detached on Windows (so the shell returns immediately):

Single-line version (paste exactly as one line, no breaks):

```powershell
Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npx expo start --clear" -WorkingDirectory "<repo>" -WindowStyle Hidden
```

(For the same reason as the backend: do NOT add `-RedirectStandardOutput` or `-RedirectStandardError` — those flags hang the bash tool.)

### 4. Open the app

- **Android emulator:** press `a` in the terminal, or click "Open Android" in the Expo dev tools in the browser
- **Physical Android device with Expo Go:** scan the QR code with the Expo Go app
- **iOS simulator (macOS only):** press `i`
- **Web:** press `w` (renders the app at localhost:8081 in your browser — note the Expo dev tools page, not the app, is shown at the root URL)

The app has 4 tabs for regular users — **Home**, **Nutrition**, **Training**,
**Community** — plus a 5th **Admin** tab if you log in as `admin` (workout/exercise
CRUD and prescription editing). Training is the tab most deeply wired to the backend;
Nutrition and Community are still mock data (see `future_ideas.md`).

### 5. Verifying the wiring end-to-end

This is the same session-engine loop as the [web-preview walkthrough](#0-fastest-way-to-see-it-running-web-preview),
adapted for a physical device:

1. Make sure the backend is running (you should see "Application startup complete" in its log)
2. Verify the app can reach the backend: `curl http://YOUR_LAN_IP:8000/api/v1/health` from your laptop (proves the bind and the LAN are correct)
3. Log in (`admin` / `admin1234` or `user1` / `user11234`) and open the **Training**
   tab — you'll land on the workout picker (`StartScreen`)
4. Tap a workout card (or **Start empty workout**) — this starts a session and switches
   to the live logging screen
5. Fill in a placeholder row's weight/reps and tap the checkmark — the set commits, a
   rest timer starts automatically, and a PR toast appears if it's your first set for
   that exercise
6. **Force-close the app and reopen it** — the session should still be active with
   your set intact. This is the single most important thing to verify; it's the whole
   point of the `WorkoutSession` rewrite (see `docuemntation/01-what-the-lifter-needs.md`)
7. Tap **Finish** → a summary sheet appears → **Training → History** → tap today's
   date → your session shows up as a named card
8. Kill the backend and try to log another set — the app should show an error toast,
   not crash
9. Restart the backend, retry — logging should resume working without needing to
   restart the app

### 6. Troubleshooting

- **`Couldn't find a navigation context` on Android:** restart Metro with `npx expo start --clear`. If it persists, check the Metro terminal for red errors.
- **`Network request failed` from the app:** the phone can't reach the backend. Verify `apiBaseUrl` in `app.json`, that the backend is running, and that both devices are on the same WiFi.
- **TypeScript errors after install:** `npx tsc --noEmit` to see what's wrong. Most often it's a missing type because `npx expo install` sometimes doesn't actually save to `package.json` on this machine — run `npm install <pkg>` directly.
- **Logged sets from a previous run are gone:** check whether `backend/config/defaults.yaml`'s `schema_version` changed since you last seeded — see the callout in [§0](#0-fastest-way-to-see-it-running-web-preview).

---

## End-to-end dev workflow

Open **two terminals**:

**Terminal 1 (backend):**
```bash
cd backend
./run.sh     # or run.bat on Windows
```

**Terminal 2 (frontend):**
```bash
npx expo start --clear
```

Then scan the QR code with Expo Go on your phone. As you change frontend code, Metro hot-reloads. As you change backend code, uvicorn auto-reloads (because of `--reload`).

---

## More docs

- **`docuemntation/`** — the architecture course covering the session-engine rewrite:
  why `WorkoutSession` exists, the full data model, the session lifecycle state
  machine, and (in `07-testing.md`) an honest accounting of what's proven vs. merely
  believed to work. Start at `docuemntation/README.md` — it has a rendered-diagram
  browser viewer and pre-rendered images, no tooling required.
- `AGENTS.md` — project context for coding agents working in this repo
- `future_ideas.md` — deferred features (real deploy, community scope, nutrition scope, etc.)
- `backend/README.md` — full backend API reference
- `lessons-learned.md` (in `~/.config/opencode/`) — global lessons for the opencode agent

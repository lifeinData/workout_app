# Future Ideas

This document tracks features and improvements that were **intentionally deferred** during the initial backend build. Each item explains what it is, why it was deferred, and what it would take to add it.

---

## Auth — Real email/password
[lessons-learned.md](../../../Users/j/.config/opencode/lessons-learned.md)
**Status:** Device UUID only. App generates a random UUID on first launch, stores in AsyncStorage, and sends it as the `X-User-Id` header. The backend trusts the header as the user identifier.

**Why deferred:** Single-user demo (the figma mock has only "ME = Jordan D."). Device UUID is enough to persist data and demonstrate the full flow.

**What it would take:**
- `User` table: `id`, `email`, `password_hash` (bcrypt), `created_at`, `display_name`, `initials`
- `POST /auth/register` and `POST /auth/login` endpoints returning a JWT or opaque session token
- Replace `X-User-Id` header with `Authorization: Bearer <token>` everywhere
- Auth middleware that validates the token and resolves the user
- Frontend: login/register screen, token refresh logic, logout

---

## Community scope

**Status:** The community tab is still mock data in `src/state/communityStore.ts`. No backend persistence.

**Why deferred:** Out of scope for the training build. Posts, comments, likes, and the four boards (FLEX, STEPS, NOMZ, Q&A) are all in-memory.

**What it would take:**
- `Post` table: `id`, `board`, `author_user_id`, `text`, `image_url`, `created_at`
- `Comment` table: `id`, `post_id`, `author_user_id`, `text`, `created_at`
- `PostLike` table: composite PK `(post_id, user_id)`
- Image uploads: S3/Cloudflare R2 + presigned URLs, or just store as base64 for the demo
- Feed pagination and ordering
- Real-time updates: polling or websockets

---

## Nutrition scope

**Status:** The nutrition tab is still mock data. The food database has a comment in `src/data/foodDatabase.ts` that says:

> // Mock food database — stands in for the SQLite USDA/Cronometer dataset.
> // When the real .sqlite file lands, replace `FOODS` with rows from the foods table

**Why deferred:** Same reason as community. The figma zip explicitly anticipates a SQLite-backed nutrition database.

**What it would take:**
- `Food` table: `id`, `name`, `brand`, `serving_size_grams`, `serving_label`, plus 17 nutrient columns (calories, protein, fat, etc.)
- `FoodDiaryEntry` table: `id`, `user_id`, `food_id`, `meal`, `grams`, `consumed_at`
- Seed from USDA FoodData Central (the public-domain nutrition database the figma comment refers to)
- `UserNutritionTargets` table: per-user target values for each nutrient
- `GET /foods?q=...&limit=...` search
- `POST /me/diary-entries`, `GET /me/diary-entries?date=...`
- `GET /me/nutrient-summary?date=...` (aggregates diary entries by nutrient)

---

## Image uploads for community posts

**Status:** The `PostComposer` has the file input removed (would need `expo-image-picker`). The model has `imageUrl?: string` but no upload endpoint.

**What it would take:**
- Decide on storage: S3, Cloudflare R2, or just a local volume for dev
- Presigned URL flow OR direct POST to backend with multipart
- CDN for serving
- Resize/optimize on upload (server-side image processing)

---

## Cross-device sync

**Status:** All data is keyed by `user_id` so the schema supports it, but auth is still a device UUID. Two devices would have two UUIDs and thus two separate data sets.

**What it would take:** Real auth (see above). Once a user logs in on multiple devices, the existing schema already supports cross-device sync.

---

## Offline-first sync queue

**Status:** When the backend is unreachable, `useLogSet` and `useDeleteSet` will fail. React Query retries with exponential backoff but the user loses the set if they close the app before reconnecting.

**What it would take:**
- Persist pending mutations in AsyncStorage as a queue
- On app load and on network reconnect, drain the queue
- Conflict resolution: server is source of truth; client just replays
- Visual indicator: "Syncing 3 pending changes..."

---

## Workout history analytics

**Status:** HistoryView shows a calendar of dates with logged workouts. No volume-over-time chart, no frequency-per-muscle-group, no streak tracking.

**What it would take:**
- `GET /me/analytics?from=&to=` returning precomputed aggregates
- Frontend: chart component (e.g. `react-native-svg` with `Victory` or hand-rolled)
- 1RM estimator (Epley formula) for auto-suggested weights

---

## Apple Health / Google Fit integration

**Status:** Dashboard has hardcoded step data ("6,420 / 10,000"). No native health integration.

**What it would take:**
- `expo-health` or `react-native-health` (requires dev build, not Expo Go)
- Permission flow
- Sync steps, heart rate, weight, body composition

---

## Push notifications

**Status:** No reminders, no workout nudges.

**What it would take:**
- `expo-notifications` (works in Expo Go)
- User preference: opt-in, preferred time, frequency
- Backend cron job: scan for users who haven't worked out in N days

---

## Dark mode polish

**Status:** CSS variables exist in `src/global.css` for both light and dark themes. Some components use them; many hardcode light-mode colors.

**What it would take:**
- Audit every component and replace hardcoded hex values with `var(--...)` or NativeWind `dark:` variants
- Test on both themes

---

## Production readiness

**Status:** The backend is dev-quality. Single-process, no auth, no rate limiting, no HTTPS, no monitoring.

**What it would take:**
- Alembic for migrations (currently uses `SQLModel.metadata.create_all` which is dev-only)
- Postgres for production (current SQLite is fine for single-laptop dev)
- Dockerfile + docker-compose
- Caddy or nginx for HTTPS termination
- Sentry for error tracking
- Structured logging (loguru or structlog)
- Health check that pings the DB
- Rate limiting (slowapi or similar)
- Load test with k6 or locust

---

## V2 Hardening

### Env-driven API base URL

**Status:** The `extra.apiBaseUrl` in `app.json` is hard-coded to a single LAN IP (currently `192.168.7.41:8000`). When the developer moves to a different network or laptop, the app breaks. Move to a build-time env loader: `EXPO_PUBLIC_API_BASE_URL` (or similar) read by `lib/api.ts` via `expo-constants extra + process.env`, with the current hard-coded value as a fallback. ~30 lines of code, no behavior change otherwise.

---

## Workout filtering — mode (home/gym/all) + equipment

**Status:** Removed from the Start screen on 2026-08-21 (bug report
`bugs/bug_reports_2026_08_21/`). The Start screen carried three filter/decoration cards
— "Hypertrophy Phase", "Available equipment", and a "Your intake says…" coach blurb
wrapping a home/gym/all mode toggle. All were cut to declutter the screen. The equipment
chips were relocated into the Add-exercise sheet; **the mode toggle was dropped entirely**
and deferred here.

**Why deferred:** The toggle was real, working UI — it drove `PATCH /me/preferences`
(`mode`) which in turn filters `GET /workouts` server-side — but it sat inside a card the
redesign removed, and there was no obvious new home for it. `prefs.mode` still exists and
still filters; the user just can't change it from the UI anymore, so it's pinned to
whatever value is currently stored (default `gym`).

**What it would take:**
- Decide where it lives. Candidates: a filter icon in the Training header opening a small
  sheet; a segmented control above the My Workouts / Coach's Playbook tabs; or fold it
  into the same sheet as the equipment chips (note: mode filters the *workout* list while
  equipment now filters the *exercise* list, so co-locating them is slightly incoherent).
- Re-add the `setMode` handler — `usePatchPreferences().mutate({ mode })`. The mutation
  already invalidates `["workouts"]` (`src/lib/queries.ts` ~L500), so the list refreshes.
- `filterWorkouts()` in `StartScreen.tsx` already handles mode; nothing else to rebuild.
- Consider whether "all" should be the default instead of `gym` — with no UI to change it,
  a user seeded to `gym` silently never sees home workouts.

**Related:** the equipment filter that *did* survive is capped by the Add-exercise sheet's
page size (client-side filter over the ≤50 fetched rows). A proper fix is a
multi-equipment query param on `GET /exercises` — see the same bug report's plan.

---

## Trophy Room carousel — hardcoded 300dp slide width (responsive bug)

**Status:** Broken on essentially every device. Found 2026-08-22 while auditing the UI for
screen-size independence; deliberately left unfixed to keep the Session 2 scope tight.

`src/components/fitness/training/StartScreen.tsx`:
- `trophySlide: { paddingHorizontal: 8, width: 300 }` (~L501) — each carousel slide is a
  fixed **300dp** wide.
- The parent `ScrollView` uses `pagingEnabled`, which snaps to the **ScrollView's own width**
  (the screen — roughly 411dp on a Galaxy S23 Ultra, ~360dp on a smaller phone), *not* 300dp.
- The active-dot math does `Math.round(e.nativeEvent.contentOffset.x / 300)` — a second,
  independent assumption of 300dp.

**Symptoms:** slides don't come to rest centered, and the dot indicator drifts out of sync
with the visible trophy the further you page. Only a device that happens to be exactly 300dp
wide behaves correctly.

**What it would take (~15 lines):**
- `const { width } = useWindowDimensions();` (no `Dimensions.get()` — it doesn't re-evaluate
  on rotation or split-screen).
- Compute a real slide width from the container: screen width minus the screen's horizontal
  padding (`TrainingTab`'s `container: { padding: 20 }`) and the card padding.
- Use that value for BOTH `trophySlide.width` and the `contentOffset.x / slideWidth` divisor
  so the two can never disagree again.
- Alternative: drop `pagingEnabled` for `snapToInterval={slideWidth}` +
  `decelerationRate="fast"`, which snaps to the slide rather than the viewport.

**Related:** the responsive ground rules added in
`agent_plans/agent_agenda_2026_08_22_session2.md` (phones-only portrait, ~320–440dp,
font scaling capped at 1.3×) — this fix should follow those rules when it happens.

---

## How to add an item

When you decide to work on one of these:

1. Create a new branch: `git checkout -b feature/<short-name>`
2. Add the item to this file as "In progress" with your name
3. Implement against the existing `backend/` and `src/` structure
4. Update this file with a "Status: Done" note and any gotchas you hit
5. Add tests in `backend/tests/`

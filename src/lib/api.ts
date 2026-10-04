import Constants from "expo-constants";
import { clearToken, getToken } from "./auth";

/* ------------------------------------------------------------------ *
 * Types — mirrors backend/app/schemas.py, snake_case on the wire    *
 * ------------------------------------------------------------------ */

export type UserRole = "user" | "coach";

export interface User {
  id: string;
  username: string;
  role: UserRole;
  display_name: string | null;
  initials: string | null;
  created_at: string;
}

export interface SessionResponse {
  token: string;
  expires_at: string;
  user: User;
}

export interface SignupRequest {
  username: string;
  password: string;
  display_name?: string | null;
  initials?: string | null;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export type WeightUnit = "lb" | "kg";

export interface ExerciseResponse {
  id: string;
  name: string;
  muscle_group: string;
  equipment: string[];
  yt_id: string | null;
  default_sets: number;
  default_reps_label: string;
  pr_trackable: boolean;
}

/** One page of `GET /exercises`. The response body is still a plain
 * `ExerciseResponse[]` (see `api.listExercises`) — `total` comes from the
 * `X-Total-Count` response header (filtered count, applied before
 * limit/offset), not the body. Used by `api.listExercisesPage` for
 * paginated browsing (the exercise picker). */
export interface ExercisePageResponse {
  items: ExerciseResponse[];
  total: number;
}

/** `ExerciseResponse` plus this workout's per-exercise prescription.
 * Additive over `ExerciseResponse` — any code that only reads the base
 * fields (name, yt_id, ...) keeps working unchanged. */
export interface WorkoutExerciseResponse extends ExerciseResponse {
  order_index?: number;
  target_sets: number;
  target_reps: number;
  /** Canonical kg; null = no target weight. */
  target_weight_kg: number | null;
  target_rest_sec: number;
  prescription_notes: string | null;
}

/** Minimal public view of a user (coach/athlete cards, "Added by"). */
export interface UserPublic {
  id: string;
  username: string;
  display_name: string | null;
  initials: string | null;
}

export interface CoachPublic extends UserPublic {
  athlete_count: number;
}

export interface WorkoutSummaryResponse {
  id: string;
  name: string;
  equipment: string[];
  duration_min: number | null;
  exercise_count: number;
  created_by: UserPublic | null;
  created_at: string;
  // null = coach library; (legacy) set = personal template.
  owner_id: string | null;
}

export interface WorkoutDetailResponse extends WorkoutSummaryResponse {
  exercises: WorkoutExerciseResponse[];
}

export interface PreferencesResponse {
  user_id: string;
  mode: string;
  equipment: string[];
  completed_workouts_today: string[];
  last_reset_date: string;
  weight_unit: WeightUnit;
  default_rest_sec: number;
}

export type PreferencesPatch = Partial<
  Pick<
    PreferencesResponse,
    "mode" | "equipment" | "completed_workouts_today" | "weight_unit" | "default_rest_sec"
  >
> & { add_completed?: string[]; client_today?: string };

/* ------------------------------------------------------------------ *
 * Sets                                                               *
 * ------------------------------------------------------------------ */

export type SetKind = "working" | "warmup";

export interface SetLogCreate {
  session_id: string;
  exercise_id: string;
  weight: number;
  weight_unit: WeightUnit;
  reps: number;
  kind?: SetKind;
  rpe?: number | null;
  timestamp?: string;
}

export interface SetLogPatch {
  weight?: number;
  weight_unit?: WeightUnit;
  reps?: number;
  kind?: SetKind;
  rpe?: number | null;
}

export interface HistoricalSetResponse {
  id: number;
  user_id: string;
  session_id: string;
  local_date: string;
  exercise_id: string;
  set_index: number;
  kind: SetKind;
  weight: number;
  weight_unit: WeightUnit;
  weight_kg: number;
  reps: number;
  rpe: number | null;
  was_pr: boolean;
  timestamp: string;
}

export interface PersonalRecordResponse {
  user_id: string;
  exercise_id: string;
  best_weight_kg: number;
  best_weight_reps: number;
  best_weight_date: string;
  best_e1rm_kg: number;
  best_e1rm_weight_kg: number;
  best_e1rm_reps: number;
  best_e1rm_date: string;
  updated_at: string;
}

export interface SetLogCreatedResponse {
  set: HistoricalSetResponse;
  is_pr: boolean;
  pr: PersonalRecordResponse | null;
}

export interface ExerciseSessionRollup {
  session_id: string;
  local_date: string;
  sets: number;
  best_weight_kg: number;
  best_e1rm_kg: number;
  volume_kg: number;
}

/* ------------------------------------------------------------------ *
 * Sessions                                                           *
 * ------------------------------------------------------------------ */

export type SessionStatus = "active" | "completed" | "abandoned";

export interface SessionCreate {
  workout_id?: string | null;
  local_date: string;
  tz_offset_min: number;
  name?: string | null;
}

export interface SessionPatch {
  status?: "completed" | "abandoned";
  notes?: string | null;
  name?: string;
}

export interface SessionExerciseBlock {
  exercise: ExerciseResponse;
  order_index: number;
  target_sets: number;
  target_reps: number;
  target_weight_kg: number | null;
  target_rest_sec: number;
  prescription_notes: string | null;
  /** True only for blocks from the session's workout prescription. Ad-hoc
   * blocks carry placeholder target_* values that must not be displayed. */
  is_prescribed: boolean;
  sets: HistoricalSetResponse[];
  last_time: HistoricalSetResponse[];
}

export interface SessionDetailResponse {
  id: string;
  user_id: string;
  workout_id: string | null;
  name: string;
  local_date: string;
  tz_offset_min: number;
  started_at: string;
  ended_at: string | null;
  status: SessionStatus;
  notes: string | null;
  blocks: SessionExerciseBlock[];
  total_sets: number;
  total_volume_kg: number;
  duration_sec: number | null;
}

export interface SessionSummaryResponse {
  id: string;
  workout_id: string | null;
  name: string;
  local_date: string;
  started_at: string;
  ended_at: string | null;
  status: SessionStatus;
  total_sets: number;
  total_volume_kg: number;
  duration_sec: number | null;
  exercise_count: number;
  pr_count: number;
}

/* ------------------------------------------------------------------ *
 * Coach request types (workout CRUD + exercise reorder + prescriptions) *
 * ------------------------------------------------------------------ *
 * Mirrors backend/app/schemas.py. All fields are snake_case on the   *
 * wire; the field names line up 1:1 with the Pydantic models so the  *
 * admin UI can build payloads with no client-side aliasing.          */

export interface WorkoutCreate {
  name: string;
  /** Optional; null/omitted = no duration. */
  duration_min?: number | null;
  exercise_ids?: string[];
}

export interface WorkoutUpdate {
  /** Only present keys are patched. `duration_min: null` clears it. */
  name?: string;
  duration_min?: number | null;
}

export interface AddExerciseToWorkout {
  exercise_id: string;
  after_exercise_id?: string;
}

export interface ReorderExercises {
  /** Same set of ids as the workout's current links, in the new order. */
  exercise_ids: string[];
}

export interface PrescriptionPatch {
  target_sets?: number;
  target_reps?: number;
  /** In `target_weight_unit`; null clears the target. Requires a unit. */
  target_weight?: number | null;
  target_weight_unit?: WeightUnit;
  target_rest_sec?: number;
  prescription_notes?: string;
}

/* ------------------------------------------------------------------ *
 * Coaching + messages                                                *
 * ------------------------------------------------------------------ */

export type CoachLinkStatus = "pending" | "accepted";

export interface LastMessage {
  body: string;
  created_at: string;
  from_me: boolean;
}

export interface AthleteRow {
  link_id: string;
  status: CoachLinkStatus;
  user: UserPublic;
  created_at: string;
  unread_count: number;
  last_message: LastMessage | null;
  assigned_workout_count: number;
}

export interface AthletesResponse {
  requests: AthleteRow[];
  athletes: AthleteRow[];
}

export interface CoachLinkResponse {
  id: string;
  status: CoachLinkStatus;
  coach: CoachPublic;
  created_at: string;
  responded_at: string | null;
  unread_count: number;
}

export interface CoachRequestCreate {
  coach_id: string;
  message?: string;
}

export interface AssignmentsBody {
  athlete_ids: string[];
}

export interface PlaybookResponse {
  is_coach: boolean;
  coach_link: CoachLinkResponse | null;
  workouts: WorkoutSummaryResponse[];
}

export interface MessageResponse {
  id: number;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface UnreadResponse {
  total: number;
  by_user: Record<string, number>;
}

/* ------------------------------------------------------------------ *
 * Errors                                                             *
 * ------------------------------------------------------------------ */

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export class NetworkError extends Error {
  constructor(cause: unknown) {
    super(
      `Network request failed: ${
        cause instanceof Error ? cause.message : String(cause)
      }`
    );
    this.name = "NetworkError";
  }
}

/* ------------------------------------------------------------------ *
 * 401 broadcast                                                      *
 * ------------------------------------------------------------------ *
 * api.ts is a pure transport module with no React Query dependency.
 * When a request fails with 401 (and it is not login or signup), we
 * wipe the local token AND fire a registered callback so the React
 * Query layer can invalidate ["auth", "me"] and the gate layouts can
 * redirect. The handler is registered once at the root layout.       */

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

/* ------------------------------------------------------------------ *
 * Transport                                                          *
 * ------------------------------------------------------------------ */

const REQUEST_TIMEOUT_MS = 15_000;

const API_PORT = 8000;

/** In dev, the backend runs on the same machine as Metro, so reuse the host
 * the bundle was served from (`hostUri`, e.g. "192.168.0.102:8081"). This
 * tracks DHCP changes automatically — no more hand-editing the LAN IP in
 * app.json. Tunnel hosts (*.exp.direct) can't reach :8000, so skip those. */
function getDevServerBaseUrl(): string | null {
  if (!__DEV__) return null;
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;
  const host = hostUri.split(":")[0];
  if (!host || host.endsWith(".exp.direct")) return null;
  return `http://${host}:${API_PORT}/api/v1`;
}

function getBaseUrl(): string {
  const extra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined);
  // EXPO_PUBLIC_API_BASE_URL (inlined at bundle time) wins: share.ps1 sets it
  // to a public backend tunnel so a remote tester's phone can reach us.
  const url =
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    getDevServerBaseUrl() ||
    extra?.apiBaseUrl ||
    `http://10.0.2.2:${API_PORT}/api/v1`;
  return url.replace(/\/$/, "");
}

/** Same transport as `request`, but also returns the raw `Response.headers`
 * for callers that need a response header (e.g. `X-Total-Count`). `request`
 * is implemented on top of this and just discards the headers — this keeps
 * every existing call site (which only wants the parsed body) unchanged. */
async function requestRaw<T>(
  method: string,
  path: string,
  init: { body?: unknown; signal?: AbortSignal } = {}
): Promise<{ data: T; headers: Headers }> {
  const token = await getToken();
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const signal = init.signal ?? ctrl.signal;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}${path}`, {
      method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    throw new NetworkError(err);
  }
  clearTimeout(timeout);

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => null);
    }
    if (res.status === 401 && path !== "/auth/login" && path !== "/auth/signup") {
      await clearToken();
      if (unauthorizedHandler) {
        try {
          unauthorizedHandler();
        } catch {
          /* a failing handler must never mask the underlying ApiError */
        }
      }
    }
    throw new ApiError(res.status, body, `${method} ${path} → ${res.status}`);
  }

  if (res.status === 204) return { data: undefined as T, headers: res.headers };
  return { data: (await res.json()) as T, headers: res.headers };
}

async function request<T>(
  method: string,
  path: string,
  init: { body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  const { data } = await requestRaw<T>(method, path, init);
  return data;
}

/* ------------------------------------------------------------------ *
 * Endpoint functions                                                 *
 * ------------------------------------------------------------------ */

function toQuery(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  signup: (body: SignupRequest) => request<SessionResponse>("POST", "/auth/signup", { body }),
  login: (body: LoginRequest) => request<SessionResponse>("POST", "/auth/login", { body }),
  logout: () => request<void>("POST", "/auth/logout"),
  me: () => request<User>("GET", "/auth/me"),
  listExercises: (q?: { muscle_group?: string; equipment?: string; search?: string; limit?: number; offset?: number }) =>
    request<ExerciseResponse[]>(
      "GET",
      `/exercises${toQuery({
        muscle_group: q?.muscle_group,
        equipment: q?.equipment,
        q: q?.search,
        limit: q?.limit,
        offset: q?.offset,
      })}`
    ),
  /** Same query params as `listExercises`, but also reads the
   * `X-Total-Count` response header (the filtered total, before
   * limit/offset) so callers can paginate — e.g. "Showing 50 of 614" and
   * knowing when to stop requesting further pages. */
  listExercisesPage: async (q?: {
    muscle_group?: string;
    equipment?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<ExercisePageResponse> => {
    const { data, headers } = await requestRaw<ExerciseResponse[]>(
      "GET",
      `/exercises${toQuery({
        muscle_group: q?.muscle_group,
        equipment: q?.equipment,
        q: q?.search,
        limit: q?.limit,
        offset: q?.offset,
      })}`
    );
    const totalHeader = headers.get("X-Total-Count");
    const total = totalHeader !== null ? Number(totalHeader) : data.length;
    return { items: data, total: Number.isFinite(total) ? total : data.length };
  },
  getExercise: (id: string) => request<ExerciseResponse>("GET", `/exercises/${id}`),
  getExerciseHistory: (id: string, limit?: number) =>
    request<ExerciseSessionRollup[]>(
      "GET",
      `/me/exercises/${id}/history${toQuery({ limit })}`
    ),
  listWorkouts: (q?: { equipment?: string }) =>
    request<WorkoutSummaryResponse[]>(
      "GET",
      `/workouts${toQuery({ equipment: q?.equipment })}`
    ),
  getWorkout: (id: string) => request<WorkoutDetailResponse>("GET", `/workouts/${id}`),
  // The caller's own past completed sessions ("My Workouts").
  listMyWorkouts: (q?: { limit?: number; offset?: number }) =>
    request<SessionSummaryResponse[]>(
      "GET",
      `/me/workouts${toQuery({ limit: q?.limit, offset: q?.offset })}`
    ),
  getPreferences: () => request<PreferencesResponse>("GET", "/me/preferences"),
  patchPreferences: (body: PreferencesPatch) =>
    request<PreferencesResponse>("PATCH", "/me/preferences", { body }),
  /* ----- sessions --------------------------------------------------- */
  startSession: (body: SessionCreate) =>
    request<SessionDetailResponse>("POST", "/me/sessions", { body }),
  getActiveSession: () => request<SessionDetailResponse | null>("GET", "/me/sessions/active"),
  getSession: (id: string) => request<SessionDetailResponse>("GET", `/me/sessions/${id}`),
  listSessions: (q?: { from?: string; to?: string; limit?: number; offset?: number }) =>
    request<SessionSummaryResponse[]>(
      "GET",
      `/me/sessions${toQuery({ from: q?.from, to: q?.to, limit: q?.limit, offset: q?.offset })}`
    ),
  patchSession: (id: string, body: SessionPatch) =>
    request<SessionDetailResponse>("PATCH", `/me/sessions/${id}`, { body }),
  deleteSession: (id: string) => request<void>("DELETE", `/me/sessions/${id}`),
  /* ----- sets ---------------------------------------------------------- */
  logSet: (body: SetLogCreate) =>
    request<SetLogCreatedResponse>("POST", "/me/sets", { body }),
  updateSet: (id: number, body: SetLogPatch) =>
    request<SetLogCreatedResponse>("PATCH", `/me/sets/${id}`, { body }),
  deleteSet: (id: number) => request<void>("DELETE", `/me/sets/${id}`),
  getPRs: () => request<PersonalRecordResponse[]>("GET", "/me/prs"),
  /* ----- coach library (workout CRUD) ------------------------------ */
  coachListWorkouts: (q?: { limit?: number; offset?: number; equipment?: string }) =>
    request<WorkoutSummaryResponse[]>(
      "GET",
      `/coach/workouts${toQuery({ limit: q?.limit, offset: q?.offset, equipment: q?.equipment })}`
    ),
  coachGetWorkout: (id: string) =>
    request<WorkoutDetailResponse>("GET", `/coach/workouts/${id}`),
  coachCreateWorkout: (body: WorkoutCreate) =>
    request<WorkoutDetailResponse>("POST", "/coach/workouts", { body }),
  coachUpdateWorkout: (id: string, body: WorkoutUpdate) =>
    request<WorkoutDetailResponse>("PATCH", `/coach/workouts/${id}`, { body }),
  coachDeleteWorkout: (id: string) => request<void>("DELETE", `/coach/workouts/${id}`),
  coachAddExercise: (workoutId: string, body: AddExerciseToWorkout) =>
    request<WorkoutDetailResponse>("POST", `/coach/workouts/${workoutId}/exercises`, { body }),
  coachRemoveExercise: (workoutId: string, exerciseId: string) =>
    request<void>("DELETE", `/coach/workouts/${workoutId}/exercises/${exerciseId}`),
  coachReorderExercises: (workoutId: string, body: ReorderExercises) =>
    request<WorkoutDetailResponse>(
      "PATCH",
      `/coach/workouts/${workoutId}/exercises/reorder`,
      { body }
    ),
  coachUpdatePrescription: (workoutId: string, exerciseId: string, body: PrescriptionPatch) =>
    request<WorkoutDetailResponse>(
      "PATCH",
      `/coach/workouts/${workoutId}/exercises/${exerciseId}/prescription`,
      { body }
    ),
  coachGetAssignments: (workoutId: string) =>
    request<AssignmentsBody>("GET", `/coach/workouts/${workoutId}/assignments`),
  coachSetAssignments: (workoutId: string, body: AssignmentsBody) =>
    request<AssignmentsBody>("PUT", `/coach/workouts/${workoutId}/assignments`, { body }),
  coachListAthletes: () => request<AthletesResponse>("GET", "/coach/athletes"),
  coachAcceptLink: (linkId: string) =>
    request<AthleteRow>("POST", `/coach/links/${linkId}/accept`),
  coachDeclineLink: (linkId: string) =>
    request<void>("POST", `/coach/links/${linkId}/decline`),
  /* ----- athlete side ------------------------------------------------- */
  listCoaches: () => request<CoachPublic[]>("GET", "/coaches"),
  getMyCoach: () => request<CoachLinkResponse | null>("GET", "/me/coach"),
  requestCoach: (body: CoachRequestCreate) =>
    request<CoachLinkResponse>("POST", "/me/coach-requests", { body }),
  cancelCoachLink: () => request<void>("DELETE", "/me/coach-link"),
  getPlaybook: () => request<PlaybookResponse>("GET", "/me/playbook"),
  /* ----- messages ----------------------------------------------------- */
  listMessages: (otherId: string, q?: { after_id?: number; limit?: number }) =>
    request<MessageResponse[]>(
      "GET",
      `/me/messages/${otherId}${toQuery({ after_id: q?.after_id, limit: q?.limit })}`
    ),
  sendMessage: (otherId: string, body: { body: string }) =>
    request<MessageResponse>("POST", `/me/messages/${otherId}`, { body }),
  markMessagesRead: (otherId: string) =>
    request<void>("POST", `/me/messages/${otherId}/read`),
  getUnread: () => request<UnreadResponse>("GET", "/me/messages/unread"),
};

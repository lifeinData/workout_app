import Constants from "expo-constants";
import { clearToken, getToken } from "./auth";

/* ------------------------------------------------------------------ *
 * Types — mirrors backend/app/schemas.py, snake_case on the wire    *
 * ------------------------------------------------------------------ */

export type UserRole = "user" | "admin";

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

/** `ExerciseResponse` plus this workout's per-exercise prescription.
 * Additive over `ExerciseResponse` — any code that only reads the base
 * fields (name, yt_id, ...) keeps working unchanged. */
export interface WorkoutExerciseResponse extends ExerciseResponse {
  order_index: number;
  target_sets: number;
  target_reps_low: number;
  target_reps_high: number | null;
  target_rest_sec: number;
  prescription_notes: string | null;
}

export interface WorkoutSummaryResponse {
  id: string;
  name: string;
  tag: string;
  location: string;
  equipment: string[];
  duration_min: number;
  exercise_count: number;
  // null = coach catalog ("Coach's Playbook"); set = a personal
  // template owned by the caller ("My Workouts").
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
  target_reps_low: number;
  target_reps_high: number | null;
  target_rest_sec: number;
  prescription_notes: string | null;
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
 * Admin request types (workout CRUD + exercise reorder + prescriptions) *
 * ------------------------------------------------------------------ *
 * Mirrors backend/app/schemas.py. All fields are snake_case on the   *
 * wire; the field names line up 1:1 with the Pydantic models so the  *
 * admin UI can build payloads with no client-side aliasing.          */

export interface WorkoutCreate {
  /** Optional — server auto-generates a slug-shaped id when omitted. */
  id?: string;
  name: string;
  tag: string;
  location: "home" | "gym" | "either";
  equipment: string[];
  duration_min: number;
  /** Must contain at least one id; every id must exist on the server. */
  exercise_ids: string[];
}

export interface WorkoutUpdate {
  /** Every field is optional; only present keys are patched. */
  name?: string;
  tag?: string;
  location?: "home" | "gym" | "either";
  equipment?: string[];
  duration_min?: number;
}

export interface AddExerciseToWorkout {
  exercise_id: string;
  /** Append at the end when omitted. Currently a presence check; the
   * server always appends at max(order_index) + 1 regardless. */
  after_exercise_id?: string;
}

export interface ReorderExercises {
  /** Same set of ids as the workout's current links, in the new order. */
  exercise_ids: string[];
}

export interface PrescriptionPatch {
  target_sets?: number;
  target_reps_low?: number;
  target_reps_high?: number;
  target_rest_sec?: number;
  prescription_notes?: string;
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

function getBaseUrl(): string {
  const extra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined);
  const url = extra?.apiBaseUrl ?? "http://10.0.2.2:8000/api/v1";
  return url.replace(/\/$/, "");
}

async function request<T>(
  method: string,
  path: string,
  init: { body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
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

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
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
  getExercise: (id: string) => request<ExerciseResponse>("GET", `/exercises/${id}`),
  getExerciseHistory: (id: string, limit?: number) =>
    request<ExerciseSessionRollup[]>(
      "GET",
      `/me/exercises/${id}/history${toQuery({ limit })}`
    ),
  listWorkouts: (q?: { location?: string; equipment?: string }) =>
    request<WorkoutSummaryResponse[]>(
      "GET",
      `/workouts${toQuery({ location: q?.location, equipment: q?.equipment })}`
    ),
  getWorkout: (id: string) => request<WorkoutDetailResponse>("GET", `/workouts/${id}`),
  // The caller's own saved templates ("My Workouts").
  listMyWorkouts: () => request<WorkoutSummaryResponse[]>("GET", "/me/workouts"),
  // Fork a session into a reusable personal template ("Save as template").
  createTemplateFromSession: (sessionId: string, body: { name?: string }) =>
    request<WorkoutDetailResponse>(
      "POST",
      `/me/workouts/from-session/${sessionId}`,
      { body }
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
  /* ----- admin (workout CRUD) --------------------------------------
   * Bearer-protected. The /admin/workouts router mirrors the shape
   * of the public read endpoints, so list/show return the same
   * payloads. Mutations always echo the freshly-built detail so the
   * client doesn't have to re-fetch.
   * ----------------------------------------------------------------- */
  adminListWorkouts: (q?: {
    limit?: number;
    offset?: number;
    location?: string;
    equipment?: string;
  }) =>
    request<WorkoutSummaryResponse[]>(
      "GET",
      `/admin/workouts${toQuery({
        limit: q?.limit,
        offset: q?.offset,
        location: q?.location,
        equipment: q?.equipment,
      })}`
    ),
  adminCreateWorkout: (body: WorkoutCreate) =>
    request<WorkoutDetailResponse>("POST", "/admin/workouts", { body }),
  adminUpdateWorkout: (id: string, body: WorkoutUpdate) =>
    request<WorkoutDetailResponse>("PATCH", `/admin/workouts/${id}`, { body }),
  adminDeleteWorkout: (id: string) =>
    request<void>("DELETE", `/admin/workouts/${id}`),
  adminAddExercise: (workoutId: string, body: AddExerciseToWorkout) =>
    request<WorkoutDetailResponse>(
      "POST",
      `/admin/workouts/${workoutId}/exercises`,
      { body }
    ),
  adminRemoveExercise: (workoutId: string, exerciseId: string) =>
    request<void>(
      "DELETE",
      `/admin/workouts/${workoutId}/exercises/${exerciseId}`
    ),
  adminReorderExercises: (workoutId: string, body: ReorderExercises) =>
    request<WorkoutDetailResponse>(
      "PATCH",
      `/admin/workouts/${workoutId}/exercises/reorder`,
      { body }
    ),
  adminUpdatePrescription: (workoutId: string, exerciseId: string, body: PrescriptionPatch) =>
    request<WorkoutDetailResponse>(
      "PATCH",
      `/admin/workouts/${workoutId}/exercises/${exerciseId}/prescription`,
      { body }
    ),
};

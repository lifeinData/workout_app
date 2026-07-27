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

export interface WorkoutSummaryResponse {
  id: string;
  name: string;
  tag: string;
  location: string;
  equipment: string[];
  duration_min: number;
  exercise_count: number;
}

export interface WorkoutDetailResponse extends WorkoutSummaryResponse {
  exercises: ExerciseResponse[];
}

export interface PreferencesResponse {
  user_id: string;
  mode: string;
  equipment: string[];
  completed_workouts_today: string[];
  last_reset_date: string;
}

export type PreferencesPatch = Partial<
  Pick<PreferencesResponse, "mode" | "equipment" | "completed_workouts_today">
> & { add_completed?: string[] };

export interface SetLogCreate {
  exercise_id: string;
  weight: number;
  reps: number;
  timestamp?: string;
}

export interface HistoricalSetResponse {
  id: number;
  user_id: string;
  date: string;
  exercise_id: string;
  weight: number;
  reps: number;
  timestamp: string;
}

export interface PersonalRecordResponse {
  user_id: string;
  exercise_id: string;
  weight: number;
  reps: number;
  date: string;
}

export interface SetLogCreatedResponse {
  set: HistoricalSetResponse;
  is_pr: boolean;
  pr: PersonalRecordResponse | null;
}

export type HistoryResponse = {
  history: Record<string, Record<string, HistoricalSetResponse[]>>;
};

/* ------------------------------------------------------------------ *
 * Admin request types (workout CRUD + exercise reorder)              *
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
  listWorkouts: (q?: { location?: string; equipment?: string }) =>
    request<WorkoutSummaryResponse[]>(
      "GET",
      `/workouts${toQuery({ location: q?.location, equipment: q?.equipment })}`
    ),
  getWorkout: (id: string) => request<WorkoutDetailResponse>("GET", `/workouts/${id}`),
  getPreferences: () => request<PreferencesResponse>("GET", "/me/preferences"),
  patchPreferences: (body: PreferencesPatch) =>
    request<PreferencesResponse>("PATCH", "/me/preferences", { body }),
  getHistory: (from?: string, to?: string) =>
    request<HistoryResponse>(
      "GET",
      `/me/history${toQuery({ from, to })}`
    ),
  logSet: (body: SetLogCreate) =>
    request<SetLogCreatedResponse>("POST", "/me/sets", { body }),
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
};

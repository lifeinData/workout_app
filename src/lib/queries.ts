import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { ApiError, api } from "./api";
import type {
  AddExerciseToWorkout,
  ExerciseResponse,
  ExerciseSessionRollup,
  HistoricalSetResponse,
  LoginRequest,
  PersonalRecordResponse,
  PreferencesPatch,
  PreferencesResponse,
  PrescriptionPatch,
  ReorderExercises,
  SessionCreate,
  SessionDetailResponse,
  SessionResponse,
  SessionSummaryResponse,
  SetLogCreate,
  SetLogCreatedResponse,
  SetLogPatch,
  SignupRequest,
  User,
  WorkoutCreate,
  WorkoutDetailResponse,
  WorkoutSummaryResponse,
  WorkoutUpdate,
} from "./api";
import { clearToken, getToken, setToken } from "./auth";
import { nowIsoUtc } from "./dates";
import { toKg } from "./units";

/* ------------------------------------------------------------------ *
 * Optimistic-id counter                                              *
 *                                                                    *
 * `Date.now()` collides if the user taps "Add set" twice within the  *
 * same millisecond. A module-level monotonic counter is collision-  *
 * free for the entire session, doesn't depend on wall-clock time,    *
 * and stays clearly negative (sentinel for "not yet confirmed by     *
 * the server"). Consumers can guard with `if (id < 0) return`.       *
 * ------------------------------------------------------------------ */

let nextOptimisticId = -1;
function getNextOptimisticId(): number {
  return nextOptimisticId--;
}

/* ------------------------------------------------------------------ *
 * Query keys — every cache key in the app lives here.                *
 * Centralizing prevents invalidation misses and stale UI.            *
 * ------------------------------------------------------------------ */

export const queryKeys = {
  me: ["auth", "me"] as const,
  exercises: (filter?: { muscle_group?: string; equipment?: string; search?: string }) =>
    ["exercises", filter ?? {}] as const,
  exercise: (id: string) => ["exercises", id] as const,
  exerciseHistory: (id: string, limit?: number) =>
    ["me", "exercises", id, "history", limit ?? 20] as const,
  workouts: (filter?: { location?: string; equipment?: string }) =>
    ["workouts", filter ?? {}] as const,
  workout: (id: string) => ["workouts", id] as const,
  myWorkouts: ["me", "workouts"] as const,
  adminWorkouts: (q?: {
    limit?: number;
    offset?: number;
    location?: string;
    equipment?: string;
  }) => ["admin", "workouts", q ?? {}] as const,
  adminWorkout: (id: string) => ["admin", "workouts", id] as const,
  preferences: ["me", "preferences"] as const,
  activeSession: ["me", "sessions", "active"] as const,
  session: (id: string) => ["me", "sessions", id] as const,
  sessions: (from?: string, to?: string) =>
    ["me", "sessions", "list", from ?? null, to ?? null] as const,
  prs: ["me", "prs"] as const,
};

/* ------------------------------------------------------------------ *
 * Default stale times. Exercises and workouts are reference data     *
 * that change rarely, so we cache aggressively. User state has the  *
 * natural invalidation pattern of mutations.                         *
 * ------------------------------------------------------------------ */

const FIVE_MIN = 1000 * 60 * 5;
const ONE_HOUR = 1000 * 60 * 60;

/* ------------------------------------------------------------------ *
 * Queries                                                            *
 * ------------------------------------------------------------------ */

/**
 * Returns the currently-authenticated user, or null if not signed in.
 *
 * Critically, this hook NEVER throws. A 401 means "the token we have
 * is no longer valid"; we drop it and return null so the gate layouts
 * can redirect to /login. Any other error propagates to React Query
 * (so the gate can distinguish "not signed in" from "couldn't tell").
 *
 * `staleTime: 60_000` only protects against trivial double-fires inside
 * one minute. Security-sensitive paths (401 in the transport layer,
 * explicit invalidation in login/logout, React StrictMode double-mount)
 * still re-fetch or evict this entry — the gate layouts see the latest
 * authoritative state, not a 60-second-stale one.
 */
export function useMe(): UseQueryResult<User | null, ApiError> {
  return useQuery<User | null, ApiError>({
    queryKey: queryKeys.me,
    queryFn: async () => {
      const token = await getToken();
      if (!token) return null;
      try {
        return await api.me();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          await clearToken();
          return null;
        }
        throw e;
      }
    },
    staleTime: 60_000,
  });
}

export function useExercises(
  filter?: { muscle_group?: string; equipment?: string; search?: string; limit?: number; offset?: number }
): UseQueryResult<ExerciseResponse[]> {
  return useQuery({
    queryKey: queryKeys.exercises(filter),
    queryFn: () => api.listExercises(filter),
    staleTime: ONE_HOUR,
  });
}

export function useExercise(id: string): UseQueryResult<ExerciseResponse> {
  return useQuery({
    queryKey: queryKeys.exercise(id),
    queryFn: () => api.getExercise(id),
    staleTime: ONE_HOUR,
    enabled: Boolean(id),
  });
}

export function useExerciseHistory(
  id: string,
  limit?: number
): UseQueryResult<ExerciseSessionRollup[]> {
  return useQuery({
    queryKey: queryKeys.exerciseHistory(id, limit),
    queryFn: () => api.getExerciseHistory(id, limit),
    enabled: Boolean(id),
  });
}

export function useWorkouts(
  filter?: { location?: string; equipment?: string }
): UseQueryResult<WorkoutSummaryResponse[]> {
  return useQuery({
    queryKey: queryKeys.workouts(filter),
    queryFn: () => api.listWorkouts(filter),
    staleTime: FIVE_MIN,
  });
}

export function useWorkout(id: string): UseQueryResult<WorkoutDetailResponse> {
  return useQuery({
    queryKey: queryKeys.workout(id),
    queryFn: () => api.getWorkout(id),
    enabled: Boolean(id),
  });
}

/** The caller's own saved templates — the "My Workouts" tab. */
export function useMyWorkouts(): UseQueryResult<WorkoutSummaryResponse[]> {
  return useQuery({
    queryKey: queryKeys.myWorkouts,
    queryFn: () => api.listMyWorkouts(),
    staleTime: FIVE_MIN,
  });
}

export function usePreferences(): UseQueryResult<PreferencesResponse> {
  return useQuery({
    queryKey: queryKeys.preferences,
    queryFn: () => api.getPreferences(),
    staleTime: FIVE_MIN,
  });
}

export function usePRs(): UseQueryResult<PersonalRecordResponse[]> {
  return useQuery({
    queryKey: queryKeys.prs,
    queryFn: () => api.getPRs(),
  });
}

/* ------------------------------------------------------------------ *
 * Sessions                                                           *
 * ------------------------------------------------------------------ */

/**
 * The one active session, or null. `staleTime: 0` — this is the value
 * the whole training tab (and the cross-tab session bar) hinges on,
 * so it always refetches on mount/focus rather than trusting a cached
 * "no active session" from before the user started one elsewhere.
 */
export function useActiveSession(): UseQueryResult<SessionDetailResponse | null> {
  return useQuery({
    queryKey: queryKeys.activeSession,
    queryFn: () => api.getActiveSession(),
    staleTime: 0,
  });
}

export function useSession(id: string): UseQueryResult<SessionDetailResponse> {
  return useQuery({
    queryKey: queryKeys.session(id),
    queryFn: () => api.getSession(id),
    enabled: Boolean(id),
  });
}

export function useSessions(from?: string, to?: string): UseQueryResult<SessionSummaryResponse[]> {
  return useQuery({
    queryKey: queryKeys.sessions(from, to),
    queryFn: () => api.listSessions({ from, to }),
  });
}

export function useStartSession(): UseMutationResult<SessionDetailResponse, Error, SessionCreate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.startSession(body),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.activeSession, data);
      qc.invalidateQueries({ queryKey: ["me", "sessions", "list"] });
    },
  });
}

export function useFinishSession(): UseMutationResult<
  SessionDetailResponse,
  Error,
  { id: string; notes?: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }) => api.patchSession(id, { status: "completed", notes }),
    onSuccess: () => {
      qc.setQueryData(queryKeys.activeSession, null);
      qc.invalidateQueries({ queryKey: ["me", "sessions", "list"] });
      qc.invalidateQueries({ queryKey: queryKeys.prs });
    },
  });
}

export function useAbandonSession(): UseMutationResult<
  SessionDetailResponse,
  Error,
  { id: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => api.patchSession(id, { status: "abandoned" }),
    onSuccess: () => {
      qc.setQueryData(queryKeys.activeSession, null);
      qc.invalidateQueries({ queryKey: ["me", "sessions", "list"] });
    },
  });
}

/**
 * Rename a session. Optimistically patches the active-session cache's
 * `name` so the header updates instantly; rolls back on error. Also
 * invalidates the sessions list (history cards show the name) and, if
 * this happens to be a non-active session, its detail cache.
 */
export function useRenameSession(): UseMutationResult<
  SessionDetailResponse,
  Error,
  { id: string; name: string },
  { snapshot: SessionDetailResponse | null | undefined }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }) => api.patchSession(id, { name }),
    onMutate: async ({ name }) => {
      await qc.cancelQueries({ queryKey: queryKeys.activeSession });
      const snapshot = qc.getQueryData<SessionDetailResponse | null>(queryKeys.activeSession);
      qc.setQueryData<SessionDetailResponse | null>(queryKeys.activeSession, (old) =>
        old ? { ...old, name } : old
      );
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot !== undefined) {
        qc.setQueryData(queryKeys.activeSession, ctx.snapshot);
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.activeSession });
      qc.invalidateQueries({ queryKey: ["me", "sessions", "list"] });
      qc.invalidateQueries({ queryKey: queryKeys.session(vars.id) });
    },
  });
}

/**
 * "Save as template" — fork a session into a reusable personal
 * template that then appears under the My Workouts tab.
 */
export function useCreateTemplateFromSession(): UseMutationResult<
  WorkoutDetailResponse,
  Error,
  { sessionId: string; name?: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, name }) =>
      api.createTemplateFromSession(sessionId, name ? { name } : {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.myWorkouts });
    },
  });
}

/* ------------------------------------------------------------------ *
 * Mutations                                                          *
 * ------------------------------------------------------------------ */

/**
 * Log a set. Optimistically inserts the set into the active session's
 * matching exercise block (`queryKeys.activeSession`) so the UI shows
 * the new set immediately; rolls back on server error.
 *
 * If the exercise has no block yet (the very first set of a brand-new
 * ad-hoc addition — the server only materializes an ad-hoc block once
 * it has a logged set), there's nothing to optimistically append to;
 * the mutation falls back to the post-settle refetch for that one
 * case. Every subsequent set for that exercise IS optimistic.
 */
export function useLogSet(): UseMutationResult<
  SetLogCreatedResponse,
  Error,
  SetLogCreate
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.logSet(body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: queryKeys.activeSession });
      const snapshot = qc.getQueryData<SessionDetailResponse | null>(queryKeys.activeSession);

      qc.setQueryData<SessionDetailResponse | null>(queryKeys.activeSession, (old) => {
        if (!old) return old;
        const blockIdx = old.blocks.findIndex((b) => b.exercise.id === body.exercise_id);
        if (blockIdx === -1) return old;

        const kind = body.kind ?? "working";
        const weightKg = toKg(body.weight, body.weight_unit);
        const optimisticSet: HistoricalSetResponse = {
          id: getNextOptimisticId(),
          user_id: "optimistic",
          session_id: body.session_id,
          local_date: old.local_date,
          exercise_id: body.exercise_id,
          set_index: old.blocks[blockIdx].sets.length,
          kind,
          weight: body.weight,
          weight_unit: body.weight_unit,
          weight_kg: weightKg,
          reps: body.reps,
          rpe: body.rpe ?? null,
          was_pr: false,
          timestamp: nowIsoUtc(),
        };

        const blocks = [...old.blocks];
        const block = blocks[blockIdx];
        blocks[blockIdx] = { ...block, sets: [...block.sets, optimisticSet] };

        const isWorking = kind === "working";
        return {
          ...old,
          blocks,
          total_sets: isWorking ? old.total_sets + 1 : old.total_sets,
          total_volume_kg: isWorking
            ? old.total_volume_kg + weightKg * body.reps
            : old.total_volume_kg,
        };
      });

      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot !== undefined) {
        qc.setQueryData(queryKeys.activeSession, ctx.snapshot);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.activeSession });
      qc.invalidateQueries({ queryKey: ["me", "sessions", "list"] });
      qc.invalidateQueries({ queryKey: queryKeys.prs });
    },
  });
}

/**
 * Edit a logged set's weight/reps/kind/rpe. Not optimistic — the PR
 * recomputation this can trigger server-side is cheap enough that a
 * short-lived stale display is preferable to reasoning about rolling
 * back a PR badge on error.
 */
export function useUpdateSet(): UseMutationResult<
  SetLogCreatedResponse,
  Error,
  { id: number; body: SetLogPatch }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => api.updateSet(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.activeSession });
      qc.invalidateQueries({ queryKey: queryKeys.prs });
    },
  });
}

/**
 * Delete a set. Optimistically removes it from the active session's
 * matching exercise block and renumbers the remaining sets' local
 * `set_index`; rolls back on server error. Mirrors the `useLogSet`
 * pattern so the row vanishes immediately and reappears only if the
 * network call fails.
 */
export function useDeleteSet(): UseMutationResult<void, Error, number> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deleteSet(id),
    onMutate: async (setId) => {
      await qc.cancelQueries({ queryKey: queryKeys.activeSession });
      const snapshot = qc.getQueryData<SessionDetailResponse | null>(queryKeys.activeSession);

      qc.setQueryData<SessionDetailResponse | null>(queryKeys.activeSession, (old) => {
        if (!old) return old;
        let removed: HistoricalSetResponse | undefined;
        const blocks = old.blocks.map((b) => {
          const idx = b.sets.findIndex((s) => s.id === setId);
          if (idx === -1) return b;
          removed = b.sets[idx];
          const sets = b.sets.filter((s) => s.id !== setId).map((s, i) => ({ ...s, set_index: i }));
          return { ...b, sets };
        });
        if (!removed) return old;

        const isWorking = removed.kind === "working";
        return {
          ...old,
          blocks,
          total_sets: isWorking ? old.total_sets - 1 : old.total_sets,
          total_volume_kg: isWorking
            ? old.total_volume_kg - removed.weight_kg * removed.reps
            : old.total_volume_kg,
        };
      });

      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot !== undefined) {
        qc.setQueryData(queryKeys.activeSession, ctx.snapshot);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.activeSession });
      qc.invalidateQueries({ queryKey: ["me", "sessions", "list"] });
      qc.invalidateQueries({ queryKey: queryKeys.prs });
    },
  });
}

export function usePatchPreferences(): UseMutationResult<
  PreferencesResponse,
  Error,
  PreferencesPatch
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.patchPreferences(body),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.preferences, data);
      // `mode` (and `equipment`) change the server-side filter for
      // /workouts, so the workout list is now stale and must refetch.
      qc.invalidateQueries({ queryKey: ["workouts"] });
    },
  });
}

/* ------------------------------------------------------------------ *
 * Auth mutations                                                     *
 * ------------------------------------------------------------------ */

export function useLogin(): UseMutationResult<SessionResponse, ApiError, LoginRequest> {
  const qc = useQueryClient();
  return useMutation<SessionResponse, ApiError, LoginRequest>({
    mutationFn: (body) => api.login(body),
    onSuccess: async (data) => {
      await setToken(data.token);
      qc.setQueryData(queryKeys.me, data.user);
    },
  });
}

export function useSignup(): UseMutationResult<SessionResponse, ApiError, SignupRequest> {
  const qc = useQueryClient();
  return useMutation<SessionResponse, ApiError, SignupRequest>({
    mutationFn: (body) => api.signup(body),
    onSuccess: async (data) => {
      await setToken(data.token);
      qc.setQueryData(queryKeys.me, data.user);
    },
  });
}

export function useLogout(): UseMutationResult<void, ApiError, void> {
  const qc = useQueryClient();
  return useMutation<void, ApiError, void>({
    mutationFn: () => api.logout(),
    onSuccess: async () => {
      // Clear the pending-logout flag — the server-side session is
      // gone, we're done.
      try {
        const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
        await AsyncStorage.removeItem("@workout/pending-logout");
      } catch { /* noop */ }
    },
    onError: async () => {
      // Logout failed (likely offline). Mark as pending so the
      // LogoutRetryBridge in _layout.tsx will retry on app foreground.
      try {
        const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
        await AsyncStorage.setItem("@workout/pending-logout", "1");
      } catch { /* noop */ }
    },
    onSettled: async () => {
      // Always clear local state — the user is heading to /login.
      // The server-side session may still be live (if onError fired);
      // the retry bridge handles that.
      await clearToken();
      qc.setQueryData(queryKeys.me, null);
      qc.removeQueries();
    },
  });
}

/* ------------------------------------------------------------------ *
 * Admin mutations                                                    *
 *                                                                    *
 * All seven hooks share the same invalidation pattern: the admin     *
 * list cache and the public /workouts cache both go stale on any    *
  * mutation, so a workout created in the admin tab immediately shows *
  * up in the user-facing Training tab without a hard reload.          *
  * ------------------------------------------------------------------ */

export function useAdminWorkouts(q?: {
  limit?: number;
  offset?: number;
  location?: string;
  equipment?: string;
}): UseQueryResult<WorkoutSummaryResponse[]> {
  return useQuery({
    queryKey: queryKeys.adminWorkouts(q),
    queryFn: () => api.adminListWorkouts(q),
    // Admin lists are user-curated; refetch often enough to catch
    // concurrent edits from another admin on the same account.
    staleTime: 30_000,
  });
}

interface AdminCreateVars {
  body: WorkoutCreate;
}

interface AdminUpdateVars {
  id: string;
  body: WorkoutUpdate;
}

interface AdminAddExerciseVars {
  workoutId: string;
  body: AddExerciseToWorkout;
}

interface AdminRemoveExerciseVars {
  workoutId: string;
  exerciseId: string;
}

interface AdminReorderVars {
  workoutId: string;
  body: ReorderExercises;
}

interface AdminUpdatePrescriptionVars {
  workoutId: string;
  exerciseId: string;
  body: PrescriptionPatch;
}

export function useAdminCreateWorkout(): UseMutationResult<
  WorkoutDetailResponse,
  Error,
  AdminCreateVars
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body }) => api.adminCreateWorkout(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "workouts"] });
      qc.invalidateQueries({ queryKey: ["workouts"] });
    },
  });
}

export function useAdminUpdateWorkout(): UseMutationResult<
  WorkoutDetailResponse,
  Error,
  AdminUpdateVars
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => api.adminUpdateWorkout(id, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "workouts"] });
      qc.invalidateQueries({ queryKey: ["workouts"] });
      // The user-facing detail cache for this id is now stale too
      // (name/duration/location/equipment may have changed).
      qc.invalidateQueries({ queryKey: queryKeys.workout(vars.id) });
      qc.invalidateQueries({ queryKey: queryKeys.adminWorkout(vars.id) });
    },
  });
}

export function useAdminDeleteWorkout(): UseMutationResult<
  void,
  Error,
  string
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.adminDeleteWorkout(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "workouts"] });
      qc.invalidateQueries({ queryKey: ["workouts"] });
    },
  });
}

export function useAdminAddExercise(): UseMutationResult<
  WorkoutDetailResponse,
  Error,
  AdminAddExerciseVars
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workoutId, body }) => api.adminAddExercise(workoutId, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "workouts"] });
      // The detail cache for this workout is also stale — the server
      // returned the updated detail, so we can write it back directly
      // to avoid a refetch.
      qc.setQueryData(queryKeys.workout(vars.workoutId), _data);
      qc.setQueryData(queryKeys.adminWorkout(vars.workoutId), _data);
    },
  });
}

export function useAdminRemoveExercise(): UseMutationResult<
  void,
  Error,
  AdminRemoveExerciseVars
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workoutId, exerciseId }) =>
      api.adminRemoveExercise(workoutId, exerciseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "workouts"] });
      // The detail cache is now stale (a link was deleted), but
      // DELETE returns 204 with no body — we can't write it back, so
      // we just invalidate. A short refetch is acceptable UX.
      qc.invalidateQueries({ queryKey: ["workouts"] });
    },
  });
}

export function useAdminReorderExercises(): UseMutationResult<
  WorkoutDetailResponse,
  Error,
  AdminReorderVars
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workoutId, body }) =>
      api.adminReorderExercises(workoutId, body),
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "workouts"] });
      // Server returns the fresh detail; write it into both caches
      // so the editor's exercise list flips to the new order without
      // a refetch.
      qc.setQueryData(queryKeys.workout(vars.workoutId), data);
      qc.setQueryData(queryKeys.adminWorkout(vars.workoutId), data);
    },
  });
}

export function useAdminUpdatePrescription(): UseMutationResult<
  WorkoutDetailResponse,
  Error,
  AdminUpdatePrescriptionVars
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workoutId, exerciseId, body }) =>
      api.adminUpdatePrescription(workoutId, exerciseId, body),
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "workouts"] });
      qc.setQueryData(queryKeys.workout(vars.workoutId), data);
      qc.setQueryData(queryKeys.adminWorkout(vars.workoutId), data);
    },
  });
}

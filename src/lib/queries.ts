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
  HistoricalSetResponse,
  HistoryResponse,
  LoginRequest,
  PersonalRecordResponse,
  PreferencesPatch,
  PreferencesResponse,
  ReorderExercises,
  SessionResponse,
  SetLogCreate,
  SetLogCreatedResponse,
  SignupRequest,
  User,
  WorkoutCreate,
  WorkoutDetailResponse,
  WorkoutSummaryResponse,
  WorkoutUpdate,
} from "./api";
import { clearToken, getToken, setToken } from "./auth";
import { nowIsoUtc, utcDateKey } from "./dates";

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
  workouts: (filter?: { location?: string; equipment?: string }) =>
    ["workouts", filter ?? {}] as const,
  workout: (id: string) => ["workouts", id] as const,
  adminWorkouts: (q?: {
    limit?: number;
    offset?: number;
    location?: string;
    equipment?: string;
  }) => ["admin", "workouts", q ?? {}] as const,
  adminWorkout: (id: string) => ["admin", "workouts", id] as const,
  preferences: ["me", "preferences"] as const,
  history: (from?: string, to?: string) => ["me", "history", from ?? null, to ?? null] as const,
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

export function usePreferences(): UseQueryResult<PreferencesResponse> {
  return useQuery({
    queryKey: queryKeys.preferences,
    queryFn: () => api.getPreferences(),
    staleTime: FIVE_MIN,
  });
}

export function useHistory(from?: string, to?: string): UseQueryResult<HistoryResponse> {
  return useQuery({
    queryKey: queryKeys.history(from, to),
    queryFn: () => api.getHistory(from, to),
  });
}

export function usePRs(): UseQueryResult<PersonalRecordResponse[]> {
  return useQuery({
    queryKey: queryKeys.prs,
    queryFn: () => api.getPRs(),
  });
}

/* ------------------------------------------------------------------ *
 * Mutations                                                          *
 * ------------------------------------------------------------------ */

/**
 * Log a set. Optimistically inserts the set into every matching
 * history cache (we may have multiple — one per filter range) so
 * the UI shows the new set immediately; rolls back on server error.
 *
 * The optimistic set's `date` uses the UTC convention (`utcDateKey`)
 * to match the server's `log_set` storage. If a user logs at 11:55pm
 * local (5:55am UTC), the optimistic row appears in tomorrow's UTC
 * bucket — which is exactly where the server's eventual row will
 * land, so the post-refetch visual is stable.
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
      await qc.cancelQueries({ queryKey: ["me", "history"] });
      const day = utcDateKey(new Date());
      const ts = nowIsoUtc();
      const optimisticSet: HistoricalSetResponse = {
        id: getNextOptimisticId(),
        user_id: "optimistic",
        date: day,
        exercise_id: body.exercise_id,
        weight: body.weight,
        reps: body.reps,
        timestamp: ts,
      };
      const allHistory = qc.getQueriesData<HistoryResponse>({
        queryKey: ["me", "history"],
      });
      const snapshots = new Map<readonly unknown[], HistoryResponse | undefined>();
      for (const [key, data] of allHistory) {
        snapshots.set(key, data);
        qc.setQueryData<HistoryResponse>(key, (old) => {
          const history = { ...(old?.history ?? {}) };
          const dayMap = { ...(history[day] ?? {}) };
          dayMap[body.exercise_id] = [
            ...(dayMap[body.exercise_id] ?? []),
            optimisticSet,
          ];
          history[day] = dayMap;
          return { history };
        });
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      for (const [key, snapshot] of ctx.snapshots) {
        qc.setQueryData(key, snapshot);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["me", "history"] });
      qc.invalidateQueries({ queryKey: queryKeys.prs });
    },
  });
}

/**
 * Delete a set. Optimistically removes the set from every matching
 * history cache; rolls back on server error. Mirrors the useLogSet
 * pattern so the user sees the row vanish immediately and reappear
 * only if the network call fails.
 */
export function useDeleteSet(): UseMutationResult<void, Error, number> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deleteSet(id),
    onMutate: async (setId) => {
      await qc.cancelQueries({ queryKey: ["me", "history"] });
      const allHistory = qc.getQueriesData<HistoryResponse>({
        queryKey: ["me", "history"],
      });
      const snapshots = new Map<readonly unknown[], HistoryResponse | undefined>();
      for (const [key, data] of allHistory) {
        snapshots.set(key, data);
        qc.setQueryData<HistoryResponse>(key, (old) => {
          if (!old?.history) return old;
          const history: typeof old.history = {};
          for (const [date, exercises] of Object.entries(old.history)) {
            history[date] = {};
            for (const [exId, sets] of Object.entries(exercises)) {
              history[date][exId] = sets.filter((s) => s.id !== setId);
            }
          }
          return { history };
        });
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      for (const [key, snapshot] of ctx.snapshots) {
        qc.setQueryData(key, snapshot);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["me", "history"] });
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

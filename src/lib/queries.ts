import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { ApiError, api } from "./api";
import type {
  AddExerciseToWorkout,
  AssignmentsBody,
  AthleteRow,
  AthletesResponse,
  CoachLinkResponse,
  CoachPublic,
  CoachRequestCreate,
  ExercisePageResponse,
  ExerciseResponse,
  ExerciseSessionRollup,
  HistoricalSetResponse,
  LoginRequest,
  MessageResponse,
  PersonalRecordResponse,
  PlaybookResponse,
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
  UnreadResponse,
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
  /** The exercise picker's paginated browse query (`useExercisesInfinite`).
   * `equipment` is included so toggling a chip resets pagination to a
   * fresh page-0 fetch (a distinct key), even though the equipment filter
   * itself is applied client-side over already-fetched pages — see the
   * comment in `ExercisePicker` (SessionScreen.tsx) for why it can't be
   * pushed server-side yet (multi-select vs. the API's single `equipment`
   * param). */
  exercisesPage: (filter?: { search?: string; equipment?: string[] }) =>
    [
      "exercises",
      "page",
      { search: filter?.search ?? "", equipment: [...(filter?.equipment ?? [])].sort() },
    ] as const,
  exercise: (id: string) => ["exercises", id] as const,
  exerciseHistory: (id: string, limit?: number) =>
    ["me", "exercises", id, "history", limit ?? 20] as const,
  workouts: (filter?: { equipment?: string }) => ["workouts", filter ?? {}] as const,
  workout: (id: string) => ["workouts", id] as const,
  myWorkouts: ["me", "workouts"] as const,
  coachWorkouts: (q?: { limit?: number; offset?: number; equipment?: string }) =>
    ["coach", "workouts", q ?? {}] as const,
  coachWorkout: (id: string) => ["coach", "workouts", id] as const,
  coaches: ["coaches"] as const,
  myCoach: ["me", "coach"] as const,
  playbook: ["me", "playbook"] as const,
  coachAthletes: ["coach", "athletes"] as const,
  assignments: (workoutId: string) => ["coach", "assignments", workoutId] as const,
  messages: (otherId: string) => ["me", "messages", otherId] as const,
  unread: ["me", "messages", "unread"] as const,
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

const EXERCISES_PAGE_SIZE = 50;

/**
 * Paginated exercise browse (the "Add exercise" picker in `SessionScreen`).
 * `useInfiniteQuery` over `api.listExercisesPage`, offset-driven (the
 * backend's `X-Total-Count` header is the filtered total, read via
 * `getNextPageParam` to know when to stop). `search`/`equipment` are baked
 * into the query key (`queryKeys.exercisesPage`) so changing either starts
 * a fresh query at page 0 instead of appending to stale pages.
 */
export function useExercisesInfinite(
  filter?: { search?: string; equipment?: string[] }
): UseInfiniteQueryResult<InfiniteData<ExercisePageResponse>, Error> {
  return useInfiniteQuery({
    queryKey: queryKeys.exercisesPage(filter),
    queryFn: ({ pageParam }) =>
      api.listExercisesPage({ search: filter?.search, limit: EXERCISES_PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
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
  filter?: { equipment?: string }
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

/** The caller's own past completed sessions — the "My Workouts" tab. */
export function useMyWorkouts(
  q?: { limit?: number; offset?: number }
): UseQueryResult<SessionSummaryResponse[]> {
  return useQuery({
    queryKey: queryKeys.myWorkouts,
    queryFn: () => api.listMyWorkouts(q),
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
      // My Workouts is now the user's completed-sessions list, so a
      // finish makes it stale too.
      qc.invalidateQueries({ queryKey: queryKeys.myWorkouts });
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
 * Permanently delete a session (live or completed) and every set in it.
 * The server recomputes PRs for the affected exercises, so PRs, history,
 * and My Workouts all go stale.
 */
export function useDeleteSession(): UseMutationResult<void, Error, { id: string }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => api.deleteSession(id),
    onSuccess: (_data, { id }) => {
      const active = qc.getQueryData<SessionDetailResponse | null>(queryKeys.activeSession);
      if (active?.id === id) qc.setQueryData(queryKeys.activeSession, null);
      qc.removeQueries({ queryKey: queryKeys.session(id) });
      qc.invalidateQueries({ queryKey: ["me", "sessions", "list"] });
      qc.invalidateQueries({ queryKey: queryKeys.myWorkouts });
      qc.invalidateQueries({ queryKey: queryKeys.prs });
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
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.activeSession });
      qc.invalidateQueries({ queryKey: ["me", "sessions", "list"] });
      qc.invalidateQueries({ queryKey: queryKeys.prs });
      qc.invalidateQueries({ queryKey: queryKeys.myWorkouts });
      // `session_id` is always present on the write body. When this set
      // belongs to a completed (past) session being edited, the active-
      // session cache above is irrelevant — this is what actually
      // refreshes that session's detail view.
      qc.invalidateQueries({ queryKey: queryKeys.session(vars.session_id) });
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
  { id: number; body: SetLogPatch; sessionId: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => api.updateSet(id, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.activeSession });
      qc.invalidateQueries({ queryKey: queryKeys.prs });
      qc.invalidateQueries({ queryKey: queryKeys.myWorkouts });
      qc.invalidateQueries({ queryKey: queryKeys.session(vars.sessionId) });
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
export function useDeleteSet(): UseMutationResult<
  void,
  Error,
  { id: number; sessionId: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => api.deleteSet(id),
    onMutate: async ({ id: setId }) => {
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
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.activeSession });
      qc.invalidateQueries({ queryKey: ["me", "sessions", "list"] });
      qc.invalidateQueries({ queryKey: queryKeys.prs });
      qc.invalidateQueries({ queryKey: queryKeys.myWorkouts });
      qc.invalidateQueries({ queryKey: queryKeys.session(vars.sessionId) });
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
 * Coach library (workout CRUD)                                       *
 *                                                                    *
 * Every library mutation invalidates the coach list, the athlete    *
 * playbook and the public /workouts cache, so a change is reflected  *
 * everywhere without a hard reload.                                  *
 * ------------------------------------------------------------------ */

function invalidateLibrary(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: ["coach", "workouts"] });
  qc.invalidateQueries({ queryKey: queryKeys.playbook });
  qc.invalidateQueries({ queryKey: ["workouts"] });
}

function writeDetail(
  qc: ReturnType<typeof useQueryClient>,
  id: string,
  data: WorkoutDetailResponse
): void {
  qc.setQueryData(queryKeys.workout(id), data);
  qc.setQueryData(queryKeys.coachWorkout(id), data);
}

export function useCoachWorkouts(q?: {
  limit?: number;
  offset?: number;
  equipment?: string;
}): UseQueryResult<WorkoutSummaryResponse[]> {
  return useQuery({
    queryKey: queryKeys.coachWorkouts(q),
    queryFn: () => api.coachListWorkouts(q),
    staleTime: 30_000,
  });
}

export function useCoachWorkout(id: string): UseQueryResult<WorkoutDetailResponse> {
  return useQuery({
    queryKey: queryKeys.coachWorkout(id),
    queryFn: () => api.coachGetWorkout(id),
    enabled: Boolean(id),
  });
}

interface CoachCreateVars {
  body: WorkoutCreate;
}

interface CoachUpdateVars {
  id: string;
  body: WorkoutUpdate;
}

interface CoachAddExerciseVars {
  workoutId: string;
  body: AddExerciseToWorkout;
}

interface CoachRemoveExerciseVars {
  workoutId: string;
  exerciseId: string;
}

interface CoachReorderVars {
  workoutId: string;
  body: ReorderExercises;
}

interface CoachUpdatePrescriptionVars {
  workoutId: string;
  exerciseId: string;
  body: PrescriptionPatch;
}

export function useCoachCreateWorkout(): UseMutationResult<
  WorkoutDetailResponse,
  Error,
  CoachCreateVars
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body }) => api.coachCreateWorkout(body),
    onSuccess: () => invalidateLibrary(qc),
  });
}

export function useCoachUpdateWorkout(): UseMutationResult<
  WorkoutDetailResponse,
  Error,
  CoachUpdateVars
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => api.coachUpdateWorkout(id, body),
    onSuccess: (data, vars) => {
      invalidateLibrary(qc);
      writeDetail(qc, vars.id, data);
    },
  });
}

export function useCoachDeleteWorkout(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.coachDeleteWorkout(id),
    onSuccess: () => {
      invalidateLibrary(qc);
      qc.invalidateQueries({ queryKey: ["coach", "assignments"] });
      qc.invalidateQueries({ queryKey: queryKeys.coachAthletes });
    },
  });
}

export function useCoachAddExercise(): UseMutationResult<
  WorkoutDetailResponse,
  Error,
  CoachAddExerciseVars
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workoutId, body }) => api.coachAddExercise(workoutId, body),
    onSuccess: (data, vars) => {
      invalidateLibrary(qc);
      writeDetail(qc, vars.workoutId, data);
    },
  });
}

export function useCoachRemoveExercise(): UseMutationResult<
  void,
  Error,
  CoachRemoveExerciseVars
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workoutId, exerciseId }) => api.coachRemoveExercise(workoutId, exerciseId),
    onSuccess: () => invalidateLibrary(qc),
  });
}

export function useCoachReorderExercises(): UseMutationResult<
  WorkoutDetailResponse,
  Error,
  CoachReorderVars
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workoutId, body }) => api.coachReorderExercises(workoutId, body),
    onSuccess: (data, vars) => {
      invalidateLibrary(qc);
      writeDetail(qc, vars.workoutId, data);
    },
  });
}

export function useCoachUpdatePrescription(): UseMutationResult<
  WorkoutDetailResponse,
  Error,
  CoachUpdatePrescriptionVars
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workoutId, exerciseId, body }) =>
      api.coachUpdatePrescription(workoutId, exerciseId, body),
    onSuccess: (data, vars) => {
      invalidateLibrary(qc);
      writeDetail(qc, vars.workoutId, data);
    },
  });
}

/* ------------------------------------------------------------------ *
 * Coaching — athlete side                                            *
 * ------------------------------------------------------------------ */

export function useCoaches(): UseQueryResult<CoachPublic[]> {
  return useQuery({
    queryKey: queryKeys.coaches,
    queryFn: () => api.listCoaches(),
    staleTime: FIVE_MIN,
  });
}

/** The caller's pending/accepted coach link, or null. Polls every 30 s so
 * unread counts stay fresh. */
export function useMyCoach(): UseQueryResult<CoachLinkResponse | null> {
  return useQuery({
    queryKey: queryKeys.myCoach,
    queryFn: () => api.getMyCoach(),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function usePlaybook(): UseQueryResult<PlaybookResponse> {
  return useQuery({
    queryKey: queryKeys.playbook,
    queryFn: () => api.getPlaybook(),
    staleTime: 30_000,
    // Polled so a workout the coach sends shows up without a manual refresh.
    refetchInterval: 30_000,
  });
}

export function useRequestCoach(): UseMutationResult<
  CoachLinkResponse,
  Error,
  CoachRequestCreate
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.requestCoach(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.myCoach });
      qc.invalidateQueries({ queryKey: queryKeys.playbook });
      qc.invalidateQueries({ queryKey: queryKeys.coaches });
    },
  });
}

export function useCancelCoachLink(): UseMutationResult<void, Error, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.cancelCoachLink(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.myCoach });
      qc.invalidateQueries({ queryKey: queryKeys.playbook });
      qc.invalidateQueries({ queryKey: queryKeys.coaches });
    },
  });
}

/* ------------------------------------------------------------------ *
 * Coaching — coach side                                              *
 * ------------------------------------------------------------------ */

/** Pending requests + accepted athletes. Polls every 30 s. */
export function useCoachAthletes(): UseQueryResult<AthletesResponse> {
  return useQuery({
    queryKey: queryKeys.coachAthletes,
    queryFn: () => api.coachListAthletes(),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function useAcceptLink(): UseMutationResult<AthleteRow, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId) => api.coachAcceptLink(linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.coachAthletes }),
  });
}

export function useDeclineLink(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId) => api.coachDeclineLink(linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.coachAthletes }),
  });
}

export function useAssignments(workoutId: string): UseQueryResult<AssignmentsBody> {
  return useQuery({
    queryKey: queryKeys.assignments(workoutId),
    queryFn: () => api.coachGetAssignments(workoutId),
    enabled: Boolean(workoutId),
  });
}

export function useSetAssignments(): UseMutationResult<
  AssignmentsBody,
  Error,
  { workoutId: string; athleteIds: string[] }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workoutId, athleteIds }) =>
      api.coachSetAssignments(workoutId, { athlete_ids: athleteIds }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.assignments(vars.workoutId) });
      qc.invalidateQueries({ queryKey: queryKeys.coachAthletes });
    },
  });
}

/* ------------------------------------------------------------------ *
 * Messages (polling, no push)                                        *
 * ------------------------------------------------------------------ */

/** A thread with `otherId`. Polls every 5 s while `enabled` (default true). */
export function useMessages(
  otherId: string,
  opts?: { enabled?: boolean }
): UseQueryResult<MessageResponse[]> {
  const enabled = (opts?.enabled ?? true) && Boolean(otherId);
  return useQuery({
    queryKey: queryKeys.messages(otherId),
    queryFn: () => api.listMessages(otherId),
    enabled,
    staleTime: 0,
    refetchInterval: enabled ? 5_000 : false,
  });
}

/**
 * Send a DM. Optimistically appends a message with a negative temp id
 * (sender id is unknown here, so it is marked via `sender_id: "me"` —
 * consumers should treat `id < 0` as "mine, pending"); rolls back on error.
 */
export function useSendMessage(): UseMutationResult<
  MessageResponse,
  Error,
  { otherId: string; body: string },
  { snapshot: MessageResponse[] | undefined }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ otherId, body }) => api.sendMessage(otherId, { body }),
    onMutate: async ({ otherId, body }) => {
      await qc.cancelQueries({ queryKey: queryKeys.messages(otherId) });
      const snapshot = qc.getQueryData<MessageResponse[]>(queryKeys.messages(otherId));
      const me = qc.getQueryData<User | null>(queryKeys.me);
      const optimistic: MessageResponse = {
        id: getNextOptimisticId(),
        sender_id: me?.id ?? "me",
        recipient_id: otherId,
        body,
        created_at: nowIsoUtc(),
        read_at: null,
      };
      qc.setQueryData<MessageResponse[]>(queryKeys.messages(otherId), (old) => [
        ...(old ?? []),
        optimistic,
      ]);
      return { snapshot };
    },
    onError: (_err, vars, ctx) => {
      qc.setQueryData(queryKeys.messages(vars.otherId), ctx?.snapshot);
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.messages(vars.otherId) });
      qc.invalidateQueries({ queryKey: queryKeys.unread });
      qc.invalidateQueries({ queryKey: queryKeys.coachAthletes });
      qc.invalidateQueries({ queryKey: queryKeys.myCoach });
    },
  });
}

/** Mark every message from `otherId` to me as read. Variable = otherId. */
export function useMarkRead(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (otherId) => api.markMessagesRead(otherId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.unread });
      qc.invalidateQueries({ queryKey: queryKeys.coachAthletes });
      qc.invalidateQueries({ queryKey: queryKeys.myCoach });
    },
  });
}

/** Total + per-user unread DM counts. Polls every 30 s. */
export function useUnread(): UseQueryResult<UnreadResponse> {
  return useQuery({
    queryKey: queryKeys.unread,
    queryFn: () => api.getUnread(),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

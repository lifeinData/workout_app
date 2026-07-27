import { useSyncExternalStore } from 'react';

export type Mode = 'home' | 'gym' | 'all';
export type Equipment = 'bodyweight' | 'dumbbells' | 'barbell' | 'cable' | 'machine' | 'bands' | 'kettlebell';

export interface SetLog { weight: number; reps: number; done: boolean; }
export interface PR { weight: number; reps: number; date: string; }
export interface HistoricalSet { weight: number; reps: number; timestamp: string; }
export interface DayHistory {
  [exerciseId: string]: HistoricalSet[];
}

interface State {
  mode: Mode;
  equipment: Set<Equipment>;
  // entries[exerciseId] = SetLog[] (today only for the demo)
  entries: Record<string, SetLog[]>;
  prs: Record<string, PR>;            // by exerciseId
  completedWorkouts: Set<string>;     // workoutIds completed today
  // history[dateString][exerciseId] = HistoricalSet[]
  history: Record<string, DayHistory>;
}

const state: State = {
  mode: 'gym',
  equipment: new Set<Equipment>(['bodyweight','dumbbells','barbell','cable','machine','bands','kettlebell']),
  entries: {},
  prs: {
    'ex-bench':    { weight: 205, reps: 5, date: '2026-05-28' },
    'ex-deadlift': { weight: 365, reps: 3, date: '2026-05-20' },
    'ex-squat':    { weight: 285, reps: 5, date: '2026-05-22' },
  },
  completedWorkouts: new Set(),
  history: {
    '2026-06-02': {
      'ex-bench': [
        { weight: 205, reps: 8, timestamp: '2026-06-02T10:15:00' },
        { weight: 205, reps: 7, timestamp: '2026-06-02T10:18:00' },
        { weight: 205, reps: 6, timestamp: '2026-06-02T10:21:00' },
      ],
      'ex-incline-db': [
        { weight: 75, reps: 10, timestamp: '2026-06-02T10:30:00' },
        { weight: 75, reps: 9, timestamp: '2026-06-02T10:33:00' },
        { weight: 75, reps: 8, timestamp: '2026-06-02T10:36:00' },
      ],
    },
    '2026-06-01': {
      'ex-squat': [
        { weight: 275, reps: 5, timestamp: '2026-06-01T09:00:00' },
        { weight: 275, reps: 5, timestamp: '2026-06-01T09:05:00' },
        { weight: 275, reps: 4, timestamp: '2026-06-01T09:10:00' },
      ],
      'ex-rdl': [
        { weight: 185, reps: 10, timestamp: '2026-06-01T09:20:00' },
        { weight: 185, reps: 10, timestamp: '2026-06-01T09:24:00' },
      ],
    },
    '2026-05-31': {
      'ex-deadlift': [
        { weight: 315, reps: 5, timestamp: '2026-05-31T11:00:00' },
        { weight: 335, reps: 3, timestamp: '2026-05-31T11:10:00' },
        { weight: 355, reps: 1, timestamp: '2026-05-31T11:20:00' },
      ],
    },
    '2026-05-28': {
      'ex-bench': [
        { weight: 185, reps: 8, timestamp: '2026-05-28T14:00:00' },
        { weight: 195, reps: 6, timestamp: '2026-05-28T14:05:00' },
        { weight: 205, reps: 5, timestamp: '2026-05-28T14:10:00' },
      ],
      'ex-ohp': [
        { weight: 115, reps: 8, timestamp: '2026-05-28T14:25:00' },
        { weight: 115, reps: 7, timestamp: '2026-05-28T14:30:00' },
      ],
    },
  },
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export const trainingStore = {
  getState: () => state,

  setMode(mode: Mode) { state.mode = mode; emit(); },

  toggleEquipment(eq: Equipment) {
    if (state.equipment.has(eq)) state.equipment.delete(eq);
    else state.equipment.add(eq);
    state.equipment = new Set(state.equipment);
    emit();
  },

  setSets(exerciseId: string, sets: SetLog[]) {
    state.entries = { ...state.entries, [exerciseId]: sets };
    emit();
  },

  /** Returns true if this commit set a new PR. */
  commitSet(exerciseId: string, idx: number, weight: number, reps: number): boolean {
    const cur = state.entries[exerciseId] ? [...state.entries[exerciseId]] : [];
    while (cur.length <= idx) cur.push({ weight: 0, reps: 0, done: false });
    cur[idx] = { weight, reps, done: true };
    state.entries = { ...state.entries, [exerciseId]: cur };

    // Save to history
    const today = new Date().toISOString().slice(0, 10);
    const timestamp = new Date().toISOString();
    if (!state.history[today]) state.history[today] = {};
    if (!state.history[today][exerciseId]) state.history[today][exerciseId] = [];
    state.history[today][exerciseId].push({ weight, reps, timestamp });
    state.history = { ...state.history };

    const existing = state.prs[exerciseId];
    const isPR = weight > 0 && reps > 0 && (
      !existing || (weight * reps) > (existing.weight * existing.reps)
    );
    if (isPR) {
      state.prs = { ...state.prs, [exerciseId]: { weight, reps, date: new Date().toISOString().slice(0,10) } };
    }
    emit();
    return isPR;
  },

  finishWorkout(workoutId: string) {
    state.completedWorkouts = new Set(state.completedWorkouts).add(workoutId);
    emit();
  },

  removeHistoricalSet(date: string, exerciseId: string, index: number) {
    const day = state.history[date];
    if (!day?.[exerciseId]) return;
    const next = day[exerciseId].filter((_, i) => i !== index);
    const nextDay = { ...day, [exerciseId]: next };
    if (next.length === 0) delete nextDay[exerciseId];
    state.history = { ...state.history, [date]: nextDay };
    // also trim entries to keep PR/index logic consistent
    const cur = state.entries[exerciseId];
    if (cur) {
      state.entries = { ...state.entries, [exerciseId]: cur.filter((_, i) => i !== index) };
    }
    emit();
  },
};

export function useTrainingStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

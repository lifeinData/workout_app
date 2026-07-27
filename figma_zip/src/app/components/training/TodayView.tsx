import { useMemo, useState } from 'react';
import { Plus, Search, Flame, Timer, Trophy } from 'lucide-react';
import { WORKOUTS, Exercise } from './workoutLibrary';
import { useTrainingStore } from '../../state/trainingStore';
import { ExerciseLogger } from './ExerciseLogger';
import { DemoVideoSheet } from './DemoVideoSheet';

const todayKey = () => new Date().toISOString().slice(0, 10);
const todayLabel = () =>
  new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

export function TodayView() {
  const today = useTrainingStore(s => s.history[todayKey()]) ?? {};
  const [pickerOpen, setPickerOpen] = useState(false);
  const [demo, setDemo] = useState<{ ytId: string; name: string } | null>(null);

  const allExercises = useMemo(() => {
    const m = new Map<string, Exercise>();
    WORKOUTS.forEach(w => w.exercises.forEach(e => m.set(e.id, e)));
    return Array.from(m.values());
  }, []);

  const byId = useMemo(() => {
    const m = new Map<string, Exercise>();
    allExercises.forEach(e => m.set(e.id, e));
    return m;
  }, [allExercises]);

  // Active exercises today, ordered by first-logged timestamp
  const activeIds = useMemo(() => {
    return Object.entries(today)
      .filter(([, sets]) => sets.length > 0)
      .sort((a, b) => (a[1][0]?.timestamp ?? '').localeCompare(b[1][0]?.timestamp ?? ''))
      .map(([id]) => id);
  }, [today]);

  // Pinned (added but not yet logged)
  const [pinned, setPinned] = useState<string[]>([]);
  const visibleIds = useMemo(() => {
    const set = new Set([...activeIds, ...pinned]);
    return Array.from(set);
  }, [activeIds, pinned]);

  const addExercise = (id: string) => {
    if (!visibleIds.includes(id)) setPinned(p => [...p, id]);
    setPickerOpen(false);
  };

  // Summary stats
  const totalSets = Object.values(today).reduce((n, s) => n + s.length, 0);
  const totalVolume = Object.values(today)
    .flat()
    .reduce((v, s) => v + s.weight * s.reps, 0);
  const firstTs = Object.values(today).flat().map(s => s.timestamp).sort()[0];
  const durationMin = firstTs
    ? Math.max(1, Math.round((Date.now() - new Date(firstTs).getTime()) / 60000))
    : 0;

  return (
    <div className="space-y-5">
      {/* Today header */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {todayLabel()}
        </div>
        <h1 className="text-foreground tracking-tight">Today's session</h1>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-2">
        <Stat icon={<Flame className="w-3.5 h-3.5" />} label="Sets" value={String(totalSets)} />
        <Stat icon={<Trophy className="w-3.5 h-3.5" />} label="Volume" value={`${totalVolume.toLocaleString()}`} suffix="lb" />
        <Stat icon={<Timer className="w-3.5 h-3.5" />} label="Duration" value={durationMin ? String(durationMin) : '—'} suffix={durationMin ? 'min' : ''} />
      </div>

      {/* Add exercise CTA — always visible, top of stack */}
      <button
        onClick={() => setPickerOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:shadow-primary/30 transition-all"
      >
        <Plus className="w-4 h-4" strokeWidth={3} />
        Add exercise
      </button>

      {/* Today's exercises, front and center */}
      {visibleIds.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center space-y-2">
          <div className="text-sm text-card-foreground">Nothing logged yet</div>
          <div className="text-xs text-muted-foreground">
            Tap <span className="text-primary">Add exercise</span> to start your session.
          </div>
        </div>
      ) : (
        <div className="space-y-6 divide-y divide-border">
          {visibleIds.map((id, i) => {
            const ex = byId.get(id);
            if (!ex) return null;
            return (
              <div key={id} className={i === 0 ? '' : 'pt-6'}>
                <ExerciseLogger
                  exercise={ex}
                  onPlayDemo={() => setDemo({ ytId: ex.ytId, name: ex.name })}
                />
              </div>
            );
          })}
        </div>
      )}

      {pickerOpen && (
        <ExercisePicker
          exercises={allExercises}
          activeIds={visibleIds}
          onPick={addExercise}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {demo && <DemoVideoSheet ytId={demo.ytId} exerciseName={demo.name} onClose={() => setDemo(null)} />}
    </div>
  );
}

function Stat({ icon, label, value, suffix }: { icon: React.ReactNode; label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border px-3 py-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-0.5 text-card-foreground tabular-nums tracking-tight">
        <span className="text-lg">{value}</span>
        {suffix && <span className="text-xs text-muted-foreground ml-1">{suffix}</span>}
      </div>
    </div>
  );
}

function ExercisePicker({
  exercises, activeIds, onPick, onClose,
}: {
  exercises: Exercise[];
  activeIds: string[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const filtered = exercises.filter(e =>
    e.name.toLowerCase().includes(q.toLowerCase()) ||
    e.muscleGroup.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card rounded-t-3xl border-t border-x border-border shadow-2xl max-h-[85vh] flex flex-col">
        <div className="p-5 border-b border-border space-y-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-card-foreground tracking-tight">Add exercise</h2>
            <button onClick={onClose} className="text-sm text-muted-foreground hover:text-primary">Cancel</button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search exercises or muscle group"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-input-background border border-border text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-ring/30"
            />
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto p-3 space-y-1">
          {filtered.map(e => {
            const active = activeIds.includes(e.id);
            return (
              <li key={e.id}>
                <button
                  onClick={() => onPick(e.id)}
                  disabled={active}
                  className="w-full flex items-center justify-between px-3 py-3 rounded-xl hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed text-left transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-card-foreground truncate">{e.name}</div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mt-0.5">{e.muscleGroup}</div>
                  </div>
                  <span className="text-xs text-primary">{active ? 'Added' : 'Add'}</span>
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="text-center text-sm text-muted-foreground py-10">No matches.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

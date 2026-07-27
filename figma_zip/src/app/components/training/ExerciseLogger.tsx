import { useState, useEffect } from 'react';
import { Play, Plus, Trophy, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Exercise } from './workoutLibrary';
import { trainingStore, useTrainingStore } from '../../state/trainingStore';

interface Props {
  exercise: Exercise;
  onPlayDemo: () => void;
  defaultExpanded?: boolean;
}

const todayKey = () => new Date().toISOString().slice(0, 10);
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function ExerciseLogger({ exercise, onPlayDemo }: Props) {
  const todaysSets = useTrainingStore(s => s.history[todayKey()]?.[exercise.id]) ?? [];
  const pr = useTrainingStore(s => s.prs[exercise.id]);
  const entries = useTrainingStore(s => s.entries[exercise.id]) ?? [];

  const lastWeight = todaysSets[todaysSets.length - 1]?.weight ?? pr?.weight ?? 0;
  const [weight, setWeight] = useState<string>('');
  const [reps, setReps] = useState<string>('');

  useEffect(() => {
    if (todaysSets.length > 0 && weight === '') setWeight(String(lastWeight));
  }, [todaysSets.length]);

  const canSave = Number(weight) > 0 && Number(reps) > 0;

  const onAdd = () => {
    if (!canSave) return;
    const w = Number(weight);
    const r = Number(reps);
    const nextIdx = entries.length;
    const isPR = trainingStore.commitSet(exercise.id, nextIdx, w, r);
    if (isPR) {
      toast.success(`New PR — ${exercise.name}`, { description: `${w} × ${r}` });
    } else {
      toast.success(`Set ${todaysSets.length + 1} logged`, { description: `${w} lb × ${r} reps` });
    }
    setReps('');
  };

  return (
    <section className="space-y-4">
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {exercise.muscleGroup}
          </div>
          <h3 className="text-card-foreground tracking-tight flex items-center gap-1.5">
            {exercise.name}
            {pr && exercise.prTrackable && <Trophy className="w-3.5 h-3.5 text-primary" />}
          </h3>
          <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
            Target {exercise.defaultSets} × {exercise.defaultRepsLabel}
            {pr && <> · <span className="text-primary">PR {pr.weight}×{pr.reps}</span></>}
          </div>
        </div>
        <button
          onClick={onPlayDemo}
          className="w-9 h-9 rounded-full bg-muted hover:bg-secondary flex items-center justify-center flex-shrink-0 transition-colors"
          aria-label="Watch demo"
        >
          <Play className="w-3.5 h-3.5 text-primary fill-primary ml-0.5" />
        </button>
      </header>

      {/* Today's sets — empty until you actually log one */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Today
          </span>
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground tabular-nums">
            {todaysSets.length} {todaysSets.length === 1 ? 'set' : 'sets'}
          </span>
        </div>

        {todaysSets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
            No sets logged yet. Enter weight + reps below.
          </div>
        ) : (
          <ul className="space-y-1">
            {todaysSets.map((s, i) => (
              <li
                key={i}
                className="group grid grid-cols-[28px_1fr_1fr_auto_28px] gap-3 items-center px-3 py-2.5 rounded-xl bg-muted/50"
              >
                <span className="text-sm text-primary tabular-nums">{i + 1}</span>
                <span className="text-sm text-card-foreground tabular-nums">
                  {s.weight} <span className="text-muted-foreground text-xs">lb</span>
                </span>
                <span className="text-sm text-card-foreground tabular-nums">
                  {s.reps} <span className="text-muted-foreground text-xs">reps</span>
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {fmtTime(s.timestamp)}
                </span>
                <button
                  onClick={() => {
                    trainingStore.removeHistoricalSet(todayKey(), exercise.id, i);
                    toast('Set removed', { description: `${s.weight} × ${s.reps}` });
                  }}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors"
                  aria-label="Remove set"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Entry row — the only place you type */}
      <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="block text-[10px] uppercase tracking-[0.14em] text-muted-foreground px-1">Weight (lb)</span>
            <input
              type="number" inputMode="decimal" value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder={String(pr?.weight ?? 0)}
              className="w-full px-3 py-2.5 rounded-xl bg-input-background border border-border text-center tabular-nums outline-none focus:border-primary/50 focus:ring-2 focus:ring-ring/30"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-[10px] uppercase tracking-[0.14em] text-muted-foreground px-1">Reps</span>
            <input
              type="number" inputMode="numeric" value={reps}
              onChange={(e) => setReps(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2.5 rounded-xl bg-input-background border border-border text-center tabular-nums outline-none focus:border-primary/50 focus:ring-2 focus:ring-ring/30"
            />
          </label>
        </div>
        <button
          onClick={onAdd}
          disabled={!canSave}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl transition-all ${
            canSave
              ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:shadow-primary/30'
              : 'bg-muted text-muted-foreground opacity-60'
          }`}
        >
          {canSave ? <Plus className="w-4 h-4" strokeWidth={3} /> : <Check className="w-4 h-4 opacity-50" />}
          {canSave ? `Add set ${todaysSets.length + 1}` : 'Enter weight & reps'}
        </button>
      </div>
    </section>
  );
}

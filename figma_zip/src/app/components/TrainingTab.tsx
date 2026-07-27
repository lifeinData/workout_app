import { useMemo, useState } from 'react';
import { Trophy, Lock, ChevronLeft, ChevronRight, Sparkles, Clock, Home, Dumbbell as DumbbellIcon, CheckCircle2, List, CalendarDays, Flame } from 'lucide-react';
import { WORKOUTS, EQUIPMENT_LIST, Workout } from './training/workoutLibrary';
import { trainingStore, useTrainingStore, Equipment } from '../state/trainingStore';
import { WorkoutDetail } from './training/WorkoutDetail';
import { HistoryView } from './training/HistoryView';
import { TodayView } from './training/TodayView';

const TROPHY_DEFS: { exerciseId: string; animal: string; name: string; threshold: number }[] = [
  { exerciseId: 'ex-bench',    animal: '🦁', name: 'Lion',  threshold: 225 },
  { exerciseId: 'ex-deadlift', animal: '🦅', name: 'Eagle', threshold: 405 },
  { exerciseId: 'ex-squat',    animal: '🐺', name: 'Wolf',  threshold: 315 },
  { exerciseId: 'ex-ohp',      animal: '🐻', name: 'Bear',  threshold: 185 },
  { exerciseId: 'ex-pullup',   animal: '🦈', name: 'Shark', threshold: 20  },
];

export function TrainingTab() {
  const mode = useTrainingStore(s => s.mode);
  const equipment = useTrainingStore(s => s.equipment);
  const prs = useTrainingStore(s => s.prs);
  const completed = useTrainingStore(s => s.completedWorkouts);
  const [open, setOpen] = useState<Workout | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [view, setView] = useState<'today' | 'workouts' | 'history'>('today');

  const filtered = useMemo(() => {
    return WORKOUTS.filter(w => {
      const locOk = mode === 'all' || w.location === mode || w.location === 'either';
      const eqOk = w.equipment.every(e => equipment.has(e) || e === 'bodyweight');
      return locOk && eqOk;
    });
  }, [mode, equipment]);

  return (
    <div className="p-5 max-w-md mx-auto space-y-4">
      {/* View toggle */}
      <div className="grid grid-cols-3 gap-2 p-1 bg-muted rounded-2xl">
        {([
          { id: 'today', label: 'Today', Icon: Flame },
          { id: 'workouts', label: 'Workouts', Icon: List },
          { id: 'history', label: 'History', Icon: CalendarDays },
        ] as const).map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 ${
              view === id ? 'bg-card text-card-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {view === 'today' && <TodayView />}

      {view === 'workouts' && (
        <>
          {/* Mode toggle */}
          <div className="bg-card rounded-3xl p-4 border border-border shadow-sm">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 rounded-2xl bg-secondary flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                Your intake says <span className="text-card-foreground">home + dumbbells</span>. Coach AI filters your library to what you can actually do.
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 p-1 bg-muted rounded-2xl">
              {(['home','gym','all'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => trainingStore.setMode(m)}
                  className={`py-2 rounded-xl text-sm capitalize transition-all flex items-center justify-center gap-1.5 ${
                    mode === m ? 'bg-card text-card-foreground shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  {m === 'home' && <Home className="w-3.5 h-3.5" />}
                  {m === 'gym' && <DumbbellIcon className="w-3.5 h-3.5" />}
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Equipment chips */}
          <div className="bg-card rounded-3xl p-4 border border-border shadow-sm">
            <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Available equipment</div>
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT_LIST.map(eq => {
                const active = equipment.has(eq.id);
                return (
                  <button
                    key={eq.id}
                    onClick={() => trainingStore.toggleEquipment(eq.id as Equipment)}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/50 text-muted-foreground border-border hover:border-primary/40'
                    }`}
                  >
                    {eq.label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {view === 'workouts' && (
        <div className="bg-gradient-to-br from-accent to-secondary rounded-3xl p-5 border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-accent-foreground">Hypertrophy Phase</h2>
              <p className="text-sm text-accent-foreground/70">Week 3 of 6</p>
            </div>
            <div className="text-right">
              <div className="text-2xl text-primary tabular-nums">50%</div>
              <div className="text-xs text-accent-foreground/70">Complete</div>
            </div>
          </div>
          <div className="mt-4 w-full bg-card/60 rounded-full h-2">
            <div className="bg-primary h-2 rounded-full" style={{ width: '50%' }} />
          </div>
        </div>
      )}

      {/* Workout list */}
      {view === 'workouts' && (
        <div className="space-y-3">
          <h3 className="text-foreground px-1">Workouts for you ({filtered.length})</h3>
          {filtered.map(w => {
            const isDone = completed.has(w.id);
            return (
              <button
                key={w.id}
                onClick={() => setOpen(w)}
                className="w-full bg-card rounded-3xl p-4 border border-border text-left hover:border-primary/40 transition-all shadow-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{w.tag}</span>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {w.durationMin} min
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <h3 className="text-card-foreground flex-1">{w.name}</h3>
                  {isDone && <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {w.exercises.length} exercises · {w.location === 'either' ? 'home or gym' : w.location}
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {w.equipment.map(eq => (
                    <span key={eq} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                      {eq}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="bg-muted/50 rounded-3xl p-8 text-center text-sm text-muted-foreground border border-dashed border-border">
              No workouts match your filters. Try adding equipment or switching mode.
            </div>
          )}
        </div>
      )}

      {/* History view */}
      {view === 'history' && <HistoryView />}

      {view === 'workouts' && (
        <div className="bg-card rounded-3xl p-5 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-card-foreground">Trophy Room</h2>
            <div className="flex gap-1">
              {TROPHY_DEFS.map((_, i) => (
                <div
                  key={i}
                  className={`h-2 rounded-full transition-all ${
                    i === activeSlide ? 'bg-primary w-4' : 'bg-muted w-2'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden">
            <div
              className="flex transition-transform duration-300 ease-out"
              style={{ transform: `translateX(-${activeSlide * 100}%)` }}
            >
              {TROPHY_DEFS.map((t) => {
                const pr = prs[t.exerciseId];
                const unlocked = !!pr && pr.weight >= t.threshold;
                const label = pr ? `${pr.weight} × ${pr.reps}` : `Target ${t.threshold}+`;
                return (
                  <div key={t.name} className="w-full flex-shrink-0 px-2">
                    <div className={`relative rounded-2xl p-6 text-center ${
                      unlocked
                        ? 'bg-gradient-to-br from-accent to-secondary border border-border'
                        : 'bg-muted/60 border border-border'
                    }`}>
                      {!unlocked && (
                        <div className="absolute inset-0 bg-card/60 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                          <Lock className="w-7 h-7 text-muted-foreground" />
                        </div>
                      )}
                      <div className={`text-6xl mb-3 ${!unlocked && 'grayscale opacity-30'}`}>{t.animal}</div>
                      <h3 className={`mb-1 ${unlocked ? 'text-accent-foreground' : 'text-muted-foreground'}`}>{t.name}</h3>
                      <p className={`text-sm ${unlocked ? 'text-accent-foreground/70' : 'text-muted-foreground'}`}>{label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setActiveSlide(Math.max(0, activeSlide - 1))}
              disabled={activeSlide === 0}
              className="flex-1 py-2 px-4 bg-muted rounded-xl text-sm text-card-foreground disabled:opacity-40 flex items-center justify-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            <button
              onClick={() => setActiveSlide(Math.min(TROPHY_DEFS.length - 1, activeSlide + 1))}
              disabled={activeSlide === TROPHY_DEFS.length - 1}
              className="flex-1 py-2 px-4 bg-muted rounded-xl text-sm text-card-foreground disabled:opacity-40 flex items-center justify-center gap-1"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {open && <WorkoutDetail workout={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

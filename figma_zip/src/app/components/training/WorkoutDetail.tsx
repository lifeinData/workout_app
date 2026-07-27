import { useState } from 'react';
import { X, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Workout } from './workoutLibrary';
import { ExerciseLogger } from './ExerciseLogger';
import { DemoVideoSheet } from './DemoVideoSheet';
import { trainingStore, useTrainingStore } from '../../state/trainingStore';

interface Props {
  workout: Workout;
  onClose: () => void;
}

export function WorkoutDetail({ workout, onClose }: Props) {
  const [demo, setDemo] = useState<{ ytId: string; name: string } | null>(null);
  const completed = useTrainingStore(s => s.completedWorkouts.has(workout.id));

  const onFinish = () => {
    trainingStore.finishWorkout(workout.id);
    toast.success(`✅ ${workout.name} complete`, { description: 'Great work — adherence ring updated.' });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-card rounded-t-3xl border-t border-x border-border shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{workout.tag}</span>
              <span>·</span>
              <Clock className="w-3 h-3" />
              <span>{workout.durationMin} min</span>
            </div>
            <h2 className="text-card-foreground truncate">{workout.name}</h2>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-muted hover:bg-secondary flex items-center justify-center transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-2 divide-y divide-border">
          {workout.exercises.map((ex, i) => (
            <div key={ex.id} className={i === 0 ? 'pb-6' : 'py-6 last:pb-2'}>
              <ExerciseLogger
                exercise={ex}
                onPlayDemo={() => setDemo({ ytId: ex.ytId, name: ex.name })}
              />
            </div>
          ))}
        </div>

        <div className="p-5 border-t border-border flex-shrink-0">
          <button
            onClick={onFinish}
            disabled={completed}
            className="w-full py-3 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/40 transition-all disabled:opacity-60"
          >
            {completed ? '✓ Workout complete' : 'Finish workout'}
          </button>
        </div>
      </div>

      {demo && <DemoVideoSheet ytId={demo.ytId} exerciseName={demo.name} onClose={() => setDemo(null)} />}
    </div>
  );
}

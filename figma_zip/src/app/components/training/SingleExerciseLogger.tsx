import { X } from 'lucide-react';
import { Exercise } from './workoutLibrary';
import { ExerciseLogger } from './ExerciseLogger';
import { DemoVideoSheet } from './DemoVideoSheet';
import { useState } from 'react';

interface Props {
  exercise: Exercise;
  onClose: () => void;
}

export function SingleExerciseLogger({ exercise, onClose }: Props) {
  const [demo, setDemo] = useState<{ ytId: string; name: string } | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-card rounded-t-3xl border-t border-x border-border shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border flex-shrink-0">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{exercise.muscleGroup}</div>
            <h2 className="text-card-foreground truncate">{exercise.name}</h2>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-muted hover:bg-secondary flex items-center justify-center transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-5 pb-8">
          <ExerciseLogger
            exercise={exercise}
            onPlayDemo={() => setDemo({ ytId: exercise.ytId, name: exercise.name })}
            defaultExpanded={true}
          />
        </div>
      </div>

      {demo && <DemoVideoSheet ytId={demo.ytId} exerciseName={demo.name} onClose={() => setDemo(null)} />}
    </div>
  );
}

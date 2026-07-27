import { X } from 'lucide-react';
import { youtubeUrl } from './workoutLibrary';

interface Props {
  ytId: string;
  exerciseName: string;
  onClose: () => void;
}

export function DemoVideoSheet({ ytId, exerciseName, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <div className="text-xs text-muted-foreground">Demo</div>
            <h3 className="text-card-foreground">{exerciseName}</h3>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-muted hover:bg-secondary flex items-center justify-center transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        <div className="aspect-video bg-black">
          <iframe
            src={youtubeUrl(ytId)}
            title={exerciseName}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
        </div>
      </div>
    </div>
  );
}

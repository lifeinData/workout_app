import { X, Sparkles } from 'lucide-react';
import { useState } from 'react';

interface InterventionModalProps {
  onClose: () => void;
}

export function InterventionModal({ onClose }: InterventionModalProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);

  const reasons = [
    'Ran out of time',
    'Forgot my gear',
    'Not feeling well',
    'Change of plans',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-card rounded-t-3xl border-t border-x border-border shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="absolute top-3 right-3">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-muted hover:bg-secondary flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-7 pb-9">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-card-foreground">Let's adjust.</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            Looks like the gym didn't happen today. What got in the way?
          </p>

          <div className="space-y-2 mb-7">
            {reasons.map((reason) => (
              <button
                key={reason}
                onClick={() => setSelectedReason(reason)}
                className={`w-full p-4 rounded-2xl text-left transition-all border-2 ${
                  selectedReason === reason
                    ? 'bg-secondary border-primary'
                    : 'bg-muted/50 border-transparent hover:border-border'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-card-foreground">{reason}</span>
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      selectedReason === reason
                        ? 'bg-primary border-primary'
                        : 'border-border'
                    }`}
                  >
                    {selectedReason === reason && (
                      <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <button
            onClick={onClose}
            disabled={!selectedReason}
            className="w-full bg-primary rounded-2xl p-4 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            Submit
          </button>

          <p className="text-center text-sm text-muted-foreground mt-4">
            Your coach will adjust your plan accordingly
          </p>
        </div>
      </div>
    </div>
  );
}

export function AdherenceRing() {
  const nutritionProgress = 85;
  const trainingProgress = 100;
  const stepsProgress = 60;

  const circumference = 2 * Math.PI * 45;

  const dash = (p: number) => `${(p / 100) * circumference} ${circumference}`;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30">
      <div className="relative w-24 h-24 rounded-full bg-card border border-border shadow-lg shadow-primary/10">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="var(--muted)" strokeWidth="7" />
          <circle
            cx="50" cy="50" r="45" fill="none"
            stroke="var(--chart-1)" strokeWidth="7"
            strokeDasharray={dash(nutritionProgress)}
            strokeLinecap="round"
          />
          <circle
            cx="50" cy="50" r="45" fill="none"
            stroke="var(--chart-2)" strokeWidth="7"
            strokeDasharray={dash(trainingProgress)}
            strokeDashoffset={-circumference * 0.33}
            strokeLinecap="round"
          />
          <circle
            cx="50" cy="50" r="45" fill="none"
            stroke="var(--chart-4)" strokeWidth="7"
            strokeDasharray={dash(stepsProgress)}
            strokeDashoffset={-circumference * 0.66}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-card-foreground text-xl tabular-nums">82</div>
          <div className="text-[10px] text-muted-foreground">Score</div>
        </div>
      </div>
    </div>
  );
}

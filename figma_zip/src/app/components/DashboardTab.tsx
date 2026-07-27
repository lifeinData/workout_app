import { Flame, Droplets, Zap, Heart, TrendingUp, Footprints, Dumbbell } from 'lucide-react';

interface DashboardTabProps {
  onOpenModal: () => void;
}

export function DashboardTab({ onOpenModal }: DashboardTabProps) {
  const macros = [
    { label: 'Protein',  value: 145,  target: 180,  unit: 'g', color: 'var(--chart-1)', icon: Droplets },
    { label: 'Carbs',    value: 220,  target: 250,  unit: 'g', color: 'var(--chart-2)', icon: Zap },
    { label: 'Fats',     value: 55,   target: 65,   unit: 'g', color: 'var(--chart-3)', icon: Heart },
    { label: 'Calories', value: 2100, target: 2400, unit: '',  color: 'var(--chart-4)', icon: Flame },
  ];

  return (
    <div className="p-5 max-w-md mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground">Hello, Jordan</h1>
          <p className="text-sm text-muted-foreground">Wednesday, June 3</p>
        </div>
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground">
          JD
        </div>
      </div>

      <div className="bg-card rounded-3xl p-5 border border-border shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-card-foreground">Today's Targets</h2>
          <TrendingUp className="w-5 h-5 text-primary" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {macros.map((macro) => {
            const Icon = macro.icon;
            const percentage = Math.min(100, (macro.value / macro.target) * 100);
            const c = 2 * Math.PI * 32;

            return (
              <div key={macro.label} className="flex flex-col items-center bg-muted/50 rounded-2xl p-3">
                <div className="relative w-20 h-20 mb-2">
                  <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="32" fill="none" stroke="var(--background)" strokeWidth="6" />
                    <circle
                      cx="40" cy="40" r="32" fill="none"
                      stroke={macro.color} strokeWidth="6"
                      strokeDasharray={`${(percentage / 100) * c} ${c}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Icon className="w-5 h-5" style={{ color: macro.color }} />
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-card-foreground tabular-nums">{macro.value}{macro.unit}</div>
                  <div className="text-xs text-muted-foreground">{macro.label}</div>
                  <div className="text-[10px] text-muted-foreground">of {macro.target}{macro.unit}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onOpenModal}
          className="bg-card rounded-3xl p-5 border border-border text-left hover:border-primary/40 transition-colors shadow-sm"
        >
          <div className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center mb-3">
            <Dumbbell className="w-5 h-5 text-primary" />
          </div>
          <h3 className="text-card-foreground mb-1">Next Workout</h3>
          <p className="text-xs text-muted-foreground">Upper Body Power</p>
          <div className="flex items-center gap-2 text-xs text-primary mt-3">
            <span>5:30 PM</span>
            <span className="text-muted-foreground">•</span>
            <span>60 min</span>
          </div>
        </button>

        <div className="bg-card rounded-3xl p-5 border border-border shadow-sm">
          <div className="w-10 h-10 rounded-2xl bg-accent flex items-center justify-center mb-3">
            <Footprints className="w-5 h-5" style={{ color: 'var(--chart-4)' }} />
          </div>
          <h3 className="text-card-foreground mb-1">Daily Steps</h3>
          <p className="text-xs text-muted-foreground">6,420 / 10,000</p>
          <div className="w-full bg-muted rounded-full h-2 mt-3">
            <div className="h-2 rounded-full" style={{ width: '64%', background: 'var(--chart-4)' }} />
          </div>
        </div>
      </div>

      <div className="bg-card rounded-3xl p-5 border border-border shadow-sm">
        <h3 className="text-card-foreground mb-4">Week at a Glance</h3>
        <div className="flex justify-between items-end h-24">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => {
            const heights = [80, 90, 75, 100, 85, 60, 40];
            const isToday = i === 2;
            return (
              <div key={i} className="flex flex-col items-center gap-2 flex-1">
                <div className="w-full flex items-end justify-center h-20">
                  <div
                    className="w-6 rounded-t-lg transition-all"
                    style={{
                      height: `${heights[i]}%`,
                      background: isToday ? 'var(--primary)' : 'var(--accent)',
                    }}
                  />
                </div>
                <span className={`text-xs ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                  {day}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

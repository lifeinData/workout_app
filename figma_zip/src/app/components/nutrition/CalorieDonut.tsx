interface Props {
  protein: number;  // grams
  carbs: number;    // grams
  fat: number;      // grams
  target: number;   // kcal target
  size?: number;
  thickness?: number;
  showLegend?: boolean;
}

export function CalorieDonut({ protein, carbs, fat, target, size = 168, thickness = 16, showLegend = true }: Props) {
  const kcalP = protein * 4;
  const kcalC = carbs * 4;
  const kcalF = fat * 9;
  const consumed = kcalP + kcalC + kcalF;
  const totalForArc = Math.max(consumed, target);

  const r = (size / 2) - thickness / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const c = 2 * Math.PI * r;

  const segs = [
    { value: kcalP, color: 'var(--chart-1)' },
    { value: kcalC, color: 'var(--chart-2)' },
    { value: kcalF, color: 'var(--chart-3)' },
  ];

  let offset = 0;

  const remaining = Math.max(0, target - consumed);
  const pctOfTarget = target ? Math.round((consumed / target) * 100) : 0;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--muted)" strokeWidth={thickness} />
          {segs.map((s, i) => {
            const len = totalForArc ? (s.value / totalForArc) * c : 0;
            const dashOffset = -offset;
            offset += len;
            return (
              <circle
                key={i} cx={cx} cy={cy} r={r}
                fill="none" stroke={s.color} strokeWidth={thickness}
                strokeDasharray={`${len} ${c}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="butt"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-card-foreground tabular-nums" style={{ fontSize: size * 0.18 }}>
            {Math.round(consumed)}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">kcal eaten</div>
          <div className="text-xs text-muted-foreground mt-1 tabular-nums">
            {remaining > 0 ? `${Math.round(remaining)} left` : `${Math.round(consumed - target)} over`}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">{pctOfTarget}% of {target}</div>
        </div>
      </div>

      {showLegend && consumed > 0 && (
        <div className="flex items-center gap-4 mt-3 text-xs">
          <LegendDot color="var(--chart-1)" label="Protein" pct={Math.round((kcalP / consumed) * 100)} />
          <LegendDot color="var(--chart-2)" label="Carbs"   pct={Math.round((kcalC / consumed) * 100)} />
          <LegendDot color="var(--chart-3)" label="Fat"     pct={Math.round((kcalF / consumed) * 100)} />
        </div>
      )}
    </div>
  );
}

function LegendDot({ color, label, pct }: { color: string; label: string; pct: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
      <span className="text-card-foreground tabular-nums">{pct}%</span>
    </div>
  );
}

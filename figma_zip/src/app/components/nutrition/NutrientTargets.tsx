import { Nutrients, TARGETS, LIMIT_NUTRIENTS } from './foodDatabase';

interface Row {
  key: keyof Nutrients;
  label: string;
  unit: string;
  precision?: number;
}

interface Section {
  title: string;
  rows: Row[];
}

const SECTIONS: Section[] = [
  { title: 'General', rows: [
    { key: 'calories', label: 'Energy',  unit: 'kcal' },
    { key: 'fiber',    label: 'Fiber',   unit: 'g', precision: 1 },
  ]},
  { title: 'Carbohydrates', rows: [
    { key: 'carbs', label: 'Total Carbs', unit: 'g', precision: 1 },
    { key: 'sugar', label: 'Sugars',      unit: 'g', precision: 1 },
  ]},
  { title: 'Lipids', rows: [
    { key: 'fat',          label: 'Total Fat',     unit: 'g',  precision: 1 },
    { key: 'saturatedFat', label: 'Saturated Fat', unit: 'g',  precision: 1 },
    { key: 'cholesterol',  label: 'Cholesterol',   unit: 'mg' },
  ]},
  { title: 'Protein', rows: [
    { key: 'protein', label: 'Protein', unit: 'g', precision: 1 },
  ]},
  { title: 'Vitamins', rows: [
    { key: 'vitaminA', label: 'Vitamin A', unit: 'µg' },
    { key: 'vitaminC', label: 'Vitamin C', unit: 'mg', precision: 1 },
    { key: 'vitaminD', label: 'Vitamin D', unit: 'IU' },
  ]},
  { title: 'Minerals', rows: [
    { key: 'calcium',   label: 'Calcium',   unit: 'mg' },
    { key: 'iron',      label: 'Iron',      unit: 'mg', precision: 1 },
    { key: 'magnesium', label: 'Magnesium', unit: 'mg' },
    { key: 'zinc',      label: 'Zinc',      unit: 'mg', precision: 1 },
    { key: 'sodium',    label: 'Sodium',    unit: 'mg' },
    { key: 'potassium', label: 'Potassium', unit: 'mg' },
  ]},
];

export function NutrientTargets({ totals }: { totals: Nutrients }) {
  return (
    <div className="space-y-5">
      {SECTIONS.map(section => (
        <div key={section.title}>
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{section.title}</h4>
          <div className="space-y-2">
            {section.rows.map(row => (
              <NutrientRow
                key={row.key}
                row={row}
                value={totals[row.key]}
                target={TARGETS[row.key]}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function NutrientRow({ row, value, target }: { row: Row; value: number; target: number }) {
  const isLimit = LIMIT_NUTRIENTS.has(row.key);
  const pct = target ? (value / target) * 100 : 0;
  const clamped = Math.min(110, pct);

  let color: string;
  if (isLimit) {
    color = pct > 100 ? 'var(--destructive)' : pct > 85 ? 'var(--chart-3)' : 'var(--chart-4)';
  } else {
    color = pct >= 90 ? 'var(--chart-4)' : pct >= 50 ? 'var(--chart-2)' : 'var(--chart-3)';
  }

  const fmt = (v: number) => row.precision != null ? v.toFixed(row.precision) : Math.round(v).toString();

  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="text-card-foreground">{row.label}</span>
        <span className="text-muted-foreground tabular-nums">
          <span className="text-card-foreground">{fmt(value)}</span>
          <span className="mx-1">/</span>
          {fmt(target)} {row.unit}
          <span className="ml-2 text-[10px]" style={{ color }}>{Math.round(pct)}%</span>
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden relative">
        <div className="h-full rounded-full transition-all" style={{ width: `${clamped}%`, background: color }} />
        {/* target marker */}
        <div className="absolute top-0 bottom-0 w-px bg-card-foreground/30" style={{ left: '100%' }} />
      </div>
    </div>
  );
}

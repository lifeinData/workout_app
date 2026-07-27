import { View, Text } from 'react-native';
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
    <View className="gap-5">
      {SECTIONS.map(section => (
        <View key={section.title}>
          <Text className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{section.title}</Text>
          <View className="gap-2">
            {section.rows.map(row => (
              <NutrientRow
                key={row.key}
                row={row}
                value={totals[row.key]}
                target={TARGETS[row.key]}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function NutrientRow({ row, value, target }: { row: Row; value: number; target: number }) {
  const isLimit = LIMIT_NUTRIENTS.has(row.key);
  const pct = target ? (value / target) * 100 : 0;
  const clamped = Math.min(110, pct);

  let color: string;
  if (isLimit) {
    color = pct > 100 ? '#d96a5a' : pct > 85 ? '#c9a86f' : '#9bb88a';
  } else {
    color = pct >= 90 ? '#9bb88a' : pct >= 50 ? '#f0a868' : '#c9a86f';
  }

  const fmt = (v: number) => row.precision != null ? v.toFixed(row.precision) : Math.round(v).toString();

  return (
    <View>
      <View className="flex-row justify-between mb-1" style={{ alignItems: 'baseline' }}>
        <Text className="text-xs text-card-foreground">{row.label}</Text>
        <View className="flex-row" style={{ alignItems: 'baseline' }}>
          <Text className="text-xs text-muted-foreground">
            <Text className="text-card-foreground">{fmt(value)}</Text>
            <Text className="mx-1">/</Text>
            {fmt(target)} {row.unit}
          </Text>
          <Text className="ml-2 text-[10px]" style={{ color }}>{Math.round(pct)}%</Text>
        </View>
      </View>
      <View className="h-1.5 bg-muted rounded-full overflow-hidden relative">
        <View className="h-full rounded-full" style={{ width: `${clamped}%`, backgroundColor: color }} />
        <View className="absolute top-0 bottom-0 w-px bg-card-foreground/30" style={{ left: '100%' }} />
      </View>
    </View>
  );
}

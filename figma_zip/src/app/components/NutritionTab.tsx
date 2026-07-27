import { useMemo, useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, Sparkles, Trash2 } from 'lucide-react';
import {
  FOODS, INITIAL_DIARY, TARGETS,
  DiaryEntry, Nutrients,
  scale, sumNutrients, emptyNutrients,
} from './nutrition/foodDatabase';
import { AddFoodModal } from './nutrition/AddFoodModal';
import { CalorieDonut } from './nutrition/CalorieDonut';
import { NutrientTargets } from './nutrition/NutrientTargets';

type Meal = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks';
const MEALS: Meal[] = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

const foodMap = new Map(FOODS.map(f => [f.id, f]));

export function NutritionTab() {
  const [diary, setDiary] = useState<DiaryEntry[]>(INITIAL_DIARY);
  const [addingTo, setAddingTo] = useState<Meal | null>(null);

  const totals = useMemo<Nutrients>(() => {
    return sumNutrients(diary.map(e => {
      const f = foodMap.get(e.foodId);
      return f ? scale(f.per100g, e.grams) : emptyNutrients();
    }));
  }, [diary]);

  const mealTotals = useMemo(() => {
    const map: Record<Meal, Nutrients> = {
      Breakfast: emptyNutrients(), Lunch: emptyNutrients(),
      Dinner: emptyNutrients(), Snacks: emptyNutrients(),
    };
    diary.forEach(e => {
      const f = foodMap.get(e.foodId);
      if (!f) return;
      const n = scale(f.per100g, e.grams);
      map[e.meal] = sumNutrients([map[e.meal], n]);
    });
    return map;
  }, [diary]);

  const addEntry = (foodId: string, grams: number) => {
    if (!addingTo) return;
    setDiary(d => [...d, { id: `d${Date.now()}`, foodId, meal: addingTo, grams }]);
  };

  const removeEntry = (id: string) => setDiary(d => d.filter(e => e.id !== id));

  return (
    <div className="p-5 max-w-md mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground">Nutrition</h1>
          <p className="text-sm text-muted-foreground">Wednesday, June 3</p>
        </div>
        <div className="flex items-center gap-1">
          <button className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center">
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <button className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center">
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Calorie source donut */}
      <div className="bg-card rounded-3xl p-5 border border-border shadow-sm">
        <CalorieDonut
          protein={totals.protein}
          carbs={totals.carbs}
          fat={totals.fat}
          target={TARGETS.calories}
        />
      </div>

      {/* Meal sections */}
      {MEALS.map(meal => {
        const entries = diary.filter(e => e.meal === meal);
        const mt = mealTotals[meal];
        return (
          <div key={meal} className="bg-card rounded-3xl border border-border overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <MealMiniDonut protein={mt.protein} carbs={mt.carbs} fat={mt.fat} />
                <div>
                  <h3 className="text-card-foreground">{meal}</h3>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {Math.round(mt.calories)} kcal · P {mt.protein.toFixed(0)} · C {mt.carbs.toFixed(0)} · F {mt.fat.toFixed(0)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAddingTo(meal)}
                className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md shadow-primary/30 hover:scale-105 transition-transform"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {entries.length > 0 && (
              <div className="border-t border-border divide-y divide-border">
                {entries.map(e => {
                  const f = foodMap.get(e.foodId);
                  if (!f) return null;
                  const nv = scale(f.per100g, e.grams);
                  return (
                    <div key={e.id} className="px-5 py-3 flex items-center gap-3 group">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-card-foreground truncate">{f.name}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {e.grams}g · P {nv.protein.toFixed(1)} · C {nv.carbs.toFixed(1)} · F {nv.fat.toFixed(1)}
                        </div>
                      </div>
                      <div className="text-sm text-card-foreground tabular-nums">{Math.round(nv.calories)}</div>
                      <button
                        onClick={() => removeEntry(e.id)}
                        className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Nutrient Targets — Cronometer-style */}
      <div className="bg-card rounded-3xl p-5 border border-border shadow-sm">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-card-foreground">Nutrient Targets</h3>
          <span className="text-xs text-muted-foreground">today</span>
        </div>
        <NutrientTargets totals={totals} />
      </div>

      {/* Coach insight */}
      <div className="bg-gradient-to-br from-accent to-secondary rounded-3xl p-5 border border-border shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-card flex items-center justify-center flex-shrink-0 shadow-sm">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h4 className="text-accent-foreground mb-1">Coach's Insight</h4>
            <p className="text-sm text-accent-foreground/80 leading-relaxed">
              Protein's tracking well. Add a serving of leafy greens at dinner to lock in your iron and vitamin C targets.
            </p>
          </div>
        </div>
      </div>

      {addingTo && (
        <AddFoodModal
          meal={addingTo}
          onClose={() => setAddingTo(null)}
          onAdd={addEntry}
        />
      )}
    </div>
  );
}

function MealMiniDonut({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const kp = protein * 4, kc = carbs * 4, kf = fat * 9;
  const total = kp + kc + kf;
  const size = 36, thickness = 5, r = (size / 2) - thickness / 2 - 1;
  const c = 2 * Math.PI * r;
  let off = 0;
  const segs = [
    { v: kp, color: 'var(--chart-1)' },
    { v: kc, color: 'var(--chart-2)' },
    { v: kf, color: 'var(--chart-3)' },
  ];
  return (
    <svg width={size} height={size} className="-rotate-90 flex-shrink-0">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--muted)" strokeWidth={thickness} />
      {total > 0 && segs.map((s, i) => {
        const len = (s.v / total) * c;
        const dashOffset = -off;
        off += len;
        return (
          <circle key={i} cx={size/2} cy={size/2} r={r} fill="none"
            stroke={s.color} strokeWidth={thickness}
            strokeDasharray={`${len} ${c}`} strokeDashoffset={dashOffset} />
        );
      })}
    </svg>
  );
}

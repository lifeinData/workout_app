import { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Plus, ChevronLeft, ChevronRight, Sparkles, Trash2 } from 'lucide-react-native';
import {
  FOODS, INITIAL_DIARY, TARGETS,
  DiaryEntry, Nutrients,
  scale, sumNutrients, emptyNutrients,
} from '../../data/foodDatabase';
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
    <View className="p-5 gap-4">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-foreground text-2xl font-bold">Nutrition</Text>
          <Text className="text-sm text-muted-foreground">Wednesday, June 3</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Pressable className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center">
            <ChevronLeft size={16} color="#8b7268" />
          </Pressable>
          <Pressable className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center">
            <ChevronRight size={16} color="#8b7268" />
          </Pressable>
        </View>
      </View>

      <View className="bg-card rounded-3xl p-5 border border-border">
        <CalorieDonut
          protein={totals.protein}
          carbs={totals.carbs}
          fat={totals.fat}
          target={TARGETS.calories}
        />
      </View>

      {MEALS.map(meal => {
        const entries = diary.filter(e => e.meal === meal);
        const mt = mealTotals[meal];
        return (
          <View key={meal} className="bg-card rounded-3xl border border-border overflow-hidden">
            <View className="flex-row items-center justify-between px-5 py-4">
              <View className="flex-row items-center gap-3">
                <MealMiniDonut protein={mt.protein} carbs={mt.carbs} fat={mt.fat} />
                <View>
                  <Text className="text-card-foreground font-semibold">{meal}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {Math.round(mt.calories)} kcal · P {mt.protein.toFixed(0)} · C {mt.carbs.toFixed(0)} · F {mt.fat.toFixed(0)}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => setAddingTo(meal)}
                className="w-9 h-9 rounded-full bg-primary flex items-center justify-center"
              >
                <Plus size={20} color="#ffffff" />
              </Pressable>
            </View>

            {entries.length > 0 && (
              <View>
                {entries.map((e, idx) => {
                  const f = foodMap.get(e.foodId);
                  if (!f) return null;
                  const nv = scale(f.per100g, e.grams);
                  return (
                    <View
                      key={e.id}
                      className="px-5 py-3 flex-row items-center gap-3"
                      style={idx > 0 ? { borderTopWidth: 1, borderTopColor: '#f0d9ce' } : undefined}
                    >
                      <View className="flex-1 flex-shrink">
                        <Text className="text-sm text-card-foreground" numberOfLines={1}>{f.name}</Text>
                        <Text className="text-xs text-muted-foreground">
                          {e.grams}g · P {nv.protein.toFixed(1)} · C {nv.carbs.toFixed(1)} · F {nv.fat.toFixed(1)}
                        </Text>
                      </View>
                      <Text className="text-sm text-card-foreground">{Math.round(nv.calories)}</Text>
                      <Pressable
                        onPress={() => removeEntry(e.id)}
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                      >
                        <Trash2 size={14} color="#8b7268" />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}

      <View className="bg-card rounded-3xl p-5 border border-border">
        <View className="flex-row justify-between mb-4" style={{ alignItems: 'baseline' }}>
          <Text className="text-card-foreground font-semibold text-lg">Nutrient Targets</Text>
          <Text className="text-xs text-muted-foreground">today</Text>
        </View>
        <NutrientTargets totals={totals} />
      </View>

      <View className="rounded-3xl p-5 border border-border" style={{ backgroundColor: '#ffd5b8' }}>
        <View className="flex-row items-start gap-3">
          <View className="w-10 h-10 rounded-2xl bg-card flex items-center justify-center flex-shrink-0">
            <Sparkles size={20} color="#e87d6f" />
          </View>
          <View className="flex-1">
            <Text className="text-lg font-semibold mb-1" style={{ color: '#5a3326' }}>{"Coach's Insight"}</Text>
            <Text className="text-sm leading-5" style={{ color: 'rgba(90, 51, 38, 0.8)' }}>
              {"Protein's tracking well. Add a serving of leafy greens at dinner to lock in your iron and vitamin C targets."}
            </Text>
          </View>
        </View>
      </View>

      {addingTo && (
        <AddFoodModal
          meal={addingTo}
          onClose={() => setAddingTo(null)}
          onAdd={addEntry}
        />
      )}
    </View>
  );
}

function MealMiniDonut({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const kp = protein * 4, kc = carbs * 4, kf = fat * 9;
  const total = kp + kc + kf;
  const size = 36, thickness = 5, r = (size / 2) - thickness / 2 - 1;
  const c = 2 * Math.PI * r;
  let off = 0;
  const segs = [
    { v: kp, color: '#e87d6f' },
    { v: kc, color: '#f0a868' },
    { v: kf, color: '#c9a86f' },
  ];
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: [{ rotate: '-90deg' }] }} className="flex-shrink-0">
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#faeadd" strokeWidth={thickness} />
      {total > 0 && segs.map((s, i) => {
        const len = (s.v / total) * c;
        const dashOffset = -off;
        off += len;
        return (
          <Circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={s.color} strokeWidth={thickness}
            strokeDasharray={`${len} ${c}`} strokeDashoffset={dashOffset} />
        );
      })}
    </Svg>
  );
}

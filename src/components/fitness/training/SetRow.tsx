import { View, Text, Pressable, TextInput } from 'react-native';
import { Check, Flame, X } from 'lucide-react-native';
import { useState } from 'react';
import type { HistoricalSetResponse, SetKind } from '@/lib/api';
import type { WeightUnit } from '@/lib/units';
import { fmtWeight, fromKg } from '@/lib/units';

interface LoggedRowProps {
  set: HistoricalSetResponse;
  displayIndex: number;
  weightUnit: WeightUnit;
  onUpdate: (weight: number, reps: number) => void;
  onDelete: () => void;
}

/** A committed set. Editing either field commits on blur, only when
 * the value actually changed — avoids a PATCH firing on every tap
 * that merely focuses and re-blurs the field without editing it. */
export function LoggedSetRow({ set, displayIndex, weightUnit, onUpdate, onDelete }: LoggedRowProps) {
  const displayWeight = fmtWeight(set.weight_kg, weightUnit);
  const [weight, setWeight] = useState(displayWeight);
  const [reps, setReps] = useState(String(set.reps));

  const commitIfChanged = () => {
    const w = Number(weight);
    const r = Number(reps);
    if (!(w > 0) || !(r > 0)) {
      setWeight(displayWeight);
      setReps(String(set.reps));
      return;
    }
    if (w !== Number(displayWeight) || r !== set.reps) {
      onUpdate(w, r);
    }
  };

  // Optimistic placeholder rows (negative id) aren't confirmed by the
  // server yet — editing/deleting one is a no-op until it resolves.
  const isOptimistic = set.id < 0;

  return (
    <View className="flex-row items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/50">
      <View className="flex-row items-center gap-1" style={{ width: 32 }}>
        <Text className="text-sm text-primary">{displayIndex}</Text>
        {set.kind === 'warmup' && <Flame size={12} color="#f0a868" />}
      </View>
      <TextInput
        keyboardType="decimal-pad"
        value={weight}
        onChangeText={setWeight}
        onEndEditing={commitIfChanged}
        editable={!isOptimistic}
        className="flex-1 text-sm text-card-foreground"
      />
      <TextInput
        keyboardType="number-pad"
        value={reps}
        onChangeText={setReps}
        onEndEditing={commitIfChanged}
        editable={!isOptimistic}
        className="flex-1 text-sm text-card-foreground"
      />
      {set.was_pr && <Text className="text-[10px] text-primary font-semibold">PR</Text>}
      <Pressable
        onPress={onDelete}
        disabled={isOptimistic}
        className="w-7 h-7 rounded-full items-center justify-center"
        style={isOptimistic ? { opacity: 0.3 } : undefined}
      >
        <X size={14} color="#8b7268" />
      </Pressable>
    </View>
  );
}

interface PlaceholderRowProps {
  displayIndex: number;
  lastTime?: HistoricalSetResponse;
  weightUnit: WeightUnit;
  kind: SetKind;
  onCommit: (weight: number, reps: number) => void;
  disabled?: boolean;
}

/** A prescribed-but-not-yet-logged row, prefilled from the same slot
 * in the previous session. Tapping the checkmark logs it. */
export function PlaceholderSetRow({
  displayIndex,
  lastTime,
  weightUnit,
  kind,
  onCommit,
  disabled,
}: PlaceholderRowProps) {
  const suggestedWeight = lastTime ? fmtWeight(lastTime.weight_kg, weightUnit) : '';
  const suggestedReps = lastTime ? String(lastTime.reps) : '';
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');

  const effectiveWeight = weight !== '' ? weight : suggestedWeight;
  const effectiveReps = reps !== '' ? reps : suggestedReps;
  const canCommit = Number(effectiveWeight) > 0 && Number(effectiveReps) > 0 && !disabled;

  const commit = () => {
    if (!canCommit) return;
    onCommit(Number(effectiveWeight), Number(effectiveReps));
    setWeight('');
    setReps('');
  };

  return (
    <View className="flex-row items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-border">
      <View className="flex-row items-center gap-1" style={{ width: 32 }}>
        <Text className="text-sm text-muted-foreground">{displayIndex}</Text>
        {kind === 'warmup' && <Flame size={12} color="#f0a868" />}
      </View>
      <TextInput
        keyboardType="decimal-pad"
        value={weight}
        onChangeText={setWeight}
        placeholder={suggestedWeight || '0'}
        placeholderTextColor="#8b7268"
        className="flex-1 text-sm text-card-foreground"
      />
      <TextInput
        keyboardType="number-pad"
        value={reps}
        onChangeText={setReps}
        placeholder={suggestedReps || '0'}
        placeholderTextColor="#8b7268"
        className="flex-1 text-sm text-card-foreground"
      />
      <Pressable
        onPress={commit}
        disabled={!canCommit}
        className="w-7 h-7 rounded-full items-center justify-center bg-primary"
        style={!canCommit ? { opacity: 0.35 } : undefined}
      >
        <Check size={14} color="#ffffff" />
      </Pressable>
    </View>
  );
}

/** Small "Last: 185 x 8" hint, used above a fresh exercise block. */
export function lastTimeLabel(sets: HistoricalSetResponse[], weightUnit: WeightUnit): string | null {
  const working = sets.filter((s) => s.kind === 'working');
  if (working.length === 0) return null;
  return working
    .map((s) => `${fmtWeight(s.weight_kg, weightUnit)}×${s.reps}`)
    .join(', ');
}

// Re-exported so callers that already have a `WeightUnit` + kg value
// (outside a set, e.g. a target-range label) can format consistently.
export { fromKg };

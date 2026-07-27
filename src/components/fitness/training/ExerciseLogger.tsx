import { View, Text, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Play, Plus, Trophy, Check, X } from 'lucide-react-native';
import { useState, useEffect } from 'react';
import Toast from 'react-native-toast-message';
import { useDeleteSet, useHistory, useLogSet, usePRs } from '@/lib/queries';
import { fmtTimeLocal, utcDateKey } from '@/lib/dates';
import type { ExerciseResponse, HistoricalSetResponse } from '@/lib/api';

interface Props {
  exercise: ExerciseResponse;
  onPlayDemo: () => void;
  defaultExpanded?: boolean;
  // When the parent already fetched today's history (e.g. TodayView
  // with N exercises on the screen), pass the per-exercise sets in
  // here to avoid N+1 React Query subscriptions. When omitted, this
  // component falls back to its own `useHistory(today, today)` call —
  // used by HistoryView's selected-day detail and WorkoutDetail.
  todaysSets?: HistoricalSetResponse[];
}

export function ExerciseLogger({ exercise, onPlayDemo, todaysSets: providedSets }: Props) {
  // Server stores history rows in UTC-day buckets, so the request
  // MUST pass UTC dates to be consistent with the server's row keys.
  const today = utcDateKey(new Date());
  // Only call useHistory if the parent didn't pre-fetch.
  const { data: history } = useHistory(
    providedSets ? undefined : today,
    providedSets ? undefined : today,
  );
  const { data: prs } = usePRs();
  const logSet = useLogSet();
  const deleteSet = useDeleteSet();

  const todaysSets: HistoricalSetResponse[] =
    providedSets ?? history?.history?.[today]?.[exercise.id] ?? [];
  const pr = prs?.find((p) => p.exercise_id === exercise.id) ?? null;

  const lastWeight = todaysSets[todaysSets.length - 1]?.weight ?? pr?.weight ?? 0;
  const [weight, setWeight] = useState<string>('');
  const [reps, setReps] = useState<string>('');

  useEffect(() => {
    if (todaysSets.length > 0 && weight === '') setWeight(String(lastWeight));
  }, [todaysSets.length, lastWeight, weight]);

  const canSave = Number(weight) > 0 && Number(reps) > 0 && !logSet.isPending;

  const onAdd = () => {
    if (!canSave) return;
    const w = Number(weight);
    const r = Number(reps);
    logSet.mutate(
      { exercise_id: exercise.id, weight: w, reps: r },
      {
        onSuccess: (data) => {
          if (data.is_pr) {
            Toast.show({
              type: 'success',
              text1: `New PR — ${exercise.name}`,
              text2: `${w} × ${r}`,
            });
          } else {
            Toast.show({
              type: 'success',
              text1: `Set ${todaysSets.length + 1} logged`,
              text2: `${w} lb × ${r} reps`,
            });
          }
          setReps('');
        },
        onError: (err) => {
          Toast.show({
            type: 'error',
            text1: 'Could not save set',
            text2: err.message,
          });
        },
      }
    );
  };

  const onDelete = (setId: number, weight: number, reps: number) => {
    if (setId < 0) return; // optimistic placeholder, server response is about to replace it
    deleteSet.mutate(setId, {
      onSuccess: () =>
        Toast.show({
          type: 'success',
          text1: 'Set removed',
          text2: `${weight} × ${reps}`,
        }),
      onError: (err) =>
        Toast.show({
          type: 'error',
          text1: 'Could not delete set',
          text2: err.message,
        }),
    });
  };

  return (
    <View className="space-y-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[10px] uppercase tracking-0.14em text-muted-foreground">
            {exercise.muscle_group}
          </Text>
          <View className="flex-row items-center gap-1.5">
            <Text className="text-base font-semibold text-card-foreground tracking-tight">
              {exercise.name}
            </Text>
            {pr && exercise.pr_trackable && <Trophy size={14} color="#e87d6f" />}
          </View>
          <Text className="text-xs text-muted-foreground mt-0.5">
            Target {exercise.default_sets} × {exercise.default_reps_label}
            {pr && (
              <Text>{' · '}<Text className="text-primary">PR {pr.weight}×{pr.reps}</Text></Text>
            )}
          </Text>
        </View>
        <Pressable
          onPress={onPlayDemo}
          className="w-9 h-9 rounded-full bg-muted items-center justify-center"
        >
          <Play size={14} color="#e87d6f" fill="#e87d6f" />
        </Pressable>
      </View>

      <View className="space-y-1.5">
        <View className="flex-row items-center justify-between px-1">
          <Text className="text-[10px] uppercase tracking-0.14em text-muted-foreground">
            Today
          </Text>
          <Text className="text-[10px] uppercase tracking-0.14em text-muted-foreground">
            {todaysSets.length} {todaysSets.length === 1 ? 'set' : 'sets'}
          </Text>
        </View>

        {todaysSets.length === 0 ? (
          <View className="rounded-xl border border-dashed border-border px-4 py-5 items-center">
            <Text className="text-xs text-muted-foreground text-center">
              No sets logged yet. Enter weight + reps below.
            </Text>
          </View>
        ) : (
          <View className="space-y-1">
            {todaysSets.map((s, i) => (
              <View
                key={s.id}
                className="flex-row items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/50"
              >
                <Text className="text-sm text-primary" style={{ width: 28 }}>{i + 1}</Text>
                <Text className="text-sm text-card-foreground flex-1">
                  {s.weight} <Text className="text-xs text-muted-foreground">lb</Text>
                </Text>
                <Text className="text-sm text-card-foreground flex-1">
                  {s.reps} <Text className="text-xs text-muted-foreground">reps</Text>
                </Text>
                <Text className="text-[10px] text-muted-foreground">
                  {fmtTimeLocal(s.timestamp)}
                </Text>
                <Pressable
                  onPress={() => onDelete(s.id, s.weight, s.reps)}
                  className="w-7 h-7 rounded-full items-center justify-center"
                >
                  <X size={14} color="#8b7268" />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>

      <View className="rounded-2xl border border-border bg-card p-3 space-y-2">
        <View className="flex-row gap-2">
          <View className="flex-1 space-y-1">
            <Text className="text-[10px] uppercase tracking-0.14em text-muted-foreground px-1">Weight (lb)</Text>
            <TextInput
              keyboardType="decimal-pad"
              value={weight}
              onChangeText={setWeight}
              placeholder={String(pr?.weight ?? 0)}
              placeholderTextColor="#8b7268"
              className="w-full px-3 py-2.5 rounded-xl bg-input-background border border-border text-center text-card-foreground"
            />
          </View>
          <View className="flex-1 space-y-1">
            <Text className="text-[10px] uppercase tracking-0.14em text-muted-foreground px-1">Reps</Text>
            <TextInput
              keyboardType="number-pad"
              value={reps}
              onChangeText={setReps}
              placeholder="0"
              placeholderTextColor="#8b7268"
              className="w-full px-3 py-2.5 rounded-xl bg-input-background border border-border text-center text-card-foreground"
            />
          </View>
        </View>
        <Pressable
          onPress={onAdd}
          disabled={!canSave}
          style={{
            width: "100%",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: canSave ? 'var(--primary)' : 'var(--muted)',
            opacity: canSave ? 1 : 0.6,
          }}
        >
          {logSet.isPending ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : canSave ? (
            <Plus size={16} color="#ffffff" strokeWidth={3} />
          ) : (
            <Check size={16} color="#8b7268" />
          )}
          <Text className={canSave ? 'text-primary-foreground font-semibold' : 'text-muted-foreground'}>
            {logSet.isPending
              ? 'Saving…'
              : canSave
              ? `Add set ${todaysSets.length + 1}`
              : 'Enter weight & reps'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

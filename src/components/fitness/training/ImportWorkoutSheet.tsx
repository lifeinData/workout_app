import { View, Text, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { Dumbbell } from 'lucide-react-native';
import { api } from '@/lib/api';
import type { ExerciseResponse, SessionDetailResponse, SessionSummaryResponse } from '@/lib/api';
import { useMyWorkouts, usePreferences } from '@/lib/queries';
import { fmtWeight } from '@/lib/units';
import { Sheet } from '@/components/ui/Sheet';
import { colors, tabular } from '@/lib/theme';

export interface ImportPlanItem {
  exercise: ExerciseResponse;
  rows: number;
}

/** Pure helper — turns a session's blocks into an import plan: one entry
 * per exercise, `rows` = the number of *working* sets logged against it
 * (warmups excluded — AGENTS.md gotcha #2), floored at 1 so an exercise
 * never imports with zero rows. Order follows the source's `order_index`.
 * Exported so C4's "Repeat" action reuses this exact logic instead of a
 * second implementation drifting out of sync. */
export function buildImportPlan(detail: SessionDetailResponse): ImportPlanItem[] {
  return [...detail.blocks]
    .sort((a, b) => a.order_index - b.order_index)
    .map((block) => {
      const workingCount = block.sets.filter((s) => s.kind === 'working').length;
      return { exercise: block.exercise, rows: Math.max(1, workingCount) };
    });
}

interface ImportWorkoutSheetProps {
  onClose: () => void;
  onImport: (plan: ImportPlanItem[]) => void;
  /** Don't offer the session the user is currently inside (e.g. re-opened
   * for editing) as an import source for itself. */
  excludeSessionId?: string;
}

/** Bottom-sheet modal listing the user's past (completed) workouts —
 * "repeat a previous workout" as a fresh session. Shell is the shared
 * `Sheet` primitive (DESIGN.md §3.6); fixed `heightPercent={85}` (not
 * `maxHeight` — see session 2's shrink bug), `FlatList` with `flex-1`. */
export function ImportWorkoutSheet({ onClose, onImport, excludeSessionId }: ImportWorkoutSheetProps) {
  const { data: sessions, isLoading } = useMyWorkouts();
  const { data: prefs } = usePreferences();
  const weightUnit = prefs?.weight_unit ?? 'lb';
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const list = (sessions ?? []).filter((s) => s.id !== excludeSessionId);

  const handlePick = async (session: SessionSummaryResponse) => {
    if (loadingId) return;
    setLoadingId(session.id);
    try {
      const detail = await api.getSession(session.id);
      const plan = buildImportPlan(detail);
      onImport(plan);
      onClose();
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <Sheet visible onClose={onClose} title="Import a previous workout" heightPercent={85}>
      <FlatList
        data={list}
        keyExtractor={(s) => s.id}
        className="flex-1"
        renderItem={({ item: s }) => (
          <Pressable
            onPress={() => handlePick(s)}
            disabled={loadingId !== null}
            accessibilityRole="button"
            accessibilityLabel={`Import ${s.name}`}
            className="flex-row items-center justify-between px-3 py-3 rounded-xl active:bg-muted"
            style={loadingId && loadingId !== s.id ? { opacity: 0.5 } : undefined}
          >
            <View className="flex-1 flex-row items-center gap-3">
              <View className="w-9 h-9 rounded-full bg-muted items-center justify-center">
                <Dumbbell size={14} color={colors.primary} />
              </View>
              <View className="flex-1">
                <Text className="text-body text-card-foreground" maxFontSizeMultiplier={1.3}>
                  {s.name}
                </Text>
                <Text
                  className="text-caption text-muted-foreground mt-0.5"
                  maxFontSizeMultiplier={1.3}
                  style={tabular}
                >
                  {s.local_date} · {s.exercise_count} exercise{s.exercise_count === 1 ? '' : 's'} ·{' '}
                  {s.total_sets} sets
                  {s.total_volume_kg > 0 ? ` · ${fmtWeight(s.total_volume_kg, weightUnit)} ${weightUnit}` : ''}
                </Text>
              </View>
            </View>
            {loadingId === s.id ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text className="text-caption text-muted-foreground" maxFontSizeMultiplier={1.3}>
                Import
              </Text>
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          <View className="py-10 items-center px-5">
            <Text className="text-body text-muted-foreground" maxFontSizeMultiplier={1.3}>
              {isLoading ? 'Loading…' : 'No previous workouts yet.'}
            </Text>
          </View>
        }
      />
    </Sheet>
  );
}

import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Check, Users } from 'lucide-react-native';
import Toast from '@/components/ui/Toast';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { CoachAvatar } from '@/components/fitness/coach/CoachAvatar';
import { colors, radius, space, tabular, type } from '@/lib/theme';
import { useAssignments, useCoachAthletes, useSetAssignments } from '@/lib/queries';
import type { AthleteRow } from '@/lib/api';

export interface SendWorkoutSheetProps {
  visible: boolean;
  onClose: () => void;
  workout: { id: string; name: string };
}

const ROW_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 };
const TEXT_HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function athleteName(row: AthleteRow): string {
  return row.user.display_name?.trim() || row.user.username;
}

/* ------------------------------------------------------------------ *
 * Row                                                                 *
 * ------------------------------------------------------------------ */

interface AthleteToggleRowProps {
  row: AthleteRow;
  checked: boolean;
  alreadySent: boolean;
  onToggle: () => void;
}

/**
 * One athlete with a round check. The whole row is the target (≥60dp).
 * Static style array + local pressed state — never the function form,
 * which NativeWind drops on device.
 */
function AthleteToggleRow({ row, checked, alreadySent, onToggle }: AthleteToggleRowProps) {
  const [pressed, setPressed] = useState(false);
  const name = athleteName(row);
  const meta = alreadySent
    ? 'Already has this workout'
    : `${plural(row.assigned_workout_count, 'workout')} sent`;

  return (
    <Pressable
      onPress={onToggle}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hitSlop={ROW_HIT_SLOP}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={name}
      accessibilityHint={meta}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          minHeight: 60,
          paddingHorizontal: space.md,
          paddingVertical: space.sm,
          borderRadius: radius.md,
          backgroundColor: checked ? colors.muted : 'transparent',
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <CoachAvatar initials={row.user.initials} name={name} size={44} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ ...type.body, color: colors.foreground }}>
          {name}
        </Text>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          style={{ ...type.caption, ...tabular, color: colors.mutedForeground }}
        >
          {meta}
        </Text>
      </View>
      {/* Fixed 24dp slot in both states so the row never reflows on toggle. */}
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: radius.full,
          borderWidth: 1.5,
          borderColor: checked ? colors.primary : colors.border,
          backgroundColor: checked ? colors.primary : colors.card,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <Check size={14} strokeWidth={3} color={colors.primaryForeground} /> : null}
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * Sheet                                                               *
 * ------------------------------------------------------------------ */

/**
 * D9 — pick which of your accepted athletes get this workout. Replace
 * semantics (`PUT /coach/workouts/{id}/assignments`): the checked set IS the
 * assignment list, pre-checked from the server, so unchecking unsends.
 */
export function SendWorkoutSheet({ visible, onClose, workout }: SendWorkoutSheetProps) {
  const { height: windowHeight } = useWindowDimensions();
  const athletesQuery = useCoachAthletes();
  const assignmentsQuery = useAssignments(workout.id);
  const setAssignments = useSetAssignments();

  const athletes = useMemo(() => athletesQuery.data?.athletes ?? [], [athletesQuery.data]);
  const athleteIds = useMemo(() => new Set(athletes.map((a) => a.user.id)), [athletes]);

  /** Server truth, limited to current accepted athletes. */
  const initial = useMemo(
    () => new Set((assignmentsQuery.data?.athlete_ids ?? []).filter((id) => athleteIds.has(id))),
    [assignmentsQuery.data, athleteIds]
  );

  // Local edits, scoped to the workout they were made for. `null` → show the
  // server's set; this avoids a seed-from-server effect and resets cleanly
  // on close or when the sheet is reused for another workout.
  const [edits, setEdits] = useState<{ workoutId: string; ids: Set<string> } | null>(null);
  const selected = edits && edits.workoutId === workout.id ? edits.ids : initial;

  const added = [...selected].filter((id) => !initial.has(id));
  const removed = [...initial].filter((id) => !selected.has(id));
  const dirty = added.length > 0 || removed.length > 0;
  const allSelected = athletes.length > 0 && selected.size === athletes.length;

  const handleClose = () => {
    setEdits(null);
    onClose();
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setEdits({ workoutId: workout.id, ids: next });
  };

  const toggleAll = () => {
    setEdits({
      workoutId: workout.id,
      ids: allSelected ? new Set() : new Set(athletes.map((a) => a.user.id)),
    });
  };

  const handleSubmit = () => {
    if (!dirty) return;
    const ids = [...selected];
    setAssignments.mutate(
      { workoutId: workout.id, athleteIds: ids },
      {
        onSuccess: () => {
          if (removed.length > 0) {
            Toast.show({
              type: 'success',
              text1: 'Updated',
              text2:
                ids.length > 0
                  ? `${workout.name} is now with ${plural(ids.length, 'athlete')}`
                  : `${workout.name} was unsent from everyone`,
            });
          } else {
            Toast.show({ type: 'success', text1: `Sent to ${plural(ids.length, 'athlete')}`, text2: workout.name });
          }
          handleClose();
        },
        onError: (err) => {
          Toast.show({ type: 'error', text1: 'Could not send workout', text2: err.message });
        },
      }
    );
  };

  let submitLabel: string;
  if (!dirty) {
    submitLabel = initial.size > 0 ? `Sent to ${plural(initial.size, 'athlete')}` : 'Select athletes';
  } else if (added.length === 0) {
    submitLabel = `Unsend from ${plural(removed.length, 'athlete')}`;
  } else {
    submitLabel = `Send to ${plural(selected.size, 'athlete')}`;
  }

  const isLoading = athletesQuery.isLoading || (athletes.length > 0 && assignmentsQuery.isLoading);
  const loadError = athletesQuery.isError || assignmentsQuery.isError;

  let content: ReactNode;
  if (isLoading) {
    content = (
      <View style={{ paddingVertical: space.xxxl, alignItems: 'center' }}>
        <ActivityIndicator color={colors.mutedForeground} />
      </View>
    );
  } else if (loadError) {
    content = (
      <View style={{ paddingVertical: space.xxl, alignItems: 'center', gap: space.md }}>
        <Text maxFontSizeMultiplier={1.3} style={{ ...type.body, color: colors.foreground, textAlign: 'center' }}>
          Couldn&apos;t load your athletes.
        </Text>
        <Button
          label="Try again"
          variant="ghost"
          size="sm"
          onPress={() => {
            void athletesQuery.refetch();
            void assignmentsQuery.refetch();
          }}
        />
      </View>
    );
  } else if (athletes.length === 0) {
    content = (
      <View
        style={{
          alignItems: 'center',
          gap: space.md,
          paddingVertical: space.xxl,
          paddingHorizontal: space.xl,
          borderRadius: radius.lg,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: colors.border,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.full,
            backgroundColor: colors.muted,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Users size={20} color={colors.mutedForeground} />
        </View>
        <Text maxFontSizeMultiplier={1.3} style={{ ...type.body, color: colors.foreground, textAlign: 'center' }}>
          No athletes yet
        </Text>
        <Text
          maxFontSizeMultiplier={1.3}
          style={{ ...type.label, color: colors.mutedForeground, textAlign: 'center' }}
        >
          When someone requests you as their coach, they&apos;ll show up under Athletes.
        </Text>
      </View>
    );
  } else {
    content = (
      <>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: space.sm,
          }}
        >
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ ...type.caption, ...tabular, color: colors.mutedForeground }}
          >
            {selected.size} of {athletes.length} selected
          </Text>
          {athletes.length > 1 ? (
            <Pressable
              onPress={toggleAll}
              hitSlop={TEXT_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={allSelected ? 'Clear selection' : 'Select all athletes'}
            >
              <Text
                maxFontSizeMultiplier={1.3}
                style={{ ...type.label, fontWeight: '600', color: colors.foreground }}
              >
                {allSelected ? 'Clear' : 'Select all'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          style={{ maxHeight: Math.round(windowHeight * 0.5) }}
          contentContainerStyle={{ gap: space.xs }}
          showsVerticalScrollIndicator={false}
        >
          {athletes.map((row) => (
            <AthleteToggleRow
              key={row.user.id}
              row={row}
              checked={selected.has(row.user.id)}
              alreadySent={initial.has(row.user.id)}
              onToggle={() => toggle(row.user.id)}
            />
          ))}
        </ScrollView>

        <Button
          label={submitLabel}
          onPress={handleSubmit}
          disabled={!dirty}
          loading={setAssignments.isPending}
          style={{ marginTop: space.xl }}
        />
      </>
    );
  }

  return (
    <Sheet visible={visible} onClose={handleClose} title={`Send “${workout.name}”`}>
      {content}
    </Sheet>
  );
}

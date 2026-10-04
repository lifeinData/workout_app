import { useState, type JSX } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Dumbbell, Plus, Send, Trash2 } from "lucide-react-native";
import Toast from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { SendWorkoutSheet } from "@/components/fitness/coach/SendWorkoutSheet";
import { WorkoutEditorModal } from "@/components/fitness/coach/WorkoutEditorModal";
import { useCoachDeleteWorkout } from "@/lib/queries";
import { coachName } from "@/lib/coach";
import { EQUIPMENT_CHIPS } from "@/lib/equipment";
import { colors, radius, space, tabular, type } from "@/lib/theme";
import type { WorkoutSummaryResponse } from "@/lib/api";

/* ------------------------------------------------------------------ *
 * Coach → Workouts segment                                           *
 *                                                                    *
 * The shared coach library (P1: any coach can edit/delete/send any   *
 * workout; "Added by" is attribution only). One coral CTA at the top *
 * ("New workout"), then one Card per workout with a horizontal,      *
 * static action row — Send · Edit · trash. Pic1's stacked/invisible  *
 * controls came from function-form Pressable styles; every pressable *
 * here is a ui/ primitive or a static style array.                   *
 * ------------------------------------------------------------------ */

type EditorState = { mode: "create" } | { mode: "edit"; id: string } | null;

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function equipmentLabel(id: string): string {
  const known = EQUIPMENT_CHIPS.find((c) => c.id === id);
  if (known) return known.label;
  return id.length > 0 ? id[0].toUpperCase() + id.slice(1) : id;
}

export interface CoachWorkoutsPanelProps {
  workouts: WorkoutSummaryResponse[] | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
}

export function CoachWorkoutsPanel({
  workouts,
  isLoading,
  error,
  onRetry,
}: CoachWorkoutsPanelProps): JSX.Element {
  const [editor, setEditor] = useState<EditorState>(null);
  // Kept separately from `sendOpen` so the sheet still has a workout to
  // render while its slide-out animation runs after close.
  const [sendTarget, setSendTarget] = useState<{ id: string; name: string } | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const deleteMutation = useCoachDeleteWorkout();

  const handleDelete = (w: WorkoutSummaryResponse) => {
    Alert.alert(
      "Delete this workout?",
      `"${w.name}" will be removed from the library and from every athlete it was sent to. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteMutation.mutate(w.id, {
              onSuccess: () =>
                Toast.show({ type: "success", text1: "Workout deleted", text2: w.name }),
              onError: (err) =>
                Toast.show({
                  type: "error",
                  text1: "Could not delete workout",
                  text2: err.message,
                }),
            });
          },
        },
      ],
    );
  };

  const openSend = (w: WorkoutSummaryResponse) => {
    setSendTarget({ id: w.id, name: w.name });
    setSendOpen(true);
  };

  const count = workouts?.length ?? 0;

  return (
    <View style={styles.root}>
      <Button
        label="New workout"
        leftIcon={<Plus size={18} color={colors.primaryForeground} strokeWidth={2.5} />}
        onPress={() => setEditor({ mode: "create" })}
      />

      {isLoading ? (
        <View style={styles.statusRow}>
          <ActivityIndicator color={colors.mutedForeground} />
          <Text maxFontSizeMultiplier={1.3} style={styles.statusText}>
            Loading the library…
          </Text>
        </View>
      ) : error ? (
        <Card style={styles.errorCard}>
          <Text maxFontSizeMultiplier={1.3} style={styles.errorTitle}>
            Couldn&rsquo;t load workouts
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.errorBody}>
            {error.message}. Check that the server is reachable, then try again.
          </Text>
          <Button label="Retry" variant="ghost" size="sm" onPress={onRetry} style={styles.selfStart} />
        </Card>
      ) : count === 0 ? (
        <View style={styles.empty}>
          <Dumbbell size={24} color={colors.mutedForeground} />
          <Text maxFontSizeMultiplier={1.3} style={styles.emptyTitle}>
            Your library is empty
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.emptyBody}>
            Build a workout with &ldquo;New workout&rdquo;, then send it to your athletes.
          </Text>
        </View>
      ) : (
        <>
          <Text maxFontSizeMultiplier={1.3} style={styles.libraryMeta}>
            Shared library · {plural(count, "workout")}
          </Text>
          <View style={styles.list}>
            {(workouts ?? []).map((w) => (
              <WorkoutCard
                key={w.id}
                workout={w}
                deleting={deleteMutation.isPending && deleteMutation.variables === w.id}
                onEdit={() => setEditor({ mode: "edit", id: w.id })}
                onSend={() => openSend(w)}
                onDelete={() => handleDelete(w)}
              />
            ))}
          </View>
        </>
      )}

      <WorkoutEditorModal
        visible={editor !== null}
        mode={editor?.mode ?? "create"}
        workoutId={editor?.mode === "edit" ? editor.id : null}
        onClose={() => setEditor(null)}
      />
      {sendTarget ? (
        <SendWorkoutSheet
          visible={sendOpen}
          onClose={() => setSendOpen(false)}
          workout={sendTarget}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Workout card                                                       *
 * ------------------------------------------------------------------ */

function WorkoutCard({
  workout,
  deleting,
  onEdit,
  onSend,
  onDelete,
}: {
  workout: WorkoutSummaryResponse;
  deleting: boolean;
  onEdit: () => void;
  onSend: () => void;
  onDelete: () => void;
}): JSX.Element {
  const [pressed, setPressed] = useState(false);
  const meta =
    workout.duration_min != null
      ? `${plural(workout.exercise_count, "exercise")} · ${workout.duration_min} min`
      : plural(workout.exercise_count, "exercise");

  return (
    <Card padded={false} style={deleting ? styles.dimmed : undefined}>
      {/* The body is the tap target for Edit; the action row sits outside
       * it so its buttons never fight the card's press. */}
      <Pressable
        onPress={onEdit}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        disabled={deleting}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${workout.name}`}
        style={[styles.cardBody, pressed ? styles.cardBodyPressed : null]}
      >
        <Text maxFontSizeMultiplier={1.3} numberOfLines={2} style={styles.cardTitle}>
          {workout.name}
        </Text>
        <Text maxFontSizeMultiplier={1.3} style={styles.cardMeta}>
          {meta}
        </Text>
        {workout.created_by ? (
          <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.cardByline}>
            Added by Coach {coachName(workout.created_by)}
          </Text>
        ) : null}
        {workout.equipment.length > 0 ? (
          <View style={styles.pills}>
            {workout.equipment.map((eq) => (
              <View key={eq} style={styles.pill}>
                <Text maxFontSizeMultiplier={1.3} style={styles.pillText}>
                  {equipmentLabel(eq)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Pressable>

      <View style={styles.actions}>
        <Button
          label="Send"
          size="sm"
          leftIcon={<Send size={14} color={colors.primaryForeground} strokeWidth={2.25} />}
          onPress={onSend}
          disabled={deleting}
        />
        <Button label="Edit" variant="ghost" size="sm" onPress={onEdit} disabled={deleting} />
        <View style={styles.flex} />
        {deleting ? (
          <View style={styles.trashSlot}>
            <ActivityIndicator size="small" color={colors.destructive} />
          </View>
        ) : (
          <IconButton
            size={44}
            accessibilityLabel={`Delete ${workout.name}`}
            onPress={onDelete}
          >
            <Trash2 size={18} color={colors.destructive} />
          </IconButton>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.lg },
  flex: { flex: 1 },
  selfStart: { alignSelf: "flex-start" },
  dimmed: { opacity: 0.5 },
  list: { gap: space.md },
  libraryMeta: { ...type.caption, ...tabular, color: colors.mutedForeground, marginBottom: -space.xs },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.xl,
    justifyContent: "center",
  },
  statusText: { ...type.label, color: colors.mutedForeground },
  errorCard: { gap: space.sm },
  errorTitle: { ...type.heading, color: colors.foreground },
  errorBody: { ...type.label, color: colors.mutedForeground },
  empty: {
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.xxxl,
    paddingHorizontal: space.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
  },
  emptyTitle: { ...type.heading, color: colors.foreground },
  emptyBody: { ...type.label, color: colors.mutedForeground, textAlign: "center" },
  cardBody: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
    gap: space.xs,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  cardBodyPressed: { opacity: 0.85 },
  cardTitle: { ...type.heading, color: colors.foreground },
  cardMeta: { ...type.caption, ...tabular, color: colors.mutedForeground },
  cardByline: { ...type.caption, color: colors.mutedForeground },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.sm },
  pill: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
  },
  pillText: { ...type.caption, color: colors.mutedForeground },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  trashSlot: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});

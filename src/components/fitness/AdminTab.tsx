import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Plus, Trash2 } from "lucide-react-native";
import Toast from "react-native-toast-message";
import {
  useAdminDeleteWorkout,
  useAdminWorkouts,
} from "@/lib/queries";
import type { WorkoutSummaryResponse } from "@/lib/api";
import { WorkoutEditorModal } from "./admin/WorkoutEditorModal";

/* ------------------------------------------------------------------ *
 * Top-level admin tab                                                *
 *                                                                    *
 * Renders the workout list + a header with the "Create workout"     *
 * affordance. The full editor lives in WorkoutEditorModal, opened   *
 * when the user taps a card or the create button. Delete is handled *
 * inline via Alert.alert + useAdminDeleteWorkout.                    *
 * ------------------------------------------------------------------ */

export function AdminTab() {
  const {
    data: workouts,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useAdminWorkouts({ limit: 500 });

  const [editor, setEditor] = useState<
    { mode: "create" } | { mode: "edit"; id: string } | null
  >(null);

  const deleteMutation = useAdminDeleteWorkout();

  const handleDelete = (w: WorkoutSummaryResponse) => {
    Alert.alert(
      "Delete this workout?",
      `"${w.name}" will be removed permanently. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteMutation.mutate(w.id, {
              onSuccess: () =>
                Toast.show({
                  type: "success",
                  text1: "Workout deleted",
                  text2: w.name,
                }),
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

  const count = workouts?.length ?? 0;

  return (
    <View className="flex-1 p-5 bg-background gap-3">
      <View className="flex-row items-center justify-between mb-1 gap-3">
        <View className="flex-1">
          <Text className="text-[11px] text-muted-foreground uppercase tracking-[1.5px] font-semibold">
            Admin
          </Text>
          <Text className="text-2xl font-bold text-foreground mt-0.5">
            {count} workout{count === 1 ? "" : "s"}
          </Text>
        </View>
        <Pressable
          onPress={() => setEditor({ mode: "create" })}
          style={({ pressed }) => [styles.createBtn, pressed && styles.pressed]}
          accessibilityLabel="Create a new workout"
        >
          <Plus size={16} color="#ffffff" strokeWidth={3} />
          <Text className="text-sm font-semibold text-white">Create workout</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View className="flex-row items-center gap-3 p-4 bg-card rounded-2xl border border-border">
          <ActivityIndicator color="#e87d6f" />
          <Text className="text-sm text-muted-foreground">Loading workouts…</Text>
        </View>
      ) : error ? (
        <View className="bg-[#fde4dc] rounded-2xl p-4 border border-primary gap-2">
          <Text className="text-sm text-[#a23a2a]">
            Could not load workouts: {error.message}
          </Text>
          <Pressable
            onPress={() => {
              void refetch();
            }}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
          >
            <Text className="text-xs font-semibold text-[#a23a2a]">Try again</Text>
          </Pressable>
        </View>
      ) : workouts && workouts.length > 0 ? (
        workouts.map((w) => (
          <WorkoutRow
            key={w.id}
            workout={w}
            onEdit={() => setEditor({ mode: "edit", id: w.id })}
            onDelete={() => handleDelete(w)}
            pending={
              deleteMutation.isPending && deleteMutation.variables === w.id
            }
          />
        ))
      ) : (
        <View className="bg-muted/50 rounded-2xl p-8 items-center border border-dashed border-border gap-1.5">
          <Text className="text-sm font-semibold text-foreground">No workouts yet</Text>
          <Text className="text-xs text-muted-foreground text-center">
            Tap &ldquo;Create workout&rdquo; above to seed the catalog.
          </Text>
        </View>
      )}

      {isRefetching && !isLoading ? (
        <View className="flex-row items-center gap-1.5 self-center px-3 py-1.5 bg-muted/60 rounded-full">
          <ActivityIndicator size="small" color="#8b7268" />
          <Text className="text-[11px] text-muted-foreground">Refreshing…</Text>
        </View>
      ) : null}

      <WorkoutEditorModal
        visible={editor !== null}
        mode={editor?.mode ?? "create"}
        workoutId={editor?.mode === "edit" ? editor.id : null}
        onClose={() => setEditor(null)}
      />
    </View>
  );
}

export default AdminTab;

/* ------------------------------------------------------------------ *
 * Workout row                                                        *
 * ------------------------------------------------------------------ */

function WorkoutRow({
  workout,
  onEdit,
  onDelete,
  pending,
}: {
  workout: WorkoutSummaryResponse;
  onEdit: () => void;
  onDelete: () => void;
  pending: boolean;
}) {
  return (
    <View className="bg-card rounded-3xl p-4 border border-border gap-2">
      <View className="flex-row items-center gap-2 flex-wrap">
        <View className="px-2 py-0.5 rounded-full bg-secondary">
          <Text className="text-[11px] text-[#6b3a30] font-semibold">{workout.tag}</Text>
        </View>
        <Text className="text-[11px] text-muted-foreground">
          {workout.location === "either" ? "home or gym" : workout.location} · {workout.exercise_count} ex · {workout.duration_min} min
        </Text>
      </View>
      <Text className="text-base font-semibold text-foreground">{workout.name}</Text>
      {workout.equipment.length > 0 ? (
        <View className="flex-row flex-wrap gap-1.5">
          {workout.equipment.map((eq) => (
            <View key={eq} className="px-2 py-0.5 rounded-full bg-muted">
              <Text className="text-[10px] text-muted-foreground capitalize">{eq}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View className="flex-row gap-2 mt-1.5">
        <Pressable
          onPress={onEdit}
          style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}
        >
          <Text className="text-[13px] text-foreground font-semibold">Edit</Text>
        </Pressable>
        <Pressable
          onPress={onDelete}
          disabled={pending}
          style={({ pressed }) => [
            styles.deleteBtn,
            pressed && styles.pressed,
            pending && styles.disabled,
          ]}
        >
          {pending ? (
            <ActivityIndicator size="small" color="#a23a2a" />
          ) : (
            <Trash2 size={14} color="#a23a2a" />
          )}
          <Text className="text-[13px] text-[#a23a2a] font-semibold">
            {pending ? "Deleting…" : "Delete"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#e87d6f",
    borderRadius: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  retryBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#ffffff",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e87d6f",
  },
  editBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#faeadd",
    alignItems: "center",
  },
  deleteBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#fde4dc",
  },
});

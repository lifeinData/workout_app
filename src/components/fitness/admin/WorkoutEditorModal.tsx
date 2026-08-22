import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ArrowDown,
  ArrowUp,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react-native";
import Toast from "react-native-toast-message";
import {
  useAdminAddExercise,
  useAdminCreateWorkout,
  useAdminReorderExercises,
  useAdminRemoveExercise,
  useAdminUpdatePrescription,
  useAdminUpdateWorkout,
  useWorkout,
} from "@/lib/queries";
import type {
  ExerciseResponse,
  WorkoutCreate,
  WorkoutExerciseResponse,
  WorkoutUpdate,
} from "@/lib/api";
import { ExercisePickerModal } from "./ExercisePickerModal";

/* ------------------------------------------------------------------ *
 * Constants                                                          *
 * ------------------------------------------------------------------ */

const LOCATIONS: readonly ("home" | "gym" | "either")[] = [
  "home",
  "gym",
  "either",
];

const EQUIPMENT_OPTIONS: readonly string[] = [
  "barbell",
  "dumbbells",
  "bodyweight",
  "cable",
  "machine",
  "kettlebell",
  "band",
];

/** Slug shape enforced by the backend's `WorkoutCreate.id` field. */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const isValidId = (id: string): boolean => ID_PATTERN.test(id);

const arraysEqual = (
  a: readonly string[],
  b: readonly string[],
): boolean => {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  for (let i = 0; i < sa.length; i += 1) {
    if (sa[i] !== sb[i]) return false;
  }
  return true;
};

/* ------------------------------------------------------------------ *
 * Editor modal                                                       *
 * ------------------------------------------------------------------ */

export interface WorkoutEditorModalProps {
  visible: boolean;
  mode: "create" | "edit";
  workoutId: string | null;
  onClose: () => void;
}

export function WorkoutEditorModal({
  visible,
  mode,
  workoutId,
  onClose,
}: WorkoutEditorModalProps) {
  const isEdit = mode === "edit" && workoutId !== null;

  const { data: detail, isLoading: detailLoading } = useWorkout(
    isEdit ? (workoutId as string) : "",
  );

  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [id, setId] = useState("");
  const [location, setLocation] = useState<"home" | "gym" | "either">("home");
  const [equipment, setEquipment] = useState<string[]>([]);
  const [durationText, setDurationText] = useState("30");
  /* Track which detail.id we've already hydrated from. Using a
   * setState-during-render pattern (instead of useEffect) avoids the
   * cascading-render warning while still letting the form populate
   * asynchronously once the detail query resolves. */
  const [hydratedFromId, setHydratedFromId] = useState<string | null>(
    isEdit ? null : "new",
  );

  if (isEdit && detail && detail.id !== hydratedFromId) {
    setName(detail.name);
    setTag(detail.tag);
    setId(detail.id);
    /* detail.location is `string` in the response type, but the
     * server's Pydantic pattern restricts it to home|gym|either —
     * so the cast is safe. */
    setLocation(detail.location as "home" | "gym" | "either");
    setEquipment(detail.equipment);
    setDurationText(String(detail.duration_min));
    setHydratedFromId(detail.id);
  }

  const [draftExercises, setDraftExercises] = useState<ExerciseResponse[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const createMutation = useAdminCreateWorkout();
  const updateMutation = useAdminUpdateWorkout();
  const addMutation = useAdminAddExercise();
  const removeMutation = useAdminRemoveExercise();
  const reorderMutation = useAdminReorderExercises();

  const trimmedName = name.trim();
  const trimmedTag = tag.trim();
  const duration = Number(durationText);
  const idError = id.length > 0 && !isValidId(id);
  const nameError = trimmedName.length === 0;
  const tagError = trimmedTag.length === 0;
  const durationError = !Number.isFinite(duration) || duration < 1;

  const metaDirty = useMemo(() => {
    if (!isEdit || !detail) {
      return (
        trimmedName.length > 0 ||
        trimmedTag.length > 0 ||
        id.length > 0 ||
        location !== "home" ||
        equipment.length > 0 ||
        (Number.isFinite(duration) && duration !== 30)
      );
    }
    return (
      trimmedName !== detail.name ||
      trimmedTag !== detail.tag ||
      (id.length > 0 && id !== detail.id) ||
      location !== detail.location ||
      !arraysEqual(equipment, detail.equipment) ||
      duration !== detail.duration_min
    );
  }, [
    isEdit,
    detail,
    trimmedName,
    trimmedTag,
    id,
    location,
    equipment,
    duration,
  ]);

  const saveDisabled =
    nameError ||
    tagError ||
    durationError ||
    idError ||
    createMutation.isPending ||
    updateMutation.isPending;

  const closeIfIdle = () => {
    if (createMutation.isPending || updateMutation.isPending) return;
    onClose();
  };

  const handleSave = () => {
    if (saveDisabled) return;

    if (!isEdit) {
      const body: WorkoutCreate = {
        name: trimmedName,
        tag: trimmedTag,
        location,
        equipment,
        duration_min: duration,
        exercise_ids: draftExercises.map((e) => e.id),
      };
      if (id.length > 0) body.id = id;

      createMutation.mutate(
        { body },
        {
          onSuccess: (created) => {
            Toast.show({
              type: "success",
              text1: "Workout created",
              text2: created.name,
            });
            onClose();
          },
          onError: (err) =>
            Toast.show({
              type: "error",
              text1: "Could not create workout",
              text2: err.message,
            }),
        },
      );
      return;
    }

    if (!detail) return;
    const body: WorkoutUpdate = {};
    if (trimmedName !== detail.name) body.name = trimmedName;
    if (trimmedTag !== detail.tag) body.tag = trimmedTag;
    if (location !== detail.location) body.location = location;
    if (!arraysEqual(equipment, detail.equipment)) body.equipment = equipment;
    if (duration !== detail.duration_min) body.duration_min = duration;

    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }

    updateMutation.mutate(
      { id: detail.id, body },
      {
        onSuccess: (updated) => {
          Toast.show({
            type: "success",
            text1: "Workout updated",
            text2: updated.name,
          });
          onClose();
        },
        onError: (err) =>
          Toast.show({
            type: "error",
            text1: "Could not update workout",
            text2: err.message,
          }),
      },
    );
  };

  const handlePickerSelect = (ex: ExerciseResponse) => {
    if (!isEdit) {
      setDraftExercises((prev) =>
        prev.some((e) => e.id === ex.id)
          ? prev.filter((e) => e.id !== ex.id)
          : [...prev, ex],
      );
      return;
    }
    if (!detail) return;
    if (detail.exercises.some((e) => e.id === ex.id)) {
      Toast.show({
        type: "error",
        text1: "Already in this workout",
        text2: "Use the remove button in the list to take it out.",
      });
      return;
    }
    addMutation.mutate(
      { workoutId: detail.id, body: { exercise_id: ex.id } },
      {
        onSuccess: (updated) => {
          Toast.show({
            type: "success",
            text1: "Exercise added",
            text2:
              updated.exercises.find((e) => e.id === ex.id)?.name ?? ex.name,
          });
        },
        onError: (err) =>
          Toast.show({
            type: "error",
            text1: "Could not add exercise",
            text2: err.message,
          }),
      },
    );
  };

  const handleRemoveExercise = (exerciseId: string) => {
    if (!isEdit || !detail) return;
    const ex = detail.exercises.find((e) => e.id === exerciseId);
    Alert.alert(
      "Remove exercise?",
      `"${ex?.name ?? exerciseId}" will be unlinked from this workout.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            removeMutation.mutate(
              { workoutId: detail.id, exerciseId },
              {
                onSuccess: () =>
                  Toast.show({
                    type: "success",
                    text1: "Exercise removed",
                    text2: ex?.name ?? exerciseId,
                  }),
                onError: (err) =>
                  Toast.show({
                    type: "error",
                    text1: "Could not remove exercise",
                    text2: err.message,
                  }),
              },
            );
          },
        },
      ],
    );
  };

  const handleReorder = (
    list: readonly ExerciseResponse[],
    fromIdx: number,
    direction: "up" | "down",
  ) => {
    const toIdx = direction === "up" ? fromIdx - 1 : fromIdx + 1;
    if (toIdx < 0 || toIdx >= list.length) return;
    const next = list.slice();
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);

    if (!isEdit) {
      setDraftExercises(next);
      return;
    }
    if (!detail) return;
    reorderMutation.mutate(
      {
        workoutId: detail.id,
        body: { exercise_ids: next.map((e) => e.id) },
      },
      {
        onSuccess: () =>
          Toast.show({ type: "success", text1: "Order updated" }),
        onError: (err) =>
          Toast.show({
            type: "error",
            text1: "Could not reorder",
            text2: err.message,
          }),
      },
    );
  };

  const toggleEquipment = (eq: string) =>
    setEquipment((prev) =>
      prev.includes(eq) ? prev.filter((e) => e !== eq) : [...prev, eq],
    );

  const currentExercises: readonly ExerciseResponse[] = isEdit
    ? (detail?.exercises ?? [])
    : draftExercises;

  const reorderBusy =
    reorderMutation.isPending ||
    removeMutation.isPending ||
    addMutation.isPending;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={closeIfIdle}
    >
      <View className="flex-1 justify-end bg-foreground/40">
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={closeIfIdle}
          accessibilityLabel="Close editor"
        />
        <View className="bg-background rounded-t-[28px] max-h-[92%] min-h-[60%] overflow-hidden">
          <View className="flex-row items-center justify-between p-5 border-b border-border bg-card gap-3">
            <View className="flex-1">
              <Text className="text-[11px] text-muted-foreground uppercase tracking-[1.5px] font-semibold">
                {isEdit ? "Edit workout" : "New workout"}
              </Text>
              <Text className="text-xl font-bold text-foreground mt-0.5">
                {isEdit ? detail?.name ?? "…" : trimmedName || "Untitled"}
              </Text>
            </View>
            <Pressable
              onPress={closeIfIdle}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              accessibilityLabel="Close"
            >
              <X size={20} color="#8b7268" />
            </Pressable>
          </View>

          {isEdit && detailLoading ? (
            <View className="p-8 items-center gap-3">
              <ActivityIndicator color="#e87d6f" />
              <Text className="text-sm text-muted-foreground">Loading workout…</Text>
            </View>
          ) : (
            <ScrollView
              className="flex-1"
              contentContainerClassName="p-5 pb-10 gap-5"
              keyboardShouldPersistTaps="handled"
            >
              <Field
                label="Name"
                error={nameError ? "Name is required." : undefined}
              >
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Push Day A"
                  placeholderTextColor="#8b7268"
                  style={[styles.input, nameError && styles.inputError]}
                />
              </Field>

              <Field
                label="Tag"
                error={tagError ? "Tag is required." : undefined}
              >
                <TextInput
                  value={tag}
                  onChangeText={setTag}
                  placeholder="strength"
                  placeholderTextColor="#8b7268"
                  autoCapitalize="none"
                  style={[styles.input, tagError && styles.inputError]}
                />
              </Field>

              {!isEdit ? (
                <Field
                  label="ID"
                  hint="Optional — server auto-generates a slug. Use lowercase letters, digits, and dashes."
                  error={
                    idError
                      ? "Must start with a letter or digit; only lowercase letters, digits, and dashes."
                      : undefined
                  }
                >
                  <TextInput
                    value={id}
                    onChangeText={(v) =>
                      setId(v.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                    }
                    placeholder="push-day-a"
                    placeholderTextColor="#8b7268"
                    autoCapitalize="none"
                    style={[styles.input, idError && styles.inputError]}
                  />
                </Field>
              ) : null}

              <Field label="Location">
                <View className="flex-row gap-1.5 p-1 bg-muted rounded-2xl">
                  {LOCATIONS.map((loc) => {
                    const active = location === loc;
                    return (
                      <Pressable
                        key={loc}
                        onPress={() => setLocation(loc)}
                        style={[styles.segBtn, active && styles.segBtnActive]}
                      >
                        <Text
                          style={[
                            styles.segLabel,
                            active && styles.segLabelActive,
                          ]}
                        >
                          {loc}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Field>

              <Field label="Equipment">
                <View className="flex-row flex-wrap gap-2">
                  {EQUIPMENT_OPTIONS.map((eq) => {
                    const active = equipment.includes(eq);
                    return (
                      <Pressable
                        key={eq}
                        onPress={() => toggleEquipment(eq)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text
                          style={[
                            styles.chipLabel,
                            active && styles.chipLabelActive,
                          ]}
                        >
                          {eq}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Field>

              <Field
                label="Duration (min)"
                error={
                  durationError
                    ? "Enter a positive number of minutes."
                    : undefined
                }
              >
                <TextInput
                  value={durationText}
                  onChangeText={setDurationText}
                  placeholder="30"
                  placeholderTextColor="#8b7268"
                  keyboardType="number-pad"
                  style={[styles.input, durationError && styles.inputError]}
                />
              </Field>

              <Field
                label={`Exercises (${currentExercises.length})`}
                hint={
                  isEdit
                    ? "Use the arrows to reorder. Changes save immediately."
                    : "Tap “Add exercise” to pick from the catalog. Reorder before saving."
                }
                error={
                  !isEdit && draftExercises.length === 0
                    ? "At least one exercise is required."
                    : undefined
                }
              >
                <View className="gap-2">
                  {currentExercises.length === 0 ? (
                    <View className="bg-muted/50 rounded-2xl p-4 items-center border border-dashed border-border">
                      <Text className="text-sm text-muted-foreground">
                        {isEdit
                          ? "No exercises linked yet."
                          : "No exercises picked yet."}
                      </Text>
                    </View>
                  ) : (
                    currentExercises.map((ex, idx) => {
                      const isFirst = idx === 0;
                      const isLast = idx === currentExercises.length - 1;
                      return (
                        <View
                          key={ex.id}
                          className="bg-card rounded-2xl p-3 border border-border gap-2"
                        >
                          <View className="flex-row items-center gap-2.5">
                            <View className="w-7 h-7 rounded-full bg-secondary items-center justify-center">
                              <Text className="text-xs text-[#6b3a30] font-bold">
                                {idx + 1}
                              </Text>
                            </View>
                            <View className="flex-1 min-w-0">
                              <Text
                                className="text-sm text-foreground font-semibold"
                                numberOfLines={1}
                              >
                                {ex.name}
                              </Text>
                              <Text
                                className="text-[11px] text-muted-foreground mt-0.5"
                                numberOfLines={1}
                              >
                                {ex.muscle_group}
                              </Text>
                            </View>
                            <View className="flex-row gap-1">
                              <Pressable
                                onPress={() =>
                                  handleReorder(currentExercises, idx, "up")
                                }
                                disabled={isFirst || reorderBusy}
                                style={({ pressed }) => [
                                  styles.smallIconBtn,
                                  (isFirst || reorderBusy) && styles.disabled,
                                  pressed && styles.pressed,
                                ]}
                                accessibilityLabel={`Move ${ex.name} up`}
                              >
                                <ArrowUp size={14} color="#3d2b26" />
                              </Pressable>
                              <Pressable
                                onPress={() =>
                                  handleReorder(currentExercises, idx, "down")
                                }
                                disabled={isLast || reorderBusy}
                                style={({ pressed }) => [
                                  styles.smallIconBtn,
                                  (isLast || reorderBusy) && styles.disabled,
                                  pressed && styles.pressed,
                                ]}
                                accessibilityLabel={`Move ${ex.name} down`}
                              >
                                <ArrowDown size={14} color="#3d2b26" />
                              </Pressable>
                              <Pressable
                                onPress={() => handleRemoveExercise(ex.id)}
                                disabled={reorderBusy}
                                style={({ pressed }) => [
                                  styles.smallIconBtnDanger,
                                  reorderBusy && styles.disabled,
                                  pressed && styles.pressed,
                                ]}
                                accessibilityLabel={`Remove ${ex.name}`}
                              >
                                <Trash2 size={14} color="#a23a2a" />
                              </Pressable>
                            </View>
                          </View>
                          {isEdit && detail ? (
                            <PrescriptionEditor
                              key={`${ex.id}-${(ex as WorkoutExerciseResponse).target_sets}-${(ex as WorkoutExerciseResponse).target_reps_low}-${(ex as WorkoutExerciseResponse).target_reps_high}-${(ex as WorkoutExerciseResponse).target_rest_sec}`}
                              workoutId={detail.id}
                              exercise={ex as WorkoutExerciseResponse}
                            />
                          ) : null}
                        </View>
                      );
                    })
                  )}

                  <Pressable
                    onPress={() => setPickerOpen(true)}
                    style={({ pressed }) => [
                      styles.addExerciseBtn,
                      pressed && styles.addExerciseBtnPressed,
                    ]}
                  >
                    <Plus size={16} color="#e87d6f" strokeWidth={2.5} />
                    <Text className="text-[13px] text-primary font-semibold">
                      Add exercise
                    </Text>
                  </Pressable>
                </View>
              </Field>
            </ScrollView>
          )}

          <View className="flex-row gap-3 p-4 bg-card border-t border-border">
            <Pressable
              onPress={closeIfIdle}
              style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
            >
              <Text className="text-[15px] text-foreground font-semibold">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saveDisabled}
              style={({ pressed }) => [
                styles.saveBtn,
                saveDisabled && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Save size={16} color="#ffffff" />
              )}
              <Text className="text-[15px] text-white font-bold">
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving…"
                  : isEdit
                    ? metaDirty
                      ? "Save changes"
                      : "Done"
                    : "Create workout"}
              </Text>
            </Pressable>
          </View>
        </View>

        <ExercisePickerModal
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          alreadyInWorkout={new Set(currentExercises.map((e) => e.id))}
          onSelect={handlePickerSelect}
        />
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Per-exercise prescription editor (target sets/reps/rest)            *
 * ------------------------------------------------------------------ *
 * Only shown in edit mode — a workout being created has no id yet to
 * PATCH a prescription against, so new links get the schema's
 * defaults (3 sets, 8-12 reps, 90s rest) until the workout is saved
 * and reopened for editing. Each field commits on blur, only when it
 * actually changed, mirroring the pattern in
 * `training/SetRow.tsx::LoggedSetRow`.                                */

function PrescriptionEditor({
  workoutId,
  exercise,
}: {
  workoutId: string;
  exercise: WorkoutExerciseResponse;
}) {
  const update = useAdminUpdatePrescription();

  const [setsText, setSetsText] = useState(String(exercise.target_sets));
  const [lowText, setLowText] = useState(String(exercise.target_reps_low));
  const [highText, setHighText] = useState(
    exercise.target_reps_high != null ? String(exercise.target_reps_high) : "",
  );
  const [restText, setRestText] = useState(String(exercise.target_rest_sec));

  // Re-syncing this local text state when the server value changes
  // underneath us (another admin's edit, or our own mutation
  // resolving) is handled by the caller passing a `key` derived from
  // those same values — React then remounts this component with a
  // fresh initial state instead of needing an effect to reach in and
  // overwrite it.

  const commit = () => {
    const sets = Number(setsText);
    const low = Number(lowText);
    const high = highText.trim() === "" ? null : Number(highText);
    const rest = Number(restText);

    if (!Number.isFinite(sets) || sets < 1) return;
    if (!Number.isFinite(low) || low < 1) return;
    if (!Number.isFinite(rest) || rest < 0) return;
    if (high !== null && (!Number.isFinite(high) || high < low)) {
      Toast.show({
        type: "error",
        text1: "Invalid rep range",
        text2: "Reps high must be greater than or equal to reps low.",
      });
      setHighText(exercise.target_reps_high != null ? String(exercise.target_reps_high) : "");
      return;
    }

    const unchanged =
      sets === exercise.target_sets &&
      low === exercise.target_reps_low &&
      high === exercise.target_reps_high &&
      rest === exercise.target_rest_sec;
    if (unchanged) return;

    update.mutate(
      {
        workoutId,
        exerciseId: exercise.id,
        body: {
          target_sets: sets,
          target_reps_low: low,
          // `undefined` (omitted) means "leave unchanged" server-side —
          // matches the rest of the app's PATCH convention, so an
          // already-null reps_high can't be explicitly re-cleared here.
          target_reps_high: high ?? undefined,
          target_rest_sec: rest,
        },
      },
      {
        onError: (err) =>
          Toast.show({
            type: "error",
            text1: "Could not update prescription",
            text2: err.message,
          }),
      },
    );
  };

  return (
    <View className="flex-row gap-2 pt-1 border-t border-border">
      <PrescriptionInput label="Sets" value={setsText} onChangeText={setSetsText} onEndEditing={commit} />
      <PrescriptionInput label="Reps low" value={lowText} onChangeText={setLowText} onEndEditing={commit} />
      <PrescriptionInput label="Reps high" value={highText} onChangeText={setHighText} onEndEditing={commit} />
      <PrescriptionInput label="Rest (s)" value={restText} onChangeText={setRestText} onEndEditing={commit} />
    </View>
  );
}

function PrescriptionInput({
  label,
  value,
  onChangeText,
  onEndEditing,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  onEndEditing: () => void;
}) {
  return (
    <View className="flex-1 gap-1 mt-2">
      <Text className="text-[9px] uppercase tracking-[1px] text-muted-foreground">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onEndEditing={onEndEditing}
        keyboardType="number-pad"
        style={styles.prescriptionInput}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Form field wrapper                                                  *
 * ------------------------------------------------------------------ */

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-[11px] text-muted-foreground uppercase tracking-[1.2px] font-semibold ml-0.5">
        {label}
      </Text>
      {children}
      {error ? (
        <Text className="text-xs text-[#a23a2a] ml-0.5">{error}</Text>
      ) : hint ? (
        <Text className="text-[11px] text-muted-foreground ml-0.5">{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "#faeadd",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#faeadd",
    alignItems: "center",
  },
  saveBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#e87d6f",
  },
  input: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#f0d9ce",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#3d2b26",
  },
  inputError: { borderColor: "#e87d6f" },
  prescriptionInput: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#f0d9ce",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 13,
    color: "#3d2b26",
    textAlign: "center",
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  segBtnActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  segLabel: {
    fontSize: 13,
    color: "#8b7268",
    fontWeight: "500",
    textTransform: "capitalize",
  },
  segLabelActive: { color: "#3d2b26", fontWeight: "700" },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#f0d9ce",
    backgroundColor: "#ffffff",
  },
  chipActive: { backgroundColor: "#e87d6f", borderColor: "#e87d6f" },
  chipLabel: { fontSize: 12, color: "#8b7268" },
  chipLabelActive: { color: "#ffffff", fontWeight: "600" },
  smallIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#faeadd",
    alignItems: "center",
    justifyContent: "center",
  },
  smallIconBtnDanger: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#fde4dc",
    alignItems: "center",
    justifyContent: "center",
  },
  addExerciseBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#f0d9ce",
  },
  addExerciseBtnPressed: { backgroundColor: "#faeadd" },
});

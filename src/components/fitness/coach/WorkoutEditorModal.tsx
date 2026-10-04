import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowDown, ArrowUp, Check, ChevronLeft, Plus, Trash2 } from 'lucide-react-native';
import Toast from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { ExercisePickerSheet } from '@/components/fitness/training/ExercisePickerSheet';
import {
  useCoachAddExercise,
  useCoachCreateWorkout,
  useCoachRemoveExercise,
  useCoachReorderExercises,
  useCoachUpdatePrescription,
  useCoachUpdateWorkout,
  useCoachWorkout,
  usePreferences,
} from '@/lib/queries';
import type {
  ExerciseResponse,
  PrescriptionPatch,
  WorkoutDetailResponse,
  WorkoutExerciseResponse,
  WorkoutUpdate,
} from '@/lib/api';
import { fromKg, roundToIncrement, type WeightUnit } from '@/lib/units';
import { colors, elevation, radius, space, tabular, type } from '@/lib/theme';

/* ------------------------------------------------------------------ *
 * Coach workout editor (agenda 2026-10-04 · C1, decisions D1–D3, P4)  *
 * ------------------------------------------------------------------ *
 * One full-height sheet, no footer. Every way out — the header back
 * chevron, a backdrop tap, Android back — runs the same `saveAndClose`:
 *
 * - Edit mode: add / remove / reorder persist immediately. Name,
 *   duration and any dirty prescription rows are flushed on dismiss
 *   (an empty name reverts). Prescription rows also commit on blur.
 * - Create mode: everything is a local draft until dismiss. Empty →
 *   close; valid (name + ≥1 exercise) → create + patch non-default
 *   prescriptions; partial → "Discard this workout?".
 *
 * Every Pressable here uses a STATIC style (or the ui/ primitives) —
 * NativeWind drops function-form Pressable styles on device. */

/** Mirrors `backend/app/schemas.py::PrescriptionPatch` + `WorkoutUpdate` bounds. */
const LIMITS = {
  sets: [1, 20],
  reps: [1, 100],
  rest: [0, 1800],
  duration: [1, 600],
} as const;

const PLACEHOLDER_COLOR = 'rgba(139,114,104,0.45)';
const BACKDROP = 'rgba(61,43,38,0.5)';
const FIELD_HEIGHT = 44;

interface RxDraft {
  sets: string;
  reps: string;
  /** In the coach's prefs unit. Empty = no target weight. */
  weight: string;
  rest: string;
}

type RxKey = keyof RxDraft;

const NEW_EXERCISE_RX: RxDraft = { sets: '3', reps: '10', weight: '', rest: '60' };

interface DraftRow {
  exercise: ExerciseResponse;
  rx: RxDraft;
}

/** What a card renders — the same shape in both modes. */
interface CardItem {
  id: string;
  name: string;
  muscleGroup: string;
  rx: RxDraft;
}

/* ------------------------------------------------------------------ *
 * Pure helpers                                                       *
 * ------------------------------------------------------------------ */

const digitsOnly = (v: string): string => v.replace(/[^0-9]/g, '').slice(0, 4);

function decimalOnly(v: string): string {
  const cleaned = v.replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  const frac = rest.join('').slice(0, 2);
  return (rest.length > 0 ? `${whole.slice(0, 4)}.${frac}` : whole.slice(0, 4));
}

function parseIntIn(text: string, [min, max]: readonly [number, number]): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}

const fmtNum = (n: number): string => String(Math.round(n * 100) / 100);

function displayWeight(kg: number | null, unit: WeightUnit): string {
  if (kg === null) return '';
  return fmtNum(roundToIncrement(fromKg(kg, unit), unit));
}

function rxFromServer(ex: WorkoutExerciseResponse, unit: WeightUnit): RxDraft {
  return {
    sets: String(ex.target_sets),
    reps: String(ex.target_reps),
    weight: displayWeight(ex.target_weight_kg, unit),
    rest: String(ex.target_rest_sec),
  };
}

/** The minimal PATCH turning `base` into `draft`, or null if nothing
 * changed. Invalid fields are dropped (the row then reverts to the
 * server value once the draft is cleared). Weight compares in the
 * DISPLAYED unit so lb↔kg rounding never produces a phantom write. */
function rxPatch(
  draft: RxDraft,
  base: WorkoutExerciseResponse,
  unit: WeightUnit,
): PrescriptionPatch | null {
  const patch: PrescriptionPatch = {};
  const sets = parseIntIn(draft.sets, LIMITS.sets);
  if (sets !== null && sets !== base.target_sets) patch.target_sets = sets;
  const reps = parseIntIn(draft.reps, LIMITS.reps);
  if (reps !== null && reps !== base.target_reps) patch.target_reps = reps;
  const rest = parseIntIn(draft.rest, LIMITS.rest);
  if (rest !== null && rest !== base.target_rest_sec) patch.target_rest_sec = rest;

  const w = draft.weight.trim() === '' ? 0 : Number(draft.weight);
  if (Number.isFinite(w)) {
    const baseShown = displayWeight(base.target_weight_kg, unit);
    if (w <= 0) {
      if (base.target_weight_kg !== null) patch.target_weight = null;
    } else if (baseShown === '' || Number(baseShown) !== w) {
      patch.target_weight = w;
      patch.target_weight_unit = unit;
    }
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/** Alert on native; `window.confirm` on web, where `Alert.alert` is a no-op. */
function confirmAsync(title: string, message: string, confirmLabel: string, cancelLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    const c = (globalThis as { confirm?: (m: string) => boolean }).confirm;
    return Promise.resolve(c ? c(`${title}\n\n${message}`) : true);
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : 'Please try again.');

/* ------------------------------------------------------------------ *
 * Public component                                                   *
 * ------------------------------------------------------------------ */

export interface WorkoutEditorModalProps {
  visible: boolean;
  mode: 'create' | 'edit';
  workoutId: string | null;
  onClose: () => void;
}

/**
 * Remounts the editor body on every open (keyed by an open counter) so a
 * create draft or half-typed edit can never leak into the next open. The
 * body stays mounted while `visible` flips false, so the slide-out still
 * animates.
 */
export function WorkoutEditorModal(props: WorkoutEditorModalProps) {
  const [openCount, setOpenCount] = useState(0);
  const [wasVisible, setWasVisible] = useState(props.visible);
  if (props.visible !== wasVisible) {
    setWasVisible(props.visible);
    if (props.visible) setOpenCount((n) => n + 1);
  }
  return <EditorBody key={openCount} {...props} />;
}

/* ------------------------------------------------------------------ *
 * Editor body                                                        *
 * ------------------------------------------------------------------ */

function EditorBody({ visible, mode: modeProp, workoutId: idProp, onClose }: WorkoutEditorModalProps) {
  // Snapshot mode/id at mount: the parent resets them to create/null the
  // moment it closes us, which would otherwise flash the create form
  // during the slide-out.
  const [mode] = useState(modeProp);
  const [workoutId] = useState(idProp);
  const isEdit = mode === 'edit' && workoutId !== null;

  const insets = useSafeAreaInsets();
  const { data: prefs } = usePreferences();
  const unit: WeightUnit = prefs?.weight_unit ?? 'lb';

  const { data: detail, isLoading: detailLoading, isError: detailError } = useCoachWorkout(
    isEdit ? workoutId : '',
  );

  const createMutation = useCoachCreateWorkout();
  const updateMutation = useCoachUpdateWorkout();
  const addMutation = useCoachAddExercise();
  const removeMutation = useCoachRemoveExercise();
  const reorderMutation = useCoachReorderExercises();
  const rxMutation = useCoachUpdatePrescription();

  /* ---- form state ---- */
  const [name, setName] = useState('');
  const [durationText, setDurationText] = useState('');
  const [hydrated, setHydrated] = useState(!isEdit);
  if (isEdit && detail && !hydrated) {
    setName(detail.name);
    setDurationText(detail.duration_min != null ? String(detail.duration_min) : '');
    setHydrated(true);
  }

  /** Edit mode: per-exercise prescription text that differs from (or
   * hasn't yet been reconciled with) the server. Cleared on save. */
  const [rxDrafts, setRxDrafts] = useState<Record<string, RxDraft>>({});
  /** Create mode: the whole exercise list is local. */
  const [draftRows, setDraftRows] = useState<DraftRow[]>([]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);

  const trimmedName = name.trim();
  const durationBlank = durationText.trim() === '';
  const durationValue = durationBlank ? null : parseIntIn(durationText, LIMITS.duration);
  const durationInvalid = !durationBlank && durationValue === null;

  const serverExercises: WorkoutExerciseResponse[] = detail?.exercises ?? [];

  const items: CardItem[] = isEdit
    ? serverExercises.map((ex) => ({
        id: ex.id,
        name: ex.name,
        muscleGroup: ex.muscle_group,
        rx: rxDrafts[ex.id] ?? rxFromServer(ex, unit),
      }))
    : draftRows.map((r) => ({
        id: r.exercise.id,
        name: r.exercise.name,
        muscleGroup: r.exercise.muscle_group,
        rx: r.rx,
      }));

  /* ---- edit-mode dirtiness ---- */
  const metaPatch: WorkoutUpdate = {};
  if (isEdit && detail && hydrated) {
    if (trimmedName.length > 0 && trimmedName !== detail.name) metaPatch.name = trimmedName;
    if (!durationInvalid && durationValue !== detail.duration_min) metaPatch.duration_min = durationValue;
  }
  const editDirty = Object.keys(metaPatch).length > 0 || Object.keys(rxDrafts).length > 0;

  const busy =
    closing ||
    createMutation.isPending ||
    updateMutation.isPending ||
    addMutation.isPending ||
    removeMutation.isPending ||
    reorderMutation.isPending ||
    rxMutation.isPending;
  const listBusy = addMutation.isPending || removeMutation.isPending || reorderMutation.isPending;

  /* ---- prescription editing ---- */

  const setRxField = (exerciseId: string, key: RxKey, raw: string) => {
    const value = key === 'weight' ? decimalOnly(raw) : digitsOnly(raw);
    if (!isEdit) {
      setDraftRows((rows) =>
        rows.map((r) => (r.exercise.id === exerciseId ? { ...r, rx: { ...r.rx, [key]: value } } : r)),
      );
      return;
    }
    const ex = serverExercises.find((e) => e.id === exerciseId);
    if (!ex) return;
    setRxDrafts((d) => ({ ...d, [exerciseId]: { ...(d[exerciseId] ?? rxFromServer(ex, unit)), [key]: value } }));
  };

  /** Drop a draft only if it's still the exact object we sent — a newer
   * keystroke made while the PATCH was in flight must survive. */
  const clearDraftIfUnchanged = (exerciseId: string, sent: RxDraft) =>
    setRxDrafts((d) => {
      if (d[exerciseId] !== sent) return d;
      const next = { ...d };
      delete next[exerciseId];
      return next;
    });

  /** Edit mode: commit one card's prescription when a field blurs. */
  const commitRow = (exerciseId: string) => {
    if (!isEdit || !detail) return;
    const draft = rxDrafts[exerciseId];
    const ex = serverExercises.find((e) => e.id === exerciseId);
    if (!draft || !ex) return;
    const patch = rxPatch(draft, ex, unit);
    if (!patch) {
      clearDraftIfUnchanged(exerciseId, draft);
      return;
    }
    rxMutation.mutate(
      { workoutId: detail.id, exerciseId, body: patch },
      {
        onSuccess: () => clearDraftIfUnchanged(exerciseId, draft),
        onError: (err) => {
          // saveAndClose surfaces its own error for the same row.
          if (!closingRef.current) {
            Toast.show({ type: 'error', text1: 'Couldn’t save targets', text2: err.message });
          }
        },
      },
    );
  };

  /* ---- exercise list ---- */

  const handlePick = (ex: ExerciseResponse) => {
    setPickerOpen(false);
    if (!isEdit) {
      setDraftRows((rows) =>
        rows.some((r) => r.exercise.id === ex.id) ? rows : [...rows, { exercise: ex, rx: { ...NEW_EXERCISE_RX } }],
      );
      return;
    }
    if (!detail) return;
    addMutation.mutate(
      { workoutId: detail.id, body: { exercise_id: ex.id } },
      {
        onError: (err) => Toast.show({ type: 'error', text1: 'Couldn’t add exercise', text2: err.message }),
      },
    );
  };

  const handleRemove = async (item: CardItem) => {
    if (!isEdit) {
      setDraftRows((rows) => rows.filter((r) => r.exercise.id !== item.id));
      return;
    }
    if (!detail) return;
    const ok = await confirmAsync(
      'Remove exercise?',
      `${item.name} and its targets will be removed from this workout.`,
      'Remove',
      'Cancel',
    );
    if (!ok) return;
    setRxDrafts((d) => {
      if (!(item.id in d)) return d;
      const next = { ...d };
      delete next[item.id];
      return next;
    });
    removeMutation.mutate(
      { workoutId: detail.id, exerciseId: item.id },
      {
        onError: (err) => Toast.show({ type: 'error', text1: 'Couldn’t remove exercise', text2: err.message }),
      },
    );
  };

  const handleMove = (fromIdx: number, direction: -1 | 1) => {
    const toIdx = fromIdx + direction;
    if (toIdx < 0 || toIdx >= items.length) return;
    if (!isEdit) {
      setDraftRows((rows) => {
        const next = rows.slice();
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        return next;
      });
      return;
    }
    if (!detail) return;
    const ids = items.map((i) => i.id);
    const [moved] = ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, moved);
    reorderMutation.mutate(
      { workoutId: detail.id, body: { exercise_ids: ids } },
      {
        onError: (err) => Toast.show({ type: 'error', text1: 'Couldn’t reorder', text2: err.message }),
      },
    );
  };

  /* ---- dismiss = save + close ---- */

  const saveEdit = async () => {
    if (!detail) {
      onClose();
      return;
    }
    const tasks: Promise<unknown>[] = [];
    if (Object.keys(metaPatch).length > 0) {
      tasks.push(updateMutation.mutateAsync({ id: detail.id, body: metaPatch }));
    }
    for (const [exerciseId, draft] of Object.entries(rxDrafts)) {
      const ex = serverExercises.find((e) => e.id === exerciseId);
      const patch = ex ? rxPatch(draft, ex, unit) : null;
      if (!patch) {
        clearDraftIfUnchanged(exerciseId, draft);
        continue;
      }
      tasks.push(
        rxMutation
          .mutateAsync({ workoutId: detail.id, exerciseId, body: patch })
          .then(() => clearDraftIfUnchanged(exerciseId, draft)),
      );
    }
    const results = await Promise.allSettled(tasks);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) {
      Toast.show({ type: 'error', text1: 'Couldn’t save your changes', text2: errMsg(failed.reason) });
      return; // stay open so nothing is lost
    }
    onClose();
  };

  const saveCreate = async () => {
    const empty = trimmedName.length === 0 && draftRows.length === 0 && durationBlank;
    if (empty) {
      onClose();
      return;
    }
    const valid = trimmedName.length > 0 && draftRows.length > 0;
    if (!valid) {
      const why =
        trimmedName.length === 0
          ? 'It needs a name before it can be saved.'
          : 'Add at least one exercise to save it.';
      const discard = await confirmAsync('Discard this workout?', why, 'Discard', 'Keep editing');
      if (discard) onClose();
      return;
    }

    let created: WorkoutDetailResponse;
    try {
      created = await createMutation.mutateAsync({
        body: {
          name: trimmedName,
          duration_min: durationValue,
          exercise_ids: draftRows.map((r) => r.exercise.id),
        },
      });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Couldn’t create workout', text2: errMsg(e) });
      return; // nothing was written — stay open with the draft intact
    }

    const patches: Promise<unknown>[] = [];
    for (const row of draftRows) {
      const link = created.exercises.find((e) => e.id === row.exercise.id);
      const patch = link ? rxPatch(row.rx, link, unit) : null;
      if (patch) {
        patches.push(
          rxMutation.mutateAsync({ workoutId: created.id, exerciseId: row.exercise.id, body: patch }),
        );
      }
    }
    const results = await Promise.allSettled(patches);
    // The workout exists now; staying open would re-create it on the next
    // dismiss, so always close and just say which part didn't land.
    if (results.some((r) => r.status === 'rejected')) {
      Toast.show({
        type: 'error',
        text1: 'Workout created — some targets didn’t save',
        text2: 'Open it again to fix them.',
      });
    } else {
      Toast.show({ type: 'success', text1: 'Workout created', text2: created.name });
    }
    onClose();
  };

  const saveAndClose = async () => {
    if (closingRef.current) return; // double-tap guard
    closingRef.current = true;
    setClosing(true);
    try {
      if (isEdit) await saveEdit();
      else await saveCreate();
    } finally {
      closingRef.current = false;
      setClosing(false);
    }
  };

  const onDismiss = () => {
    void saveAndClose();
  };

  /* ---- status caption (header right) ---- */
  let status: { label: string; icon: 'spinner' | 'check' | null };
  if (busy) status = { label: 'Saving…', icon: 'spinner' };
  else if (!isEdit) status = { label: 'Draft', icon: null };
  else if (editDirty) status = { label: 'Saves on close', icon: null };
  else status = { label: 'Saved', icon: 'check' };

  const createdBy = isEdit ? detail?.created_by : null;
  const createdByName = createdBy ? createdBy.display_name || createdBy.username : null;

  const nameHint =
    trimmedName.length > 0
      ? null
      : isEdit && detail
        ? `A name is required — leaving it empty keeps “${detail.name}”.`
        : 'Name it to save it.';

  const footerHint = isEdit
    ? 'Changes save automatically when you close.'
    : 'Close to create — needs a name and at least one exercise.';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDismiss}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: BACKDROP }]}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Save and close"
        />

        <View style={styles.sheet}>
          <View style={styles.grabber} />

          {/* Header — back chevron · title · save status. No buttons on the right. */}
          <View style={styles.header}>
            <IconButton accessibilityLabel="Save and close" onPress={onDismiss} disabled={closing}>
              <ChevronLeft size={18} color={colors.foreground} />
            </IconButton>
            <Text maxFontSizeMultiplier={1.3} style={styles.headerTitle} numberOfLines={1}>
              {isEdit ? 'Edit workout' : 'New workout'}
            </Text>
            <View style={styles.status} accessibilityLiveRegion="polite">
              {status.icon === 'spinner' ? (
                <ActivityIndicator size="small" color={colors.mutedForeground} />
              ) : status.icon === 'check' ? (
                <Check size={14} color={colors.success} strokeWidth={2.5} />
              ) : null}
              <Text maxFontSizeMultiplier={1.3} style={styles.statusText}>
                {status.label}
              </Text>
            </View>
          </View>

          {isEdit && detailLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.mutedForeground} />
              <Text maxFontSizeMultiplier={1.3} style={styles.mutedBody}>
                Loading workout…
              </Text>
            </View>
          ) : isEdit && (detailError || !detail) ? (
            <View style={styles.centered}>
              <Text maxFontSizeMultiplier={1.3} style={styles.mutedBody}>
                Couldn’t load this workout.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: space.xxxl + insets.bottom }]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {/* Name + duration share one line: the name is the point,
                  duration is optional metadata riding alongside it. */}
              <View style={styles.metaRow}>
                <View style={styles.nameCol}>
                  <Text maxFontSizeMultiplier={1.3} style={styles.fieldLabel}>
                    Name
                  </Text>
                  <MetaInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Push Day A"
                    accessibilityLabel="Workout name"
                    big
                  />
                </View>
                <View style={styles.durationCol}>
                  <Text maxFontSizeMultiplier={1.3} style={styles.fieldLabel}>
                    Duration
                  </Text>
                  <MetaInput
                    value={durationText}
                    onChangeText={(v) => setDurationText(digitsOnly(v))}
                    placeholder="Optional"
                    keyboardType="number-pad"
                    suffix={durationBlank ? undefined : 'min'}
                    accessibilityLabel="Duration in minutes, optional"
                    numeric
                  />
                </View>
              </View>

              {nameHint || durationInvalid || createdByName ? (
                <View style={styles.metaNotes}>
                  {nameHint ? (
                    <Text maxFontSizeMultiplier={1.3} style={styles.caption}>
                      {nameHint}
                    </Text>
                  ) : null}
                  {durationInvalid ? (
                    <Text maxFontSizeMultiplier={1.3} style={[styles.caption, { color: colors.destructive }]}>
                      Duration must be 1–600 minutes.
                    </Text>
                  ) : null}
                  {createdByName ? (
                    <Text maxFontSizeMultiplier={1.3} style={styles.caption}>
                      Added by Coach {createdByName}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {/* Exercises */}
              <View style={styles.sectionHead}>
                <Text maxFontSizeMultiplier={1.3} style={styles.sectionTitle}>
                  Exercises
                </Text>
                {items.length > 0 ? (
                  <Text maxFontSizeMultiplier={1.3} style={[styles.caption, tabular]}>
                    {items.length}
                  </Text>
                ) : null}
              </View>

              {items.length === 0 ? (
                <View style={styles.empty}>
                  <Text maxFontSizeMultiplier={1.3} style={styles.emptyTitle}>
                    No exercises yet
                  </Text>
                  <Text maxFontSizeMultiplier={1.3} style={styles.caption}>
                    Add from the catalog, then set targets for each.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: space.md }}>
                  {items.map((item, idx) => (
                    <ExerciseCard
                      key={item.id}
                      item={item}
                      index={idx}
                      count={items.length}
                      unit={unit}
                      listBusy={listBusy || closing}
                      onChangeRx={(key, v) => setRxField(item.id, key, v)}
                      onCommit={() => commitRow(item.id)}
                      onMove={(dir) => handleMove(idx, dir)}
                      onRemove={() => void handleRemove(item)}
                    />
                  ))}
                </View>
              )}

              <Button
                label="Add exercise"
                variant="ghost"
                size="md"
                onPress={() => setPickerOpen(true)}
                disabled={closing}
                loading={addMutation.isPending}
                leftIcon={<Plus size={16} color={colors.foreground} strokeWidth={2.5} />}
                style={{ marginTop: space.md }}
              />

              <Text maxFontSizeMultiplier={1.3} style={[styles.caption, styles.footerHint]}>
                {footerHint}
              </Text>
            </ScrollView>
          )}
        </View>

        {pickerOpen ? (
          <ExercisePickerSheet
            excludeIds={items.map((i) => i.id)}
            onPick={handlePick}
            onClose={() => setPickerOpen(false)}
          />
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Exercise card                                                      *
 * ------------------------------------------------------------------ */

const RX_COLUMNS: { key: RxKey; label: string }[] = [
  { key: 'sets', label: 'Sets' },
  { key: 'reps', label: 'Reps' },
  { key: 'weight', label: 'Weight' },
  { key: 'rest', label: 'Rest' },
];

function ExerciseCard({
  item,
  index,
  count,
  unit,
  listBusy,
  onChangeRx,
  onCommit,
  onMove,
  onRemove,
}: {
  item: CardItem;
  index: number;
  count: number;
  unit: WeightUnit;
  listBusy: boolean;
  onChangeRx: (key: RxKey, value: string) => void;
  onCommit: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const isFirst = index === 0;
  const isLast = index === count - 1;
  return (
    <Card>
      <View style={styles.cardHead}>
        <View style={styles.cardTitleCol}>
          <Text maxFontSizeMultiplier={1.3} style={styles.eyebrow} numberOfLines={1}>
            {item.muscleGroup}
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.cardTitle} numberOfLines={2}>
            {item.name}
          </Text>
        </View>
        <View style={styles.cardActions}>
          <IconButton
            accessibilityLabel={`Move ${item.name} up`}
            onPress={() => onMove(-1)}
            disabled={isFirst || listBusy}
          >
            <ArrowUp size={15} color={colors.foreground} />
          </IconButton>
          <IconButton
            accessibilityLabel={`Move ${item.name} down`}
            onPress={() => onMove(1)}
            disabled={isLast || listBusy}
          >
            <ArrowDown size={15} color={colors.foreground} />
          </IconButton>
          <IconButton accessibilityLabel={`Remove ${item.name}`} onPress={onRemove} disabled={listBusy}>
            <Trash2 size={15} color={colors.destructive} />
          </IconButton>
        </View>
      </View>

      <View style={styles.rxLabels}>
        {RX_COLUMNS.map((c) => (
          <Text key={c.key} maxFontSizeMultiplier={1.3} style={styles.rxLabel}>
            {c.label}
          </Text>
        ))}
      </View>
      <View style={styles.rxRow}>
        <RxField
          value={item.rx.sets}
          onChangeText={(v) => onChangeRx('sets', v)}
          onCommit={onCommit}
          accessibilityLabel={`${item.name} target sets`}
        />
        <RxField
          value={item.rx.reps}
          onChangeText={(v) => onChangeRx('reps', v)}
          onCommit={onCommit}
          accessibilityLabel={`${item.name} target reps`}
        />
        <RxField
          value={item.rx.weight}
          onChangeText={(v) => onChangeRx('weight', v)}
          onCommit={onCommit}
          suffix={unit}
          placeholder="—"
          decimal
          accessibilityLabel={`${item.name} target weight in ${unit}, optional`}
        />
        <RxField
          value={item.rx.rest}
          onChangeText={(v) => onChangeRx('rest', v)}
          onCommit={onCommit}
          suffix="s"
          accessibilityLabel={`${item.name} rest in seconds`}
        />
      </View>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Inputs — SetRow's field language: r.sm, input fill, no idle border,
 * 1.5dp ring on focus (always-present border so focus never reflows),
 * tabular numerals, unit as a micro suffix inside the right edge.      *
 * ------------------------------------------------------------------ */

function RxField({
  value,
  onChangeText,
  onCommit,
  suffix,
  placeholder,
  decimal = false,
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onCommit: () => void;
  suffix?: string;
  placeholder?: string;
  decimal?: boolean;
  accessibilityLabel: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, focused ? styles.fieldFocused : null]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        // onBlur (not onEndEditing) — it fires on native AND web, and on
        // every way focus leaves the field.
        onBlur={() => {
          setFocused(false);
          onCommit();
        }}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        selectTextOnFocus
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER_COLOR}
        accessibilityLabel={accessibilityLabel}
        maxFontSizeMultiplier={1.3}
        style={[styles.fieldInput, suffix ? styles.fieldInputWithSuffix : null]}
      />
      {suffix ? (
        <Text pointerEvents="none" maxFontSizeMultiplier={1.3} style={styles.fieldSuffix}>
          {suffix}
        </Text>
      ) : null}
    </View>
  );
}

function MetaInput({
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  suffix,
  accessibilityLabel,
  big = false,
  numeric = false,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad';
  suffix?: string;
  accessibilityLabel: string;
  big?: boolean;
  numeric?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.metaField, focused ? styles.fieldFocused : null]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER_COLOR}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'default' ? 'words' : 'none'}
        returnKeyType="done"
        maxLength={big ? 200 : 3}
        accessibilityLabel={accessibilityLabel}
        maxFontSizeMultiplier={1.3}
        style={[
          styles.metaInput,
          big ? styles.metaInputBig : null,
          numeric ? tabular : null,
          suffix ? styles.metaInputWithSuffix : null,
        ]}
      />
      {suffix ? (
        <Text pointerEvents="none" maxFontSizeMultiplier={1.3} style={styles.fieldSuffix}>
          {suffix}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Styles — every value from `@/lib/theme` (DESIGN.md §2)              *
 * ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    height: '92%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
    ...elevation.e2,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...type.heading, color: colors.foreground, flex: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 32 },
  statusText: { ...type.caption, color: colors.mutedForeground },
  centered: { padding: space.xxxl, alignItems: 'center', gap: space.md },
  mutedBody: { ...type.body, color: colors.mutedForeground },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: space.lg, paddingTop: space.xl },

  metaRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-end' },
  nameCol: { flex: 1, gap: space.sm },
  durationCol: { width: 112, gap: space.sm },
  fieldLabel: { ...type.micro, color: colors.mutedForeground },
  metaField: {
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  metaInput: {
    ...type.body,
    color: colors.foreground,
    paddingHorizontal: space.md,
    height: '100%',
  },
  metaInputBig: { ...type.heading },
  metaInputWithSuffix: { paddingRight: 36 },
  metaNotes: { marginTop: space.sm, gap: space.xs },
  caption: { ...type.caption, color: colors.mutedForeground },

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: space.xxl,
    marginBottom: space.md,
  },
  sectionTitle: { ...type.heading, color: colors.foreground },
  empty: {
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.xxl,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  emptyTitle: { ...type.body, color: colors.foreground },

  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  cardTitleCol: { flex: 1, minWidth: 0, gap: 2 },
  eyebrow: { ...type.micro, color: colors.mutedForeground },
  cardTitle: { ...type.heading, color: colors.foreground },
  cardActions: { flexDirection: 'row', gap: space.sm },

  rxLabels: { flexDirection: 'row', gap: space.sm, marginTop: space.lg, marginBottom: space.xs },
  rxLabel: { ...type.micro, color: colors.mutedForeground, flex: 1, textAlign: 'center' },
  rxRow: { flexDirection: 'row', gap: space.sm },
  field: {
    flex: 1,
    height: FIELD_HEIGHT,
    borderRadius: radius.sm,
    backgroundColor: colors.inputBackground,
    borderWidth: 1.5,
    borderColor: 'transparent',
    justifyContent: 'center',
  },
  fieldFocused: { borderColor: colors.ring },
  fieldInput: {
    ...type.body,
    ...tabular,
    color: colors.foreground,
    textAlign: 'center',
    height: '100%',
    paddingHorizontal: space.xs,
  },
  fieldInputWithSuffix: { paddingRight: 20 },
  fieldSuffix: {
    ...type.micro,
    letterSpacing: 0.4,
    color: colors.mutedForeground,
    position: 'absolute',
    right: space.sm,
  },
  footerHint: { textAlign: 'center', marginTop: space.lg },
});

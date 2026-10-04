import { memo } from "react";
import { View, Text, Pressable } from "react-native";
import { Play, Plus, Trophy } from "lucide-react-native";
import { LoggedSetRow, PlaceholderSetRow, SetRowHeader } from "./SetRow";
import type {
  PersonalRecordResponse,
  SessionExerciseBlock,
  SetKind,
} from "@/lib/api";
import type { WeightUnit } from "@/lib/units";
import { fmtWeight, fromKg, roundToIncrement } from "@/lib/units";
import { colors } from "@/lib/theme";

/** 45 -> "45s", 60 -> "1:00", 90 -> "1:30". */
function fmtRest(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, "0")}`;
}

const HIT_SLOP_6 = { top: 6, bottom: 6, left: 6, right: 6 };

interface Props {
  block: SessionExerciseBlock;
  weightUnit: WeightUnit;
  pr?: PersonalRecordResponse;
  onLogSet: (weight: number, reps: number, kind: SetKind) => void;
  onUpdateSet: (id: number, weight: number, reps: number) => void;
  onDeleteSet: (id: number) => void;
  onPlayDemo: () => void;
  onSetLogged?: () => void;
  /** Parent removes this whole exercise from the session view (fired when the
   * user deletes the block's last remaining row). */
  onRemoveExercise?: () => void;
  /** How many rows (logged + empty) the user asked for. Owned by the parent so it
   * survives this block remounting when a pending exercise logs its first set and
   * becomes a server block. `undefined` = default (target sets if prescribed, else 1). */
  rows?: number;
  onRowsChange: (rows: number) => void;
}

/**
 * Memoized: logging a set re-renders SessionScreen (optimistic cache write,
 * refetch, rest timer), and re-rendering every block + row on each of those
 * starved the JS thread (toast lag, 2026-10-04). React Query's structural
 * sharing keeps an unchanged block's object identical across refetches, so
 * only the block that actually changed re-renders.
 *
 * Function props are deliberately NOT compared: SessionScreen passes fresh
 * inline closures every render, but they route through its latest-handlers
 * ref, so a skipped re-render can't leave this block calling stale logic.
 */
function propsEqual(a: Props, b: Props): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<
    keyof Props
  >;
  for (const k of keys) {
    if (typeof a[k] === "function" && typeof b[k] === "function") continue;
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export const ExerciseBlock = memo(ExerciseBlockImpl, propsEqual);

function ExerciseBlockImpl({
  block,
  weightUnit,
  pr,
  onLogSet,
  onUpdateSet,
  onDeleteSet,
  onPlayDemo,
  onSetLogged: _onSetLogged,
  onRemoveExercise,
  rows: rowsProp,
  onRowsChange,
}: Props) {
  // ONE row model for every block, ad-hoc or prescribed (bug 2026-10-04: the
  // two used to differ, and prescribed blocks spawned a fresh empty row after
  // every logged set). `rows` = how many rows (logged + empty) the user wants.
  // It starts at the coach's target set count (prescribed), the imported count,
  // or 1, and only changes on "Add additional set" or a row delete. Logging a
  // set fills a row; it never adds one.
  const isPrescribed = block.is_prescribed;
  const rows = rowsProp ?? (isPrescribed ? block.target_sets : 1);
  const setRows = onRowsChange;
  // Never fewer rows than logged sets (e.g. sets arriving from the server).
  const shownRows = Math.max(1, rows, block.sets.length);
  const placeholderCount = shownRows - block.sets.length;
  const workingLogged = block.sets.filter((s) => s.kind === "working").length;
  const workingLastTime = block.last_time.filter((s) => s.kind === "working");

  // Prescription display + set-row placeholders. Only for prescribed blocks;
  // ad-hoc blocks carry default target_* values that must never surface as a
  // "target". Placeholders are hints only — SetRow never commits them unless typed.
  const targetWeight =
    isPrescribed && block.target_weight_kg != null
      ? roundToIncrement(fromKg(block.target_weight_kg, weightUnit), weightUnit)
      : null;
  const targetLine = isPrescribed
    ? `Target ${block.target_sets} × ${block.target_reps}` +
      (targetWeight != null ? ` @ ${targetWeight} ${weightUnit}` : "") +
      ` · Rest ${fmtRest(block.target_rest_sec)}`
    : null;
  const targetWeightHint =
    targetWeight != null ? String(targetWeight) : undefined;
  const targetRepsHint = isPrescribed ? String(block.target_reps) : undefined;

  const handleLogWorking = (weight: number, reps: number) => {
    onLogSet(weight, reps, "working");
  };

  // Deleting the block's LAST remaining row (logged or empty) removes the whole
  // exercise from the session. Any other delete removes just that row; the
  // remaining rows renumber automatically via array position.
  const handleDeleteLoggedSet = (id: number) => {
    if (shownRows <= 1) {
      onRemoveExercise?.();
      return;
    }
    onDeleteSet(id);
    setRows(shownRows - 1);
  };

  const handleDeletePlaceholder = () => {
    if (shownRows <= 1) {
      onRemoveExercise?.();
      return;
    }
    setRows(shownRows - 1);
  };

  return (
    <View className="gap-4">
      {/* DESIGN.md §3.2 — eyebrow / name / PR line. Target moves onto the
          name's baseline as a right-aligned chip instead of a stacked third
          line, saving one line of vertical space per exercise. */}
      <View className="gap-1">
        <View className="flex-row items-start justify-between gap-3">
          <Text
            className="text-micro text-muted-foreground"
            maxFontSizeMultiplier={1.3}
          >
            {block.exercise.muscle_group}
          </Text>
          {block.exercise.yt_id ? (
            <Pressable
              onPress={onPlayDemo}
              accessibilityRole="button"
              accessibilityLabel={`Play demo video for ${block.exercise.name}`}
              hitSlop={HIT_SLOP_6}
              className="w-8 h-8 rounded-full bg-muted items-center justify-center active:opacity-70"
            >
              <Play
                size={13}
                color={colors.mutedForeground}
                fill={colors.mutedForeground}
              />
            </Pressable>
          ) : null}
        </View>

        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1 flex-row items-center gap-1.5">
            <Text
              className="text-heading text-card-foreground flex-shrink"
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {block.exercise.name}
            </Text>
            {pr && block.exercise.pr_trackable && (
              <Trophy size={14} color="#e87d6f" />
            )}
          </View>
        </View>

        {targetLine ? (
          <Text
            className="text-caption text-muted-foreground"
            style={{ fontVariant: ["tabular-nums"] }}
            maxFontSizeMultiplier={1.3}
          >
            {targetLine}
          </Text>
        ) : null}

        {pr && (
          <Text
            className="text-caption text-muted-foreground"
            maxFontSizeMultiplier={1.3}
          >
            PR{" "}
            <Text
              className="text-primary font-semibold"
              maxFontSizeMultiplier={1.3}
            >
              {fmtWeight(pr.best_weight_kg, weightUnit)}×{pr.best_weight_reps}
            </Text>
          </Text>
        )}
        {block.prescription_notes ? (
          <Text
            className="text-caption text-muted-foreground"
            maxFontSizeMultiplier={1.3}
          >
            {block.prescription_notes}
          </Text>
        ) : null}
      </View>

      <View className="gap-3">
        <SetRowHeader />
        {block.sets.map((s, i) => (
          <LoggedSetRow
            key={s.id}
            set={s}
            displayIndex={i + 1}
            weightUnit={weightUnit}
            onUpdate={(weight, reps) => onUpdateSet(s.id, weight, reps)}
            onDelete={() => handleDeleteLoggedSet(s.id)}
            isFirst={i === 0}
          />
        ))}

        {Array.from({ length: placeholderCount }, (_, i) => (
          <PlaceholderSetRow
            key={`placeholder-${workingLogged + i}`}
            displayIndex={block.sets.length + i + 1}
            kind="working"
            weightUnit={weightUnit}
            lastTime={workingLastTime[workingLogged + i]}
            targetWeightHint={targetWeightHint}
            targetRepsHint={targetRepsHint}
            onCommit={handleLogWorking}
            isFirst={block.sets.length === 0 && i === 0}
            onDelete={handleDeletePlaceholder}
          />
        ))}
      </View>

      <Pressable
        onPress={() => setRows(shownRows + 1)}
        accessibilityRole="button"
        accessibilityLabel="Add additional set"
        style={{ minHeight: 44 }}
        className="bg-muted rounded-md items-center flex-row justify-center gap-1.5 active:opacity-80"
      >
        <Plus size={14} color="#8b7268" />
        <Text
          className="text-label text-muted-foreground"
          maxFontSizeMultiplier={1.3}
        >
          Add additional set
        </Text>
      </Pressable>
    </View>
  );
}

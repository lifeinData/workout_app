import { View, Text, Pressable, TextInput } from 'react-native';
import { Flame, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { HistoricalSetResponse, SetKind } from '@/lib/api';
import type { WeightUnit } from '@/lib/units';
import { fmtWeight, fromKg } from '@/lib/units';
import { colors } from '@/lib/theme';

// DESIGN.md §3.1 — the set-row grid. `SetRowHeader` and both row variants
// (`LoggedSetRow`, `PlaceholderSetRow`) consume this so the header can never
// drift out of alignment with the rows again (2026-08-24 design pass — the
// header used to be hand-aligned against `px-3` while the rows used
// `px-3.5` + extra flex siblings, so labels sat left of their columns and
// weight/reps weren't even equal width).
export const SET_ROW_METRICS = { railW: 3, idxW: 24, actionW: 32, gap: 10, padX: 12 } as const;

// 52dp row + 44dp field height (the touch-target floor, DESIGN.md §2.8),
// centered inside the row via `items-center` on the content strip.
const ROW_HEIGHT = 52;
const FIELD_HEIGHT = 44;
const TABULAR = { fontVariant: ['tabular-nums'] as ('tabular-nums')[] };

// Lighter than muted-foreground so an empty field's placeholder can't be
// mistaken for a logged "0" at a glance. RN `placeholderTextColor` takes a
// prop, not a className, so this stays a literal.
const PLACEHOLDER_COLOR = 'rgba(139,114,104,0.45)';

const COMMIT_DEBOUNCE_MS = 800;

/** Horizontal frame shared by the header and every row: the 3dp rail is a
 * flex sibling (not padding), then the content strip is inset by `padX` on
 * both sides with `gap` between idx / weight / reps / action. */
const contentStripStyle = { paddingHorizontal: SET_ROW_METRICS.padX, gap: SET_ROW_METRICS.gap };

/** `SET · WEIGHT · REPS` column header, mounted once per card (by
 * ExerciseBlock) above the row list. Shares `SET_ROW_METRICS` with the rows
 * below it so the labels always sit directly over their columns. */
export function SetRowHeader() {
  return (
    <View className="flex-row items-center" style={{ height: 20 }}>
      <View style={{ width: SET_ROW_METRICS.railW }} />
      <View className="flex-1 flex-row items-center" style={contentStripStyle}>
        <Text
          className="text-micro text-muted-foreground"
          style={{ width: SET_ROW_METRICS.idxW }}
          maxFontSizeMultiplier={1.3}
        >
          Set
        </Text>
        <Text className="flex-1 text-micro text-muted-foreground text-center" maxFontSizeMultiplier={1.3}>
          Weight
        </Text>
        <Text className="flex-1 text-micro text-muted-foreground text-center" maxFontSizeMultiplier={1.3}>
          Reps
        </Text>
        <View style={{ width: SET_ROW_METRICS.actionW }} />
      </View>
    </View>
  );
}

/** 24dp index column. A tabular numeral, not a pill — a pill on every row
 * is 100% noise (DESIGN.md §3.1). Warmup swaps the numeral for the flame
 * glyph instead of adding a second element next to it. `pending` (a
 * placeholder row with one field filled but not the other) tints the
 * numeral toward the accent instead of appending a marker glyph. */
function IndexCell({ index, kind, pending }: { index: number; kind: SetKind; pending?: boolean }) {
  if (kind === 'warmup') {
    return (
      <View style={{ width: SET_ROW_METRICS.idxW }} className="items-center justify-center">
        <Flame size={14} color={colors.warmup} />
      </View>
    );
  }
  return (
    <Text
      className={`text-micro text-center ${pending ? 'text-primary' : 'text-muted-foreground'}`}
      style={[TABULAR, { width: SET_ROW_METRICS.idxW }]}
      maxFontSizeMultiplier={1.3}
    >
      {index}
    </Text>
  );
}

interface SetFieldProps {
  value: string;
  onChangeText: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  placeholder?: string;
  editable: boolean;
  keyboardType: 'decimal-pad' | 'number-pad';
  unit: string;
  focused: boolean;
  /** This set counts (logged, or a placeholder row that has been typed
   * into) — fill goes `--card` and the value gains weight. */
  committed: boolean;
  accessibilityLabel: string;
}

/** One weight/reps field: `r.sm`, `--input-background` fill, no idle
 * border, 1.5dp `--ring` on focus. The unit is a `micro` suffix inside the
 * field's right edge, not a separate flex sibling — that sibling (22dp for
 * "lb", 30dp for "reps") is what made weight/reps unequal widths before. */
function SetField({
  value,
  onChangeText,
  onFocus,
  onBlur,
  placeholder,
  editable,
  keyboardType,
  unit,
  focused,
  committed,
  accessibilityLabel,
}: SetFieldProps) {
  return (
    <View
      className={`flex-1 rounded-sm justify-center ${committed ? 'bg-card' : 'bg-input-background'} ${
        focused ? 'border-[1.5px] border-ring' : ''
      }`}
      style={{ height: FIELD_HEIGHT }}
    >
      <TextInput
        keyboardType={keyboardType}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER_COLOR}
        editable={editable}
        accessibilityLabel={accessibilityLabel}
        maxFontSizeMultiplier={1.3}
        className={`text-body text-center text-card-foreground ${committed ? 'font-semibold' : ''}`}
        style={[TABULAR, { paddingRight: 26 }]}
      />
      <Text
        className="text-micro text-muted-foreground absolute"
        style={{ right: 8 }}
        maxFontSizeMultiplier={1.3}
        pointerEvents="none"
      >
        {unit}
      </Text>
    </View>
  );
}

interface ActionSlotProps {
  /** Omit entirely (template rows with no delete affordance) to render an
   * empty 32dp slot instead of a button — the slot itself is always
   * rendered so the row never reflows based on what it holds. */
  onDelete?: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
}

/** 32dp fixed-width action column — DESIGN.md §3.1's fix for the PR-reflow
 * bug (`Workout2.jpg`): the slot is always rendered at a constant width, so a
 * row never reflows based on what it holds. It carries the delete affordance
 * only; the PR is surfaced once in the exercise header ("PR 6×35"), so a
 * per-row PR badge here was redundant and collided with the trash icon. */
function ActionSlot({ onDelete, disabled, accessibilityLabel }: ActionSlotProps) {
  return (
    <View
      style={{ width: SET_ROW_METRICS.actionW, height: SET_ROW_METRICS.actionW }}
      className="items-center justify-center"
    >
      {onDelete ? (
        <Pressable
          onPress={onDelete}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}
          style={[{ width: 30, height: 30 }, disabled ? { opacity: 0.3 } : undefined]}
          className="rounded-full items-center justify-center active:bg-muted"
        >
          <Trash2 size={15} color="#8b7268" />
        </Pressable>
      ) : (
        <View style={{ width: 30, height: 30 }} />
      )}
    </View>
  );
}

interface LoggedRowProps {
  set: HistoricalSetResponse;
  displayIndex: number;
  weightUnit: WeightUnit;
  onUpdate: (weight: number, reps: number) => void;
  onDelete: () => void;
  /** Whether this is the first set in its exercise block. Rendering-only
   * here — ExerciseBlock (a later task) owns the "delete first set removes
   * the whole exercise" semantics; this component just exposes the flag
   * so that logic can be wired without another prop-plumbing pass. */
  isFirst?: boolean;
}

/** A committed set. Editing either field commits on blur, only when
 * the value actually changed — avoids a PATCH firing on every tap
 * that merely focuses and re-blurs the field without editing it. */
export function LoggedSetRow({
  set,
  displayIndex,
  weightUnit,
  onUpdate,
  onDelete,
  isFirst: _isFirst,
}: LoggedRowProps) {
  const displayWeight = fmtWeight(set.weight_kg, weightUnit);
  const [weight, setWeight] = useState(displayWeight);
  const [reps, setReps] = useState(String(set.reps));
  const [weightFocused, setWeightFocused] = useState(false);
  const [repsFocused, setRepsFocused] = useState(false);

  const commitIfChanged = () => {
    const w = Number(weight);
    const r = Number(reps);
    const weightValid = weight !== '' && Number.isFinite(w) && w >= 0;
    const repsValid = reps !== '' && Number.isFinite(r) && r > 0;
    if (!weightValid || !repsValid) {
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
    <View className="flex-row" style={{ height: ROW_HEIGHT }}>
      <View className="bg-success" style={{ width: SET_ROW_METRICS.railW }} />
      <View className="flex-1 flex-row items-center" style={contentStripStyle}>
        <IndexCell index={displayIndex} kind={set.kind} />
        <SetField
          value={weight}
          onChangeText={setWeight}
          onFocus={() => setWeightFocused(true)}
          onBlur={() => {
            setWeightFocused(false);
            commitIfChanged();
          }}
          editable={!isOptimistic}
          keyboardType="decimal-pad"
          unit={weightUnit}
          focused={weightFocused}
          committed
          accessibilityLabel={`Weight for set ${displayIndex}`}
        />
        <SetField
          value={reps}
          onChangeText={setReps}
          onFocus={() => setRepsFocused(true)}
          onBlur={() => {
            setRepsFocused(false);
            commitIfChanged();
          }}
          editable={!isOptimistic}
          keyboardType="number-pad"
          unit="reps"
          focused={repsFocused}
          committed
          accessibilityLabel={`Reps for set ${displayIndex}`}
        />
        <ActionSlot
          onDelete={onDelete}
          disabled={isOptimistic}
          accessibilityLabel={`Delete set ${displayIndex}`}
        />
      </View>
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
  /** Optional local-remove affordance for an empty slot (e.g. undoing an
   * "Add set" tap). Not the same as deleting a logged set — nothing has
   * been posted to the server yet for a row using this prop. */
  onDelete?: () => void;
  /** See `LoggedRowProps.isFirst` — rendering-only flag, no removal
   * logic lives here. */
  isFirst?: boolean;
  /** Coach prescription hints (already in the user's unit / as strings). When
   * set they win over the last-time suggestion (P3). Placeholder text only —
   * never a value; the row commits only after the user types BOTH fields. */
  targetWeightHint?: string;
  targetRepsHint?: string;
}

/** A not-yet-logged row, optionally showing hints (coach target, or the
 * same slot in the previous session) as placeholder text. There is no
 * commit button — typing a weight and reps commits automatically
 * (debounced, and on blur) once both typed values are valid. */
export function PlaceholderSetRow({
  displayIndex,
  lastTime,
  weightUnit,
  kind,
  onCommit,
  disabled,
  onDelete,
  isFirst: _isFirst,
  targetWeightHint,
  targetRepsHint,
}: PlaceholderRowProps) {
  const suggestedWeight =
    targetWeightHint ?? (lastTime ? fmtWeight(lastTime.weight_kg, weightUnit) : '');
  const suggestedReps = targetRepsHint ?? (lastTime ? String(lastTime.reps) : '');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [weightFocused, setWeightFocused] = useState(false);
  const [repsFocused, setRepsFocused] = useState(false);

  // Guards against the debounce timer and a blur event both trying to
  // commit the same pending values (React state updates are batched, so
  // two calls in the same tick would otherwise both see "not yet reset").
  const committingRef = useRef(false);

  // A row is "touched" the moment the user has typed into either field —
  // this drives the visual committed style (rail + field fill). A
  // prefilled suggestion shown as placeholder text does NOT count;
  // untouched stays in the quiet idle style.
  const isTouched = weight !== '' || reps !== '';

  // Only TYPED values commit. Suggestions (coach target / last time) are
  // placeholder hints and never fill in a missing field — falling back to
  // them made blurring Weight to tap Reps commit the row with the hinted
  // reps and yank focus away (bug 2026-10-04). Same rule for every flow.
  const weightValid = weight !== '' && Number.isFinite(Number(weight));
  const repsValid =
    reps !== '' && Number.isFinite(Number(reps)) && Number(reps) > 0;

  // Both typed fields must be valid (which implies the row is touched).
  const canCommit = isTouched && weightValid && repsValid && !disabled;
  const isPending = isTouched && !canCommit;

  const attemptCommit = useCallback(() => {
    if (!canCommit || committingRef.current) return;
    committingRef.current = true;
    onCommit(Number(weight), Number(reps));
    setWeight('');
    setReps('');
  }, [canCommit, weight, reps, onCommit]);

  // Debounce: commit ~800ms after the last keystroke, once both fields
  // resolve. Re-armed on every weight/reps change; cleared on unmount.
  useEffect(() => {
    if (!canCommit) return;
    const timer = setTimeout(attemptCommit, COMMIT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [canCommit, attemptCommit]);

  // Once the fields are actually cleared (post-commit or post-reset),
  // release the in-flight guard so the next real edit can commit again.
  useEffect(() => {
    if (weight === '' && reps === '') {
      committingRef.current = false;
    }
  }, [weight, reps]);

  const handleBlur = (setFocused: (v: boolean) => void) => () => {
    setFocused(false);
    attemptCommit();
  };

  return (
    <View className="flex-row" style={{ height: ROW_HEIGHT }}>
      <View className={isTouched ? 'bg-success' : 'bg-transparent'} style={{ width: SET_ROW_METRICS.railW }} />
      <View className="flex-1 flex-row items-center" style={contentStripStyle}>
        <IndexCell index={displayIndex} kind={kind} pending={isPending} />
        <SetField
          value={weight}
          onChangeText={setWeight}
          onFocus={() => setWeightFocused(true)}
          onBlur={handleBlur(setWeightFocused)}
          placeholder={suggestedWeight || '—'}
          editable={!disabled}
          keyboardType="decimal-pad"
          unit={weightUnit}
          focused={weightFocused}
          committed={isTouched}
          accessibilityLabel={`Weight for set ${displayIndex}`}
        />
        <SetField
          value={reps}
          onChangeText={setReps}
          onFocus={() => setRepsFocused(true)}
          onBlur={handleBlur(setRepsFocused)}
          placeholder={suggestedReps || '—'}
          editable={!disabled}
          keyboardType="number-pad"
          unit="reps"
          focused={repsFocused}
          committed={isTouched}
          accessibilityLabel={`Reps for set ${displayIndex}`}
        />
        <ActionSlot onDelete={onDelete} accessibilityLabel={`Remove set ${displayIndex}`} />
      </View>
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

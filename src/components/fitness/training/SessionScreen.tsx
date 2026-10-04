import {
  View,
  Text,
  Pressable,
  TextInput,
  Alert,
  ScrollView,
} from "react-native";
import { ChevronLeft, Plus, Trash2 } from "lucide-react-native";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Toast from "@/components/ui/Toast";
import { ExerciseBlock } from "./ExerciseBlock";
import { RestTimerBar } from "./RestTimerBar";
import { DemoVideoSheet } from "./DemoVideoSheet";
import { ExercisePickerSheet } from "./ExercisePickerSheet";
import { ImportWorkoutSheet, type ImportPlanItem } from "./ImportWorkoutSheet";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { colors, space, tabular } from "@/lib/theme";
import { useRestTimer } from "@/hooks/use-rest-timer";
import {
  useDeleteSession,
  useDeleteSet,
  useFinishSession,
  useLogSet,
  usePRs,
  usePreferences,
  useRenameSession,
  useUpdateSet,
} from "@/lib/queries";
import { fmtWeight, type WeightUnit } from "@/lib/units";
import type {
  ExerciseResponse,
  PersonalRecordResponse,
  SessionDetailResponse,
  SessionExerciseBlock,
  SetKind,
} from "@/lib/api";

interface Props {
  session: SessionDetailResponse;
  onBack?: () => void;
  // Called with the completed session snapshot when Finish succeeds.
  // The summary sheet is rendered by the PARENT (TrainingTab), not here:
  // finishing nulls `activeSession`, which unmounts this component, so a
  // sheet rendered inside SessionScreen would never appear.
  onFinished?: (snapshot: SessionDetailResponse) => void;
  /** Seeds this (freshly-started, ad-hoc) session with exercises + empty row
   * counts imported from a previous workout — either "Repeat" (TrainingTab)
   * or the empty-state "Import from a previous workout" action below. Read
   * once via `useState` initializers, so this only has an effect on the
   * render where the component first mounts with a non-empty plan. */
  seedPlan?: ImportPlanItem[];
}

function elapsedSecFrom(startedAt: string): number {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
  );
}

/** `m:ss` below an hour, `h:mm:ss` at/past 60 minutes — a plain `m:ss`
 * rendered a 7-hour session as `435:00`. */
function fmtElapsed(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The ticking clock in the meta line. Its own component so the 1 s tick
 * re-renders only this <Text>, not the whole session tree (that per-second
 * full re-render competed with set logging for the JS thread — toast lag,
 * 2026-10-04). `frozenSec` set = past session: no interval at all.
 */
function Elapsed({
  startedAt,
  frozenSec,
}: {
  startedAt: string;
  frozenSec: number | null;
}) {
  const [sec, setSec] = useState(() => elapsedSecFrom(startedAt));
  // No immediate re-sync on `startedAt` change — the next tick self-corrects
  // within a second, and it avoids a synchronous setState in the effect body.
  useEffect(() => {
    if (frozenSec != null) return;
    const id = setInterval(() => setSec(elapsedSecFrom(startedAt)), 1000);
    return () => clearInterval(id);
  }, [startedAt, frozenSec]);
  return <Text>{fmtElapsed(frozenSec ?? sec)}</Text>;
}

// Local-only block for an exercise picked but not yet logged. Not prescribed,
// so ExerciseBlock never displays these target_* values.
const ADHOC_DEFAULTS = {
  target_sets: 3,
  target_reps: 10,
  target_weight_kg: null,
  target_rest_sec: 60,
  is_prescribed: false,
};

export function SessionScreen({
  session,
  onBack,
  onFinished,
  seedPlan,
}: Props) {
  const { data: prefs } = usePreferences();
  const { data: prs } = usePRs();
  const logSet = useLogSet();
  const updateSet = useUpdateSet();
  const deleteSet = useDeleteSet();
  const finishSession = useFinishSession();
  const deleteSession = useDeleteSession();
  const renameSession = useRenameSession();
  const restTimer = useRestTimer(prefs?.default_rest_sec ?? 90);

  const weightUnit = (prefs?.weight_unit ?? "lb") as WeightUnit;
  // An empty/self-started session has no workout. Only gates the empty-state
  // "Import from a previous workout" card — set rows behave identically in both
  // flows (bug 2026-10-04); the per-block target line keys off `is_prescribed`.
  const isAdHoc = session.workout_id == null;
  // A completed session re-opened from My Workouts for editing. Elapsed
  // freezes (shows the recorded duration instead of ticking), Finish
  // becomes a plain Done/close, and started_at/ended_at/local_date are
  // never touched — see AGENTS.md ⚠️ architecture-change section.
  const isPast = session.status === "completed";

  const [pickerOpen, setPickerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // Seeded once from `seedPlan` at mount (Repeat / empty-state import both
  // land here): the initial pending-exercise list plus a per-exercise empty
  // row count. `useState` initializers run exactly once per mount, which is
  // safe because TrainingTab only ever mounts this component fresh for a
  // session that's about to receive a seed (see its Repeat conflict guard).
  const [pendingExercises, setPendingExercises] = useState<ExerciseResponse[]>(
    () => seedPlan?.map((p) => p.exercise) ?? [],
  );
  // Per-exercise row count (logged + empty rows), seeded by imports and changed
  // by "Add additional set" / row deletes. Lives here rather than in
  // ExerciseBlock because a pending block remounts as a server block when its
  // first set is logged, and the user's row count must survive that.
  // Missing entry = ExerciseBlock's default (target sets if prescribed, else 1).
  const [rowCounts, setRowCounts] = useState<Map<string, number>>(
    () => new Map((seedPlan ?? []).map((p) => [p.exercise.id, p.rows])),
  );
  const setRowsFor = (exerciseId: string, rows: number) =>
    setRowCounts((prev) => new Map(prev).set(exerciseId, rows));
  // Prescribed exercises the user removed from THIS session view. The server
  // always returns prescribed blocks, so removal is client-side only (the
  // coach's workout is untouched; reopening the session shows them again).
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [demo, setDemo] = useState<{ ytId: string; name: string } | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(session.name);

  const commitTitle = () => {
    const next = titleDraft.trim();
    setEditingTitle(false);
    if (!next || next === session.name) {
      setTitleDraft(session.name);
      return;
    }
    renameSession.mutate(
      { id: session.id, name: next },
      {
        onError: (err) => {
          setTitleDraft(session.name);
          Toast.show({
            type: "error",
            text1: "Could not rename",
            text2: err.message,
          });
        },
      },
    );
  };

  const prById = useMemo(() => {
    const m = new Map<string, PersonalRecordResponse>();
    for (const p of prs ?? []) m.set(p.exercise_id, p);
    return m;
  }, [prs]);

  const visibleBlocks = useMemo(
    () => session.blocks.filter((b) => !hiddenIds.has(b.exercise.id)),
    [session.blocks, hiddenIds],
  );
  const blockedExerciseIds = useMemo(
    () => new Set(visibleBlocks.map((b) => b.exercise.id)),
    [visibleBlocks],
  );
  // Exercises the user tapped "Add" on but hasn't logged a first set for
  // yet — the server only materializes an ad-hoc block once it has at
  // least one set, so these render as empty local-only blocks until
  // then (mirrors the old TodayView's `pinned` pattern).
  // Filtered against ALL server blocks (hidden ones included) so a hidden
  // prescribed exercise never renders twice.
  const serverIds = new Set(session.blocks.map((b) => b.exercise.id));
  const visiblePending = pendingExercises.filter((e) => !serverIds.has(e.id));

  const onLogSet = (
    exerciseId: string,
    weight: number,
    reps: number,
    kind: SetKind,
  ) => {
    logSet.mutate(
      {
        session_id: session.id,
        exercise_id: exerciseId,
        weight,
        weight_unit: weightUnit,
        reps,
        kind,
      },
      {
        onSuccess: (data) => {
          Toast.show({
            type: data.is_pr ? "pr" : "success",
            text1: data.is_pr ? "New PR!" : "Set logged",
            text2: `${weight} ${weightUnit} × ${reps}`,
          });
        },
        onError: (err) =>
          Toast.show({
            type: "error",
            text1: "Could not save set",
            text2: err.message,
          }),
      },
    );
  };

  const onUpdateSetFn = (id: number, weight: number, reps: number) => {
    if (id < 0) return; // optimistic placeholder, server response is about to replace it
    updateSet.mutate(
      {
        id,
        body: { weight, weight_unit: weightUnit, reps },
        sessionId: session.id,
      },
      {
        onError: (err) =>
          Toast.show({
            type: "error",
            text1: "Could not update set",
            text2: err.message,
          }),
      },
    );
  };

  const onDeleteSetFn = (id: number) => {
    if (id < 0) return;
    deleteSet.mutate(
      { id, sessionId: session.id },
      {
        onSuccess: () => Toast.show({ type: "success", text1: "Set removed" }),
        onError: (err) =>
          Toast.show({
            type: "error",
            text1: "Could not delete set",
            text2: err.message,
          }),
      },
    );
  };

  // Deleting a server block's only logged set while it still has empty rows: an
  // ad-hoc block would vanish from the server response, so keep it on screen
  // as a pending (local) block. Prescribed blocks are always returned anyway.
  const onDeleteBlockSet = (block: SessionExerciseBlock, id: number) => {
    if (!block.is_prescribed && block.sets.length === 1) {
      setPendingExercises((p) =>
        p.some((x) => x.id === block.exercise.id) ? p : [...p, block.exercise],
      );
    }
    onDeleteSetFn(id);
  };

  // There is no "remove exercise" endpoint — deleting every set in the block is
  // what makes the server stop materializing an ad-hoc block. Prescribed blocks
  // are always materialized, so they're also hidden client-side via `hiddenIds`.
  // `s.id < 0` rows are optimistic placeholders that haven't round-tripped yet;
  // they'll be replaced/removed by their own in-flight mutation, not this one.
  const removeExercise = (block: SessionExerciseBlock) => {
    const idsToDelete = block.sets.filter((s) => s.id >= 0).map((s) => s.id);
    setPendingExercises((p) => p.filter((x) => x.id !== block.exercise.id));
    setRowCounts((prev) => {
      const next = new Map(prev);
      next.delete(block.exercise.id);
      return next;
    });
    if (block.is_prescribed) {
      setHiddenIds((prev) => new Set(prev).add(block.exercise.id));
    }
    if (idsToDelete.length === 0) {
      Toast.show({ type: "success", text1: "Exercise removed" });
      return;
    }
    Promise.allSettled(
      idsToDelete.map(
        (id) =>
          new Promise<void>((resolve) => {
            deleteSet.mutate(
              { id, sessionId: session.id },
              { onSettled: () => resolve() },
            );
          }),
      ),
    ).then(() => Toast.show({ type: "success", text1: "Exercise removed" }));
  };

  const addExercise = (ex: ExerciseResponse) => {
    if (hiddenIds.has(ex.id)) {
      // Re-adding a removed prescribed exercise just un-hides it.
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(ex.id);
        return next;
      });
    } else if (
      !blockedExerciseIds.has(ex.id) &&
      !pendingExercises.some((p) => p.id === ex.id)
    ) {
      setPendingExercises((p) => [...p, ex]);
    }
    setPickerOpen(false);
  };

  // "Import from a previous workout" (empty-state entry point — the Repeat
  // entry point goes through TrainingTab's `seedPlan` prop instead, since
  // that one starts a brand-new session). Dedupe: an exercise already in
  // this session (logged or pending) is skipped rather than double-added or
  // merged — importing again just adds nothing for it.
  const onImportPlan = (plan: ImportPlanItem[]) => {
    const existingIds = new Set([
      ...blockedExerciseIds,
      ...pendingExercises.map((p) => p.id),
    ]);
    const additions = plan.filter((p) => !existingIds.has(p.exercise.id));
    if (additions.length > 0) {
      setRowCounts((prev) => {
        const next = new Map(prev);
        for (const p of additions) next.set(p.exercise.id, p.rows);
        return next;
      });
      setPendingExercises((prev) => [
        ...prev,
        ...additions.map((p) => p.exercise),
      ]);
    }
    const skipped = plan.length - additions.length;
    Toast.show({
      type: "success",
      text1:
        additions.length > 0
          ? `Imported ${additions.length} exercise${additions.length === 1 ? "" : "s"}`
          : "Nothing new to import",
      text2: skipped > 0 ? `${skipped} already in this workout` : undefined,
    });
  };

  const onFinish = () => {
    finishSession.mutate(
      { id: session.id },
      {
        onSuccess: (finished) => onFinished?.(finished),
        onError: (err) =>
          Toast.show({
            type: "error",
            text1: "Could not finish session",
            text2: err.message,
          }),
      },
    );
  };

  // Hard delete (DELETE /me/sessions/{id}) for both a live session and a past
  // one reopened from My Workouts — the server drops every set and recomputes
  // the affected PRs.
  const onDelete = () => {
    deleteSession.mutate(
      { id: session.id },
      {
        onSuccess: () => {
          Toast.show({ type: "success", text1: "Workout deleted" });
          onBack?.();
        },
        onError: (err) =>
          Toast.show({
            type: "error",
            text1: "Could not delete workout",
            text2: err.message,
          }),
      },
    );
  };

  const confirmDelete = () => {
    Alert.alert(
      "Delete this workout?",
      `Are you sure you want to delete this session? `,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: onDelete },
      ],
    );
  };

  // Latest handlers, read at CALL time. ExerciseBlock is memoized and skips
  // re-rendering when its data is unchanged, so the closures it holds may be
  // from an older render — routing through this ref means they never run
  // stale logic.
  const handlers = useRef({
    onLogSet,
    onUpdateSetFn,
    onDeleteSetFn,
    onDeleteBlockSet,
    removeExercise,
    setRowsFor,
  });
  useLayoutEffect(() => {
    handlers.current = {
      onLogSet,
      onUpdateSetFn,
      onDeleteSetFn,
      onDeleteBlockSet,
      removeExercise,
      setRowsFor,
    };
  });

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 32, gap: space.xl }}
      stickyHeaderIndices={[0]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    >
      {/* Index 0 — sticky session header (DESIGN.md §3.4). Opaque background
       * so scrolled content disappears beneath it; a hairline bottom edge
       * separates it from the timer/cards flowing underneath. */}
      <View
        className="bg-background border-b border-border"
        style={{ paddingTop: 4, paddingBottom: 10, gap: 2 }}
      >
        {/* Row 1 — back · title (flexes, tap to rename) · overflow · Finish.
         * Finish owns the top-right corner; the title itself is the rename
         * affordance (no separate pencil). */}
        <View className="flex-row items-center gap-3" style={{ minHeight: 44 }}>
          <Pressable
            onPress={() => onBack?.()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 8 }}
            className="active:opacity-70"
            style={{ flexShrink: 0 }}
          >
            <ChevronLeft size={20} color={colors.mutedForeground} />
          </Pressable>

          {editingTitle ? (
            <TextInput
              value={titleDraft}
              onChangeText={setTitleDraft}
              onBlur={commitTitle}
              onSubmitEditing={commitTitle}
              autoFocus
              returnKeyType="done"
              maxLength={200}
              maxFontSizeMultiplier={1.3}
              className="flex-1 text-heading text-foreground border-b border-border"
              style={{ minWidth: 0 }}
            />
          ) : (
            <Pressable
              onPress={() => {
                setTitleDraft(session.name);
                setEditingTitle(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Edit session title"
              className="flex-1 active:opacity-70"
              style={{ minWidth: 0 }}
            >
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                maxFontSizeMultiplier={1.3}
                className="text-heading text-foreground"
                style={{ minWidth: 0 }}
              >
                {session.name}
              </Text>
            </Pressable>
          )}

          {/* Delete — live or past. Sits left of Finish/Done; confirms first. */}
          <IconButton
            onPress={confirmDelete}
            accessibilityLabel="Delete workout"
            backgroundColor="transparent"
            disabled={deleteSession.isPending}
            style={{ flexShrink: 0 }}
          >
            <Trash2 size={19} color={colors.mutedForeground} />
          </IconButton>

          {isPast ? (
            // A completed session has nothing to "finish" — this is a plain
            // close: it never PATCHes status, and never touches
            // started_at/ended_at/local_date (AGENTS.md ⚠️ architecture change).
            <Button
              label="Done"
              size="sm"
              onPress={() => onBack?.()}
              style={{ flexShrink: 0 }}
            />
          ) : (
            <Button
              label={finishSession.isPending ? "Saving…" : "Finish"}
              size="sm"
              loading={finishSession.isPending}
              onPress={onFinish}
              style={{ flexShrink: 0 }}
            />
          )}
        </View>

        {/* Row 2 — meta line: elapsed · sets · volume. For a past session
         * this reads as a record (frozen duration), not a live clock. */}
        <Text
          className="text-caption text-muted-foreground"
          maxFontSizeMultiplier={1.3}
          style={tabular}
        >
          <Elapsed
            startedAt={session.started_at}
            frozenSec={isPast ? (session.duration_sec ?? 0) : null}
          />{" "}
          {isPast ? "·" : "elapsed ·"} {session.total_sets} sets ·{" "}
          {fmtWeight(session.total_volume_kg, weightUnit)} {weightUnit}
        </Text>
      </View>

      <RestTimerBar
        remainingSec={restTimer.remainingSec}
        durationSec={restTimer.durationSec}
        isRunning={restTimer.isRunning}
        onStart={restTimer.start}
        onPause={restTimer.pause}
        onRestart={restTimer.restart}
        onAddTime={restTimer.addTime}
        onSetDuration={restTimer.setDuration}
      />

      <View style={{ gap: space.md }}>
        {visibleBlocks.map((block) => (
          <Card key={block.exercise.id}>
            <ExerciseBlock
              block={block}
              weightUnit={weightUnit}
              pr={prById.get(block.exercise.id)}
              onLogSet={(w, r, k) =>
                handlers.current.onLogSet(block.exercise.id, w, r, k)
              }
              onUpdateSet={(id, w, r) =>
                handlers.current.onUpdateSetFn(id, w, r)
              }
              onDeleteSet={(id) => handlers.current.onDeleteBlockSet(block, id)}
              onPlayDemo={() =>
                block.exercise.yt_id &&
                setDemo({
                  ytId: block.exercise.yt_id,
                  name: block.exercise.name,
                })
              }
              onRemoveExercise={() => handlers.current.removeExercise(block)}
              rows={rowCounts.get(block.exercise.id)}
              onRowsChange={(n) =>
                handlers.current.setRowsFor(block.exercise.id, n)
              }
            />
          </Card>
        ))}

        {visiblePending.map((ex) => {
          const syntheticBlock: SessionExerciseBlock = {
            exercise: ex,
            order_index: 9999,
            ...ADHOC_DEFAULTS,
            prescription_notes: null,
            sets: [],
            last_time: [],
          };
          return (
            <Card key={ex.id}>
              <ExerciseBlock
                block={syntheticBlock}
                weightUnit={weightUnit}
                pr={prById.get(ex.id)}
                onLogSet={(w, r, k) =>
                  handlers.current.onLogSet(ex.id, w, r, k)
                }
                onUpdateSet={(id, w, r) =>
                  handlers.current.onUpdateSetFn(id, w, r)
                }
                onDeleteSet={(id) => handlers.current.onDeleteSetFn(id)}
                onPlayDemo={() =>
                  ex.yt_id && setDemo({ ytId: ex.yt_id, name: ex.name })
                }
                onRemoveExercise={() =>
                  handlers.current.removeExercise(syntheticBlock)
                }
                rows={rowCounts.get(ex.id)}
                onRowsChange={(n) => handlers.current.setRowsFor(ex.id, n)}
              />
            </Card>
          );
        })}
      </View>

      {isAdHoc && visibleBlocks.length === 0 && visiblePending.length === 0 && (
        <View className="items-center justify-center border border-dashed border-border rounded-lg py-10 px-6 bg-muted/40 gap-4">
          <Text
            className="text-body text-foreground text-center"
            maxFontSizeMultiplier={1.3}
          >
            No exercises yet — add your first one, or import a previous workout.
          </Text>
          <Button
            label="Import from a previous workout"
            variant="ghost"
            size="md"
            onPress={() => setImportOpen(true)}
          />
        </View>
      )}

      <Button
        label="Add exercise"
        size="lg"
        onPress={() => setPickerOpen(true)}
        disabled={finishSession.isPending}
        leftIcon={
          <Plus size={16} color={colors.primaryForeground} strokeWidth={3} />
        }
      />

      {pickerOpen && (
        <ExercisePickerSheet
          excludeIds={[
            ...blockedExerciseIds,
            ...pendingExercises.map((p) => p.id),
          ]}
          onPick={addExercise}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {importOpen && (
        <ImportWorkoutSheet
          excludeSessionId={session.id}
          onImport={onImportPlan}
          onClose={() => setImportOpen(false)}
        />
      )}

      {demo && (
        <DemoVideoSheet
          ytId={demo.ytId}
          exerciseName={demo.name}
          onClose={() => setDemo(null)}
        />
      )}
    </ScrollView>
  );
}

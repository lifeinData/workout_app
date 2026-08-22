import { View, Text, Pressable, Modal, TextInput, FlatList } from 'react-native';
import { Pencil, Plus, Search } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import Toast from 'react-native-toast-message';
import { ExerciseBlock } from './ExerciseBlock';
import { RestTimerBar } from './RestTimerBar';
import { DemoVideoSheet } from './DemoVideoSheet';
import { SessionSummarySheet } from './SessionSummarySheet';
import { useRestTimer } from '@/hooks/use-rest-timer';
import {
  useAbandonSession,
  useDeleteSet,
  useExercises,
  useFinishSession,
  useLogSet,
  usePRs,
  usePreferences,
  useRenameSession,
  useUpdateSet,
} from '@/lib/queries';
import { fmtWeight, type WeightUnit } from '@/lib/units';
import type { ExerciseResponse, PersonalRecordResponse, SessionDetailResponse, SessionExerciseBlock, SetKind } from '@/lib/api';

interface Props {
  session: SessionDetailResponse;
}

function elapsedSecFrom(startedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
}

function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const ADHOC_DEFAULTS = { target_sets: 3, target_reps_low: 8, target_reps_high: 12, target_rest_sec: 90 };

export function SessionScreen({ session }: Props) {
  const { data: prefs } = usePreferences();
  const { data: prs } = usePRs();
  const logSet = useLogSet();
  const updateSet = useUpdateSet();
  const deleteSet = useDeleteSet();
  const finishSession = useFinishSession();
  const abandonSession = useAbandonSession();
  const renameSession = useRenameSession();
  const restTimer = useRestTimer();

  const weightUnit = (prefs?.weight_unit ?? 'lb') as WeightUnit;
  const defaultRestSec = prefs?.default_rest_sec ?? ADHOC_DEFAULTS.target_rest_sec;

  const [elapsedSec, setElapsedSec] = useState(() => elapsedSecFrom(session.started_at));
  // No immediate re-sync call here on `started_at` change (e.g. this
  // screen staying mounted across finishing one session and starting
  // the next) — the 1s tick below self-corrects within a second,
  // which is an imperceptible display glitch, and avoids calling
  // setState synchronously in the effect body.
  useEffect(() => {
    const id = setInterval(() => setElapsedSec(elapsedSecFrom(session.started_at)), 1000);
    return () => clearInterval(id);
  }, [session.started_at]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingExercises, setPendingExercises] = useState<ExerciseResponse[]>([]);
  const [demo, setDemo] = useState<{ ytId: string; name: string } | null>(null);
  const [finishedSnapshot, setFinishedSnapshot] = useState<SessionDetailResponse | null>(null);
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
          Toast.show({ type: 'error', text1: 'Could not rename', text2: err.message });
        },
      }
    );
  };

  const prById = useMemo(() => {
    const m = new Map<string, PersonalRecordResponse>();
    for (const p of prs ?? []) m.set(p.exercise_id, p);
    return m;
  }, [prs]);

  const blockedExerciseIds = useMemo(
    () => new Set(session.blocks.map((b) => b.exercise.id)),
    [session.blocks]
  );
  // Exercises the user tapped "Add" on but hasn't logged a first set for
  // yet — the server only materializes an ad-hoc block once it has at
  // least one set, so these render as empty local-only blocks until
  // then (mirrors the old TodayView's `pinned` pattern).
  const visiblePending = pendingExercises.filter((e) => !blockedExerciseIds.has(e.id));

  const onLogSet = (exerciseId: string, weight: number, reps: number, kind: SetKind) => {
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
            type: 'success',
            text1: data.is_pr ? 'New PR!' : 'Set logged',
            text2: `${weight} ${weightUnit} × ${reps}`,
          });
        },
        onError: (err) =>
          Toast.show({ type: 'error', text1: 'Could not save set', text2: err.message }),
      }
    );
  };

  const onUpdateSetFn = (id: number, weight: number, reps: number) => {
    if (id < 0) return; // optimistic placeholder, server response is about to replace it
    updateSet.mutate(
      { id, body: { weight, weight_unit: weightUnit, reps } },
      {
        onError: (err) =>
          Toast.show({ type: 'error', text1: 'Could not update set', text2: err.message }),
      }
    );
  };

  const onDeleteSetFn = (id: number) => {
    if (id < 0) return;
    deleteSet.mutate(id, {
      onSuccess: () => Toast.show({ type: 'success', text1: 'Set removed' }),
      onError: (err) =>
        Toast.show({ type: 'error', text1: 'Could not delete set', text2: err.message }),
    });
  };

  const addExercise = (ex: ExerciseResponse) => {
    if (!blockedExerciseIds.has(ex.id) && !pendingExercises.some((p) => p.id === ex.id)) {
      setPendingExercises((p) => [...p, ex]);
    }
    setPickerOpen(false);
  };

  const onFinish = () => {
    finishSession.mutate(
      { id: session.id },
      {
        onSuccess: (finished) => setFinishedSnapshot(finished),
        onError: (err) =>
          Toast.show({ type: 'error', text1: 'Could not finish session', text2: err.message }),
      }
    );
  };

  const onAbandon = () => {
    abandonSession.mutate(
      { id: session.id },
      {
        onError: (err) =>
          Toast.show({ type: 'error', text1: 'Could not abandon session', text2: err.message }),
      }
    );
  };

  return (
    <View className="space-y-5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[10px] uppercase tracking-0.14em text-muted-foreground">
            {fmtElapsed(elapsedSec)} elapsed
          </Text>
          {editingTitle ? (
            <TextInput
              value={titleDraft}
              onChangeText={setTitleDraft}
              onBlur={commitTitle}
              onSubmitEditing={commitTitle}
              autoFocus
              returnKeyType="done"
              maxLength={200}
              className="text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.025em] text-foreground border-b border-border"
            />
          ) : (
            <Pressable
              onPress={() => {
                setTitleDraft(session.name);
                setEditingTitle(true);
              }}
              className="flex-row items-center gap-2"
            >
              <Text className="text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.025em] text-foreground">
                {session.name}
              </Text>
              <Pencil size={14} color="#8b7268" />
            </Pressable>
          )}
          <Text className="text-xs text-muted-foreground mt-1">
            {session.total_sets} sets · {fmtWeight(session.total_volume_kg, weightUnit)} {weightUnit}
          </Text>
        </View>
        <View className="items-end gap-2">
          <Pressable
            onPress={onFinish}
            disabled={finishSession.isPending}
            className="px-4 py-2.5 rounded-2xl bg-primary"
          >
            <Text className="text-primary-foreground font-semibold">
              {finishSession.isPending ? 'Saving…' : 'Finish'}
            </Text>
          </Pressable>
          <Pressable onPress={onAbandon} disabled={abandonSession.isPending}>
            <Text className="text-xs text-muted-foreground">Discard session</Text>
          </Pressable>
        </View>
      </View>

      {restTimer.isRunning && (
        <RestTimerBar
          remainingSec={restTimer.remainingSec}
          targetSec={restTimer.targetSec}
          onAddTime={restTimer.addTime}
          onSkip={restTimer.skip}
        />
      )}

      <View className="space-y-6">
        {session.blocks.map((block, i) => (
          <View
            key={block.exercise.id}
            className={i === 0 ? '' : 'pt-6'}
            style={i > 0 ? { borderTopWidth: 1, borderTopColor: '#f0d9ce' } : undefined}
          >
            <ExerciseBlock
              block={block}
              weightUnit={weightUnit}
              pr={prById.get(block.exercise.id)}
              onLogSet={(w, r, k) => onLogSet(block.exercise.id, w, r, k)}
              onUpdateSet={onUpdateSetFn}
              onDeleteSet={onDeleteSetFn}
              onPlayDemo={() =>
                block.exercise.yt_id &&
                setDemo({ ytId: block.exercise.yt_id, name: block.exercise.name })
              }
              onSetLogged={() => restTimer.start(block.target_rest_sec || defaultRestSec)}
            />
          </View>
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
            <View
              key={ex.id}
              className="pt-6"
              style={{ borderTopWidth: 1, borderTopColor: '#f0d9ce' }}
            >
              <ExerciseBlock
                block={syntheticBlock}
                weightUnit={weightUnit}
                pr={prById.get(ex.id)}
                onLogSet={(w, r, k) => onLogSet(ex.id, w, r, k)}
                onUpdateSet={onUpdateSetFn}
                onDeleteSet={onDeleteSetFn}
                onPlayDemo={() => ex.yt_id && setDemo({ ytId: ex.yt_id, name: ex.name })}
                onSetLogged={() => restTimer.start(ADHOC_DEFAULTS.target_rest_sec || defaultRestSec)}
              />
            </View>
          );
        })}
      </View>

      <Pressable
        onPress={() => setPickerOpen(true)}
        className="w-full flex-row items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary shadow-sm"
      >
        <Plus size={16} color="#ffffff" strokeWidth={3} />
        <Text className="text-primary-foreground font-semibold">Add exercise</Text>
      </Pressable>

      {pickerOpen && (
        <ExercisePicker
          excludeIds={[...blockedExerciseIds, ...pendingExercises.map((p) => p.id)]}
          onPick={addExercise}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {demo && <DemoVideoSheet ytId={demo.ytId} exerciseName={demo.name} onClose={() => setDemo(null)} />}

      {finishedSnapshot && (
        <SessionSummarySheet
          session={finishedSnapshot}
          weightUnit={weightUnit}
          onClose={() => setFinishedSnapshot(null)}
        />
      )}
    </View>
  );
}

/** Debounced server-side search (`GET /exercises?q=`) — replaces the
 * old client-side filter over the full 1,000+ row catalog. */
function ExercisePicker({
  excludeIds,
  onPick,
  onClose,
}: {
  excludeIds: string[];
  onPick: (ex: ExerciseResponse) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: exercises, isLoading } = useExercises({
    search: debounced || undefined,
    limit: 50,
  });

  const excludeSet = new Set(excludeIds);
  const filtered = (exercises ?? []).filter((e) => !excludeSet.has(e.id));

  return (
    <Modal visible animationType="slide" transparent>
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-foreground/40" onPress={onClose} />
        <View className="bg-card rounded-t-3xl border-t border-x border-border" style={{ maxHeight: '85%' }}>
          <View className="p-5 border-b border-border">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-lg font-semibold text-card-foreground tracking-tight">Add exercise</Text>
              <Pressable onPress={onClose}>
                <Text className="text-sm text-muted-foreground">Cancel</Text>
              </Pressable>
            </View>
            <View className="flex-row items-center bg-muted rounded-xl px-3">
              <Search size={16} color="#8b7268" />
              <TextInput
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder="Search exercises or muscle group"
                placeholderTextColor="#8b7268"
                className="flex-1 py-2.5 px-2 text-sm text-card-foreground"
              />
            </View>
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(e) => e.id}
            className="p-3"
            renderItem={({ item: e }) => (
              <Pressable
                onPress={() => onPick(e)}
                className="flex-row items-center justify-between px-3 py-3 rounded-xl"
              >
                <View className="flex-1">
                  <Text className="text-sm text-card-foreground">{e.name}</Text>
                  <Text className="text-[10px] uppercase tracking-0.14em text-muted-foreground mt-0.5">
                    {e.muscle_group}
                  </Text>
                </View>
                <Text className="text-xs text-primary">Add</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <View className="py-10 items-center px-5">
                <Text className="text-sm text-muted-foreground">
                  {isLoading ? 'Searching…' : 'No matches.'}
                </Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

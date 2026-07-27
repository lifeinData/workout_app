import { View, Text, Pressable, Modal, TextInput, FlatList, ActivityIndicator } from 'react-native';
import { Plus, Search, Flame, Trophy, Timer } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ExerciseLogger } from './ExerciseLogger';
import { DemoVideoSheet } from './DemoVideoSheet';
import { useExercises, useHistory } from '@/lib/queries';
import type { ExerciseResponse } from '@/lib/api';
import { utcDateKey } from '@/lib/dates';

const todayLabel = () =>
  new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

export function TodayView() {
  // Server stores history rows in UTC-day buckets, so the request MUST
  // pass UTC dates to be consistent with the server's row keys.
  const serverToday = utcDateKey(new Date());
  const { data: history, isLoading: historyLoading, error: historyError } = useHistory(serverToday, serverToday);
  const { data: exercises, isLoading: exercisesLoading, error: exercisesError } = useExercises();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [demo, setDemo] = useState<{ ytId: string; name: string } | null>(null);

  const allExercises = exercises ?? [];
  const byId = useMemo(() => {
    const m = new Map<string, ExerciseResponse>();
    for (const e of allExercises) m.set(e.id, e);
    return m;
  }, [allExercises]);

  const todayHistory = history?.history?.[serverToday] ?? {};
  const activeIds = useMemo(() => {
    return Object.entries(todayHistory)
      .filter(([, sets]) => sets.length > 0)
      .sort((a, b) =>
        (a[1][0]?.timestamp ?? '').localeCompare(b[1][0]?.timestamp ?? '')
      )
      .map(([id]) => id);
  }, [todayHistory]);

  const [pinned, setPinned] = useState<string[]>([]);
  const visibleIds = useMemo(() => {
    const set = new Set([...activeIds, ...pinned]);
    return Array.from(set);
  }, [activeIds, pinned]);

  const addExercise = (id: string) => {
    if (!visibleIds.includes(id)) setPinned((p) => [...p, id]);
    setPickerOpen(false);
  };

  const allTodaysSets = Object.values(todayHistory).flat();
  const totalSets = allTodaysSets.length;
  const totalVolume = allTodaysSets.reduce((v, s) => v + s.weight * s.reps, 0);
  const firstTs = allTodaysSets
    .map((s) => s.timestamp)
    .sort()[0];
  const durationMin = firstTs
    ? Math.max(1, Math.round((Date.now() - new Date(firstTs).getTime()) / 60000))
    : 0;

  return (
    <View className="space-y-5">
      <View>
        <Text className="text-[10px] uppercase tracking-0.14em text-muted-foreground">
          {todayLabel()}
        </Text>
        <Text className="text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.025em] text-foreground">Today's session</Text>
      </View>

      <View className="flex-row gap-2">
        <Stat icon={<Flame size={14} color="#8b7268" />} label="Sets" value={String(totalSets)} />
        <Stat icon={<Trophy size={14} color="#8b7268" />} label="Volume" value={`${totalVolume.toLocaleString()}`} suffix="lb" />
        <Stat icon={<Timer size={14} color="#8b7268" />} label="Duration" value={durationMin ? String(durationMin) : '—'} suffix={durationMin ? 'min' : ''} />
      </View>

      <Pressable
        onPress={() => setPickerOpen(true)}
        className="w-full flex-row items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary shadow-sm"
      >
        <Plus size={16} color="#ffffff" strokeWidth={3} />
        <Text className="text-primary-foreground font-semibold">Add exercise</Text>
      </Pressable>

      {exercisesError || historyError ? (
        <View className="rounded-2xl border border-dashed border-destructive px-5 py-6">
          <Text className="text-sm text-destructive font-semibold mb-1">
            Couldn't load today's session
          </Text>
          <Text className="text-xs text-muted-foreground">
            {(exercisesError || historyError)?.message ?? 'Unknown error'}
          </Text>
          <Text className="text-xs text-muted-foreground mt-2">
            Check that the backend is running and your phone is on the same WiFi.
            apiBaseUrl in app.json: http://10.0.2.2:8000 (emulator) or your laptop's LAN IP.
          </Text>
        </View>
      ) : exercisesLoading || historyLoading ? (
        <View className="py-10 items-center">
          <ActivityIndicator />
        </View>
      ) : visibleIds.length === 0 ? (
        <View className="rounded-2xl border border-dashed border-border px-5 py-10 items-center space-y-2">
          <Text className="text-sm text-card-foreground">Nothing logged yet</Text>
          <Text className="text-xs text-muted-foreground">Tap <Text className="text-primary">Add exercise</Text> to start your session.</Text>
        </View>
      ) : (
        <View className="space-y-6">
          {visibleIds.map((id, i) => {
            const ex = byId.get(id);
            if (!ex) return null;
            return (
              <View
                key={id}
                className={i === 0 ? '' : 'pt-6'}
                style={i > 0 ? { borderTopWidth: 1, borderTopColor: '#f0d9ce' } : undefined}
              >
                <ExerciseLogger
                  exercise={ex}
                  onPlayDemo={() =>
                    ex.yt_id && setDemo({ ytId: ex.yt_id, name: ex.name })
                  }
                  todaysSets={todayHistory[ex.id] ?? []}
                />
              </View>
            );
          })}
        </View>
      )}

      {pickerOpen && (
        <ExercisePicker
          exercises={allExercises}
          activeIds={visibleIds}
          onPick={addExercise}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {demo && <DemoVideoSheet ytId={demo.ytId} exerciseName={demo.name} onClose={() => setDemo(null)} />}
    </View>
  );
}

function Stat({ icon, label, value, suffix }: { icon: React.ReactNode; label: string; value: string; suffix?: string }) {
  return (
    <View className="flex-1 rounded-2xl bg-card border border-border px-3 py-2.5">
      <View className="flex-row items-center gap-1">{icon}<Text className="text-[10px] uppercase tracking-0.14em text-muted-foreground">{label}</Text></View>
      <View className="flex-row mt-1" style={{ alignItems: 'baseline' }}>
        <Text className="text-lg text-card-foreground">{value}</Text>{suffix ? <Text className="text-xs text-muted-foreground ml-1">{suffix}</Text> : null}
      </View>
    </View>
  );
}

function ExercisePicker({
  exercises, activeIds, onPick, onClose,
}: {
  exercises: ExerciseResponse[];
  activeIds: string[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const filtered = exercises.filter(
    (e) =>
      e.name.toLowerCase().includes(q.toLowerCase()) ||
      e.muscle_group.toLowerCase().includes(q.toLowerCase())
  );

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
                value={q}
                onChangeText={setQ}
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
            renderItem={({ item: e }) => {
              const active = activeIds.includes(e.id);
              return (
                <Pressable
                  onPress={() => onPick(e.id)}
                  disabled={active}
                  className={`flex-row items-center justify-between px-3 py-3 rounded-xl ${active ? 'opacity-40' : ''}`}
                >
                  <View className="flex-1">
                    <Text className="text-sm text-card-foreground">{e.name}</Text>
                    <Text className="text-[10px] uppercase tracking-0.14em text-muted-foreground mt-0.5">{e.muscle_group}</Text>
                  </View>
                  <Text className="text-xs text-primary">{active ? 'Added' : 'Add'}</Text>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View className="py-10 items-center px-5">
                {exercises.length === 0 ? (
                  <>
                    <Text className="text-sm text-muted-foreground text-center mb-2">
                      No exercises loaded from server.
                    </Text>
                    <Text className="text-xs text-muted-foreground text-center">
                      Check that the backend is running and reachable.
                    </Text>
                  </>
                ) : (
                  <Text className="text-sm text-muted-foreground">No matches.</Text>
                )}
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

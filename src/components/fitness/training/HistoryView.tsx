import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Trophy } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useExercises, useHistory } from '@/lib/queries';
import { fmtTimeLocal, localDateKey, utcDateKey } from '@/lib/dates';
import type { ExerciseResponse, HistoricalSetResponse } from '@/lib/api';

export function HistoryView() {
  const today = new Date();
  // Server stores dates as UTC YYYY-MM-DD and interprets the /me/history
  // `from`/`to` filter in UTC. Passing local dates causes a set logged
  // at 11:55pm local to silently fall outside the window once the
  // server's UTC-day boundary is crossed. We compute the local date
  // N days ago for the *intent* (a 90-day window) and then convert to
  // the server's UTC convention just before issuing the request.
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const fromStr = utcDateKey(ninetyDaysAgo);
  const toStr = utcDateKey(today);

  const { data: historyResp, isLoading: historyLoading } = useHistory(fromStr, toStr);
  const { data: exercises, isLoading: exercisesLoading } = useExercises({ limit: 500 });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(today);

  const exerciseMap = useMemo(() => {
    const m = new Map<string, ExerciseResponse>();
    for (const e of exercises ?? []) m.set(e.id, e);
    return m;
  }, [exercises]);

  const datesWithHistory = useMemo(() => {
    return new Set(Object.keys(historyResp?.history ?? {}));
  }, [historyResp]);

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];
    for (let i = 0; i < startDayOfWeek; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  }, [currentMonth]);

  const selectedDayHistory = selectedDate ? historyResp?.history?.[selectedDate] : null;

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const formatDate = (date: Date) => localDateKey(date);
  const isToday = (date: Date) =>
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  const isLoading = historyLoading || exercisesLoading;

  return (
    <View className="space-y-4">
      <View className="bg-card rounded-3xl p-4 border border-border shadow-sm">
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center gap-2">
            <CalendarIcon size={20} color="#e87d6f" />
            <Text className="text-base font-semibold text-card-foreground">
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </Text>
          </View>
          <View className="flex-row gap-2">
            <Pressable
              onPress={prevMonth}
              className="w-8 h-8 rounded-lg bg-muted items-center justify-center"
            >
              <ChevronLeft size={16} color="#3d2b26" />
            </Pressable>
            <Pressable
              onPress={nextMonth}
              className="w-8 h-8 rounded-lg bg-muted items-center justify-center"
            >
              <ChevronRight size={16} color="#3d2b26" />
            </Pressable>
          </View>
        </View>

        <View className="flex-row flex-wrap gap-1 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <View key={day} style={{ width: '14.28%' }} className="items-center py-1">
              <Text className="text-xs text-muted-foreground">{day}</Text>
            </View>
          ))}
        </View>

        <View className="flex-row flex-wrap gap-1">
          {calendarDays.map((day, idx) => {
            if (!day) {
              return <View key={`empty-${idx}`} style={{ width: '14.28%', aspectRatio: 1 }} />;
            }
            const dateStr = formatDate(day);
            const hasHistory = datesWithHistory.has(dateStr);
            const isSelected = dateStr === selectedDate;
            const isTodayDate = isToday(day);
            return (
              <Pressable
                key={dateStr}
                onPress={() => setSelectedDate(isSelected ? null : dateStr)}
                style={{
                  width: '14.28%',
                  aspectRatio: 1,
                  borderWidth: isTodayDate && !isSelected ? 2 : 0,
                  borderColor: isTodayDate && !isSelected ? '#e87d6f' : 'transparent',
                }}
                className={`rounded-lg items-center justify-center ${
                  isSelected
                    ? 'bg-primary'
                    : hasHistory
                    ? 'bg-accent'
                    : ''
                }`}
              >
                <Text
                  className={`text-sm ${
                    isSelected
                      ? 'text-primary-foreground'
                      : hasHistory
                      ? 'text-accent-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  {day.getDate()}
                </Text>
                {hasHistory && !isSelected && (
                  <View className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" style={{ left: '50%', marginLeft: -2 }} />
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {isLoading && (
        <View className="py-10 items-center">
          <ActivityIndicator />
        </View>
      )}

      {selectedDayHistory && selectedDate && (
        <View className="bg-card rounded-3xl p-5 border border-border shadow-sm">
          <Text className="text-base font-semibold text-card-foreground mb-4">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
          <View className="space-y-4">
            {Object.entries(selectedDayHistory ?? {}).map(([exerciseId, sets], i) => {
              const exercise = exerciseMap.get(exerciseId);
              return (
                <View
                  key={exerciseId}
                  className="pt-4"
                  style={i > 0 ? { borderTopWidth: 1, borderTopColor: '#f0d9ce' } : undefined}
                >
                  <View className="flex-row items-center gap-2 mb-2">
                    <Text className="text-base font-semibold text-card-foreground">
                      {exercise?.name ?? exerciseId}
                    </Text>
                    {exercise?.pr_trackable && <Trophy size={14} color="#e87d6f" />}
                  </View>
                  {exercise && (
                    <Text className="text-xs text-muted-foreground mb-2">
                      {exercise.muscle_group}
                    </Text>
                  )}
                  <View className="space-y-1">
                    {sets.map((set, idx) => (
                      <SetRow key={set.id} set={set} index={idx} />
                    ))}
                  </View>
                  <Text className="mt-2 text-xs text-muted-foreground">
                    Total volume:{' '}
                    {sets
                      .reduce((sum, s) => sum + s.weight * s.reps, 0)
                      .toLocaleString()}{' '}
                    lb
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {!selectedDate && !isLoading && (
        <View className="bg-muted/50 rounded-3xl p-8 items-center border border-dashed border-border">
          <Text className="text-sm text-muted-foreground text-center">
            Select a date to view your workout history
          </Text>
        </View>
      )}
    </View>
  );
}

function SetRow({ set, index }: { set: HistoricalSetResponse; index: number }) {
  return (
    <View className="flex-row items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
      <Text className="text-sm text-muted-foreground">Set {index + 1}</Text>
      <Text className="text-sm text-card-foreground">
        {set.weight} lb × {set.reps} reps
      </Text>
      <Text className="text-xs text-muted-foreground">{fmtTimeLocal(set.timestamp)}</Text>
    </View>
  );
}

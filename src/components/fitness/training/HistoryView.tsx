import { View, Text, Pressable, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Trophy, Clock, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { usePreferences, useSession, useSessions } from '@/lib/queries';
import { localDateKey } from '@/lib/dates';
import { fmtWeight, type WeightUnit } from '@/lib/units';
import type { SessionSummaryResponse } from '@/lib/api';

/**
 * Calendar marks and the day list both come from `GET /me/sessions`,
 * keyed on the server's `local_date` — the client no longer
 * re-buckets by UTC vs. local timestamp, which is what used to put
 * the "has history" dot on the wrong day for anyone west of UTC.
 */
export function HistoryView() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  const { data: prefs } = usePreferences();
  const weightUnit = (prefs?.weight_unit ?? 'lb') as WeightUnit;

  const monthStart = localDateKey(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1));
  const monthEnd = localDateKey(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0));
  const { data: monthSessions, isLoading } = useSessions(monthStart, monthEnd);

  const datesWithHistory = useMemo(
    () => new Set((monthSessions ?? []).map((s) => s.local_date)),
    [monthSessions]
  );

  const selectedDaySessions = useMemo(() => {
    if (!selectedDate) return [];
    return (monthSessions ?? []).filter((s) => s.local_date === selectedDate);
  }, [monthSessions, selectedDate]);

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

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const isToday = (date: Date) =>
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

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
            const dateStr = localDateKey(day);
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

      {selectedDate && !isLoading && selectedDaySessions.length > 0 && (
        <View className="space-y-3">
          {selectedDaySessions.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              weightUnit={weightUnit}
              onPress={() => setOpenSessionId(s.id)}
            />
          ))}
        </View>
      )}

      {selectedDate && !isLoading && selectedDaySessions.length === 0 && (
        <View className="bg-muted/50 rounded-3xl p-8 items-center border border-dashed border-border">
          <Text className="text-sm text-muted-foreground text-center">No sessions logged this day</Text>
        </View>
      )}

      {!selectedDate && !isLoading && (
        <View className="bg-muted/50 rounded-3xl p-8 items-center border border-dashed border-border">
          <Text className="text-sm text-muted-foreground text-center">
            Select a date to view your workout history
          </Text>
        </View>
      )}

      {openSessionId && (
        <SessionDetailSheet
          sessionId={openSessionId}
          weightUnit={weightUnit}
          onClose={() => setOpenSessionId(null)}
        />
      )}
    </View>
  );
}

function SessionCard({
  session,
  weightUnit,
  onPress,
}: {
  session: SessionSummaryResponse;
  weightUnit: WeightUnit;
  onPress: () => void;
}) {
  const statusLabel =
    session.status === 'abandoned' ? 'Abandoned' : session.status === 'active' ? 'In progress' : null;
  return (
    <Pressable onPress={onPress} className="bg-card rounded-3xl p-5 border border-border shadow-sm">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-base font-semibold text-card-foreground">{session.name}</Text>
        {statusLabel && <Text className="text-xs text-muted-foreground">{statusLabel}</Text>}
      </View>
      <View className="flex-row items-center gap-4">
        <View className="flex-row items-center gap-1">
          <Clock size={12} color="#8b7268" />
          <Text className="text-xs text-muted-foreground">
            {session.duration_sec ? `${Math.round(session.duration_sec / 60)} min` : '—'}
          </Text>
        </View>
        <Text className="text-xs text-muted-foreground">{session.total_sets} sets</Text>
        <Text className="text-xs text-muted-foreground">
          {fmtWeight(session.total_volume_kg, weightUnit)} {weightUnit}
        </Text>
        {session.pr_count > 0 && (
          <View className="flex-row items-center gap-1">
            <Trophy size={12} color="#e87d6f" />
            <Text className="text-xs text-primary">{session.pr_count} PR{session.pr_count > 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function SessionDetailSheet({
  sessionId,
  weightUnit,
  onClose,
}: {
  sessionId: string;
  weightUnit: WeightUnit;
  onClose: () => void;
}) {
  const { data: session, isLoading } = useSession(sessionId);

  return (
    <Modal visible animationType="slide" transparent>
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-foreground/40" onPress={onClose} />
        <View className="bg-card rounded-t-3xl border-t border-x border-border" style={{ maxHeight: '85%' }}>
          <View className="flex-row items-center justify-between p-5 border-b border-border">
            <Text className="text-lg font-semibold text-card-foreground">{session?.name ?? 'Session'}</Text>
            <Pressable onPress={onClose} className="w-9 h-9 rounded-full bg-muted items-center justify-center">
              <X size={18} color="#8b7268" />
            </Pressable>
          </View>
          {isLoading || !session ? (
            <View className="py-10 items-center">
              <ActivityIndicator />
            </View>
          ) : (
            <ScrollView className="px-5 pt-4 pb-6">
              {session.blocks.map((block, i) => (
                <View
                  key={block.exercise.id}
                  className="py-4"
                  style={i > 0 ? { borderTopWidth: 1, borderTopColor: '#f0d9ce' } : undefined}
                >
                  <View className="flex-row items-center gap-2 mb-2">
                    <Text className="text-base font-semibold text-card-foreground">
                      {block.exercise.name}
                    </Text>
                    {block.exercise.pr_trackable && block.sets.some((s) => s.was_pr) && (
                      <Trophy size={14} color="#e87d6f" />
                    )}
                  </View>
                  <View className="space-y-1">
                    {block.sets.map((set, idx) => (
                      <View
                        key={set.id}
                        className="flex-row items-center justify-between bg-muted/40 rounded-lg px-3 py-2"
                      >
                        <Text className="text-sm text-muted-foreground">
                          Set {idx + 1}
                          {set.kind === 'warmup' ? ' · warmup' : ''}
                        </Text>
                        <Text className="text-sm text-card-foreground">
                          {fmtWeight(set.weight_kg, weightUnit)} {weightUnit} × {set.reps} reps
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
              {session.blocks.length === 0 && (
                <Text className="text-sm text-muted-foreground text-center py-8">
                  No sets were logged in this session.
                </Text>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

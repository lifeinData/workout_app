import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Trophy, Clock } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { usePreferences, useSession, useSessions } from '@/lib/queries';
import { localDateKey } from '@/lib/dates';
import { fmtWeight, type WeightUnit } from '@/lib/units';
import type { SessionSummaryResponse } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Sheet } from '@/components/ui/Sheet';
import { colors } from '@/lib/theme';

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

  // History shows FINISHED workouts only. Active (in-progress) and
  // abandoned/discarded sessions are intentionally excluded — an
  // unfinished workout should never appear here (and used to show up
  // uselessly as "Abandoned").
  const completedSessions = useMemo(
    () => (monthSessions ?? []).filter((s) => s.status === 'completed'),
    [monthSessions]
  );

  const datesWithHistory = useMemo(
    () => new Set(completedSessions.map((s) => s.local_date)),
    [completedSessions]
  );

  const selectedDaySessions = useMemo(() => {
    if (!selectedDate) return [];
    return completedSessions.filter((s) => s.local_date === selectedDate);
  }, [completedSessions, selectedDate]);

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
    <View style={{ gap: 20 }}>
      <Card>
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center gap-2">
            <CalendarIcon size={20} color={colors.mutedForeground} />
            <Text maxFontSizeMultiplier={1.3} className="text-heading font-semibold text-card-foreground">
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </Text>
          </View>
          <View className="flex-row gap-2">
            <Pressable
              onPress={prevMonth}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="w-8 h-8 rounded-full bg-muted items-center justify-center"
            >
              <ChevronLeft size={16} color={colors.foreground} />
            </Pressable>
            <Pressable
              onPress={nextMonth}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="w-8 h-8 rounded-full bg-muted items-center justify-center"
            >
              <ChevronRight size={16} color={colors.foreground} />
            </Pressable>
          </View>
        </View>

        <View className="flex-row flex-wrap mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <View key={day} style={{ width: '14.28%' }} className="items-center py-1">
              <Text maxFontSizeMultiplier={1.3} className="text-caption text-muted-foreground">
                {day}
              </Text>
            </View>
          ))}
        </View>

        <View className="flex-row flex-wrap">
          {calendarDays.map((day, idx) => {
            if (!day) {
              return <View key={`empty-${idx}`} style={{ width: '14.28%', aspectRatio: 1 }} />;
            }
            const dateStr = localDateKey(day);
            const hasHistory = datesWithHistory.has(dateStr);
            const isSelected = dateStr === selectedDate;
            const isTodayDate = isToday(day);
            return (
              <View key={dateStr} style={{ width: '14.28%', aspectRatio: 1, padding: 2 }}>
                <Pressable
                  onPress={() => setSelectedDate(isSelected ? null : dateStr)}
                  style={{
                    flex: 1,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isSelected
                      ? colors.primary
                      : hasHistory
                      ? colors.accent
                      : 'transparent',
                    borderWidth: isTodayDate && !isSelected ? 2 : 0,
                    borderColor: colors.primary,
                  }}
                >
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={{ fontVariant: ['tabular-nums'] }}
                    className={`text-body ${
                      isSelected
                        ? 'text-primary-foreground'
                        : hasHistory
                        ? 'text-accent-foreground'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {day.getDate()}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </Card>

      {isLoading && (
        <View className="py-10 items-center">
          <ActivityIndicator />
        </View>
      )}

      {selectedDate && !isLoading && selectedDaySessions.length > 0 && (
        <View style={{ gap: 12 }}>
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
          <Text maxFontSizeMultiplier={1.3} className="text-body text-muted-foreground text-center">
            No sessions logged this day
          </Text>
        </View>
      )}

      {!selectedDate && !isLoading && (
        <View className="bg-muted/50 rounded-3xl p-8 items-center border border-dashed border-border">
          <Text maxFontSizeMultiplier={1.3} className="text-body text-muted-foreground text-center">
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
  const metaParts = [
    session.duration_sec ? `${Math.round(session.duration_sec / 60)} min` : null,
    `${session.total_sets} sets`,
    `${fmtWeight(session.total_volume_kg, weightUnit)} ${weightUnit}`,
  ].filter(Boolean);
  return (
    <Pressable onPress={onPress}>
      <Card padded={false} style={{ padding: 14 }}>
        <View className="flex-row items-center justify-between mb-1">
          <Text
            maxFontSizeMultiplier={1.3}
            className="text-heading font-semibold text-card-foreground"
            numberOfLines={1}
            style={{ flexShrink: 1 }}
          >
            {session.name}
          </Text>
          {statusLabel && (
            <Text maxFontSizeMultiplier={1.3} className="text-caption text-muted-foreground">
              {statusLabel}
            </Text>
          )}
        </View>
        <View className="flex-row items-center gap-1">
          <Clock size={12} color={colors.mutedForeground} />
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ fontVariant: ['tabular-nums'] }}
            className="text-caption text-muted-foreground"
          >
            {metaParts.join(' · ')}
          </Text>
          {session.pr_count > 0 && (
            <View className="flex-row items-center gap-1 ml-2">
              <Trophy size={12} color={colors.primary} />
              <Text
                maxFontSizeMultiplier={1.3}
                style={{ fontVariant: ['tabular-nums'] }}
                className="text-caption text-primary"
              >
                {session.pr_count} PR{session.pr_count > 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>
      </Card>
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
    <Sheet visible onClose={onClose} title={session?.name ?? 'Session'} heightPercent={85}>
      {isLoading || !session ? (
        <View className="py-10 items-center">
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {session.blocks.map((block, i) => (
            <View
              key={block.exercise.id}
              className="py-4"
              style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}
            >
              <View className="flex-row items-center gap-2 mb-2">
                <Text maxFontSizeMultiplier={1.3} className="text-heading font-semibold text-card-foreground">
                  {block.exercise.name}
                </Text>
                {block.exercise.pr_trackable && block.sets.some((s) => s.was_pr) && (
                  <Trophy size={14} color={colors.primary} />
                )}
              </View>
              <View style={{ gap: 4 }}>
                {block.sets.map((set, idx) => (
                  <View
                    key={set.id}
                    className="flex-row items-center justify-between bg-muted rounded-md px-3 py-2"
                  >
                    <Text maxFontSizeMultiplier={1.3} className="text-body text-muted-foreground">
                      Set {idx + 1}
                      {set.kind === 'warmup' ? ' · warmup' : ''}
                    </Text>
                    <Text
                      maxFontSizeMultiplier={1.3}
                      style={{ fontVariant: ['tabular-nums'] }}
                      className="text-body text-card-foreground"
                    >
                      {fmtWeight(set.weight_kg, weightUnit)} {weightUnit} × {set.reps} reps
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
          {session.blocks.length === 0 && (
            <Text maxFontSizeMultiplier={1.3} className="text-body text-muted-foreground text-center py-8">
              No sets were logged in this session.
            </Text>
          )}
        </ScrollView>
      )}
    </Sheet>
  );
}

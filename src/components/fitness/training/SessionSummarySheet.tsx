import { View, Text, Pressable, Modal } from 'react-native';
import { BookmarkPlus, Check, Clock, Flame, Trophy } from 'lucide-react-native';
import { useState } from 'react';
import Toast from 'react-native-toast-message';
import type { SessionDetailResponse } from '@/lib/api';
import type { WeightUnit } from '@/lib/units';
import { fmtWeight } from '@/lib/units';
import { useCreateTemplateFromSession } from '@/lib/queries';

interface Props {
  session: SessionDetailResponse;
  weightUnit: WeightUnit;
  onClose: () => void;
}

function fmtDuration(sec: number | null): string {
  if (!sec) return '—';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

export function SessionSummarySheet({ session, weightUnit, onClose }: Props) {
  const prCount = session.blocks.reduce(
    (sum, b) => sum + b.sets.filter((s) => s.was_pr).length,
    0
  );

  const createTemplate = useCreateTemplateFromSession();
  const [saved, setSaved] = useState(false);
  // Only offer "Save as template" when there's something to template —
  // the server rejects a warmup-only / empty session with a 422.
  const canSaveTemplate = session.total_sets > 0;

  const onSaveTemplate = () => {
    createTemplate.mutate(
      { sessionId: session.id, name: session.name },
      {
        onSuccess: () => {
          setSaved(true);
          Toast.show({ type: 'success', text1: 'Saved to My Workouts' });
        },
        onError: (err) =>
          Toast.show({ type: 'error', text1: 'Could not save template', text2: err.message }),
      }
    );
  };

  return (
    <Modal visible animationType="fade" transparent>
      <View className="flex-1 items-center justify-center p-6">
        <Pressable className="absolute inset-0 bg-foreground/50" onPress={onClose} />
        <View className="w-full bg-card rounded-3xl border border-border p-6 space-y-5">
          <View className="items-center space-y-1">
            <Text className="text-lg font-semibold text-card-foreground">{session.name}</Text>
            <Text className="text-sm text-muted-foreground">Session complete</Text>
          </View>

          <View className="flex-row gap-2">
            <SummaryStat
              icon={<Clock size={14} color="#8b7268" />}
              label="Duration"
              value={fmtDuration(session.duration_sec)}
            />
            <SummaryStat
              icon={<Flame size={14} color="#8b7268" />}
              label="Volume"
              value={`${fmtWeight(session.total_volume_kg, weightUnit)} ${weightUnit}`}
            />
            <SummaryStat
              icon={<Trophy size={14} color="#8b7268" />}
              label="PRs"
              value={String(prCount)}
            />
          </View>

          <Text className="text-center text-xs text-muted-foreground">
            {session.total_sets} working sets across {session.blocks.length}{' '}
            {session.blocks.length === 1 ? 'exercise' : 'exercises'}
          </Text>

          {canSaveTemplate && (
            <Pressable
              onPress={onSaveTemplate}
              disabled={saved || createTemplate.isPending}
              className="w-full py-3 rounded-2xl bg-muted items-center flex-row justify-center gap-2"
              style={saved || createTemplate.isPending ? { opacity: 0.6 } : undefined}
            >
              {saved ? (
                <Check size={16} color="#8b7268" />
              ) : (
                <BookmarkPlus size={16} color="#8b7268" />
              )}
              <Text className="text-muted-foreground font-medium">
                {saved
                  ? 'Saved to My Workouts'
                  : createTemplate.isPending
                    ? 'Saving…'
                    : 'Save as template'}
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={onClose}
            className="w-full py-3 rounded-2xl bg-primary items-center"
          >
            <Text className="text-primary-foreground font-semibold">Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function SummaryStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View className="flex-1 rounded-2xl bg-muted px-3 py-2.5 items-center">
      <View className="flex-row items-center gap-1">
        {icon}
        <Text className="text-[10px] uppercase tracking-0.14em text-muted-foreground">{label}</Text>
      </View>
      <Text className="text-base text-card-foreground mt-1">{value}</Text>
    </View>
  );
}

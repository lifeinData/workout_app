import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { X, Clock } from 'lucide-react-native';
import { useState } from 'react';
import Toast from 'react-native-toast-message';
import { ExerciseLogger } from './ExerciseLogger';
import { DemoVideoSheet } from './DemoVideoSheet';
import { usePatchPreferences, usePreferences } from '@/lib/queries';
import type { WorkoutDetailResponse } from '@/lib/api';

interface Props {
  workout: WorkoutDetailResponse;
  onClose: () => void;
}

export function WorkoutDetail({ workout, onClose }: Props) {
  const [demo, setDemo] = useState<{ ytId: string; name: string } | null>(null);
  const { data: prefs } = usePreferences();
  const patch = usePatchPreferences();
  const completed = prefs?.completed_workouts_today.includes(workout.id) ?? false;

  const onFinish = () => {
    patch.mutate(
      { add_completed: [workout.id] },
      {
        onSuccess: () => {
          Toast.show({
            type: 'success',
            text1: `${workout.name} complete`,
            text2: 'Great work — adherence ring updated.',
          });
          onClose();
        },
        onError: (err) =>
          Toast.show({
            type: 'error',
            text1: 'Could not finish workout',
            text2: err.message,
          }),
      }
    );
  };

  return (
    <Modal visible animationType="slide" transparent>
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-foreground/40" onPress={onClose} />

        <View className="bg-card rounded-t-3xl border-t border-x border-border" style={{ maxHeight: '90%' }}>
          <View className="flex-row items-center justify-between p-5 border-b border-border">
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <Text className="text-xs text-muted-foreground">{workout.tag}</Text>
                <Text className="text-xs text-muted-foreground">·</Text>
                <Clock size={12} color="#8b7268" />
                <Text className="text-xs text-muted-foreground">{workout.duration_min} min</Text>
              </View>
              <Text className="text-lg font-semibold text-card-foreground">{workout.name}</Text>
            </View>
            <Pressable onPress={onClose} className="w-10 h-10 rounded-full bg-muted items-center justify-center">
              <X size={20} color="#8b7268" />
            </Pressable>
          </View>

          <ScrollView className="px-5 pt-4 pb-2">
            {workout.exercises.map((ex, i) => (
              <View
                key={ex.id}
                className="py-6"
                style={i > 0 ? { borderTopWidth: 1, borderTopColor: '#f0d9ce' } : undefined}
              >
                <ExerciseLogger
                  exercise={ex}
                  onPlayDemo={() => ex.yt_id && setDemo({ ytId: ex.yt_id, name: ex.name })}
                />
              </View>
            ))}
          </ScrollView>

          <View className="p-5 border-t border-border">
            <Pressable
              onPress={onFinish}
              disabled={completed || patch.isPending}
              className={`w-full py-3 rounded-2xl bg-primary items-center shadow-lg ${completed || patch.isPending ? 'opacity-60' : ''}`}
            >
              <Text className="text-primary-foreground font-semibold">
                {completed ? '✓ Workout complete' : patch.isPending ? 'Saving…' : 'Finish workout'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {demo && <DemoVideoSheet ytId={demo.ytId} exerciseName={demo.name} onClose={() => setDemo(null)} />}
    </Modal>
  );
}

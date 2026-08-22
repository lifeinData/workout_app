import { View, Text, Pressable } from 'react-native';
import { Play, Plus, Trophy } from 'lucide-react-native';
import { useState } from 'react';
import { LoggedSetRow, PlaceholderSetRow } from './SetRow';
import type { PersonalRecordResponse, SessionExerciseBlock, SetKind } from '@/lib/api';
import type { WeightUnit } from '@/lib/units';
import { fmtWeight } from '@/lib/units';

interface Props {
  block: SessionExerciseBlock;
  weightUnit: WeightUnit;
  pr?: PersonalRecordResponse;
  onLogSet: (weight: number, reps: number, kind: SetKind) => void;
  onUpdateSet: (id: number, weight: number, reps: number) => void;
  onDeleteSet: (id: number) => void;
  onPlayDemo: () => void;
  onSetLogged: () => void;
}

export function ExerciseBlock({
  block,
  weightUnit,
  pr,
  onLogSet,
  onUpdateSet,
  onDeleteSet,
  onPlayDemo,
  onSetLogged,
}: Props) {
  const [showWarmupSlot, setShowWarmupSlot] = useState(false);

  const workingLogged = block.sets.filter((s) => s.kind === 'working').length;
  const placeholderCount = Math.max(1, block.target_sets - workingLogged);
  const workingLastTime = block.last_time.filter((s) => s.kind === 'working');

  const repsLabel =
    block.target_reps_high && block.target_reps_high !== block.target_reps_low
      ? `${block.target_reps_low}–${block.target_reps_high}`
      : String(block.target_reps_low);

  const handleLogWorking = (weight: number, reps: number) => {
    onLogSet(weight, reps, 'working');
    onSetLogged();
  };

  const handleLogWarmup = (weight: number, reps: number) => {
    onLogSet(weight, reps, 'warmup');
    setShowWarmupSlot(false);
  };

  return (
    <View className="space-y-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[10px] uppercase tracking-0.14em text-muted-foreground">
            {block.exercise.muscle_group}
          </Text>
          <View className="flex-row items-center gap-1.5">
            <Text className="text-base font-semibold text-card-foreground tracking-tight">
              {block.exercise.name}
            </Text>
            {pr && block.exercise.pr_trackable && <Trophy size={14} color="#e87d6f" />}
          </View>
          <Text className="text-xs text-muted-foreground mt-0.5">
            Target {block.target_sets} × {repsLabel}
            {pr && (
              <Text>
                {' · '}
                <Text className="text-primary">
                  PR {fmtWeight(pr.best_weight_kg, weightUnit)}×{pr.best_weight_reps}
                </Text>
              </Text>
            )}
          </Text>
          {block.prescription_notes ? (
            <Text className="text-xs text-muted-foreground mt-0.5">{block.prescription_notes}</Text>
          ) : null}
        </View>
        {block.exercise.yt_id ? (
          <Pressable
            onPress={onPlayDemo}
            className="w-9 h-9 rounded-full bg-muted items-center justify-center"
          >
            <Play size={14} color="#e87d6f" fill="#e87d6f" />
          </Pressable>
        ) : null}
      </View>

      <View className="space-y-1.5">
        {showWarmupSlot && (
          <PlaceholderSetRow
            displayIndex={0}
            kind="warmup"
            weightUnit={weightUnit}
            onCommit={handleLogWarmup}
          />
        )}

        {block.sets.map((s, i) => (
          <LoggedSetRow
            key={s.id}
            set={s}
            displayIndex={i + 1}
            weightUnit={weightUnit}
            onUpdate={(weight, reps) => onUpdateSet(s.id, weight, reps)}
            onDelete={() => onDeleteSet(s.id)}
          />
        ))}

        {Array.from({ length: placeholderCount }, (_, i) => (
          <PlaceholderSetRow
            key={`placeholder-${workingLogged + i}`}
            displayIndex={block.sets.length + i + 1}
            kind="working"
            weightUnit={weightUnit}
            lastTime={workingLastTime[workingLogged + i]}
            onCommit={handleLogWorking}
          />
        ))}
      </View>

      {!showWarmupSlot && (
        <Pressable
          onPress={() => setShowWarmupSlot(true)}
          className="flex-row items-center gap-1.5 self-start px-3 py-1.5 rounded-full bg-muted"
        >
          <Plus size={12} color="#8b7268" />
          <Text className="text-xs text-muted-foreground">Add warmup set</Text>
        </Pressable>
      )}
    </View>
  );
}

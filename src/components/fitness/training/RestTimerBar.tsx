import { View, Text, Pressable } from 'react-native';
import { Timer, X } from 'lucide-react-native';

interface Props {
  remainingSec: number;
  targetSec: number;
  onAddTime: (deltaSec: number) => void;
  onSkip: () => void;
}

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function RestTimerBar({ remainingSec, targetSec, onAddTime, onSkip }: Props) {
  const progress = targetSec > 0 ? Math.max(0, Math.min(1, 1 - remainingSec / targetSec)) : 0;

  return (
    <View className="rounded-2xl bg-accent overflow-hidden">
      <View
        className="absolute inset-0 bg-primary/20"
        style={{ width: `${progress * 100}%` }}
      />
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Timer size={16} color="#5a3326" />
        <Pressable onPress={() => onAddTime(-15)} className="px-2 py-1">
          <Text className="text-sm text-accent-foreground font-semibold">−15s</Text>
        </Pressable>
        <Text className="flex-1 text-center text-lg font-semibold text-accent-foreground">
          {fmtClock(remainingSec)}
        </Text>
        <Pressable onPress={() => onAddTime(15)} className="px-2 py-1">
          <Text className="text-sm text-accent-foreground font-semibold">+15s</Text>
        </Pressable>
        <Pressable onPress={onSkip} className="w-7 h-7 rounded-full bg-white/40 items-center justify-center">
          <X size={14} color="#5a3326" />
        </Pressable>
      </View>
    </View>
  );
}

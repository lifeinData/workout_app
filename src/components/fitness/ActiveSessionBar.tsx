import { View, Text, Pressable } from 'react-native';
import { Flame } from 'lucide-react-native';
import type { SessionDetailResponse } from '@/lib/api';
import { colors, radius } from '@/lib/theme';

interface Props {
  session: SessionDetailResponse;
  onPress: () => void;
}

/**
 * Nudge back to the live session. This does NOT float above the
 * native tab bar on every screen — `NativeTabs`
 * (expo-router/unstable-native-tabs) renders a real native tab
 * controller, and overlaying an absolutely-positioned JS view on top
 * of it is not something that can be verified without a device/
 * simulator to test the actual compositing behavior. Rather than ship
 * an unverified layer, this renders only where a session could
 * otherwise go unnoticed: the Training tab's own History sub-view
 * (see `TrainingTab.tsx`), where `SessionScreen` — the surface that
 * already shows this info — isn't mounted. A badge dot on the
 * Training tab icon (`app/(tabs)/training.tsx`) covers the other tabs.
 */
export function ActiveSessionBar({ session, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 px-4 py-3 bg-accent mb-4"
      style={{ borderRadius: radius.lg }}
    >
      <View className="w-8 h-8 items-center justify-center" style={{ borderRadius: radius.full, backgroundColor: colors.primary }}>
        <Flame size={14} color={colors.primaryForeground} />
      </View>
      <View className="flex-1">
        <Text maxFontSizeMultiplier={1.3} className="text-heading font-semibold text-accent-foreground">
          {session.name}
        </Text>
        <Text maxFontSizeMultiplier={1.3} className="text-caption text-accent-foreground/70">
          {session.total_sets} sets logged · tap to resume
        </Text>
      </View>
      <Text maxFontSizeMultiplier={1.3} className="text-caption text-primary font-semibold">
        Resume
      </Text>
    </Pressable>
  );
}

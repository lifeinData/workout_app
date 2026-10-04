import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { colors, radius, space, tabular, type } from '@/lib/theme';

interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
}

/**
 * DESIGN.md §3 — filter/selection pill. `r.full` with a hairline outline so it
 * reads as a tappable filter/label (not bare text): idle = subtle secondary
 * fill + border, active = primary fill + white text + coral border (one of the
 * three permitted coral uses — §2.2 rule 2, "active state of a control").
 * Static style array (not `({ pressed }) => …`) — see the note in Button.tsx.
 */
export function Chip({ label, active = false, onPress }: ChipProps) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={!onPress}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected: active }}
      style={{
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        minHeight: 32,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.primary : colors.secondary,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.85 : 1,
      }}
    >
      <Text
        maxFontSizeMultiplier={1.3}
        style={{
          ...type.label,
          ...tabular,
          color: active ? colors.primaryForeground : colors.secondaryForeground,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

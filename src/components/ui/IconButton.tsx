import { useState, type ReactNode } from 'react';
import { Pressable, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from '@/lib/theme';

interface IconButtonProps {
  children: ReactNode;
  /** Receives the press event so callers can `stopPropagation()` when nested
   * inside another Pressable (the classic RN nested-press bug). */
  onPress?: (event: GestureResponderEvent) => void;
  /** 32 (default) or 44. A 32dp visual gets hitSlop padded out to a 44dp target. */
  size?: 32 | 44;
  /** Required — an icon-only control has no other accessible name. */
  accessibilityLabel: string;
  backgroundColor?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Adds enough hitSlop for a `visual`-sized control to reach a 44dp target. */
function hitSlopFor(visual: number) {
  const pad = Math.max(0, Math.ceil((44 - visual) / 2));
  return { top: pad, bottom: pad, left: pad, right: pad };
}

/**
 * DESIGN.md §3 — round icon-only pressable (demo button, sheet close
 * button, Repeat action, rest-timer ghost buttons). Visual size can be
 * 32dp; touch target is always compensated to ≥44dp via hitSlop.
 */
export function IconButton({
  children,
  onPress,
  size = 32,
  accessibilityLabel,
  backgroundColor = colors.muted,
  disabled = false,
  style,
}: IconButtonProps) {
  // Static style array (not the `({ pressed }) => …` form) — NativeWind v4
  // drops function-form styles on its wrapped Pressable. See Button.tsx.
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
      hitSlop={hitSlopFor(size)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius.full,
          backgroundColor,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

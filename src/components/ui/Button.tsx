import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, type } from '@/lib/theme';

type Variant = 'primary' | 'ghost' | 'destructive';
type Size = 'lg' | 'md' | 'sm';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  /** lg=52 (default) · md=44 · sm=36 — DESIGN.md §3 button heights. */
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
}

const HEIGHTS: Record<Size, number> = { lg: 52, md: 44, sm: 36 };
// Horizontal padding + a minimum width per size so a label-only button (e.g.
// the header "Finish"/"Done" pill) has real presence instead of collapsing to
// the text width. Harmless to full-width buttons (Start empty / Add exercise):
// they stretch well past MIN_WIDTHS, and centered content is unaffected by the
// extra padding. minWidth on the sm size also keeps a short label ("Done") and
// a longer one ("Finish") visually consistent.
const PAD_X: Record<Size, number> = { lg: 24, md: 20, sm: 18 };
const MIN_WIDTHS: Record<Size, number> = { lg: 120, md: 96, sm: 84 };

function fillFor(variant: Variant, disabled: boolean): { bg: string; fg: string } {
  if (disabled) return { bg: colors.muted, fg: colors.mutedForeground };
  switch (variant) {
    case 'primary':
      return { bg: colors.primary, fg: colors.primaryForeground };
    case 'destructive':
      return { bg: colors.destructive, fg: colors.primaryForeground };
    case 'ghost':
      return { bg: colors.muted, fg: colors.foreground };
  }
}

/**
 * DESIGN.md §3 — primary / ghost / destructive action button. Height is
 * driven by `size`, radius is always `r.md` (14). A 36dp `sm` button is
 * still a full touch target because the whole Pressable is that tall.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  loading = false,
  leftIcon,
  style,
  className,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const { bg, fg } = fillFor(variant, isDisabled);
  const height = HEIGHTS[size];
  // NativeWind v4's cssInterop-wrapped Pressable drops the function form of
  // `style` (it silently applies nothing — the control loses its background
  // AND its flexDirection, so an icon+label stacks into two lines). Every
  // primitive here therefore uses a STATIC style array and drives the pressed
  // dim through local state instead of the `({ pressed }) => …` render prop.
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      className={className}
      style={[
        {
          height,
          minHeight: 44,
          minWidth: MIN_WIDTHS[size],
          paddingHorizontal: PAD_X[size],
          borderRadius: radius.md,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          opacity: pressed && !isDisabled ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {leftIcon ? <View>{leftIcon}</View> : null}
          <Text maxFontSizeMultiplier={1.3} style={{ ...type.label, fontWeight: '600', color: fg }}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

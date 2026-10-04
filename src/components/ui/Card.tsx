import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { elevation, radius, space, colors } from '@/lib/theme';

interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
  /** Apply the default 16dp padding. Defaults to true — pass false to control padding yourself. */
  padded?: boolean;
}

/**
 * DESIGN.md §3.2 / §2.3 — the one raised-surface primitive. `--card` fill,
 * `r.lg` (20), `e1` elevation, NEVER a border. Depth comes from the shadow,
 * not an outline.
 */
export function Card({ children, style, className, padded = true }: CardProps) {
  return (
    <View
      className={className}
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: radius.lg,
          padding: padded ? space.lg : 0,
        },
        elevation.e1,
        style,
      ]}
    >
      {children}
    </View>
  );
}

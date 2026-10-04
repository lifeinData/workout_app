import type { JSX } from 'react';
import { Text, View, type TextStyle } from 'react-native';
import { colors, radius, space, tabular, type } from '@/lib/theme';

type AvatarSize = 32 | 44 | 56;

/** Initials scale with the circle, always from the DESIGN.md §2.4 table. */
const INITIALS_TYPE: Record<AvatarSize, TextStyle> = {
  32: type.caption,
  44: type.body,
  56: type.title,
};

/** Server initials win; otherwise derive up to two letters from the name. */
function resolveInitials(initials: string | null, name: string): string {
  const fromServer = initials?.trim();
  if (fromServer) return fromServer.slice(0, 2).toUpperCase();
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('');
  return letters ? letters.toUpperCase() : '?';
}

/**
 * Initials in a `--secondary` circle with `--secondary-foreground` text.
 * Sizes 32 (dense rows), 44 (roster rows, thread header) and 56 (coach card).
 * Decorative weight only: no accent, no border, so it never competes with
 * the one coral action on the surface.
 */
export function CoachAvatar({
  initials,
  name,
  size = 44,
}: {
  initials: string | null;
  name: string;
  size?: 32 | 44 | 56;
}): JSX.Element {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: radius.full,
        backgroundColor: colors.secondary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Fixed-size circle: initials must not scale past it with the OS font size. */}
      <Text
        maxFontSizeMultiplier={1}
        numberOfLines={1}
        style={{
          ...INITIALS_TYPE[size],
          fontWeight: '600',
          letterSpacing: 0,
          color: colors.secondaryForeground,
        }}
      >
        {resolveInitials(initials, name)}
      </Text>
    </View>
  );
}

/**
 * Coral count pill. Renders nothing at 0, caps at "9+". Coral is earned here:
 * an unread count is the "something needs you" state of a control.
 */
export function UnreadBadge({ count }: { count: number }): JSX.Element | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  const label = count > 9 ? '9+' : String(Math.floor(count));
  return (
    <View
      accessible
      accessibilityLabel={`${count} unread`}
      style={{
        minWidth: 20,
        height: 20,
        paddingHorizontal: space.xs,
        borderRadius: radius.full,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        maxFontSizeMultiplier={1}
        style={{
          ...type.caption,
          ...tabular,
          fontWeight: '700',
          color: colors.primaryForeground,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

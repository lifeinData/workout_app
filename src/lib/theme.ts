/**
 * JS mirror of the design tokens in `DESIGN.md` §2 for files that use
 * `StyleSheet.create` and therefore cannot reach NativeWind `className` or
 * `var(--*)` CSS custom properties. NativeWind/className files should keep
 * using the Tailwind theme (`tailwind.config.js`) directly.
 *
 * Single source of visual truth is `DESIGN.md` — do not add a value here
 * that isn't specified there.
 */
import type { TextStyle, ViewStyle } from 'react-native';

/** DESIGN.md §2.1 — hex literals (RGB-channel format is CSS-only). */
export const colors = {
  background: '#fdf6f0',
  foreground: '#3d2b26',
  card: '#ffffff',
  primary: '#e87d6f',
  primaryForeground: '#ffffff',
  secondary: '#fce4d8',
  secondaryForeground: '#6b3a30',
  muted: '#faeadd',
  mutedForeground: '#8b7268',
  accent: '#ffd5b8',
  accentForeground: '#5a3326',
  destructive: '#d96a5a',
  border: '#f0d9ce',
  inputBackground: '#fff4ea',
  ring: '#f4a29a',
  success: '#9bb88a',
  warmup: '#f0a868',
} as const;

/** DESIGN.md §2.4 — no size or weight outside this table. */
export const type = {
  display: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 } satisfies TextStyle,
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 } satisfies TextStyle,
  heading: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2 } satisfies TextStyle,
  body: { fontSize: 15, fontWeight: '500', letterSpacing: 0 } satisfies TextStyle,
  label: { fontSize: 13, fontWeight: '500', letterSpacing: 0 } satisfies TextStyle,
  caption: { fontSize: 12, fontWeight: '500', letterSpacing: 0 } satisfies TextStyle,
  micro: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  } satisfies TextStyle,
} as const;

/** DESIGN.md §2.5 — 4pt grid. No other gaps. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/** DESIGN.md §2.6 — radius scale. */
export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  full: 9999,
} as const;

/** DESIGN.md §2.6 — two elevation levels, warm shadow, never neutral black. */
export const elevation = {
  e1: {
    shadowColor: '#3d2b26',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  } satisfies ViewStyle,
  e2: {
    shadowColor: '#3d2b26',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  } satisfies ViewStyle,
} as const;

/** DESIGN.md §2.4 — every numeric value carries this. */
export const tabular = { fontVariant: ['tabular-nums'] } satisfies TextStyle;

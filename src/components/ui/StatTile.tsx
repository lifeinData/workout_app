import { Text, View } from 'react-native';
import { colors, tabular, type } from '@/lib/theme';

interface StatTileProps {
  value: string;
  label: string;
  /** A personal record or other headline stat — one of the three permitted coral uses. */
  highlight?: boolean;
}

/**
 * DESIGN.md §3.6 — summary stat block used by SessionSummarySheet: a
 * tabular `title`-weight value with a `micro` label underneath.
 */
export function StatTile({ value, label, highlight = false }: StatTileProps) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text
        maxFontSizeMultiplier={1.3}
        style={{
          ...type.title,
          ...tabular,
          color: highlight ? colors.primary : colors.foreground,
        }}
      >
        {value}
      </Text>
      <Text maxFontSizeMultiplier={1.3} style={{ ...type.micro, color: colors.mutedForeground }}>
        {label}
      </Text>
    </View>
  );
}

import { View, Text } from 'react-native';
import type { SessionDetailResponse } from '@/lib/api';
import type { WeightUnit } from '@/lib/units';
import { fmtWeight } from '@/lib/units';
import { Sheet } from '@/components/ui/Sheet';
import { StatTile } from '@/components/ui/StatTile';
import { Button } from '@/components/ui/Button';
import { colors, radius, space, type } from '@/lib/theme';

interface Props {
  session: SessionDetailResponse;
  weightUnit: WeightUnit;
  onClose: () => void;
}

function fmtDuration(sec: number | null): string {
  if (!sec) return '—';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

export function SessionSummarySheet({ session, weightUnit, onClose }: Props) {
  const prCount = session.blocks.reduce(
    (sum, b) => sum + b.sets.filter((s) => s.was_pr).length,
    0
  );
  const hasSets = session.total_sets > 0;

  return (
    <Sheet visible onClose={onClose}>
      {/* Eyebrow + headline: workout name is the hero, "complete" is a quiet label */}
      <View style={{ alignItems: 'center', gap: 4, marginBottom: space.xxl }}>
        <Text maxFontSizeMultiplier={1.3} style={{ ...type.micro, color: colors.mutedForeground }}>
          Session complete
        </Text>
        <Text
          maxFontSizeMultiplier={1.3}
          numberOfLines={2}
          style={{ ...type.title, color: colors.foreground, textAlign: 'center' }}
        >
          {session.name}
        </Text>
      </View>

      {/* Stats centerpiece */}
      {hasSets ? (
        <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.xxl }}>
          <View
            style={{
              flex: 1,
              minHeight: 88,
              borderRadius: radius.lg,
              backgroundColor: colors.muted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <StatTile label="Duration" value={fmtDuration(session.duration_sec)} />
          </View>
          <View
            style={{
              flex: 1,
              minHeight: 88,
              borderRadius: radius.lg,
              backgroundColor: colors.muted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <StatTile
              label="Volume"
              value={`${fmtWeight(session.total_volume_kg, weightUnit)} ${weightUnit}`}
            />
          </View>
          <View
            style={{
              flex: 1,
              minHeight: 88,
              borderRadius: radius.lg,
              // primary @ 12% — inline style (not className) so this stays rgba per DESIGN.md §2.1
              backgroundColor: prCount > 0 ? 'rgba(232,125,111,0.12)' : colors.muted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <StatTile label="PRs" value={String(prCount)} highlight={prCount > 0} />
          </View>
        </View>
      ) : (
        <View
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 88,
            paddingVertical: space.lg,
            borderRadius: radius.lg,
            backgroundColor: colors.muted,
            marginBottom: space.xxl,
          }}
        >
          <Text maxFontSizeMultiplier={1.3} style={{ ...type.body, color: colors.mutedForeground }}>
            No sets logged
          </Text>
        </View>
      )}

      <Button label="Done" onPress={onClose} size="lg" />
    </Sheet>
  );
}

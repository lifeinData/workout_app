import { Pressable, Text, View } from 'react-native';
import { colors, space, type } from '@/lib/theme';

interface Tab<TId extends string> {
  id: TId;
  label: string;
}

interface SegmentedTabsProps<TId extends string> {
  tabs: Tab<TId>[];
  activeId: TId;
  onChange: (id: TId) => void;
}

/**
 * DESIGN.md §3.5 — underlined text tabs. No container/tray chrome: active =
 * foreground + 2dp primary underline, inactive = muted-foreground. Replaces
 * the tray-and-pill segmented control pattern app-wide.
 */
export function SegmentedTabs<TId extends string>({
  tabs,
  activeId,
  onChange,
}: SegmentedTabsProps<TId>) {
  return (
    <View style={{ flexDirection: 'row', gap: space.xl }}>
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{ paddingBottom: space.sm }}
          >
            <Text
              maxFontSizeMultiplier={1.3}
              style={{
                ...type.heading,
                color: active ? colors.foreground : colors.mutedForeground,
              }}
            >
              {tab.label}
            </Text>
            <View
              style={{
                marginTop: space.xs,
                height: 2,
                borderRadius: 1,
                backgroundColor: active ? colors.primary : 'transparent',
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

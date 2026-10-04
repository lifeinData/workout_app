import { View, Text, Pressable, TextInput, FlatList, ActivityIndicator } from 'react-native';
import { Search } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Chip } from '@/components/ui/Chip';
import { colors, radius, space, tabular } from '@/lib/theme';
import { useExercisesInfinite, usePatchPreferences, usePreferences } from '@/lib/queries';
import { EQUIPMENT_CHIPS } from '@/lib/equipment';
import type { ExerciseResponse } from '@/lib/api';

export interface ExercisePickerSheetProps {
  visible?: boolean;
  excludeIds: string[];
  onPick: (exercise: ExerciseResponse) => void;
  onClose: () => void;
  title?: string;
}

/** Debounced server-side search (`GET /exercises?q=`), paginated via
 * `useInfiniteQuery` (see `useExercisesInfinite` in `lib/queries.ts`) —
 * replaces the old single `limit: 50` fetch that only ever showed the
 * first 50 of ~614 rows, alphabetically. `onEndReached` requests the next
 * page as the user scrolls; the search/equipment key change resets
 * pagination to page 0 automatically (they're baked into the query key).
 *
 * Visual shell only (DESIGN.md §3.6): rebuilt on the shared `Sheet`
 * primitive and `Chip` for the equipment filters. Pagination, the
 * "Showing N of TOTAL" line, the debounce, and the client-side equipment
 * filter are all unchanged (do-not-regress #12). */
export function ExercisePickerSheet({
  visible = true,
  excludeIds,
  onPick,
  onClose,
  title = 'Add exercise',
}: ExercisePickerSheetProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const { data: prefs } = usePreferences();
  const patchPreferences = usePatchPreferences();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const selectedEquipment = useMemo(() => new Set(prefs?.equipment ?? []), [prefs?.equipment]);
  // Sorted, stable form of the selection for the query key — see
  // `queryKeys.exercisesPage` doc comment for why equipment is part of the
  // key even though the filter itself runs client-side below.
  const equipmentKey = useMemo(() => Array.from(selectedEquipment).sort(), [selectedEquipment]);

  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useExercisesInfinite({ search: debounced || undefined, equipment: equipmentKey });

  const toggleEquipment = (id: string) => {
    const next = new Set(selectedEquipment);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    patchPreferences.mutate({ equipment: Array.from(next) });
  };

  // `data.pages` is a new array reference on every fetch, not every render,
  // so a plain (non-memoized) flatMap here is cheap and correct — wrapping
  // it in `useMemo([pages])` would never actually skip work (`pages` itself
  // is derived fresh each render) and trips `react-hooks/exhaustive-deps`.
  const pages = data?.pages ?? [];
  const fetchedExercises = pages.flatMap((p) => p.items);
  // The header total describes the search-filtered set on the server; it
  // does NOT account for the equipment filter below, which is client-side
  // only (see the query-key comment) — matches the picker's pre-existing
  // "Option A" equipment behavior from agent_agenda_2026_08_21.md B4.
  const total = pages.length > 0 ? pages[pages.length - 1].total : 0;

  const excludeSet = new Set(excludeIds);
  const filtered = fetchedExercises
    .filter((e) => !excludeSet.has(e.id))
    // Client-side filter (Option A from agent_agenda_2026_08_21.md B4): the API only
    // accepts a single `equipment` string, but prefs.equipment is a
    // multi-select string[], so we can't push the filter server-side without
    // a backend change. This only filters rows already fetched across the
    // pages loaded so far — a match past the last loaded page stays hidden
    // until the user scrolls further. Acceptable for now; a backend
    // multi-equipment query param is the real fix (out of scope).
    .filter((e) => selectedEquipment.size === 0 || e.equipment.some((x) => selectedEquipment.has(x)));

  const loadMore = () => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={title} heightPercent={85}>
      <View style={{ flex: 1, gap: space.md }}>
        <View
          className="flex-row items-center bg-muted px-3"
          style={{ borderRadius: radius.sm }}
        >
          <Search size={16} color={colors.mutedForeground} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search exercises or muscle group"
            placeholderTextColor={colors.mutedForeground}
            maxFontSizeMultiplier={1.3}
            className="flex-1 py-2.5 px-2 text-body text-foreground"
          />
        </View>

        <View className="flex-row flex-wrap" style={{ gap: space.sm }}>
          {EQUIPMENT_CHIPS.map((c) => (
            <Chip
              key={c.id}
              label={c.label}
              active={selectedEquipment.has(c.id)}
              onPress={() => toggleEquipment(c.id)}
            />
          ))}
        </View>

        <View className="flex-row items-center justify-between">
          <Text
            className="text-caption text-muted-foreground"
            maxFontSizeMultiplier={1.3}
            style={tabular}
          >
            {total > 0 ? `Showing ${filtered.length} of ${total}` : ' '}
          </Text>
          {isFetching && !isFetchingNextPage && (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          )}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(e) => e.id}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ItemSeparatorComponent={() => <View className="border-b border-border" />}
          renderItem={({ item: e }) => (
            <Pressable
              onPress={() => onPick(e)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${e.name}`}
              className="flex-row items-center justify-between py-3 active:bg-muted"
            >
              <View className="flex-1">
                <Text className="text-body text-foreground" maxFontSizeMultiplier={1.3}>
                  {e.name}
                </Text>
                <Text className="text-micro text-muted-foreground mt-0.5" maxFontSizeMultiplier={1.3}>
                  {e.muscle_group}
                </Text>
              </View>
              <Text className="text-label text-muted-foreground" maxFontSizeMultiplier={1.3}>
                Add
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <View className="py-10 items-center px-5">
              <Text className="text-body text-muted-foreground" maxFontSizeMultiplier={1.3}>
                {isLoading ? 'Searching…' : debounced ? `No matches for '${debounced}'` : 'No matches.'}
              </Text>
            </View>
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <View className="py-4 items-center">
                <ActivityIndicator size="small" color={colors.mutedForeground} />
              </View>
            ) : null
          }
        />
      </View>
    </Sheet>
  );
}

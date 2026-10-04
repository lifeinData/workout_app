import { useState, type JSX } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { CoachWorkoutsPanel } from "@/components/fitness/coach/CoachWorkoutsPanel";
import { CoachAthletesPanel } from "@/components/fitness/coach/CoachAthletesPanel";
import { useCoachAthletes, useCoachWorkouts } from "@/lib/queries";
import { colors, space, type } from "@/lib/theme";

/* ------------------------------------------------------------------ *
 * Coach tab (agenda D1 / D11)                                        *
 *                                                                    *
 * Header ("COACH" / "Your coaching") + underlined segments           *
 * Workouts · Athletes. The Athletes label carries the pending-request *
 * count so a new request is visible from either segment. Both        *
 * queries are fetched here (not per panel) so the label count and    *
 * pull-to-refresh cover both, whichever segment is showing.          *
 * ------------------------------------------------------------------ */

type Segment = "workouts" | "athletes";

export function CoachTab(): JSX.Element {
  const workouts = useCoachWorkouts({ limit: 500 });
  const athletes = useCoachAthletes();
  const pending = athletes.data?.requests.length ?? 0;

  // Until the coach picks a segment, land on Athletes when a request is
  // waiting (also when the athletes query resolves after mount). Latched via
  // the "adjust state during render" pattern so accepting the LAST request
  // doesn't bounce the coach back to Workouts.
  const [picked, setPicked] = useState<Segment | null>(null);
  if (picked === null && pending > 0) setPicked("athletes");
  const segment: Segment = picked ?? "workouts";
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([workouts.refetch(), athletes.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void onRefresh();
          }}
          tintColor={colors.mutedForeground}
          colors={[colors.primary]}
        />
      }
    >
      <View style={styles.header}>
        <Text maxFontSizeMultiplier={1.3} style={styles.eyebrow}>
          Coach
        </Text>
        <Text maxFontSizeMultiplier={1.3} style={styles.title}>
          Your coaching
        </Text>
      </View>

      <SegmentedTabs<Segment>
        tabs={[
          { id: "workouts", label: "Workouts" },
          { id: "athletes", label: pending > 0 ? `Athletes · ${pending}` : "Athletes" },
        ]}
        activeId={segment}
        onChange={setPicked}
      />

      {segment === "workouts" ? (
        <CoachWorkoutsPanel
          workouts={workouts.data}
          isLoading={workouts.isLoading}
          error={workouts.error}
          onRetry={() => {
            void workouts.refetch();
          }}
        />
      ) : (
        <CoachAthletesPanel
          data={athletes.data}
          isLoading={athletes.isLoading}
          error={athletes.error}
          onRetry={() => {
            void athletes.refetch();
          }}
        />
      )}
    </ScrollView>
  );
}

export default CoachTab;

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxxl * 3,
    gap: space.xl,
  },
  header: { gap: space.xs },
  eyebrow: { ...type.micro, color: colors.mutedForeground },
  title: { ...type.display, color: colors.foreground },
});

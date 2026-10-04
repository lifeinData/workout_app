import { View, Text, Pressable, ActivityIndicator, ScrollView, StyleSheet, Alert } from "react-native";
import { Settings } from "lucide-react-native";
import { useState } from "react";
import Toast from "@/components/ui/Toast";
import { useActiveSession, usePreferences, useSession, useStartSession } from "@/lib/queries";
import { SessionScreen } from "./training/SessionScreen";
import { StartScreen } from "./training/StartScreen";
import { HistoryView } from "./training/HistoryView";
import { SessionSummarySheet } from "./training/SessionSummarySheet";
import { SettingsSheet } from "./SettingsSheet";
import { ActiveSessionBar } from "./ActiveSessionBar";
import { buildImportPlan, type ImportPlanItem } from "./training/ImportWorkoutSheet";
import { api, type SessionDetailResponse } from "@/lib/api";
import { fmtSessionDefaultName, localDateKey } from "@/lib/dates";
import type { WeightUnit } from "@/lib/units";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { colors, type } from "@/lib/theme";

/**
 * Thin router: whether there's an active `WorkoutSession` decides
 * whether Train renders the live logging screen or the workout
 * picker. This replaces the old three-way Today/Workouts/History
 * split — Today and Workouts (via the modal WorkoutDetail) used to be
 * two independent logging surfaces writing to the same undifferentiated
 * set table; a session is now the single source of truth for both.
 */
export function TrainingTab() {
  const [view, setView] = useState<"train" | "history">("train");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showStart, setShowStart] = useState(false);
  // The post-finish summary sheet lives HERE, not in SessionScreen:
  // finishing nulls `activeSession`, which unmounts SessionScreen, so a
  // sheet owned by SessionScreen would vanish before it ever rendered
  // (and its "Save as template" button — the only path into My Workouts —
  // with it). Holding the snapshot at this level lets the sheet outlive
  // the session it summarizes.
  const [finishedSnapshot, setFinishedSnapshot] = useState<SessionDetailResponse | null>(null);
  const { data: activeSession, isLoading } = useActiveSession();
  const { data: prefs } = usePreferences();
  const weightUnit = (prefs?.weight_unit ?? "lb") as WeightUnit;

  // A past (completed) session opened from a My Workouts card, for
  // editing in place. Deliberately a SEPARATE record from `activeSession`
  // — a live workout and an old one being edited can coexist, so opening
  // one never displaces the other. While a past session is open, the live
  // session (if any) stays reachable via `ActiveSessionBar` rather than
  // being hidden.
  const [openPastSessionId, setOpenPastSessionId] = useState<string | null>(null);
  const { data: pastSession, isLoading: pastSessionLoading } = useSession(openPastSessionId ?? "");

  // Bumped on every "return to the picker" transition (back from a live
  // session, close a past one, or finish) so `<StartScreen key={...}>`
  // remounts and resets its internal tab state back to its own default
  // ("mine" / My Workouts) instead of remembering whatever tab the user
  // had open before. StartScreen's tab state stays internal/uncontrolled —
  // this remount is the seam instead of lifting it.
  const [startScreenKey, setStartScreenKey] = useState(0);
  const returnToStart = () => setStartScreenKey((k) => k + 1);

  const startSession = useStartSession();
  // Set once a "Repeat" starts a brand-new session, so the next render of
  // that session's SessionScreen can seed it. Matched by id so it only
  // ever applies to the one session it was built for.
  const [repeatSeed, setRepeatSeed] = useState<{ sessionId: string; plan: ImportPlanItem[] } | null>(
    null
  );

  const onRepeatSession = async (id: string) => {
    // `POST /me/sessions` is idempotent and would just hand back the live
    // session if one exists — silently dumping an unrelated workout's
    // exercises into it would be surprising, so surface the conflict
    // instead of starting anything.
    if (activeSession) {
      Alert.alert(
        "Workout already in progress",
        "Finish or discard your current workout before repeating another one."
      );
      return;
    }
    let plan: ImportPlanItem[];
    try {
      const detail = await api.getSession(id);
      plan = buildImportPlan(detail);
    } catch (err) {
      Toast.show({
        type: "error",
        text1: "Could not load workout",
        text2: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    startSession.mutate(
      {
        // No `workout_id` — Repeat always starts a fresh AD-HOC session,
        // never reusing the source's own workout link, name, or date.
        // Reusing those is exactly the stale-name bug this rework removes.
        local_date: localDateKey(new Date()),
        tz_offset_min: -new Date().getTimezoneOffset(),
        name: fmtSessionDefaultName(new Date()),
      },
      {
        onSuccess: (data) => setRepeatSeed({ sessionId: data.id, plan }),
        onError: (err) =>
          Toast.show({ type: "error", text1: "Could not start session", text2: err.message }),
      }
    );
  };

  // Reset the picker-override whenever the active session's identity
  // changes (e.g. a new session starts) so the user isn't stranded on
  // StartScreen. Done as a render-time state adjustment rather than an
  // effect — the effect form triggers a cascading-render lint error and
  // an extra commit; this pattern re-renders in place before paint.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevSessionId, setPrevSessionId] = useState(activeSession?.id);
  if (activeSession?.id !== prevSessionId) {
    setPrevSessionId(activeSession?.id);
    setShowStart(false);
  }

  // A live/past session occupies the WHOLE screen: the "Training" title and
  // the Train|History toggle are picker chrome (~124-139dp on an S23 Ultra)
  // that a session mid-set has no use for, so they're hidden for the
  // duration. `openPastSessionId` hides chrome even while that session is
  // still loading, so there's no chrome-flash between tapping a card and
  // the spinner resolving.
  const inSession = view === "train" && !!(openPastSessionId || (activeSession && !showStart));

  return (
    <View style={styles.container}>
      {!inSession && (
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} maxFontSizeMultiplier={1.3}>
              Training
            </Text>
            {!activeSession && (
              <Text style={styles.headerSubtitle} maxFontSizeMultiplier={1.3}>
                Ready when you are
              </Text>
            )}
          </View>
          <Pressable
            onPress={() => setSettingsOpen(true)}
            style={styles.settingsBtn}
            accessibilityLabel="Training settings"
          >
            <Settings size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>
      )}

      {!inSession && (
        <View style={styles.toggleRow}>
          <SegmentedTabs
            tabs={[
              { id: "train", label: "Train" },
              { id: "history", label: "History" },
            ]}
            activeId={view}
            onChange={setView}
          />
        </View>
      )}

      {view === "train" && inSession ? (
        // Session view: SessionScreen gets a full-height, unpadded flex
        // region instead of scrolling inside the page-level ScrollView
        // below. T3.1 owns the scroll region for the session view — it
        // adds its own `ScrollView stickyHeaderIndices={[0]}` (with
        // `keyboardShouldPersistTaps="handled"` +
        // `keyboardDismissMode="on-drag"` carried onto it, per the
        // do-not-regress list) so the sticky header + rest timer + Finish
        // stay reachable while the set list scrolls beneath them.
        <View style={styles.sessionArea}>
          {openPastSessionId ? (
            // Opening a past session takes precedence over the live one in
            // THIS slot, but doesn't hide or interrupt the live session —
            // it's a separate record, so the nudge bar stays visible.
            pastSessionLoading || !pastSession ? (
              <View style={{ padding: 32, alignItems: "center" }}>
                <ActivityIndicator />
              </View>
            ) : (
              <>
                {activeSession && (
                  <ActiveSessionBar
                    session={activeSession}
                    onPress={() => setOpenPastSessionId(null)}
                  />
                )}
                <SessionScreen
                  session={pastSession}
                  onBack={() => {
                    setOpenPastSessionId(null);
                    returnToStart();
                  }}
                />
              </>
            )
          ) : (
            activeSession && (
              <SessionScreen
                session={activeSession}
                onBack={() => {
                  setShowStart(true);
                  returnToStart();
                }}
                onFinished={(snapshot) => {
                  setFinishedSnapshot(snapshot);
                  returnToStart();
                }}
                seedPlan={
                  repeatSeed?.sessionId === activeSession.id ? repeatSeed.plan : undefined
                }
              />
            )
          )}
        </View>
      ) : (
        // Picker views (StartScreen / History / the "train" loading spinner)
        // own the page-level scroll — the session view above never mounts
        // this ScrollView, so the rest timer and Finish button can't scroll
        // away out from under a live workout.
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {view === "train" &&
            (isLoading ? (
              <View style={{ padding: 32, alignItems: "center" }}>
                <ActivityIndicator />
              </View>
            ) : (
              <>
                {activeSession && (
                  <ActiveSessionBar session={activeSession} onPress={() => setShowStart(false)} />
                )}
                <StartScreen
                  key={startScreenKey}
                  onOpenPastSession={setOpenPastSessionId}
                  onRepeatSession={onRepeatSession}
                />
              </>
            ))}

          {view === "history" && (
            <>
              {/* SessionScreen (the "train" view) isn't mounted here, so a
               * session in progress would otherwise be invisible while
               * browsing History — nudge back to it. */}
              {activeSession && (
                <ActiveSessionBar session={activeSession} onPress={() => setView("train")} />
              )}
              <HistoryView />
            </>
          )}
        </ScrollView>
      )}

      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}

      {finishedSnapshot && (
        <SessionSummarySheet
          session={finishedSnapshot}
          weightUnit={weightUnit}
          onClose={() => setFinishedSnapshot(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  sessionArea: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    marginTop: 20,
    gap: 12,
  },
  headerTitle: { ...type.display, color: colors.foreground },
  headerSubtitle: { ...type.caption, color: colors.mutedForeground, marginTop: 2 },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleRow: {
    marginBottom: 16,
  },
});

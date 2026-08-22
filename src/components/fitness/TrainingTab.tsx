import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Settings, CalendarDays, Flame } from "lucide-react-native";
import { useState } from "react";
import { useActiveSession } from "@/lib/queries";
import { SessionScreen } from "./training/SessionScreen";
import { StartScreen } from "./training/StartScreen";
import { HistoryView } from "./training/HistoryView";
import { SettingsSheet } from "./SettingsSheet";
import { ActiveSessionBar } from "./ActiveSessionBar";

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
  const { data: activeSession, isLoading } = useActiveSession();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Training</Text>
          <Text style={styles.headerSubtitle}>
            {activeSession ? activeSession.name : "Ready when you are"}
          </Text>
        </View>
        <Pressable
          onPress={() => setSettingsOpen(true)}
          style={styles.settingsBtn}
          accessibilityLabel="Training settings"
        >
          <Settings size={18} color="#8b7268" />
        </Pressable>
      </View>

      <View style={styles.toggleRow}>
        {(
          [
            { id: "train", label: "Train", Icon: Flame },
            { id: "history", label: "History", Icon: CalendarDays },
          ] as const
        ).map(({ id, label, Icon }) => (
          <Pressable
            key={id}
            onPress={() => setView(id)}
            style={[styles.toggleBtn, view === id && styles.toggleBtnActive]}
          >
            <Icon size={14} color={view === id ? "#3d2b26" : "#8b7268"} />
            <Text style={[styles.toggleLabel, view === id && styles.toggleLabelActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {view === "train" &&
        (isLoading ? (
          <View style={{ padding: 32, alignItems: "center" }}>
            <ActivityIndicator />
          </View>
        ) : activeSession ? (
          <SessionScreen session={activeSession} />
        ) : (
          <StartScreen />
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

      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 12,
  },
  headerTitle: { fontSize: 24, fontWeight: "700", color: "#3d2b26" },
  headerSubtitle: { fontSize: 12, color: "#8b7268", marginTop: 2 },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#faeadd",
    alignItems: "center",
    justifyContent: "center",
  },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
    padding: 4,
    backgroundColor: "#faeadd",
    borderRadius: 16,
    marginBottom: 16,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: 12,
  },
  toggleBtnActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  toggleLabel: { fontSize: 12, color: "#8b7268" },
  toggleLabelActive: { color: "#3d2b26" },
});

import { KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { TrainingTab } from "@/components/fitness/TrainingTab";
import { useActiveSession } from "@/lib/queries";

export default function TrainingScreen() {
  const { data: activeSession } = useActiveSession();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Dynamic per-screen Trigger customization (the documented
       * expo-router NativeTabs pattern) — a dot badge on the Training
       * tab icon so an in-progress session stays visible while on
       * another tab, without needing to overlay a JS view on top of
       * the native tab bar. */}
      <NativeTabs.Trigger>
        <NativeTabs.Trigger.Badge hidden={!activeSession} />
      </NativeTabs.Trigger>
      {/* `keyboardShouldPersistTaps="handled"` is the actual fix for the
       * "press play twice" bug: with a text input focused, the first tap
       * on another control (e.g. the rest timer's play button) used to be
       * swallowed dismissing the keyboard, so the control needed a second
       * tap. `expo.android.softwareKeyboardLayoutMode: "resize"` (app.json)
       * handles the keyboard-overlay half on Android by resizing the
       * window instead of panning it, so no height-behavior wrapper there
       * (it would double-compensate) — only iOS gets the `padding`
       * behavior. Auto-scrolling the focused set row above the keyboard
       * was NOT implemented — see the report / AGENTS.md for the
       * deferral note.
       *
       * The page-level ScrollView that used to live here was moved INSIDE
       * `TrainingTab` (2026-08-24 structural pass): it now only wraps the
       * StartScreen/History picker views, while a live session renders
       * `SessionScreen` into a plain `flex: 1` region so the rest timer and
       * Finish button can't scroll away out from under a live workout.
       * `keyboardShouldPersistTaps="handled"` + `keyboardDismissMode="on-drag"`
       * moved with it onto that ScrollView — carry them onto SessionScreen's
       * own ScrollView too when T3.1 adds it. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TrainingTab />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fdf6f0",
  },
});

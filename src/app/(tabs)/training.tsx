import { ScrollView, StyleSheet } from "react-native";
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
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <TrainingTab />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fdf6f0",
  },
});

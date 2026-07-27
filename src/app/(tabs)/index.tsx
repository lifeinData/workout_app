import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DashboardTab } from "@/components/fitness/DashboardTab";
import { AdherenceRing } from "@/components/fitness/AdherenceRing";
import { InterventionModal } from "@/components/fitness/InterventionModal";

export default function HomeScreen() {
  const [showModal, setShowModal] = useState(false);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <DashboardTab onOpenModal={() => setShowModal(true)} />
      </ScrollView>

      <AdherenceRing />

      {showModal && (
        <InterventionModal onClose={() => setShowModal(false)} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fdf6f0",
  },
});

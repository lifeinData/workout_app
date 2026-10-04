import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useMe } from "@/lib/queries";
import { colors } from "@/lib/theme";
import CoachTab from "@/components/fitness/CoachTab";

/**
 * Coach tab route. Only mounted (by `(tabs)/_layout.tsx`) for users with
 * role === "coach"; the gate below also bounces anyone who deep-links here.
 * `SafeAreaView` comes from react-native-safe-area-context (the RN core one
 * is deprecated — Warning1). `CoachTab` owns its own ScrollView so it can
 * attach pull-to-refresh to the queries it renders.
 */
export default function CoachRoute() {
  const { data: me, isLoading } = useMe();

  useEffect(() => {
    if (!isLoading && me?.role !== "coach") {
      router.replace("/training");
    }
  }, [me, isLoading]);

  if (isLoading || !me || me.role !== "coach") {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <CoachTab />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});

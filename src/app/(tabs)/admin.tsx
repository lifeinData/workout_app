import { useEffect } from "react";
import { ActivityIndicator, SafeAreaView, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useMe } from "@/lib/queries";
import AdminTab from "@/components/fitness/AdminTab";

export default function AdminRoute() {
  const { data: me, isLoading } = useMe();

  useEffect(() => {
    if (!isLoading && me?.role !== "admin") {
      router.replace("/");
    }
  }, [me, isLoading]);

  if (isLoading || !me || me.role !== "admin") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fdf6f0" }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#e87d6f" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fdf6f0" }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <AdminTab />
      </ScrollView>
    </SafeAreaView>
  );
}

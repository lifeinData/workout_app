import { useEffect } from "react";
import { router, Stack } from "expo-router";
import { useMe } from "@/lib/queries";

export default function AuthLayout() {
  const { data: me, isLoading } = useMe();

  useEffect(() => {
    if (!isLoading && me) {
      router.replace("/");
    }
  }, [me, isLoading]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#fdf6f0" } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
    </Stack>
  );
}

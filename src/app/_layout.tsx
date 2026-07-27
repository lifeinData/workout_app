import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { AppState } from "react-native";
import Toast from "react-native-toast-message";
import { setUnauthorizedHandler } from "@/lib/api";
import { api } from "@/lib/api";
import { clearToken } from "@/lib/auth";
import { queryKeys } from "@/lib/queries";
import "../global.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, refetchOnWindowFocus: false },
  },
});

/**
 * api.ts is a pure transport module with no React Query dependency,
 * so it exposes a callback for "the user just got a 401". We wire it
 * here — inside the QueryClientProvider so we have a useQueryClient
 * — to invalidate ["auth", "me"], which triggers the gate layouts
 * in (tabs) and (auth) to re-evaluate and redirect to /login.
 */
function AuthBridge() {
  const qc = useQueryClient();
  useEffect(() => {
    setUnauthorizedHandler(() => {
      qc.invalidateQueries({ queryKey: queryKeys.me });
    });
    return () => setUnauthorizedHandler(null);
  }, [qc]);
  return null;
}

/**
 * Retry-failed-logout on app foreground. If the user signed out while
 * offline, the POST /auth/logout request left a live server-side
 * session row. The 30-day TTL is the only mitigation otherwise. This
 * bridge runs `api.logout()` again on AppState `active` whenever a
 * queued-logout flag is set in AsyncStorage.
 */
function LogoutRetryBridge() {
  useEffect(() => {
    let cancelled = false;
    const onAppActive = async () => {
      if (cancelled) return;
      try {
        const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
        const pending = await AsyncStorage.getItem("@workout/pending-logout");
        if (!pending) return;
        try {
          await api.logout();
        } catch {
          // Still offline / server down. Leave the flag set so we
          // try again on the next foreground.
          return;
        }
        await AsyncStorage.removeItem("@workout/pending-logout");
        await clearToken();
      } catch {
        // AsyncStorage import failed or something unexpected. Swallow.
      }
    };
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") onAppActive();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
  return null;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthBridge />
      <LogoutRetryBridge />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
      </Stack>
      <Toast />
    </QueryClientProvider>
  );
}

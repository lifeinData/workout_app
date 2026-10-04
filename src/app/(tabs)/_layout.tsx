import { useEffect } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMe, queryKeys } from "@/lib/queries";
import { api } from "@/lib/api";
import { clearToken } from "@/lib/auth";
import Toast from "@/components/ui/Toast";

/**
 * (tabs) gate. If the user is not signed in, send them to /login.
 * Once signed in we render the (iOS 18+) native tab bar. The Coach
 * trigger is only mounted for users with role === "coach", and carries a
 * count badge = pending athlete requests + unread DMs.
 *
 * The badge queries live HERE (not in the coach screen, unlike Training's
 * dot badge in training.tsx) because the layout is always mounted, so the
 * badge is live even before the coach has opened the tab. They share the
 * `queryKeys.coachAthletes` / `queryKeys.unread` cache entries with
 * `useCoachAthletes()` / `useUnread()`, so the Coach screen reuses the same
 * data; they're written inline only to gate them with `enabled` (a
 * non-coach would 403 on /coach/athletes).
 *
 * NOTE: NativeTabs is designed to be the root navigator; we are
 * mounting it as a child of the root Stack so we can swap between
 * (tabs) and (auth). If expo-router 5.x rejects this nesting, fall
 * back to the regular `Tabs` component from "expo-router/tabs".
 */
// Training is the only built-out tab, so the app opens on it.
export const unstable_settings = { initialRouteName: "training" };

/** Home / Nutrition / Community are still mock data, so they're shown but
 * inert: `disabled` blocks the native tap, and the still-emitted `tabPress`
 * says why. (The native bar can't colour one tab differently, so they keep
 * the normal unselected colour.) */
const comingSoon = {
  tabPress: () =>
    Toast.show({
      type: "info",
      text1: "Coming soon",
      text2: "Training is ready to use for now.",
    }),
};

export default function TabsLayout() {
  const { data: me, isLoading, isError } = useMe();
  const qc = useQueryClient();
  const isCoach = me?.role === "coach";

  const { data: athletes } = useQuery({
    queryKey: queryKeys.coachAthletes,
    queryFn: () => api.coachListAthletes(),
    enabled: isCoach,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const { data: unread } = useQuery({
    queryKey: queryKeys.unread,
    queryFn: () => api.getUnread(),
    enabled: isCoach,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const coachBadge = (athletes?.requests.length ?? 0) + (unread?.total ?? 0);

  const tintColor = "#e87d6f"; // --primary (coral) — selected icon + label
  const labelColor = "#8b7268"; // --muted-foreground — unselected icon + label
  const bgColor = "#fdf6f0"; // app background — the tab bar sits on this
  const indicatorColor = "#fce4d8"; // --secondary (peach) — active-tab pill, on-brand

  useEffect(() => {
    if (!isLoading && me === null) {
      router.replace("/login");
    }
  }, [isLoading, me]);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fdf6f0",
        }}
      >
        <ActivityIndicator color="#e87d6f" />
      </View>
    );
  }

  if (me === null) {
    /* Redirect pending. Render a blank loading state so we never
     * briefly flash the tabs to an unauthenticated user. */
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fdf6f0",
        }}
      >
        <ActivityIndicator color="#e87d6f" />
      </View>
    );
  }

  if (isError) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fdf6f0",
          padding: 24,
          gap: 16,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "600", color: "#3d2b26" }}>
          Could not reach the server
        </Text>
        <Text style={{ fontSize: 13, color: "#8b7268", textAlign: "center" }}>
          Check that the backend is running and your phone is on the same WiFi.
        </Text>
        <Pressable
          onPress={() => qc.invalidateQueries({ queryKey: queryKeys.me })}
          style={{
            backgroundColor: "#e87d6f",
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: "#ffffff", fontWeight: "600" }}>Try again</Text>
        </Pressable>
        <Pressable
          onPress={async () => {
            await clearToken();
            router.replace("/login");
          }}
        >
          <Text style={{ color: "#8b7268", fontSize: 13 }}>
            Sign out and try again
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!me) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fdf6f0",
        }}
      >
        <ActivityIndicator color="#e87d6f" />
      </View>
    );
  }

  return (
    <NativeTabs
      tintColor={tintColor}
      backgroundColor={bgColor}
      // Without an explicit iconColor, UNSELECTED icons fall back to
      // Material 3's `onSurfaceVariant`, which is near-white on this
      // light background — effectively invisible. Set both states.
      iconColor={{ default: labelColor, selected: tintColor }}
      // Android's default `auto` hides labels on unselected tabs (with
      // 4+ tabs), so only the active tab was labelled. `labeled` keeps
      // every tab identifiable.
      labelVisibilityMode="labeled"
      labelStyle={{
        selected: { color: tintColor },
        default: { color: labelColor },
      }}
    >
      <NativeTabs.Trigger
        name="home"
        indicatorColor={indicatorColor}
        disabled
        listeners={comingSoon}
      >
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="home" sf="house.fill" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="nutrition"
        indicatorColor={indicatorColor}
        disabled
        listeners={comingSoon}
      >
        <NativeTabs.Trigger.Label>Nutrition</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="lunch_dining" sf="fork.knife" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="training" indicatorColor={indicatorColor}>
        <NativeTabs.Trigger.Label>Training</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md="fitness_center"
          sf="figure.strengthtraining.traditional"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="community"
        indicatorColor={indicatorColor}
        disabled
        listeners={comingSoon}
      >
        <NativeTabs.Trigger.Label>Community</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="groups" sf="person.3.fill" />
      </NativeTabs.Trigger>
      {me.role === "coach" && (
        <NativeTabs.Trigger name="coach" indicatorColor={indicatorColor}>
          <NativeTabs.Trigger.Label>Coach</NativeTabs.Trigger.Label>
          {/* md "sports" is Material's referee whistle. */}
          <NativeTabs.Trigger.Icon md="sports" sf="person.2.fill" />
          <NativeTabs.Trigger.Badge hidden={coachBadge === 0}>
            {coachBadge > 9 ? "9+" : String(coachBadge)}
          </NativeTabs.Trigger.Badge>
        </NativeTabs.Trigger>
      )}
    </NativeTabs>
  );
}

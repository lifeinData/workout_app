import { useState, type JSX } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, MessageCircle, Users } from "lucide-react-native";
import Toast from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { CoachAvatar, UnreadBadge } from "@/components/fitness/coach/CoachAvatar";
import { MessageThreadSheet } from "@/components/fitness/coach/MessageThreadSheet";
import { useAcceptLink, useDeclineLink } from "@/lib/queries";
import { coachName } from "@/lib/coach";
import { colors, elevation, radius, space, tabular, type } from "@/lib/theme";
import type { AthleteRow, AthletesResponse, LastMessage, UserPublic } from "@/lib/api";

/* ------------------------------------------------------------------ *
 * Coach → Athletes segment (agenda D11)                              *
 *                                                                    *
 * Two groups that must never be confused at a glance:                *
 *  - NEW REQUESTS — loud. Peach (`secondary`) cards with a coral     *
 *    rail on the left edge (the same rail grammar as a committed set *
 *    row), a coral count pill in the header, and the decision right  *
 *    on the card: Accept · Decline · Message.                        *
 *  - YOUR ATHLETES — calm. One white grouped list, hairline-divided  *
 *    rows, no accent except an unread badge. Tap → DM thread.        *
 * ------------------------------------------------------------------ */

const RAIL_W = 4;
const AVATAR = 44;

type Thread = { user: UserPublic; subtitle: string };

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "just now" · "5m ago" · "3h ago" · "2d ago" · "Sep 12". */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function previewText(m: LastMessage): string {
  const body = m.body.replace(/\s+/g, " ").trim();
  return m.from_me ? `You: ${body}` : body;
}

export interface CoachAthletesPanelProps {
  data: AthletesResponse | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
}

export function CoachAthletesPanel({
  data,
  isLoading,
  error,
  onRetry,
}: CoachAthletesPanelProps): JSX.Element {
  // `thread` outlives `threadOpen` so the sheet keeps its content while it
  // animates out.
  const [thread, setThread] = useState<Thread | null>(null);
  const [threadOpen, setThreadOpen] = useState(false);
  const accept = useAcceptLink();
  const decline = useDeclineLink();

  const openThread = (user: UserPublic, subtitle: string) => {
    setThread({ user, subtitle });
    setThreadOpen(true);
  };

  const handleAccept = (row: AthleteRow) => {
    const name = coachName(row.user);
    accept.mutate(row.link_id, {
      onSuccess: () =>
        Toast.show({
          type: "success",
          text1: `${name} is now your athlete`,
          text2: "Send them a workout from the Workouts tab.",
        }),
      onError: (err) =>
        Toast.show({ type: "error", text1: "Could not accept request", text2: err.message }),
    });
  };

  const handleDecline = (row: AthleteRow) => {
    const name = coachName(row.user);
    Alert.alert(
      `Decline ${name}?`,
      "Their request is removed and your conversation closes. They can ask again later.",
      [
        { text: "Keep request", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: () =>
            decline.mutate(row.link_id, {
              onSuccess: () => Toast.show({ type: "success", text1: "Request declined" }),
              onError: (err) =>
                Toast.show({
                  type: "error",
                  text1: "Could not decline request",
                  text2: err.message,
                }),
            }),
        },
      ],
    );
  };

  let body: JSX.Element;
  if (isLoading) {
    body = (
      <View style={styles.statusRow}>
        <ActivityIndicator color={colors.mutedForeground} />
        <Text maxFontSizeMultiplier={1.3} style={styles.statusText}>
          Loading athletes…
        </Text>
      </View>
    );
  } else if (error || !data) {
    body = (
      <Card style={styles.errorCard}>
        <Text maxFontSizeMultiplier={1.3} style={styles.errorTitle}>
          Couldn&rsquo;t load athletes
        </Text>
        <Text maxFontSizeMultiplier={1.3} style={styles.errorBody}>
          {error ? `${error.message}. ` : ""}Check that the server is reachable, then try again.
        </Text>
        <Button label="Retry" variant="ghost" size="sm" onPress={onRetry} style={styles.selfStart} />
      </Card>
    );
  } else if (data.requests.length === 0 && data.athletes.length === 0) {
    body = (
      <View style={styles.empty}>
        <Users size={24} color={colors.mutedForeground} />
        <Text maxFontSizeMultiplier={1.3} style={styles.emptyTitle}>
          No athletes yet
        </Text>
        <Text maxFontSizeMultiplier={1.3} style={styles.emptyBody}>
          Athletes find you from their Coach&rsquo;s Playbook and send a request.
        </Text>
      </View>
    );
  } else {
    body = (
      <>
        {data.requests.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text maxFontSizeMultiplier={1.3} style={styles.sectionTitle}>
                New requests
              </Text>
              <View style={styles.countPill}>
                <Text maxFontSizeMultiplier={1.3} style={styles.countPillText}>
                  {data.requests.length}
                </Text>
              </View>
            </View>
            <Text maxFontSizeMultiplier={1.3} style={styles.sectionHint}>
              Accept to start coaching. You can message them first.
            </Text>
            <View style={styles.requestList}>
              {data.requests.map((row) => (
                <RequestCard
                  key={row.link_id}
                  row={row}
                  accepting={accept.isPending && accept.variables === row.link_id}
                  declining={decline.isPending && decline.variables === row.link_id}
                  onAccept={() => handleAccept(row)}
                  onDecline={() => handleDecline(row)}
                  onMessage={() => openThread(row.user, "Request pending")}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text maxFontSizeMultiplier={1.3} style={styles.sectionTitle}>
              Your athletes
            </Text>
            {data.athletes.length > 0 ? (
              <Text maxFontSizeMultiplier={1.3} style={styles.sectionCount}>
                {data.athletes.length}
              </Text>
            ) : null}
          </View>
          {data.athletes.length > 0 ? (
            <Card padded={false} style={styles.roster}>
              {data.athletes.map((row, i) => (
                <AthleteListRow
                  key={row.link_id}
                  row={row}
                  first={i === 0}
                  onPress={() => openThread(row.user, "Athlete")}
                />
              ))}
            </Card>
          ) : (
            <Text maxFontSizeMultiplier={1.3} style={styles.sectionHint}>
              Accepted athletes show up here.
            </Text>
          )}
        </View>
      </>
    );
  }

  return (
    <View style={styles.root}>
      {body}
      {thread ? (
        <MessageThreadSheet
          visible={threadOpen}
          onClose={() => setThreadOpen(false)}
          otherUser={thread.user}
          subtitle={thread.subtitle}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Request card — the loud one                                        *
 * ------------------------------------------------------------------ */

function RequestCard({
  row,
  accepting,
  declining,
  onAccept,
  onDecline,
  onMessage,
}: {
  row: AthleteRow;
  accepting: boolean;
  declining: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onMessage: () => void;
}): JSX.Element {
  const name = coachName(row.user);
  const busy = accepting || declining;
  const when = relativeTime(row.created_at);

  return (
    <View style={styles.requestCard}>
      <View style={styles.rail} />
      <View style={styles.requestContent}>
        <View style={styles.requestHead}>
          {/* White ring: the avatar's peach fill would otherwise vanish
           * into the peach card. */}
          <View style={styles.avatarRing}>
            <CoachAvatar initials={row.user.initials} name={name} size={AVATAR} />
          </View>
          <View style={styles.flexShrink}>
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.requestName}>
              {name}
            </Text>
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.requestMeta}>
              Wants you as their coach{when ? ` · ${when}` : ""}
            </Text>
          </View>
        </View>

        {row.last_message ? (
          <View style={styles.quote}>
            <Text maxFontSizeMultiplier={1.3} numberOfLines={2} style={styles.quoteText}>
              {previewText(row.last_message)}
            </Text>
          </View>
        ) : null}

        <View style={styles.requestActions}>
          <Button
            label="Accept"
            size="sm"
            onPress={onAccept}
            loading={accepting}
            disabled={busy}
            style={styles.flex}
          />
          <Button
            label="Decline"
            variant="ghost"
            size="sm"
            onPress={onDecline}
            loading={declining}
            disabled={busy}
            style={busy ? undefined : styles.onPeach}
          />
          <View>
            <IconButton
              size={44}
              accessibilityLabel={`Message ${name}`}
              backgroundColor={colors.card}
              onPress={onMessage}
            >
              <MessageCircle size={18} color={colors.secondaryForeground} />
            </IconButton>
            <View style={styles.badgeAnchor} pointerEvents="none">
              <UnreadBadge count={row.unread_count} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Roster row — the calm one                                          *
 * ------------------------------------------------------------------ */

function AthleteListRow({
  row,
  first,
  onPress,
}: {
  row: AthleteRow;
  first: boolean;
  onPress: () => void;
}): JSX.Element {
  const [pressed, setPressed] = useState(false);
  const name = coachName(row.user);
  const hasUnread = row.unread_count > 0;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${plural(row.assigned_workout_count, "workout")} sent${
        hasUnread ? `, ${row.unread_count} unread` : ""
      }`}
      accessibilityHint="Opens your conversation"
      style={[styles.rosterRow, pressed ? styles.rosterRowPressed : null]}
    >
      <CoachAvatar initials={row.user.initials} name={name} size={AVATAR} />
      <View style={[styles.rosterText, first ? null : styles.rosterDivider]}>
        <View style={styles.flexShrink}>
          <Text
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
            style={[styles.rosterName, hasUnread ? styles.strong : null]}
          >
            {name}
          </Text>
          <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.rosterMeta}>
            {plural(row.assigned_workout_count, "workout")} sent
          </Text>
          {row.last_message ? (
            <Text
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
              style={[styles.rosterPreview, hasUnread ? styles.previewUnread : null]}
            >
              {previewText(row.last_message)}
            </Text>
          ) : null}
        </View>
        <View style={styles.rosterTrail}>
          <UnreadBadge count={row.unread_count} />
          <ChevronRight size={18} color={colors.mutedForeground} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xl },
  flex: { flex: 1 },
  flexShrink: { flex: 1, minWidth: 0 },
  selfStart: { alignSelf: "flex-start" },
  strong: { fontWeight: "600" },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
    paddingVertical: space.xl,
  },
  statusText: { ...type.label, color: colors.mutedForeground },
  errorCard: { gap: space.sm },
  errorTitle: { ...type.heading, color: colors.foreground },
  errorBody: { ...type.label, color: colors.mutedForeground },
  empty: {
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.xxxl,
    paddingHorizontal: space.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
  },
  emptyTitle: { ...type.heading, color: colors.foreground },
  emptyBody: { ...type.label, color: colors.mutedForeground, textAlign: "center" },

  section: { gap: space.sm },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: space.sm },
  sectionTitle: { ...type.heading, color: colors.foreground },
  sectionCount: { ...type.heading, ...tabular, color: colors.mutedForeground },
  sectionHint: { ...type.caption, color: colors.mutedForeground },
  countPill: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: space.sm,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  countPillText: {
    ...type.label,
    ...tabular,
    fontWeight: "700",
    color: colors.primaryForeground,
  },

  requestList: { gap: space.md, marginTop: space.xs },
  requestCard: {
    flexDirection: "row",
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...elevation.e1,
  },
  rail: { width: RAIL_W, backgroundColor: colors.primary },
  requestContent: { flex: 1, padding: space.lg, gap: space.md },
  requestHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  avatarRing: {
    padding: 2,
    borderRadius: radius.full,
    backgroundColor: colors.card,
  },
  requestName: { ...type.heading, color: colors.foreground },
  requestMeta: { ...type.caption, color: colors.secondaryForeground },
  quote: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderTopLeftRadius: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  quoteText: { ...type.label, color: colors.foreground },
  requestActions: { flexDirection: "row", alignItems: "center", gap: space.sm },
  onPeach: { backgroundColor: colors.card },
  badgeAnchor: { position: "absolute", top: -space.xs, right: -space.xs },

  roster: { overflow: "hidden" },
  rosterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingLeft: space.lg,
  },
  rosterRowPressed: { backgroundColor: colors.muted },
  rosterText: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.md,
    paddingRight: space.lg,
    minHeight: 72,
  },
  rosterDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rosterName: { ...type.body, color: colors.foreground },
  rosterMeta: { ...type.caption, ...tabular, color: colors.mutedForeground },
  rosterPreview: { ...type.caption, color: colors.mutedForeground },
  previewUnread: { color: colors.foreground },
  rosterTrail: { flexDirection: "row", alignItems: "center", gap: space.sm },
});

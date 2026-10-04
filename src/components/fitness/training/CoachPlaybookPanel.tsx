import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MessageCircle, Play, UsersRound } from "lucide-react-native";
import Toast from "@/components/ui/Toast";
import {
  useCancelCoachLink,
  useCoaches,
  useMyCoach,
  usePlaybook,
  useRequestCoach,
  useUnread,
} from "@/lib/queries";
import type { CoachLinkResponse, CoachPublic, WorkoutSummaryResponse } from "@/lib/api";
import { coachName } from "@/lib/coach";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Sheet } from "@/components/ui/Sheet";
import { CoachAvatar, UnreadBadge } from "@/components/fitness/coach/CoachAvatar";
import { MessageThreadSheet } from "@/components/fitness/coach/MessageThreadSheet";
import { colors, radius, space, tabular, type } from "@/lib/theme";

/** Server limit for the request's opening message (`POST /me/coach-requests`). */
const MAX_REQUEST_MESSAGE = 2000;
/** Show the remaining-characters counter only near the limit. */
const COUNTER_FROM = MAX_REQUEST_MESSAGE - 200;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface CoachPlaybookPanelProps {
  /** Starts a session from the tapped workout (StartScreen's `startFrom`). */
  onSelectWorkout: (id: string) => void;
}

/**
 * The Coach's Playbook tab body (agenda D9/D10, P2, P5). One query
 * (`GET /me/playbook`) decides which of four states renders:
 *
 * - coach user          → "Your library": the full shared library;
 * - no coach link       → an inviting "find a coach" card with the coach list;
 * - pending request     → the coach card (pending) + cancel;
 * - accepted            → the coach card + the workouts that coach sent.
 *
 * The link itself is read from `useMyCoach()` when available: it polls every
 * 30 s and is invalidated by mark-read, so the status chip and unread badge
 * stay live, whereas the playbook query doesn't poll. When the polled status
 * drifts from the playbook's (the coach accepted, or declined), the playbook
 * is refetched so the workout list follows.
 */
export function CoachPlaybookPanel({ onSelectWorkout }: CoachPlaybookPanelProps) {
  const playbook = usePlaybook();
  const myCoach = useMyCoach();
  const unread = useUnread();

  const isCoach = playbook.data?.is_coach ?? false;
  const link: CoachLinkResponse | null = isCoach
    ? null
    : myCoach.data !== undefined
      ? myCoach.data
      : (playbook.data?.coach_link ?? null);

  const playbookStatus = playbook.data?.coach_link?.status ?? null;
  const liveStatus = myCoach.data === undefined ? playbookStatus : (myCoach.data?.status ?? null);
  const refetchPlaybook = playbook.refetch;
  const playbookLoaded = playbook.data !== undefined;
  useEffect(() => {
    if (!playbookLoaded || isCoach) return;
    if (liveStatus !== playbookStatus) void refetchPlaybook();
  }, [playbookLoaded, isCoach, liveStatus, playbookStatus, refetchPlaybook]);

  if (playbook.isLoading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={colors.mutedForeground} />
      </View>
    );
  }

  if (playbook.isError || !playbook.data) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle} maxFontSizeMultiplier={1.3}>
          Couldn&apos;t load your playbook
        </Text>
        <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>
          Check your connection and try again.
        </Text>
        <Button
          label="Retry"
          variant="ghost"
          size="sm"
          onPress={() => void playbook.refetch()}
          style={styles.emptyAction}
        />
      </View>
    );
  }

  const { workouts } = playbook.data;

  if (isCoach) {
    return (
      <View style={styles.stack}>
        <SectionHeader title="Your library" count={workouts.length} />
        {workouts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>
              The library is empty. Build a workout from the Coach tab.
            </Text>
          </View>
        ) : (
          workouts.map((w) => (
            <PlaybookWorkoutCard key={w.id} workout={w} onPress={() => onSelectWorkout(w.id)} />
          ))
        )}
      </View>
    );
  }

  if (!link) return <FindCoachCard />;

  const coach = link.coach;
  const name = coachName(coach);
  const unreadCount = unread.data ? (unread.data.by_user[coach.id] ?? 0) : link.unread_count;

  return (
    <View style={styles.stack}>
      <CoachCard link={link} unreadCount={unreadCount} />

      {link.status === "accepted" && (
        <>
          <SectionHeader title={`From Coach ${name}`} count={workouts.length} />
          {workouts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle} maxFontSizeMultiplier={1.3}>
                Coach {name} hasn&apos;t sent you any workouts yet.
              </Text>
              <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>
                Workouts they send you will show up here.
              </Text>
            </View>
          ) : (
            workouts.map((w) => (
              <PlaybookWorkoutCard key={w.id} workout={w} onPress={() => onSelectWorkout(w.id)} />
            ))
          )}
        </>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Shared bits                                                         *
 * ------------------------------------------------------------------ */

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {title}
      </Text>
      {count > 0 && (
        <Text style={[styles.sectionCount, tabular]} maxFontSizeMultiplier={1.3}>
          {count}
        </Text>
      )}
    </View>
  );
}

/** A Pressable whose pressed dim is driven by state — never the
 * function-form Pressable style, which NativeWind drops on device. */
function PressableSurface({
  onPress,
  accessibilityLabel,
  children,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.pressable, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

/** A Playbook workout. Tapping starts a session from it (same as the old
 * `WorkoutRow`). No tag badge; attribution folded into the meta line. */
function PlaybookWorkoutCard({
  workout,
  onPress,
}: {
  workout: WorkoutSummaryResponse;
  onPress: () => void;
}) {
  const meta = [
    workout.created_by ? `Added by Coach ${coachName(workout.created_by)}` : null,
    plural(workout.exercise_count, "exercise", "exercises"),
    workout.duration_min != null ? `${workout.duration_min} min` : null,
  ]
    .filter((s): s is string => s !== null)
    .join(" · ");

  return (
    <PressableSurface onPress={onPress} accessibilityLabel={`Start ${workout.name}`}>
      <Card style={styles.workoutCard}>
        <View style={styles.workoutRow}>
          <View style={styles.flexCol}>
            <Text style={styles.workoutName} numberOfLines={2} maxFontSizeMultiplier={1.3}>
              {workout.name}
            </Text>
            <Text style={[styles.meta, tabular]} maxFontSizeMultiplier={1.3}>
              {meta}
            </Text>
          </View>
          {/* Visual cue only — the whole card is the press target. */}
          <View style={styles.startGlyph}>
            <Play size={14} color={colors.foreground} fill={colors.foreground} />
          </View>
        </View>
        {workout.equipment.length > 0 && (
          <View style={styles.chipRow}>
            {workout.equipment.map((eq) => (
              <View key={eq} style={styles.eqChip}>
                <Text style={styles.eqChipLabel} maxFontSizeMultiplier={1.3}>
                  {eq}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>
    </PressableSurface>
  );
}

/* ------------------------------------------------------------------ *
 * Coach card — pending / accepted                                     *
 * ------------------------------------------------------------------ */

function StatusPill({ pending }: { pending: boolean }) {
  return (
    <View style={[styles.statusPill, pending ? styles.statusPillPending : styles.statusPillActive]}>
      <View
        style={[
          styles.statusDot,
          { backgroundColor: pending ? colors.warmup : colors.success },
        ]}
      />
      <Text
        style={[
          styles.statusText,
          { color: pending ? colors.mutedForeground : colors.secondaryForeground },
        ]}
        maxFontSizeMultiplier={1.3}
      >
        {pending ? "Request pending" : "Your coach"}
      </Text>
    </View>
  );
}

function CoachCard({ link, unreadCount }: { link: CoachLinkResponse; unreadCount: number }) {
  const [threadOpen, setThreadOpen] = useState(false);
  const [cancelPressed, setCancelPressed] = useState(false);
  const cancelLink = useCancelCoachLink();
  const coach = link.coach;
  const name = coachName(coach);
  const pending = link.status === "pending";

  const confirmCancel = () => {
    // Device-only: Alert.alert is a no-op on web.
    Alert.alert(
      "Cancel your request?",
      `Coach ${name} won't be able to accept it, and you can pick a coach again.`,
      [
        { text: "Keep request", style: "cancel" },
        {
          text: "Cancel request",
          style: "destructive",
          onPress: () =>
            cancelLink.mutate(undefined, {
              onSuccess: () => Toast.show({ type: "success", text1: "Request cancelled" }),
              onError: (err) =>
                Toast.show({
                  type: "error",
                  text1: "Could not cancel request",
                  text2: errMessage(err),
                }),
            }),
        },
      ]
    );
  };

  return (
    <Card style={styles.coachCard}>
      <View style={styles.coachRow}>
        <CoachAvatar initials={coach.initials} name={name} size={56} />
        <View style={styles.flexCol}>
          <Text style={styles.coachName} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            Coach {name}
          </Text>
          <StatusPill pending={pending} />
        </View>
      </View>

      <View style={styles.messageWrap}>
        <Button
          label="Message"
          variant="ghost"
          size="md"
          onPress={() => setThreadOpen(true)}
          leftIcon={<MessageCircle size={16} color={colors.foreground} />}
        />
        {/* Badge floats on the button's corner; it never takes the press. */}
        <View style={styles.badgeSlot} pointerEvents="none">
          <UnreadBadge count={unreadCount} />
        </View>
      </View>

      {pending && (
        <View style={styles.pendingFooter}>
          <Text style={styles.pendingNote} maxFontSizeMultiplier={1.3}>
            Coach {name} will see your request and can message you here.
          </Text>
          <Pressable
            onPress={confirmCancel}
            onPressIn={() => setCancelPressed(true)}
            onPressOut={() => setCancelPressed(false)}
            disabled={cancelLink.isPending}
            accessibilityRole="button"
            accessibilityLabel="Cancel request"
            style={[styles.textAction, (cancelPressed || cancelLink.isPending) && styles.pressed]}
          >
            <Text style={styles.textActionLabel} maxFontSizeMultiplier={1.3}>
              {cancelLink.isPending ? "Cancelling…" : "Cancel request"}
            </Text>
          </Pressable>
        </View>
      )}

      <MessageThreadSheet
        visible={threadOpen}
        onClose={() => setThreadOpen(false)}
        otherUser={coach}
        subtitle={pending ? "Request pending" : "Your coach"}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * No coach — find one                                                 *
 * ------------------------------------------------------------------ */

function FindCoachCard() {
  const coaches = useCoaches();
  const [target, setTarget] = useState<CoachPublic | null>(null);

  return (
    <Card style={styles.findCard}>
      <View style={styles.introIcon}>
        <UsersRound size={22} color={colors.secondaryForeground} />
      </View>
      <Text style={styles.introTitle} maxFontSizeMultiplier={1.3}>
        You don&apos;t have a coach yet.
      </Text>
      <Text style={styles.introBody} maxFontSizeMultiplier={1.3}>
        Pick a coach and send them a message about your goals.
      </Text>

      <View style={styles.coachList}>
        {coaches.isLoading ? (
          <View style={styles.inlineLoading}>
            <ActivityIndicator color={colors.mutedForeground} />
          </View>
        ) : coaches.isError ? (
          <View style={styles.inlineState}>
            <Text style={styles.meta} maxFontSizeMultiplier={1.3}>
              Couldn&apos;t load coaches.
            </Text>
            <Button
              label="Retry"
              variant="ghost"
              size="sm"
              onPress={() => void coaches.refetch()}
            />
          </View>
        ) : (coaches.data ?? []).length === 0 ? (
          <View style={styles.inlineState}>
            <Text style={styles.meta} maxFontSizeMultiplier={1.3}>
              No coaches are available yet.
            </Text>
          </View>
        ) : (
          (coaches.data ?? []).map((c, i) => (
            <View key={c.id} style={[styles.coachListRow, i > 0 && styles.hairlineTop]}>
              <CoachAvatar initials={c.initials} name={coachName(c)} size={44} />
              <View style={styles.flexCol}>
                <Text style={styles.listName} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  Coach {coachName(c)}
                </Text>
                <Text style={[styles.meta, tabular]} maxFontSizeMultiplier={1.3}>
                  {plural(c.athlete_count, "athlete", "athletes")}
                </Text>
              </View>
              <Button label="Request" variant="ghost" size="sm" onPress={() => setTarget(c)} />
            </View>
          ))
        )}
      </View>

      {target && <RequestCoachSheet coach={target} onClose={() => setTarget(null)} />}
    </Card>
  );
}

function RequestCoachSheet({ coach, onClose }: { coach: CoachPublic; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [focused, setFocused] = useState(false);
  const requestCoach = useRequestCoach();
  const name = coachName(coach);
  const remaining = MAX_REQUEST_MESSAGE - message.length;

  const send = () => {
    const trimmed = message.trim();
    requestCoach.mutate(
      { coach_id: coach.id, message: trimmed ? trimmed : undefined },
      {
        onSuccess: () => {
          Toast.show({
            type: "success",
            text1: "Request sent",
            text2: `Coach ${name} will see it in their Coach tab.`,
          });
          onClose();
        },
        onError: (err) =>
          Toast.show({ type: "error", text1: "Could not send request", text2: errMessage(err) }),
      }
    );
  };

  return (
    <Sheet onClose={onClose} title={`Request Coach ${name}`}>
      <View style={styles.sheetBody}>
        <View style={styles.sheetCoachRow}>
          <CoachAvatar initials={coach.initials} name={name} size={44} />
          <Text style={styles.sheetLead} maxFontSizeMultiplier={1.3}>
            Your message is the first thing Coach {name} reads. Optional, but it helps.
          </Text>
        </View>

        <TextInput
          value={message}
          onChangeText={setMessage}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Tell them about your goals"
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel="Tell them about your goals"
          multiline
          maxLength={MAX_REQUEST_MESSAGE}
          maxFontSizeMultiplier={1.3}
          textAlignVertical="top"
          style={[styles.input, focused && styles.inputFocused]}
        />
        {message.length >= COUNTER_FROM && (
          <Text style={[styles.counter, tabular]} maxFontSizeMultiplier={1.3}>
            {remaining} left
          </Text>
        )}

        <Button
          label={requestCoach.isPending ? "Sending…" : "Send request"}
          onPress={send}
          loading={requestCoach.isPending}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  flexCol: { flex: 1, minWidth: 0, gap: space.xs },
  loadingBox: { padding: space.xxxl, alignItems: "center" },
  pressable: { borderRadius: radius.lg },
  pressed: { opacity: 0.85 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.sm,
    marginTop: space.sm,
  },
  sectionTitle: { ...type.heading, color: colors.foreground, flexShrink: 1 },
  sectionCount: { ...type.label, color: colors.mutedForeground },

  /* Workout card — same rhythm as My Workouts' PastSessionRow (padding 14). */
  workoutCard: { padding: 14, gap: space.md },
  workoutRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  workoutName: { ...type.heading, color: colors.foreground },
  meta: { ...type.caption, color: colors.mutedForeground },
  startGlyph: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 2,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  eqChip: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
  },
  eqChipLabel: { ...type.micro, color: colors.mutedForeground, textTransform: "capitalize" },

  /* Coach card */
  coachCard: { padding: space.xl, gap: space.lg },
  coachRow: { flexDirection: "row", alignItems: "center", gap: space.lg },
  coachName: { ...type.title, color: colors.foreground },
  statusPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.full,
  },
  statusPillActive: { backgroundColor: colors.secondary },
  statusPillPending: { backgroundColor: colors.muted },
  statusDot: { width: 6, height: 6, borderRadius: radius.full },
  statusText: { ...type.caption },
  messageWrap: { alignSelf: "stretch" },
  badgeSlot: { position: "absolute", top: -6, right: -6 },
  pendingFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: space.md,
    gap: space.xs,
  },
  pendingNote: { ...type.label, color: colors.mutedForeground },
  textAction: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center" },
  textActionLabel: { ...type.label, fontWeight: "600", color: colors.destructive },

  /* No coach */
  findCard: { padding: space.xl },
  introIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.lg,
  },
  introTitle: { ...type.title, color: colors.foreground },
  introBody: { ...type.body, color: colors.mutedForeground, marginTop: space.xs },
  coachList: { marginTop: space.xl },
  coachListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
  },
  hairlineTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  listName: { ...type.body, fontWeight: "600", color: colors.foreground },
  inlineLoading: { paddingVertical: space.xl, alignItems: "center" },
  inlineState: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingVertical: space.md,
  },

  /* Request sheet */
  sheetBody: { gap: space.lg },
  sheetCoachRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  sheetLead: { ...type.label, color: colors.mutedForeground, flex: 1 },
  input: {
    ...type.body,
    color: colors.foreground,
    minHeight: 112,
    maxHeight: 180,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: "transparent",
    backgroundColor: colors.inputBackground,
  },
  inputFocused: { borderColor: colors.ring },
  counter: { ...type.caption, color: colors.mutedForeground, alignSelf: "flex-end", marginTop: -space.sm },

  /* Empty / error */
  emptyState: {
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    padding: space.xxl,
    alignItems: "center",
    gap: space.xs,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
  },
  emptyTitle: { ...type.body, fontWeight: "600", color: colors.foreground, textAlign: "center" },
  emptyText: { ...type.label, color: colors.mutedForeground, textAlign: "center" },
  emptyAction: { marginTop: space.md },
});

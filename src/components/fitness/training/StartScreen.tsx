import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import {
  Lock,
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCcw,
} from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import Toast from "@/components/ui/Toast";
import {
  useExercises,
  useMyWorkouts,
  usePRs,
  usePreferences,
  useStartSession,
} from "@/lib/queries";
import { fmtSessionDefaultName, localDateKey } from "@/lib/dates";
import { toKg, fmtWeight, type WeightUnit } from "@/lib/units";
import type { PersonalRecordResponse, SessionSummaryResponse } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { colors, radius, space, tabular, type } from "@/lib/theme";
import { CoachPlaybookPanel } from "./CoachPlaybookPanel";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Format a `local_date` (`YYYY-MM-DD`) for display, e.g. "Aug 21". Pure
 * string parsing — deliberately avoids `new Date(local_date)`, which
 * reinterprets the date-only string in the device's local timezone and can
 * shift it a day (the same class of bug `local_date` exists to prevent). */
function fmtLocalDateShort(localDate: string): string {
  const [, m, d] = localDate.split("-").map(Number);
  return `${MONTHS_SHORT[(m ?? 1) - 1]} ${d}`;
}

const TROPHY_DEFS: {
  exerciseId: string;
  animal: string;
  name: string;
  thresholdKg: number;
}[] = [
  { exerciseId: "ex-bench", animal: "\u{1F981}", name: "Lion", thresholdKg: toKg(225, "lb") },
  { exerciseId: "ex-deadlift", animal: "\u{1F985}", name: "Eagle", thresholdKg: toKg(405, "lb") },
  { exerciseId: "ex-squat", animal: "\u{1F43A}", name: "Wolf", thresholdKg: toKg(315, "lb") },
  { exerciseId: "ex-ohp", animal: "\u{1F43B}", name: "Bear", thresholdKg: toKg(185, "lb") },
  { exerciseId: "ex-pullup", animal: "\u{1F988}", name: "Shark", thresholdKg: toKg(20, "lb") },
];

interface StartScreenProps {
  onOpenPastSession?: (id: string) => void;
  onRepeatSession?: (id: string) => void;
}

export function StartScreen({ onOpenPastSession, onRepeatSession }: StartScreenProps) {
  const [activeSlide, setActiveSlide] = useState(0);

  const { data: prefs } = usePreferences();
  const { data: prs } = usePRs();
  const { data: exercises } = useExercises({ limit: 500 });
  const startSession = useStartSession();

  const weightUnit = (prefs?.weight_unit ?? "lb") as WeightUnit;
  const catalogIds = useMemo(() => new Set((exercises ?? []).map((e) => e.id)), [exercises]);

  const startFrom = (workoutId?: string) => {
    startSession.mutate(
      {
        workout_id: workoutId,
        local_date: localDateKey(new Date()),
        tz_offset_min: -new Date().getTimezoneOffset(),
        // Empty (self-directed) workouts get a friendly default title the
        // user can rename; template starts omit `name` so the server
        // snapshots the template's own name.
        name: workoutId ? undefined : fmtSessionDefaultName(new Date()),
      },
      {
        onError: (err) =>
          Toast.show({ type: "error", text1: "Could not start session", text2: err.message }),
      }
    );
  };

  return (
    <View style={styles.container}>
      <WorkoutsView
        catalogIds={catalogIds}
        onSelectWorkout={startFrom}
        onStartEmpty={() => startFrom(undefined)}
        onOpenPastSession={onOpenPastSession}
        onRepeatSession={onRepeatSession}
        startPending={startSession.isPending}
        prs={prs ?? []}
        weightUnit={weightUnit}
        activeSlide={activeSlide}
        setActiveSlide={setActiveSlide}
      />
    </View>
  );
}

interface WorkoutsViewProps {
  catalogIds: Set<string>;
  onSelectWorkout: (id: string) => void;
  onStartEmpty: () => void;
  onOpenPastSession?: (id: string) => void;
  onRepeatSession?: (id: string) => void;
  startPending: boolean;
  prs: PersonalRecordResponse[];
  weightUnit: WeightUnit;
  activeSlide: number;
  setActiveSlide: (n: number) => void;
}

function WorkoutsView({
  catalogIds,
  onSelectWorkout,
  onStartEmpty,
  onOpenPastSession,
  onRepeatSession,
  startPending,
  prs,
  weightUnit,
  activeSlide,
  setActiveSlide,
}: WorkoutsViewProps) {
  // Internal/uncontrolled on purpose — TrainingTab remounts this component
  // (via `key={startScreenKey}`) to reset it. Do not lift this state.
  const [tab, setTab] = useState<"mine" | "coach">("mine");
  const { data: myWorkouts, isLoading: mineLoading } = useMyWorkouts();
  const mineList = myWorkouts ?? [];

  return (
    <View style={styles.sectionGap}>
      {/* Workout list — two sources: the user's own saved templates
       * past sessions ("My Workouts") and what their coach sent them
       * ("Coach's Playbook" — CoachPlaybookPanel owns its no-coach /
       * pending / accepted / coach-library states). Both start a session
       * on the same screen. The Playbook is deliberately NOT filtered by
       * mode or equipment: hiding a workout your coach sent would be wrong. */}
      <View style={styles.sectionGap}>
        <SegmentedTabs
          tabs={[
            { id: "mine", label: "My Workouts" },
            { id: "coach", label: "Coach's Playbook" },
          ]}
          activeId={tab}
          onChange={setTab}
        />

        {tab === "mine" ? (
          mineLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator />
            </View>
          ) : mineList.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>
                No workouts yet — start an empty workout to log your first.
              </Text>
            </View>
          ) : (
            mineList.map((s) => (
              <PastSessionRow
                key={s.id}
                session={s}
                weightUnit={weightUnit}
                onPress={() => onOpenPastSession?.(s.id)}
                onRepeat={() => onRepeatSession?.(s.id)}
              />
            ))
          )
        ) : (
          <CoachPlaybookPanel onSelectWorkout={onSelectWorkout} />
        )}
      </View>

      {/* Primary action sits right above the Trophy Room (per the 2026-08-24
       * placement request) — only on the "mine" tab, since selecting a card
       * IS the action on Coach's Playbook. */}
      {tab === "mine" && (
        <Button
          label={startPending ? "Starting…" : "Start empty workout"}
          onPress={onStartEmpty}
          disabled={startPending}
          loading={startPending}
          leftIcon={<Plus size={16} color={colors.primaryForeground} strokeWidth={3} />}
        />
      )}

      {/* Trophy Room */}
      <TrophyRoom
        prs={prs}
        catalogIds={catalogIds}
        weightUnit={weightUnit}
        activeSlide={activeSlide}
        setActiveSlide={setActiveSlide}
      />
    </View>
  );
}

/** My Workouts card — a past COMPLETED session, not a `Workout` template
 * (those no longer exist). Tapping opens it for editing; the separate
 * Repeat button starts a brand-new session seeded from it. No tag pill,
 * no default duration, no location string, no checkmark — those were all
 * artifacts of the auto-created personal template this replaces. */
function PastSessionRow({
  session,
  weightUnit,
  onPress,
  onRepeat,
}: {
  session: SessionSummaryResponse;
  weightUnit: WeightUnit;
  onPress: () => void;
  onRepeat: () => void;
}) {
  const isEmpty = session.exercise_count === 0 && session.total_sets === 0;

  return (
    <Pressable onPress={onPress}>
      <Card style={styles.cardPad}>
        <View style={styles.workoutNameRow}>
          <Text
            style={[styles.workoutName, isEmpty && styles.mutedText]}
            maxFontSizeMultiplier={1.3}
          >
            {session.name}
          </Text>
          <View style={styles.repeatSlot}>
            <IconButton
              onPress={(e) => {
                // Prevent the outer card's onPress (open-for-edit) from
                // also firing — the classic RN nested-press bug.
                e.stopPropagation();
                onRepeat();
              }}
              accessibilityLabel={`Repeat ${session.name}`}
            >
              <RotateCcw size={14} color={colors.mutedForeground} />
            </IconButton>
          </View>
        </View>
        {isEmpty ? (
          <Text style={[styles.mutedSmall, tabular]} maxFontSizeMultiplier={1.3}>
            No sets logged
          </Text>
        ) : (
          <Text style={[styles.mutedSmall, tabular]} maxFontSizeMultiplier={1.3}>
            {fmtLocalDateShort(session.local_date)} · {session.exercise_count} exercises ·{" "}
            {session.total_sets} sets
            {session.duration_sec ? ` · ${Math.round(session.duration_sec / 60)} min` : ""}
            {" · "}
            {fmtWeight(session.total_volume_kg, weightUnit)} {weightUnit}
          </Text>
        )}
      </Card>
    </Pressable>
  );
}

function TrophyRoom({
  prs,
  catalogIds,
  weightUnit,
  activeSlide,
  setActiveSlide,
}: {
  prs: PersonalRecordResponse[];
  catalogIds: Set<string>;
  weightUnit: WeightUnit;
  activeSlide: number;
  setActiveSlide: (n: number) => void;
}) {
  // Trophy ids are hand-curated against a handful of classic lifts;
  // hide any that don't resolve against the (mostly wger-sourced)
  // catalog rather than rendering a trophy for a nonexistent exercise.
  const trophies = TROPHY_DEFS.filter((t) => catalogIds.has(t.exerciseId));
  const clampedSlide = Math.min(activeSlide, Math.max(0, trophies.length - 1));

  // Trophy Room paging: `pagingEnabled` snaps to *screen* width while the
  // slide itself used to be a hardcoded 300dp, so dots desynced from the
  // visible slide immediately. Fixed by measuring the actual carousel
  // width via onLayout and driving both the slide width and the
  // scroll-position math off that measured value instead.
  const [slideWidth, setSlideWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const onCarouselLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== slideWidth) setSlideWidth(w);
  };

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!slideWidth) return;
    setActiveSlide(Math.round(e.nativeEvent.contentOffset.x / slideWidth));
  };

  const goTo = (index: number) => {
    const clamped = Math.max(0, Math.min(trophies.length - 1, index));
    setActiveSlide(clamped);
    if (slideWidth) {
      scrollRef.current?.scrollTo({ x: clamped * slideWidth, animated: true });
    }
  };

  if (trophies.length === 0) return null;

  return (
    <Card>
      <View style={styles.trophyHeader}>
        <Text style={styles.cardTitle} maxFontSizeMultiplier={1.3}>
          Trophy Room
        </Text>
        <View style={styles.dotsRow}>
          {trophies.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === clampedSlide ? styles.dotActive : styles.dotInactive]}
            />
          ))}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={slideWidth || undefined}
        onLayout={onCarouselLayout}
        onMomentumScrollEnd={onMomentumScrollEnd}
      >
        {trophies.map((t) => {
          const pr = prs.find((p) => p.exercise_id === t.exerciseId);
          // Trophies unlock on the heaviest single working set — the
          // pre-session-engine version compared against a
          // volume-weighted score, which let a high-rep light set
          // outrank a genuinely heavier lift.
          const unlocked = !!pr && pr.best_weight_kg >= t.thresholdKg;
          const label = pr
            ? `${fmtWeight(pr.best_weight_kg, weightUnit)} × ${pr.best_weight_reps}`
            : `Target ${fmtWeight(t.thresholdKg, weightUnit)}+`;
          return (
            <View key={t.name} style={[styles.trophySlide, { width: slideWidth || undefined }]}>
              <View
                style={[styles.trophyCard, !unlocked && styles.trophyCardLocked]}
              >
                {!unlocked && (
                  <View style={styles.trophyLock}>
                    <Lock size={28} color={colors.mutedForeground} />
                  </View>
                )}
                <Text style={[styles.trophyAnimal, !unlocked && { opacity: 0.3 }]} maxFontSizeMultiplier={1.3}>
                  {t.animal}
                </Text>
                <Text
                  style={[styles.trophyName, !unlocked && styles.mutedText]}
                  maxFontSizeMultiplier={1.3}
                >
                  {t.name}
                </Text>
                <Text
                  style={[styles.trophyLabel, tabular, !unlocked && styles.mutedText]}
                  maxFontSizeMultiplier={1.3}
                >
                  {label}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.trophyNav}>
        <Pressable
          onPress={() => goTo(clampedSlide - 1)}
          disabled={clampedSlide === 0}
          style={[styles.trophyNavBtn, clampedSlide === 0 && styles.disabled]}
        >
          <ChevronLeft size={16} color={colors.foreground} />
          <Text style={styles.trophyNavText} maxFontSizeMultiplier={1.3}>
            Prev
          </Text>
        </Pressable>
        <Pressable
          onPress={() => goTo(clampedSlide + 1)}
          disabled={clampedSlide === trophies.length - 1}
          style={[
            styles.trophyNavBtn,
            clampedSlide === trophies.length - 1 && styles.disabled,
          ]}
        >
          <Text style={styles.trophyNavText} maxFontSizeMultiplier={1.3}>
            Next
          </Text>
          <ChevronRight size={16} color={colors.foreground} />
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.lg },
  sectionGap: { gap: space.md },
  loadingBox: { padding: space.xxxl, alignItems: "center" },
  cardPad: { padding: 14 },
  cardTitle: { ...type.heading, color: colors.foreground },
  workoutNameRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  workoutName: { flex: 1, ...type.heading, color: colors.foreground },
  mutedText: { color: colors.mutedForeground },
  mutedSmall: { ...type.caption, color: colors.mutedForeground, marginTop: space.xs },
  repeatSlot: { flexShrink: 0 },
  emptyState: {
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    padding: space.xxxl,
    alignItems: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
  },
  emptyText: { ...type.body, color: colors.mutedForeground, textAlign: "center" },
  trophyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: space.lg,
  },
  dotsRow: { flexDirection: "row", gap: space.xs },
  dot: { height: 8, borderRadius: radius.full },
  dotActive: { width: 16, backgroundColor: colors.primary },
  dotInactive: { width: 8, backgroundColor: colors.muted },
  trophySlide: { paddingHorizontal: space.sm },
  trophyCard: {
    borderRadius: radius.md,
    padding: space.xxl,
    alignItems: "center",
    backgroundColor: colors.accent,
  },
  trophyCardLocked: { backgroundColor: colors.muted },
  trophyLock: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(255,255,255,0.6)",
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  trophyAnimal: { fontSize: 60, marginBottom: space.md },
  trophyName: { ...type.heading, marginBottom: space.xs, color: colors.accentForeground },
  trophyLabel: { ...type.body, color: colors.accentForeground },
  trophyNav: { flexDirection: "row", gap: space.sm, marginTop: space.lg },
  trophyNavBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    backgroundColor: colors.muted,
    borderRadius: radius.md,
    minHeight: 44,
  },
  disabled: { opacity: 0.4 },
  trophyNavText: { ...type.label, color: colors.foreground },
});

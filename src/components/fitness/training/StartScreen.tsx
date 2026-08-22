import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import {
  Lock,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Clock,
  Home,
  Dumbbell as DumbbellIcon,
  CheckCircle2,
  Plus,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import Toast from "react-native-toast-message";
import {
  useExercises,
  useMyWorkouts,
  usePRs,
  usePatchPreferences,
  usePreferences,
  useSessions,
  useStartSession,
  useWorkouts,
} from "@/lib/queries";
import { fmtSessionDefaultName, localDateKey } from "@/lib/dates";
import { toKg, fmtWeight, type WeightUnit } from "@/lib/units";
import type { Equipment, Mode } from "@/state/trainingStore";
import type { PersonalRecordResponse, WorkoutSummaryResponse } from "@/lib/api";

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

const EQUIPMENT_CHIPS: { id: Equipment; label: string }[] = [
  { id: "bodyweight", label: "Bodyweight" },
  { id: "dumbbells", label: "Dumbbells" },
  { id: "bands", label: "Bands" },
  { id: "kettlebell", label: "Kettlebell" },
  { id: "barbell", label: "Barbell" },
  { id: "cable", label: "Cable" },
  { id: "machine", label: "Machine" },
];

/** Filter a workout list by the active mode (location) + equipment set.
 * An empty equipment selection is a wildcard (see T0.1 fix). Module-level
 * and pure so the `useMemo`s that call it have a clean dependency list. */
function filterWorkouts(
  list: WorkoutSummaryResponse[] | undefined,
  mode: Mode,
  equipment: Set<Equipment>
): WorkoutSummaryResponse[] {
  return (list ?? []).filter((w) => {
    const locOk = mode === "all" || w.location === mode || w.location === "either";
    const eqOk =
      equipment.size === 0 ||
      w.equipment.every((e) => e === "bodyweight" || equipment.has(e as Equipment));
    return locOk && eqOk;
  });
}

export function StartScreen() {
  const [activeSlide, setActiveSlide] = useState(0);

  const { data: prefs } = usePreferences();
  const { data: prs } = usePRs();
  const { data: exercises } = useExercises({ limit: 500 });
  const today = localDateKey(new Date());
  const { data: todaysSessions } = useSessions(today, today);
  const patchPrefs = usePatchPreferences();
  const startSession = useStartSession();

  const mode = (prefs?.mode ?? "gym") as Mode;
  const weightUnit = (prefs?.weight_unit ?? "lb") as WeightUnit;
  const equipment = useMemo(
    () => new Set<Equipment>((prefs?.equipment ?? []) as Equipment[]),
    [prefs?.equipment]
  );
  // A workout is "done today" once a COMPLETED session referencing it
  // exists — durable, not the old `completed_workouts_today` prefs
  // list (which reset at midnight and was never tied to a real
  // record of what was actually logged).
  const completedWorkoutIds = useMemo(
    () =>
      new Set(
        (todaysSessions ?? [])
          .filter((s) => s.status === "completed" && s.workout_id)
          .map((s) => s.workout_id as string)
      ),
    [todaysSessions]
  );
  const catalogIds = useMemo(() => new Set((exercises ?? []).map((e) => e.id)), [exercises]);

  const setMode = (m: Mode) => patchPrefs.mutate({ mode: m });
  const toggleEquipment = (eq: Equipment) => {
    const next = new Set(equipment);
    if (next.has(eq)) next.delete(eq);
    else next.add(eq);
    patchPrefs.mutate({ equipment: Array.from(next) });
  };

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

  /* The server already filters by location+equipment; the local
   * filter kept here only hides the Phase / Equipment card when
   * workouts are unavailable. The actual list comes from useWorkouts(). */
  const serverFilter = useMemo(() => {
    if (mode === "all") return undefined;
    return { location: mode };
  }, [mode]);

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => startFrom(undefined)}
        disabled={startSession.isPending}
        style={styles.startEmptyBtn}
      >
        <Plus size={16} color="#ffffff" strokeWidth={3} />
        <Text style={styles.startEmptyText}>
          {startSession.isPending ? "Starting…" : "Start empty workout"}
        </Text>
      </Pressable>

      <WorkoutsView
        mode={mode}
        equipment={equipment}
        completed={completedWorkoutIds}
        catalogIds={catalogIds}
        filter={serverFilter}
        onSelectWorkout={startFrom}
        setMode={setMode}
        toggleEquipment={toggleEquipment}
        prs={prs ?? []}
        weightUnit={weightUnit}
        activeSlide={activeSlide}
        setActiveSlide={setActiveSlide}
      />
    </View>
  );
}

interface WorkoutsViewProps {
  mode: Mode;
  equipment: Set<Equipment>;
  completed: Set<string>;
  catalogIds: Set<string>;
  filter: { location?: Mode } | undefined;
  onSelectWorkout: (id: string) => void;
  setMode: (m: Mode) => void;
  toggleEquipment: (eq: Equipment) => void;
  prs: PersonalRecordResponse[];
  weightUnit: WeightUnit;
  activeSlide: number;
  setActiveSlide: (n: number) => void;
}

function WorkoutsView({
  mode,
  equipment,
  completed,
  catalogIds,
  filter,
  onSelectWorkout,
  setMode,
  toggleEquipment,
  prs,
  weightUnit,
  activeSlide,
  setActiveSlide,
}: WorkoutsViewProps) {
  const [tab, setTab] = useState<"mine" | "coach">("coach");
  const { data: coachWorkouts, isLoading: coachLoading } = useWorkouts(filter);
  const { data: myWorkouts, isLoading: mineLoading } = useMyWorkouts();

  const coachFiltered = useMemo(
    () => filterWorkouts(coachWorkouts, mode, equipment),
    [coachWorkouts, mode, equipment]
  );
  const mineFiltered = useMemo(
    () => filterWorkouts(myWorkouts, mode, equipment),
    [myWorkouts, mode, equipment]
  );

  const activeList = tab === "mine" ? mineFiltered : coachFiltered;
  const activeLoading = tab === "mine" ? mineLoading : coachLoading;

  /* Recommend equipment from the active filter set (for the coach
   * insight chip). Falls back to "home + dumbbells" until prefs load. */
  const recommendedEquipment = useMemo(() => {
    if (equipment.size === 0) {
      return mode === "gym" ? "gym equipment" : "bodyweight";
    }
    return Array.from(equipment).slice(0, 2).join(" + ");
  }, [equipment, mode]);

  return (
    <View style={styles.sectionGap}>
      {/* Mode & Equipment filter card */}
      <View style={styles.card}>
        <View style={styles.coachRow}>
          <View style={styles.coachIcon}>
            <Sparkles size={16} color="#e87d6f" />
          </View>
          <Text style={styles.coachText}>
            Your intake says{" "}
            <Text style={{ color: "#3d2b26", fontWeight: "600" }}>{recommendedEquipment}</Text>
            . Coach AI filters your library to what you can actually do.
          </Text>
        </View>
        <View style={styles.modeToggle}>
          {(["home", "gym", "all"] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
            >
              {m === "home" && <Home size={14} color={mode === m ? "#3d2b26" : "#8b7268"} />}
              {m === "gym" && <DumbbellIcon size={14} color={mode === m ? "#3d2b26" : "#8b7268"} />}
              <Text style={[styles.modeLabel, mode === m && styles.modeLabelActive]}>{m}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Equipment chips */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Available equipment</Text>
        <View style={styles.chipRow}>
          {EQUIPMENT_CHIPS.map((eq) => {
            const active = equipment.has(eq.id);
            return (
              <Pressable
                key={eq.id}
                onPress={() => toggleEquipment(eq.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {eq.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Phase progress — cosmetic placeholder, intentionally not
       * wired to real data. Deferred: replace with a real
       * Program/mesocycle entity. */}
      <View style={styles.phaseCard}>
        <View style={styles.phaseRow}>
          <View>
            <Text style={styles.phaseTitle}>Hypertrophy Phase</Text>
            <Text style={styles.phaseSubtitle}>Week 3 of 6</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.phasePercent}>50%</Text>
            <Text style={styles.phaseSubtitle}>Complete</Text>
          </View>
        </View>
        <View style={styles.progressBar}>
          <View style={styles.progressFill} />
        </View>
      </View>

      {/* Workout list — two sources: the user's own saved templates
       * ("My Workouts") and the coach/admin catalog ("Coach's
       * Playbook"). Both start a session on the same screen. */}
      <View style={styles.sectionGap}>
        <View style={styles.listTabs}>
          {(
            [
              { id: "mine", label: "My Workouts" },
              { id: "coach", label: "Coach's Playbook" },
            ] as const
          ).map(({ id, label }) => (
            <Pressable
              key={id}
              onPress={() => setTab(id)}
              style={[styles.listTabBtn, tab === id && styles.listTabBtnActive]}
            >
              <Text style={[styles.listTabLabel, tab === id && styles.listTabLabelActive]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {activeLoading ? (
          <View style={{ padding: 32, alignItems: "center" }}>
            <ActivityIndicator />
          </View>
        ) : (
          activeList.map((w) => (
            <WorkoutRow
              key={w.id}
              workout={w}
              isDone={completed.has(w.id)}
              onPress={() => onSelectWorkout(w.id)}
            />
          ))
        )}

        {!activeLoading && activeList.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {tab === "mine"
                ? "Save a workout as a template to see it here. Start any workout, then tap “Save as template” when you finish."
                : "No coach workouts match your filters. Try adding equipment or switching mode."}
            </Text>
          </View>
        )}
      </View>

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

function WorkoutRow({
  workout,
  isDone,
  onPress,
}: {
  workout: WorkoutSummaryResponse;
  isDone: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.workoutCard}
    >
      <View style={styles.workoutMeta}>
        <View style={styles.tagBadge}>
          <Text style={styles.tagText}>{workout.tag}</Text>
        </View>
        <View style={styles.durationRow}>
          <Clock size={12} color="#8b7268" />
          <Text style={styles.mutedSmall}>{workout.duration_min} min</Text>
        </View>
      </View>
      <View style={styles.workoutNameRow}>
        <Text style={styles.workoutName}>{workout.name}</Text>
        {isDone && <CheckCircle2 size={20} color="#e87d6f" />}
      </View>
      <Text style={styles.mutedSmall}>
        {workout.exercise_count} exercises ·{" "}
        {workout.location === "either" ? "home or gym" : workout.location}
      </Text>
      <View style={styles.chipRow}>
        {workout.equipment.map((eq) => (
          <View key={eq} style={styles.eqChip}>
            <Text style={styles.eqChipLabel}>{eq}</Text>
          </View>
        ))}
      </View>
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
  if (trophies.length === 0) return null;
  const clampedSlide = Math.min(activeSlide, trophies.length - 1);

  return (
    <View style={styles.card}>
      <View style={styles.trophyHeader}>
        <Text style={styles.cardTitle}>Trophy Room</Text>
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
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) =>
          setActiveSlide(
            Math.round(e.nativeEvent.contentOffset.x / 300)
          )
        }
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
            <View key={t.name} style={styles.trophySlide}>
              <View
                style={[styles.trophyCard, !unlocked && styles.trophyCardLocked]}
              >
                {!unlocked && (
                  <View style={styles.trophyLock}>
                    <Lock size={28} color="#8b7268" />
                  </View>
                )}
                <Text style={[styles.trophyAnimal, !unlocked && { opacity: 0.3 }]}>
                  {t.animal}
                </Text>
                <Text
                  style={[styles.trophyName, !unlocked && styles.textMuted]}
                >
                  {t.name}
                </Text>
                <Text
                  style={[styles.trophyLabel, !unlocked && styles.textMuted]}
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
          onPress={() => setActiveSlide(Math.max(0, clampedSlide - 1))}
          disabled={clampedSlide === 0}
          style={[styles.trophyNavBtn, clampedSlide === 0 && styles.disabled]}
        >
          <ChevronLeft size={16} color="#3d2b26" />
          <Text style={styles.trophyNavText}>Prev</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            setActiveSlide(Math.min(trophies.length - 1, clampedSlide + 1))
          }
          disabled={clampedSlide === trophies.length - 1}
          style={[
            styles.trophyNavBtn,
            clampedSlide === trophies.length - 1 && styles.disabled,
          ]}
        >
          <Text style={styles.trophyNavText}>Next</Text>
          <ChevronRight size={16} color="#3d2b26" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  startEmptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#e87d6f",
  },
  startEmptyText: { color: "#ffffff", fontWeight: "600" },
  sectionGap: { gap: 12 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f0d9ce",
  },
  cardTitle: { fontSize: 18, fontWeight: "600", color: "#3d2b26" },
  coachRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  coachIcon: {
    width: 36,
    height: 36,
    borderRadius: 16,
    backgroundColor: "#fce4d8",
    alignItems: "center",
    justifyContent: "center",
  },
  coachText: { flex: 1, fontSize: 12, color: "#8b7268", lineHeight: 18 },
  modeToggle: {
    flexDirection: "row",
    gap: 8,
    padding: 4,
    backgroundColor: "#faeadd",
    borderRadius: 16,
  },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 12,
  },
  modeBtnActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  modeLabel: { fontSize: 14, textTransform: "capitalize", color: "#8b7268" },
  modeLabelActive: { color: "#3d2b26" },
  sectionTitle: {
    fontSize: 12,
    color: "#8b7268",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#f0d9ce",
    backgroundColor: "rgba(250, 234, 221, 0.5)",
  },
  chipActive: { backgroundColor: "#e87d6f", borderColor: "#e87d6f" },
  chipLabel: { fontSize: 12, color: "#8b7268" },
  chipLabelActive: { color: "#ffffff" },
  phaseCard: {
    backgroundColor: "#ffd5b8",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#f0d9ce",
  },
  phaseRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  phaseTitle: { fontSize: 18, fontWeight: "600", color: "#5a3326" },
  phaseSubtitle: { fontSize: 14, color: "rgba(90,51,38,0.7)" },
  phasePercent: { fontSize: 24, color: "#e87d6f" },
  progressBar: {
    marginTop: 16,
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.6)",
    borderRadius: 999,
    height: 8,
  },
  progressFill: { backgroundColor: "#e87d6f", height: 8, borderRadius: 999, width: "50%" },
  listTitle: { fontSize: 18, fontWeight: "600", color: "#3d2b26" },
  listTabs: {
    flexDirection: "row",
    gap: 8,
    padding: 4,
    backgroundColor: "#faeadd",
    borderRadius: 16,
  },
  listTabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
  },
  listTabBtnActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  listTabLabel: { fontSize: 13, color: "#8b7268", fontWeight: "500" },
  listTabLabelActive: { color: "#3d2b26", fontWeight: "700" },
  workoutCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f0d9ce",
  },
  workoutMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  tagBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: "#fce4d8" },
  tagText: { fontSize: 12, color: "#6b3a30" },
  durationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  workoutNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  workoutName: { flex: 1, fontSize: 16, fontWeight: "600", color: "#3d2b26" },
  mutedSmall: { fontSize: 12, color: "#8b7268", marginTop: 4 },
  eqChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: "#faeadd" },
  eqChipLabel: { fontSize: 10, color: "#8b7268", textTransform: "capitalize" },
  emptyState: {
    backgroundColor: "rgba(250, 234, 221, 0.5)",
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#f0d9ce",
  },
  emptyText: { fontSize: 14, color: "#8b7268", textAlign: "center" },
  trophyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  dotsRow: { flexDirection: "row", gap: 4 },
  dot: { height: 8, borderRadius: 999 },
  dotActive: { width: 16, backgroundColor: "#e87d6f" },
  dotInactive: { width: 8, backgroundColor: "#faeadd" },
  trophySlide: { paddingHorizontal: 8, width: 300 },
  trophyCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    backgroundColor: "#ffd5b8",
    borderWidth: 1,
    borderColor: "#f0d9ce",
  },
  trophyCardLocked: { backgroundColor: "rgba(250, 234, 221, 0.6)" },
  trophyLock: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(255,255,255,0.6)",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  trophyAnimal: { fontSize: 60, marginBottom: 12 },
  trophyName: { fontSize: 16, fontWeight: "600", marginBottom: 4, color: "#5a3326" },
  trophyLabel: { fontSize: 14, color: "rgba(90,51,38,0.7)" },
  textMuted: { color: "#8b7268" },
  trophyNav: { flexDirection: "row", gap: 8, marginTop: 16 },
  trophyNavBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#faeadd",
    borderRadius: 12,
  },
  disabled: { opacity: 0.4 },
  trophyNavText: { fontSize: 14, color: "#3d2b26" },
});

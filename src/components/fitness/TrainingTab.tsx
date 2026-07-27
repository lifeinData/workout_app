import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import {
  Trophy,
  Lock,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Clock,
  Home,
  Dumbbell as DumbbellIcon,
  CheckCircle2,
  List,
  CalendarDays,
  Flame,
  LogOut,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  useExercises,
  useLogout,
  usePatchPreferences,
  usePRs,
  usePreferences,
  useWorkout,
  useWorkouts,
} from "@/lib/queries";
import { WorkoutDetail } from "./training/WorkoutDetail";
import { HistoryView } from "./training/HistoryView";
import { TodayView } from "./training/TodayView";
import type { Equipment, Mode } from "@/state/trainingStore";
import type { WorkoutSummaryResponse } from "@/lib/api";

const TROPHY_DEFS: {
  exerciseId: string;
  animal: string;
  name: string;
  threshold: number;
}[] = [
  { exerciseId: "ex-bench", animal: "\u{1F981}", name: "Lion", threshold: 225 },
  { exerciseId: "ex-deadlift", animal: "\u{1F985}", name: "Eagle", threshold: 405 },
  { exerciseId: "ex-squat", animal: "\u{1F43A}", name: "Wolf", threshold: 315 },
  { exerciseId: "ex-ohp", animal: "\u{1F43B}", name: "Bear", threshold: 185 },
  { exerciseId: "ex-pullup", animal: "\u{1F988}", name: "Shark", threshold: 20 },
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

const KNOWN_EQUIPMENT: ReadonlySet<string> = new Set([
  "barbell",
  "dumbbells",
  "bodyweight",
  "cable",
  "machine",
  "kettlebell",
  "band",
  "bands",
  "other",
]);

function isKnownEquipment(e: string): boolean {
  return KNOWN_EQUIPMENT.has(e);
}

export function TrainingTab() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [view, setView] = useState<"today" | "workouts" | "history">("today");

  const { data: prefs } = usePreferences();
  const { data: prs } = usePRs();
  const { data: exercises } = useExercises({ limit: 500 });
  const { data: openWorkout } = useWorkout(openId ?? "");
  const patchPrefs = usePatchPreferences();
  const logout = useLogout();

  const mode = (prefs?.mode ?? "gym") as Mode;
  const equipment = new Set<Equipment>((prefs?.equipment ?? []) as Equipment[]);
  const completed = new Set(prefs?.completed_workouts_today ?? []);

  const setMode = (m: Mode) => patchPrefs.mutate({ mode: m });
  const toggleEquipment = (eq: Equipment) => {
    const next = new Set(equipment);
    if (next.has(eq)) next.delete(eq);
    else next.add(eq);
    patchPrefs.mutate({ equipment: Array.from(next) });
  };

  /* The server already filters by location+equipment; the local filter
   * kept here only hides the Phase / Equipment card when workouts are
   * unavailable. The actual list comes from useWorkouts(). */
  const serverFilter = useMemo(() => {
    if (mode === "all") return undefined;
    return { location: mode };
  }, [mode]);

  return (
    <View style={styles.container}>
      {/* Header: sign out */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Training</Text>
          <Text style={styles.headerSubtitle}>
            {prefs?.mode === "gym"
              ? "Gym session"
              : prefs?.mode === "home"
                ? "Home session"
                : "Mixed session"}
          </Text>
        </View>
        <Pressable
          onPress={() => logout.mutate()}
          disabled={logout.isPending}
          style={({ pressed }) => [
            styles.signOutBtn,
            pressed && !logout.isPending && styles.signOutPressed,
          ]}
          accessibilityLabel="Sign out"
        >
          <LogOut size={16} color="#8b7268" />
          <Text style={styles.signOutText}>
            {logout.isPending ? "Signing out…" : "Sign out"}
          </Text>
        </Pressable>
      </View>

      {/* View toggle */}
      <View style={styles.toggleRow}>
        {(
          [
            { id: "today", label: "Today", Icon: Flame },
            { id: "workouts", label: "Workouts", Icon: List },
            { id: "history", label: "History", Icon: CalendarDays },
          ] as const
        ).map(({ id, label, Icon }) => (
          <Pressable
            key={id}
            onPress={() => setView(id)}
            style={[styles.toggleBtn, view === id && styles.toggleBtnActive]}
          >
            <Icon size={14} color={view === id ? "#3d2b26" : "#8b7268"} />
            <Text style={[styles.toggleLabel, view === id && styles.toggleLabelActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {view === "today" && <TodayView />}

      {view === "workouts" && (
        <WorkoutsView
          mode={mode}
          equipment={equipment}
          completed={completed}
          exercises={exercises ?? []}
          filter={serverFilter}
          onSelectWorkout={setOpenId}
          setMode={setMode}
          toggleEquipment={toggleEquipment}
          prs={prs ?? []}
          activeSlide={activeSlide}
          setActiveSlide={setActiveSlide}
        />
      )}

      {view === "history" && <HistoryView />}

      {openWorkout && (
        <WorkoutDetail workout={openWorkout} onClose={() => setOpenId(null)} />
      )}
    </View>
  );
}

interface WorkoutsViewProps {
  mode: Mode;
  equipment: Set<Equipment>;
  completed: Set<string>;
  exercises: import("@/lib/api").ExerciseResponse[];
  filter: { location?: Mode } | undefined;
  onSelectWorkout: (id: string) => void;
  setMode: (m: Mode) => void;
  toggleEquipment: (eq: Equipment) => void;
  prs: import("@/lib/api").PersonalRecordResponse[];
  activeSlide: number;
  setActiveSlide: (n: number) => void;
}

function WorkoutsView({
  mode,
  equipment,
  completed,
  exercises,
  filter,
  onSelectWorkout,
  setMode,
  toggleEquipment,
  prs,
  activeSlide,
  setActiveSlide,
}: WorkoutsViewProps) {
  const { data: workouts, isLoading } = useWorkouts(filter);

  /* Server already filtered by location; we further filter in memory
   * for the equipment check (the server endpoint has the same param
   * but local filtering keeps the data model simple). */
  const filtered = useMemo(() => {
    return (workouts ?? []).filter((w) => {
      const locOk = mode === "all" || w.location === mode || w.location === "either";
      const eqOk = w.equipment.every((e) => e === "bodyweight" || isKnownEquipment(e));
      return locOk && eqOk;
    });
  }, [workouts, mode, equipment]);

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

      {/* Phase progress — cosmetic, no backend data yet */}
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

      {/* Workout list */}
      <View style={styles.sectionGap}>
        <Text style={styles.listTitle}>Workouts for you ({filtered.length})</Text>
        {isLoading ? (
          <View style={{ padding: 32, alignItems: "center" }}>
            <ActivityIndicator />
          </View>
        ) : (
          filtered.map((w) => (
            <WorkoutRow
              key={w.id}
              workout={w}
              isDone={completed.has(w.id)}
              onPress={() => onSelectWorkout(w.id)}
            />
          ))
        )}
        {!isLoading && filtered.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              No workouts match your filters. Try adding equipment or switching mode.
            </Text>
          </View>
        )}
      </View>

      {/* Trophy Room */}
      <TrophyRoom prs={prs} activeSlide={activeSlide} setActiveSlide={setActiveSlide} />
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
  activeSlide,
  setActiveSlide,
}: {
  prs: import("@/lib/api").PersonalRecordResponse[];
  activeSlide: number;
  setActiveSlide: (n: number) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.trophyHeader}>
        <Text style={styles.cardTitle}>Trophy Room</Text>
        <View style={styles.dotsRow}>
          {TROPHY_DEFS.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === activeSlide ? styles.dotActive : styles.dotInactive]}
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
        {TROPHY_DEFS.map((t) => {
          const pr = prs.find((p) => p.exercise_id === t.exerciseId);
          const unlocked = !!pr && pr.weight >= t.threshold;
          const label = pr
            ? `${pr.weight} × ${pr.reps}`
            : `Target ${t.threshold}+`;
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
          onPress={() => setActiveSlide(Math.max(0, activeSlide - 1))}
          disabled={activeSlide === 0}
          style={[styles.trophyNavBtn, activeSlide === 0 && styles.disabled]}
        >
          <ChevronLeft size={16} color="#3d2b26" />
          <Text style={styles.trophyNavText}>Prev</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            setActiveSlide(Math.min(TROPHY_DEFS.length - 1, activeSlide + 1))
          }
          disabled={activeSlide === TROPHY_DEFS.length - 1}
          style={[
            styles.trophyNavBtn,
            activeSlide === TROPHY_DEFS.length - 1 && styles.disabled,
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
  container: { padding: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 12,
  },
  headerTitle: { fontSize: 24, fontWeight: "700", color: "#3d2b26" },
  headerSubtitle: { fontSize: 12, color: "#8b7268", marginTop: 2 },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#faeadd",
    borderRadius: 999,
  },
  signOutPressed: { opacity: 0.7 },
  signOutText: { fontSize: 12, color: "#8b7268", fontWeight: "500" },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
    padding: 4,
    backgroundColor: "#faeadd",
    borderRadius: 16,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: 12,
  },
  toggleBtnActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  toggleLabel: { fontSize: 12, color: "#8b7268" },
  toggleLabelActive: { color: "#3d2b26" },
  sectionGap: { gap: 12, marginTop: 16 },
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

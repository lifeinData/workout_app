from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ExerciseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    muscle_group: str
    equipment: list[str]
    yt_id: Optional[str] = None
    default_sets: int
    default_reps_label: str
    pr_trackable: bool


class WorkoutExerciseResponse(ExerciseResponse):
    """`ExerciseResponse` plus this workout's per-exercise prescription.

    Subclasses rather than replaces `ExerciseResponse` — every existing
    consumer that only reads `.name` / `.yt_id` / etc. keeps compiling
    unchanged; only code that needs the new prescription fields has to
    change.
    """

    order_index: int
    target_sets: int
    target_reps_low: int
    target_reps_high: Optional[int] = None
    target_rest_sec: int
    prescription_notes: Optional[str] = None


class WorkoutSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    tag: str
    location: str
    equipment: list[str]
    duration_min: int
    exercise_count: int
    # None = coach catalog ("Coach's Playbook"); set = a personal template
    # owned by the caller ("My Workouts"). Lets the client segment the two.
    owner_id: Optional[str] = None


class WorkoutDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    tag: str
    location: str
    equipment: list[str]
    duration_min: int
    owner_id: Optional[str] = None
    exercises: list[WorkoutExerciseResponse]


class PreferencesPatch(BaseModel):
    mode: Optional[str] = Field(default=None, pattern="^(home|gym|all)$")
    equipment: Optional[list[str]] = None
    completed_workouts_today: Optional[list[str]] = None
    # Additive update for `completed_workouts_today` — the server
    # appends each id (deduping) instead of overwriting the list.
    # Use this from the client to avoid last-write-wins PATCHes that
    # would drop concurrent updates from other devices.
    add_completed: Optional[list[str]] = None
    client_today: Optional[str] = Field(
        default=None,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description=(
            "Client's local YYYY-MM-DD, used for the "
            "completed_workouts_today rollover boundary"
        ),
    )
    weight_unit: Optional[str] = Field(default=None, pattern="^(lb|kg)$")
    default_rest_sec: Optional[int] = Field(default=None, ge=0, le=1800)


class PreferencesResponse(BaseModel):
    user_id: str
    mode: str
    equipment: list[str]
    completed_workouts_today: list[str]
    last_reset_date: str
    weight_unit: str
    default_rest_sec: int


# ---------------------------------------------------------------------------
# Sets
# ---------------------------------------------------------------------------


class SetLogCreate(BaseModel):
    session_id: str = Field(min_length=1, max_length=64)
    exercise_id: str = Field(min_length=1, max_length=64)
    weight: float = Field(ge=0)
    weight_unit: str = Field(default="lb", pattern="^(lb|kg)$")
    reps: int = Field(ge=1, le=1000)
    kind: str = Field(default="working", pattern="^(working|warmup)$")
    rpe: Optional[float] = Field(default=None, ge=1, le=10)
    timestamp: Optional[str] = None


class SetLogPatch(BaseModel):
    weight: Optional[float] = Field(default=None, ge=0)
    weight_unit: Optional[str] = Field(default=None, pattern="^(lb|kg)$")
    reps: Optional[int] = Field(default=None, ge=1, le=1000)
    kind: Optional[str] = Field(default=None, pattern="^(working|warmup)$")
    rpe: Optional[float] = Field(default=None, ge=1, le=10)


class HistoricalSetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: str
    session_id: str
    local_date: str
    exercise_id: str
    set_index: int
    kind: str
    weight: float
    weight_unit: str
    weight_kg: float
    reps: int
    rpe: Optional[float] = None
    was_pr: bool
    timestamp: str


class PersonalRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: str
    exercise_id: str
    best_weight_kg: float
    best_weight_reps: int
    best_weight_date: str
    best_e1rm_kg: float
    best_e1rm_weight_kg: float
    best_e1rm_reps: int
    best_e1rm_date: str
    updated_at: str


class SetLogCreatedResponse(BaseModel):
    set: HistoricalSetResponse
    is_pr: bool
    pr: Optional[PersonalRecordResponse] = None


class ExerciseSessionRollup(BaseModel):
    """One row of the per-exercise progression series (`GET
    /me/exercises/{id}/history`) — one entry per session that logged
    working sets for this exercise."""

    session_id: str
    local_date: str
    sets: int
    best_weight_kg: float
    best_e1rm_kg: float
    volume_kg: float


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------


class SessionCreate(BaseModel):
    workout_id: Optional[str] = Field(default=None, max_length=64)
    local_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    tz_offset_min: int = Field(default=0, ge=-1440, le=1440)
    name: Optional[str] = Field(default=None, max_length=200)


class SessionPatch(BaseModel):
    status: Optional[str] = Field(default=None, pattern="^(completed|abandoned)$")
    notes: Optional[str] = Field(default=None, max_length=2000)
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)


class TemplateFromSessionCreate(BaseModel):
    """Body for POST /me/workouts/from-session/{id}. `name` optional —
    defaults to the source session's name when omitted."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=200)


class SessionExerciseBlock(BaseModel):
    exercise: ExerciseResponse
    order_index: int
    target_sets: int
    target_reps_low: int
    target_reps_high: Optional[int] = None
    target_rest_sec: int
    prescription_notes: Optional[str] = None
    sets: list[HistoricalSetResponse]
    last_time: list[HistoricalSetResponse]


class SessionDetailResponse(BaseModel):
    id: str
    user_id: str
    workout_id: Optional[str] = None
    name: str
    local_date: str
    tz_offset_min: int
    started_at: str
    ended_at: Optional[str] = None
    status: str
    notes: Optional[str] = None
    blocks: list[SessionExerciseBlock]
    total_sets: int
    total_volume_kg: float
    duration_sec: Optional[int] = None


class SessionSummaryResponse(BaseModel):
    id: str
    workout_id: Optional[str] = None
    name: str
    local_date: str
    started_at: str
    ended_at: Optional[str] = None
    status: str
    total_sets: int
    total_volume_kg: float
    duration_sec: Optional[int] = None
    exercise_count: int
    pr_count: int


# ---------------------------------------------------------------------------
# Auth (signup / login / me)
# ---------------------------------------------------------------------------


class SignupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-z0-9_]+$")
    password: str = Field(min_length=8, max_length=128)
    display_name: Optional[str] = Field(default=None, max_length=80)
    initials: Optional[str] = Field(default=None, max_length=4)


class LoginRequest(BaseModel):
    # min_length=1 (not 3/8) so ultra-short dev seed creds (a/a, ad/ad) can
    # log in. Login does not gate on length — the credential check is the
    # only real guard — so this weakens nothing. SignupRequest stays strict.
    username: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    role: str
    display_name: Optional[str] = None
    initials: Optional[str] = None
    created_at: str


class SessionResponse(BaseModel):
    token: str
    expires_at: str
    user: UserResponse


# ---------------------------------------------------------------------------
# Admin (workout CRUD + exercise reorder + prescriptions)
# ---------------------------------------------------------------------------


class WorkoutCreate(BaseModel):
    """Admin creates a new workout. `id` auto-generated if omitted."""

    id: Optional[str] = Field(
        default=None,
        max_length=64,
        pattern=r"^[a-z0-9][a-z0-9-]{0,63}$",
    )
    name: str = Field(min_length=1, max_length=200)
    tag: str = Field(min_length=1, max_length=40)
    location: str = Field(pattern="^(home|gym|either)$")
    equipment: list[str] = Field(default_factory=list)
    duration_min: int = Field(ge=1, le=600)
    exercise_ids: list[str] = Field(min_length=1)


class WorkoutUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    tag: Optional[str] = Field(default=None, min_length=1, max_length=40)
    location: Optional[str] = Field(default=None, pattern="^(home|gym|either)$")
    equipment: Optional[list[str]] = None
    duration_min: Optional[int] = Field(default=None, ge=1, le=600)


class AddExerciseToWorkout(BaseModel):
    exercise_id: str = Field(min_length=1, max_length=64)
    # If omitted, append at the end.
    after_exercise_id: Optional[str] = Field(default=None, max_length=64)


class ReorderExercises(BaseModel):
    exercise_ids: list[str] = Field(min_length=1)


class PrescriptionPatch(BaseModel):
    """Edits a single exercise's target sets/reps/rest within one workout."""

    target_sets: Optional[int] = Field(default=None, ge=1, le=20)
    target_reps_low: Optional[int] = Field(default=None, ge=1, le=100)
    target_reps_high: Optional[int] = Field(default=None, ge=1, le=100)
    target_rest_sec: Optional[int] = Field(default=None, ge=0, le=1800)
    prescription_notes: Optional[str] = Field(default=None, max_length=500)

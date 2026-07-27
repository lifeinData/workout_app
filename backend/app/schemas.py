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


class WorkoutSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    tag: str
    location: str
    equipment: list[str]
    duration_min: int
    exercise_count: int


class WorkoutDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    tag: str
    location: str
    equipment: list[str]
    duration_min: int
    exercises: list[ExerciseResponse]


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


class PreferencesResponse(BaseModel):
    user_id: str
    mode: str
    equipment: list[str]
    completed_workouts_today: list[str]
    last_reset_date: str


class SetLogCreate(BaseModel):
    exercise_id: str = Field(min_length=1, max_length=64)
    weight: float = Field(ge=0)
    reps: int = Field(ge=1, le=1000)
    timestamp: Optional[str] = None


class HistoricalSetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: str
    date: str
    exercise_id: str
    weight: float
    reps: int
    timestamp: str


class PersonalRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: str
    exercise_id: str
    weight: float
    reps: int
    date: str


class SetLogCreatedResponse(BaseModel):
    set: HistoricalSetResponse
    is_pr: bool
    pr: Optional[PersonalRecordResponse] = None


class HistoryResponse(BaseModel):
    """Map of date -> exercise_id -> list of sets."""

    history: dict[str, dict[str, list[HistoricalSetResponse]]]


# ---------------------------------------------------------------------------
# Auth (signup / login / me)
# ---------------------------------------------------------------------------


class SignupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-z0-9_]+$")
    password: str = Field(min_length=8, max_length=128)
    display_name: Optional[str] = Field(default=None, max_length=80)
    initials: Optional[str] = Field(default=None, max_length=4)


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=128)


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
# Admin (workout CRUD + exercise reorder)
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

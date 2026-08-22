from typing import Optional

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    """Auth user. `id` is `usr-<uuid4>`, `username` is unique (case-insensitive)."""

    __tablename__ = "users"

    id: str = Field(primary_key=True, max_length=64)
    username: str = Field(max_length=32, unique=True, index=True)  # stored lowercase
    password_hash: str = Field(max_length=120)  # bcrypt ~60 chars + headroom
    role: str = Field(default="user", max_length=10)  # "user" | "admin"
    display_name: Optional[str] = Field(default=None, max_length=80)
    initials: Optional[str] = Field(default=None, max_length=4)
    created_at: str = Field(max_length=32)  # ISO 8601 UTC
    last_login_at: Optional[str] = Field(default=None, max_length=32)


class Session(SQLModel, table=True):
    """Opaque session token. Token is the PK (secrets.token_urlsafe(32) -> 43 chars)."""

    __tablename__ = "sessions"

    token: str = Field(primary_key=True, max_length=64)
    user_id: str = Field(max_length=64, foreign_key="users.id", index=True)
    created_at: str = Field(max_length=32)  # ISO 8601 UTC
    expires_at: str = Field(max_length=32)  # ISO 8601 UTC
    user_agent: Optional[str] = Field(default=None, max_length=200)
    ip: Optional[str] = Field(default=None, max_length=45)


class Exercise(SQLModel, table=True):
    __tablename__ = "exercises"

    id: str = Field(primary_key=True, max_length=64)
    name: str = Field(max_length=200)
    muscle_group: str = Field(max_length=100, index=True)
    equipment: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    yt_id: Optional[str] = Field(default=None, max_length=32)
    default_sets: int = Field(default=3)
    default_reps_label: str = Field(default="8-12", max_length=20)
    pr_trackable: bool = Field(default=False)


class Workout(SQLModel, table=True):
    __tablename__ = "workouts"

    id: str = Field(primary_key=True, max_length=64)
    name: str = Field(max_length=200)
    tag: str = Field(max_length=40, index=True)
    location: str = Field(max_length=20, index=True)  # "home" | "gym" | "either"
    equipment: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    duration_min: int = Field(default=45)
    # None  = "Coach's Playbook": the seeded / admin-created owner-less catalog
    #         everyone can start from.
    # set   = a personal template owned by that user ("My Workouts"), created via
    #         POST /me/workouts/from-session. Only the owner may list or start it.
    owner_id: Optional[str] = Field(
        default=None, max_length=64, foreign_key="users.id", index=True
    )


class WorkoutExerciseLink(SQLModel, table=True):
    """Order-preserving many-to-many: workouts contain exercises in sequence.

    Also carries the per-workout prescription (target sets/reps/rest) for
    that exercise, so the same exercise can be prescribed differently in
    two different workouts (e.g. "Bench 5x5" in a strength workout vs.
    "Bench 3x12" in a hypertrophy one).
    """

    __tablename__ = "workout_exercise_link"

    workout_id: str = Field(foreign_key="workouts.id", primary_key=True, max_length=64)
    exercise_id: str = Field(foreign_key="exercises.id", primary_key=True, max_length=64)
    order_index: int = Field(default=0)
    target_sets: int = Field(default=3, ge=1, le=20)
    target_reps_low: int = Field(default=8, ge=1, le=100)
    target_reps_high: Optional[int] = Field(default=12, ge=1, le=100)
    target_rest_sec: int = Field(default=90, ge=0, le=1800)
    prescription_notes: Optional[str] = Field(default=None, max_length=500)


class WorkoutSession(SQLModel, table=True):
    """A single training session — the durable record of "did Push Day A
    on 2026-08-01". Sets are logged against a session, never floating.

    Exactly one session per user may be `status == "active"` at a time
    (enforced in the router, not the schema — SQLite has no portable
    partial-unique-index syntax across our supported dialects).
    """

    __tablename__ = "workout_sessions"

    id: str = Field(primary_key=True, max_length=64)  # "ses-<uuid4.hex[:12]>"
    user_id: str = Field(max_length=64, index=True)
    workout_id: Optional[str] = Field(
        default=None, max_length=64, foreign_key="workouts.id"
    )  # None = ad-hoc / empty workout
    name: str = Field(max_length=200)  # snapshot at start; workout may be renamed later
    local_date: str = Field(max_length=10, index=True)  # YYYY-MM-DD, USER-local day
    tz_offset_min: int = Field(default=0)  # client tz offset, minutes east of UTC
    started_at: str = Field(max_length=32)  # ISO 8601 UTC
    ended_at: Optional[str] = Field(default=None, max_length=32)  # ISO 8601 UTC
    status: str = Field(default="active", max_length=12, index=True)  # active|completed|abandoned
    notes: Optional[str] = Field(default=None, max_length=2000)


class HistoricalSet(SQLModel, table=True):
    """A single logged set, always attached to a `WorkoutSession`.

    `weight` is stored exactly as the user entered it (so plate math
    stays lossless — 135 lb must round-trip as `135`, not `61.2`).
    `weight_kg` is the canonical unit for every comparison (PRs, e1RM,
    volume) so mixed-unit history compares correctly.
    """

    __tablename__ = "historical_sets"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(max_length=64, index=True)
    session_id: str = Field(max_length=64, foreign_key="workout_sessions.id", index=True)
    local_date: str = Field(max_length=10, index=True)  # denormalized from the session
    exercise_id: str = Field(max_length=64, foreign_key="exercises.id", index=True)
    set_index: int = Field(default=0)  # 0-based, per (session, exercise), server-assigned
    kind: str = Field(default="working", max_length=8)  # "working" | "warmup"
    weight: float = Field(ge=0)  # as entered, in `weight_unit`
    weight_unit: str = Field(default="lb", max_length=2)  # "lb" | "kg"
    weight_kg: float = Field(ge=0, index=True)  # canonical — all comparisons use this
    reps: int = Field(ge=1)
    rpe: Optional[float] = Field(default=None, ge=1, le=10)
    was_pr: bool = Field(default=False)  # snapshot at log time, for history badges
    timestamp: str = Field(max_length=32)  # ISO 8601 UTC


class PersonalRecord(SQLModel, table=True):
    """Two independently-tracked bests per exercise: heaviest single working
    set, and best estimated 1RM (Epley). A single `weight * reps` score
    (the old model) let a high-volume light set outrank a much heavier
    single — e.g. 135x20 (2700) beating 315x3 (945).
    """

    __tablename__ = "personal_records"

    user_id: str = Field(primary_key=True, max_length=64)
    exercise_id: str = Field(primary_key=True, max_length=64, foreign_key="exercises.id")
    best_weight_kg: float = Field(ge=0)
    best_weight_reps: int = Field(ge=1)
    best_weight_date: str = Field(max_length=10)
    best_e1rm_kg: float = Field(ge=0)
    best_e1rm_weight_kg: float = Field(ge=0)
    best_e1rm_reps: int = Field(ge=1)
    best_e1rm_date: str = Field(max_length=10)
    updated_at: str = Field(max_length=32)


class UserPreference(SQLModel, table=True):
    __tablename__ = "user_preferences"

    user_id: str = Field(primary_key=True, max_length=64)
    mode: str = Field(default="gym", max_length=10)
    equipment: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    completed_workouts_today: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    last_reset_date: str = Field(default="", max_length=10)
    weight_unit: str = Field(default="lb", max_length=2)  # "lb" | "kg"
    default_rest_sec: int = Field(default=90, ge=0, le=1800)

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


class WorkoutExerciseLink(SQLModel, table=True):
    """Order-preserving many-to-many: workouts contain exercises in sequence."""

    __tablename__ = "workout_exercise_link"

    workout_id: str = Field(foreign_key="workouts.id", primary_key=True, max_length=64)
    exercise_id: str = Field(foreign_key="exercises.id", primary_key=True, max_length=64)
    order_index: int = Field(default=0)


class HistoricalSet(SQLModel, table=True):
    __tablename__ = "historical_sets"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(max_length=64, index=True)
    date: str = Field(max_length=10, index=True)  # YYYY-MM-DD
    exercise_id: str = Field(max_length=64, foreign_key="exercises.id", index=True)
    weight: float = Field(ge=0)
    reps: int = Field(ge=1)
    timestamp: str = Field(max_length=32)  # ISO 8601 datetime


class PersonalRecord(SQLModel, table=True):
    __tablename__ = "personal_records"

    user_id: str = Field(primary_key=True, max_length=64)
    exercise_id: str = Field(primary_key=True, max_length=64, foreign_key="exercises.id")
    weight: float = Field(ge=0)
    reps: int = Field(ge=1)
    date: str = Field(max_length=10)


class UserPreference(SQLModel, table=True):
    __tablename__ = "user_preferences"

    user_id: str = Field(primary_key=True, max_length=64)
    mode: str = Field(default="gym", max_length=10)
    equipment: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    completed_workouts_today: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    last_reset_date: str = Field(default="", max_length=10)

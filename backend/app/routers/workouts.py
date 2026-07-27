from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.models import Workout, WorkoutExerciseLink
from app.routers._helpers import build_workout_detail
from app.schemas import WorkoutDetailResponse, WorkoutSummaryResponse

router = APIRouter(prefix="/workouts", tags=["workouts"])


@router.get("", response_model=list[WorkoutSummaryResponse])
def list_workouts(
    session: Session = Depends(get_session),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    location: str | None = Query(default=None, pattern="^(home|gym|either)$"),
    equipment: str | None = Query(default=None, max_length=50),
) -> list[WorkoutSummaryResponse]:
    """List workouts, with optional location/equipment filters.

    `limit`/`offset` allow paging through large catalogs; default
    100 is enough for the v1 UI. `location` and `equipment` are pushed
    into SQL so filtering is O(returned) not O(catalog). The `equipment`
    LIKE-substring check is a JSON-array-contains test (the column is
    a JSON list stringified by SQLAlchemy); we re-verify in Python to
    guard against false positives in pathological cases.
    """
    stmt = select(Workout)
    if location:
        # Treat "either" as a wildcard (a workout with `location="either"`
        # is valid for both home and gym filters).
        stmt = stmt.where(
            (Workout.location == location) | (Workout.location == "either")
        )
    if equipment:
        stmt = stmt.where(Workout.equipment.like(f'%"{equipment}"%'))

    rows = session.exec(stmt.limit(limit).offset(offset)).all()
    if equipment:
        # Re-verify in Python (the LIKE substring check is good enough
        # for our short token set, but defense-in-depth).
        rows = [w for w in rows if equipment in w.equipment]

    count_stmt = select(
        WorkoutExerciseLink.workout_id,
        func.count(WorkoutExerciseLink.exercise_id),
    ).group_by(WorkoutExerciseLink.workout_id)
    counts = dict(session.exec(count_stmt).all())  # type: ignore[arg-type]

    return [
        WorkoutSummaryResponse(
            id=w.id,
            name=w.name,
            tag=w.tag,
            location=w.location,
            equipment=w.equipment,
            duration_min=w.duration_min,
            exercise_count=counts.get(w.id, 0),
        )
        for w in rows
    ]


@router.get("/{workout_id}", response_model=WorkoutDetailResponse)
def get_workout(workout_id: str, session: Session = Depends(get_session)) -> WorkoutDetailResponse:
    w = session.get(Workout, workout_id)
    if w is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found")
    return build_workout_detail(session, w)

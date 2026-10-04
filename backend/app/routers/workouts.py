from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import Workout
from app.routers._helpers import build_workout_detail, workout_summaries
from app.schemas import WorkoutDetailResponse, WorkoutSummaryResponse

router = APIRouter(prefix="/workouts", tags=["workouts"])


@router.get("", response_model=list[WorkoutSummaryResponse])
def list_workouts(
    session: Session = Depends(get_session),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    equipment: str | None = Query(default=None, max_length=50),
) -> list[WorkoutSummaryResponse]:
    """List library workouts, with an optional equipment filter.

    `limit`/`offset` allow paging through large catalogs; default
    100 is enough for the v1 UI. `equipment` is pushed
    into SQL so filtering is O(returned) not O(catalog). The `equipment`
    LIKE-substring check is a JSON-array-contains test (the column is
    a JSON list stringified by SQLAlchemy); we re-verify in Python to
    guard against false positives in pathological cases.
    """
    # This public endpoint serves the "Coach's Playbook" — the owner-less
    # seeded/coach catalog. Personal templates (owner_id set) are private
    # and only reachable via the authed GET /me/workouts.
    stmt = select(Workout).where(Workout.owner_id.is_(None))
    if equipment:
        stmt = stmt.where(Workout.equipment.like(f'%"{equipment}"%'))

    rows = session.exec(stmt.order_by(Workout.created_at.desc(), Workout.id).limit(limit).offset(offset)).all()
    if equipment:
        # Re-verify in Python (the LIKE substring check is good enough
        # for our short token set, but defense-in-depth).
        rows = [w for w in rows if equipment in w.equipment]

    return workout_summaries(session, list(rows))


@router.get("/{workout_id}", response_model=WorkoutDetailResponse)
def get_workout(workout_id: str, session: Session = Depends(get_session)) -> WorkoutDetailResponse:
    w = session.get(Workout, workout_id)
    if w is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found")
    return build_workout_detail(session, w)

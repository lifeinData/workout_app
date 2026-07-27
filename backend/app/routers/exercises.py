from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, or_, select

from app.db import get_session
from app.models import Exercise
from app.schemas import ExerciseResponse

router = APIRouter(prefix="/exercises", tags=["exercises"])

# Max page size: large enough for the exercise picker to show every
# wger seed + hand-curated rows in one page. Past 1000 the JSON
# payload starts to feel heavy on cold start; 500 is the sweet spot.
EXERCISES_MAX_LIMIT = 500


@router.get("", response_model=list[ExerciseResponse])
def list_exercises(
    session: Session = Depends(get_session),
    muscle_group: str | None = Query(default=None, max_length=100),
    equipment: str | None = Query(default=None, max_length=50),
    q: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=EXERCISES_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[Exercise]:
    stmt = select(Exercise)
    if muscle_group:
        stmt = stmt.where(Exercise.muscle_group == muscle_group)
    if q:
        pattern = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(
                Exercise.name.ilike(pattern),
                Exercise.muscle_group.ilike(pattern),
            )
        )
    # equipment is a JSON array; do an in-Python filter for simplicity
    rows = session.exec(stmt.limit(limit).offset(offset)).all()
    if equipment:
        rows = [r for r in rows if equipment in r.equipment]
    return rows


@router.get("/{exercise_id}", response_model=ExerciseResponse)
def get_exercise(exercise_id: str, session: Session = Depends(get_session)) -> Exercise:
    ex = session.get(Exercise, exercise_id)
    if ex is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    return ex

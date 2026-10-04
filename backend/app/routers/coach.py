"""Coach library CRUD endpoints for workouts.

All routes are gated by `Depends(require_coach)` and live under
`/api/v1/coach/workouts`. The library is shared by all coaches
(`created_by` is attribution only). Assignment / athlete routes live in
`coaching.py`.

Conventions
-----------
- snake_case on the wire (no aliasing).
- Mutations return the freshly-built `WorkoutDetailResponse` so the
  client never has to re-fetch.
- `WorkoutExerciseLink.order_index` is always canonical ``0..N-1``
  after any mutation that touches the link table.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlmodel import Session as SQLModelSession, select

from app.db import get_session
from app.deps import require_coach
from app.models import Exercise, User, Workout, WorkoutAssignment, WorkoutExerciseLink
from app.routers._helpers import (
    build_workout_detail,
    recompute_equipment,
    workout_summaries,
)
from app.timefmt import utc_now_iso
from app.units import to_kg
from app.schemas import (
    AddExerciseToWorkout,
    PrescriptionPatch,
    ReorderExercises,
    WorkoutCreate,
    WorkoutDetailResponse,
    WorkoutSummaryResponse,
    WorkoutUpdate,
)


router = APIRouter(
    prefix="/workouts",
    tags=["coach"],
    dependencies=[Depends(require_coach)],
)


# ---------------------------------------------------------------------------
# Local helpers
# ---------------------------------------------------------------------------


def _renormalize_order_indexes(
    session: SQLModelSession, workout_id: str
) -> None:
    """Rewrite every link's ``order_index`` to 0, 1, 2, ... in current order.

    Stages updates only — the caller commits. Idempotent: a no-op run
    writes nothing. The secondary `exercise_id` sort key is a stable
    tie-breaker for any case where two links share the same
    `order_index` (shouldn't happen in normal flow, but the half-step
    trick historically used to write float values that could land on
    the same int after a renorm).
    """
    links = session.exec(
        select(WorkoutExerciseLink)
        .where(WorkoutExerciseLink.workout_id == workout_id)
        .order_by(WorkoutExerciseLink.order_index, WorkoutExerciseLink.exercise_id)
    ).all()
    for i, link in enumerate(links):
        if link.order_index != i:
            link.order_index = i
            session.add(link)


def _get_workout_or_404(session: SQLModelSession, workout_id: str) -> Workout:
    w = session.get(Workout, workout_id)
    if w is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout not found",
        )
    return w


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------


@router.get("", response_model=list[WorkoutSummaryResponse])
def list_workouts(
    session: SQLModelSession = Depends(get_session),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[WorkoutSummaryResponse]:
    """The shared library (`owner_id IS NULL`), newest first."""
    rows = session.exec(
        select(Workout)
        .where(Workout.owner_id.is_(None))
        .order_by(Workout.created_at.desc(), Workout.id)
        .limit(limit)
        .offset(offset)
    ).all()
    return workout_summaries(session, list(rows))


@router.get("/{workout_id}", response_model=WorkoutDetailResponse)
def get_workout(
    workout_id: str,
    session: SQLModelSession = Depends(get_session),
) -> WorkoutDetailResponse:
    return build_workout_detail(session, _get_workout_or_404(session, workout_id))


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=WorkoutDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_workout(
    body: WorkoutCreate,
    session: SQLModelSession = Depends(get_session),
    coach: User = Depends(require_coach),
) -> WorkoutDetailResponse:
    new_id = body.id if body.id else f"w-{uuid.uuid4().hex[:8]}"

    if session.get(Workout, new_id) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Workout id '{new_id}' already exists",
        )

    # Verify every referenced exercise exists in one IN-query.
    existing = session.exec(
        select(Exercise).where(Exercise.id.in_(body.exercise_ids))
    ).all()
    existing_ids = {e.id for e in existing}
    missing = [eid for eid in body.exercise_ids if eid not in existing_ids]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Exercise(s) not found: {', '.join(missing)}",
        )

    w = Workout(
        id=new_id,
        name=body.name,
        equipment=[],
        duration_min=body.duration_min,
        created_by=coach.id,
        created_at=utc_now_iso(),
    )
    session.add(w)
    for idx, ex_id in enumerate(body.exercise_ids):
        session.add(
            WorkoutExerciseLink(
                workout_id=new_id,
                exercise_id=ex_id,
                order_index=idx,
            )
        )
    session.flush()
    recompute_equipment(session, w)
    session.commit()
    session.refresh(w)
    return build_workout_detail(session, w)


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


@router.patch("/{workout_id}", response_model=WorkoutDetailResponse)
def update_workout(
    workout_id: str,
    body: WorkoutUpdate,
    session: SQLModelSession = Depends(get_session),
) -> WorkoutDetailResponse:
    w = _get_workout_or_404(session, workout_id)

    # Explicit allowlist of mutable fields. Pydantic's
    # `model_dump(exclude_unset=True)` would auto-allow whatever the
    # schema declares, which means a future field added to
    # `WorkoutUpdate` becomes silently mutable here. Spelling out the
    # fields keeps the patch surface auditable: any new field needs
    # a deliberate line added in this router.
    if body.name is not None:
        w.name = body.name
    if "duration_min" in body.model_fields_set:
        w.duration_min = body.duration_min  # explicit null clears it

    session.add(w)
    session.commit()
    session.refresh(w)
    return build_workout_detail(session, w)


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


@router.delete(
    "/{workout_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_workout(
    workout_id: str,
    session: SQLModelSession = Depends(get_session),
) -> Response:
    w = _get_workout_or_404(session, workout_id)
    # Children first — the DB doesn't enforce cascading, and stale links
    # would be a confusing bug if a future migration ever added one.
    links = session.exec(
        select(WorkoutExerciseLink).where(
            WorkoutExerciseLink.workout_id == workout_id
        )
    ).all()
    for link in links:
        session.delete(link)
    for assignment in session.exec(
        select(WorkoutAssignment).where(WorkoutAssignment.workout_id == workout_id)
    ).all():
        session.delete(assignment)
    session.delete(w)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Add exercise to a workout
# ---------------------------------------------------------------------------


@router.post(
    "/{workout_id}/exercises",
    response_model=WorkoutDetailResponse,
    status_code=status.HTTP_200_OK,
)
def add_exercise_to_workout(
    workout_id: str,
    body: AddExerciseToWorkout,
    session: SQLModelSession = Depends(get_session),
) -> WorkoutDetailResponse:
    w = _get_workout_or_404(session, workout_id)

    if session.get(Exercise, body.exercise_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Exercise '{body.exercise_id}' not found",
        )

    if session.get(WorkoutExerciseLink, (workout_id, body.exercise_id)) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Exercise '{body.exercise_id}' is already in workout "
                f"'{workout_id}'"
            ),
        )

    # Validate the anchor if specified. The anchor is used only for
    # the 404 check; the new link is always appended at the end (see
    # below). The "after_exercise_id" field is currently a presence
    # check, not a positioning contract; future "insert at exact
    # position" support would slot in here.
    if body.after_exercise_id is not None:
        anchor = session.get(
            WorkoutExerciseLink, (workout_id, body.after_exercise_id)
        )
        if anchor is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    f"after_exercise_id '{body.after_exercise_id}' is not "
                    f"in workout '{workout_id}'"
                ),
            )

    # Always append at the end (max + 1) and renorm 0..N-1 in a single
    # pass. The old half-step trick (writing a float order_index) is
    # gone: SQLite stores integers in the column, so writing 2.5
    # silently rounded to 2 and corrupted the chain. The renorm is
    # defensive — for the append case it's a no-op, but it makes
    # the state canonical even if a previous operation left gaps.
    current_max = session.exec(
        select(func.max(WorkoutExerciseLink.order_index)).where(
            WorkoutExerciseLink.workout_id == workout_id
        )
    ).first()
    new_idx: int = (current_max if current_max is not None else -1) + 1

    session.add(
        WorkoutExerciseLink(
            workout_id=workout_id,
            exercise_id=body.exercise_id,
            order_index=new_idx,
        )
    )
    _renormalize_order_indexes(session, workout_id)
    session.flush()
    recompute_equipment(session, w)
    session.commit()
    return build_workout_detail(session, w)


# ---------------------------------------------------------------------------
# Remove exercise from a workout
# ---------------------------------------------------------------------------


@router.delete(
    "/{workout_id}/exercises/{exercise_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_exercise_from_workout(
    workout_id: str,
    exercise_id: str,
    session: SQLModelSession = Depends(get_session),
) -> Response:
    # 404 if the workout itself doesn't exist (consistent with the add
    # endpoint, which checks both). Catches `/coach/workouts/nope/exercises/x`.
    _get_workout_or_404(session, workout_id)

    link = session.get(WorkoutExerciseLink, (workout_id, exercise_id))
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"Exercise '{exercise_id}' is not in workout '{workout_id}'"
            ),
        )

    session.delete(link)
    session.flush()
    _renormalize_order_indexes(session, workout_id)
    recompute_equipment(session, _get_workout_or_404(session, workout_id))
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Edit a single exercise's prescription within a workout
# ---------------------------------------------------------------------------


@router.patch(
    "/{workout_id}/exercises/{exercise_id}/prescription",
    response_model=WorkoutDetailResponse,
)
def update_prescription(
    workout_id: str,
    exercise_id: str,
    body: PrescriptionPatch,
    session: SQLModelSession = Depends(get_session),
) -> WorkoutDetailResponse:
    w = _get_workout_or_404(session, workout_id)

    link = session.get(WorkoutExerciseLink, (workout_id, exercise_id))
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Exercise '{exercise_id}' is not in workout '{workout_id}'",
        )

    if body.target_sets is not None:
        link.target_sets = body.target_sets
    if body.target_reps is not None:
        link.target_reps = body.target_reps
    if "target_weight" in body.model_fields_set:
        if body.target_weight is None:
            link.target_weight_kg = None  # explicit null clears the target
        else:
            # Schema validator guarantees the unit is present.
            link.target_weight_kg = to_kg(body.target_weight, body.target_weight_unit or "lb")
    if body.target_rest_sec is not None:
        link.target_rest_sec = body.target_rest_sec
    if body.prescription_notes is not None:
        link.prescription_notes = body.prescription_notes

    session.add(link)
    session.commit()
    return build_workout_detail(session, w)


# ---------------------------------------------------------------------------
# Reorder exercises in a workout
# ---------------------------------------------------------------------------


@router.patch(
    "/{workout_id}/exercises/reorder",
    response_model=WorkoutDetailResponse,
)
def reorder_exercises(
    workout_id: str,
    body: ReorderExercises,
    session: SQLModelSession = Depends(get_session),
) -> WorkoutDetailResponse:
    w = _get_workout_or_404(session, workout_id)

    current = session.exec(
        select(WorkoutExerciseLink)
        .where(WorkoutExerciseLink.workout_id == workout_id)
        .order_by(
            WorkoutExerciseLink.order_index,
            WorkoutExerciseLink.exercise_id,
        )
    ).all()
    current_ids = [link.exercise_id for link in current]

    # Same set + same length == same multiset. The composite PK on
    # WorkoutExerciseLink makes per-workout exercise_ids a set, so
    # length+set is sufficient (defensive `len` check guards against a
    # future schema change that allowed duplicates).
    if len(current_ids) != len(body.exercise_ids) or set(current_ids) != set(
        body.exercise_ids
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "exercise_ids must contain the same set of ids as the "
                "current workout, just in a new order"
            ),
        )

    by_id = {link.exercise_id: link for link in current}
    for new_idx, ex_id in enumerate(body.exercise_ids):
        link = by_id[ex_id]
        if link.order_index != new_idx:
            link.order_index = new_idx
            session.add(link)
    session.commit()
    return build_workout_detail(session, w)

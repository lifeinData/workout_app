"""Shared helpers used by both the public and admin workout routers.

Currently exports:
    - `build_workout_detail`: turns a `Workout` row into a fully-populated
      `WorkoutDetailResponse` (exercises ordered by `order_index`, each
      carrying its per-workout prescription from the link row).
      Uses two queries total (links + IN-fetch of exercises), so it's
      safe to call after any mutation without re-fetching the Workout.
"""

import logging

from sqlmodel import Session as SQLModelSession, select

from app.models import Exercise, Workout, WorkoutExerciseLink
from app.schemas import WorkoutDetailResponse, WorkoutExerciseResponse

logger = logging.getLogger(__name__)


def build_workout_detail(
    session: SQLModelSession, w: Workout
) -> WorkoutDetailResponse:
    """Build a `WorkoutDetailResponse` for an already-attached `Workout`.

    Assumes `w` is attached to `session` (and reflects any pending changes).
    The caller is responsible for committing before invoking this if it
    wants the response to reflect newly staged data.

    If a link references an `exercise_id` that doesn't resolve (e.g.
    a referenced exercise was deleted out from under the workout), we
    log a warning and skip it — the link stays in the DB and the
    workout renders with the remaining exercises. This shouldn't
    happen in normal flow (deletion of an exercise that's in a
    workout is blocked upstream), but the data integrity check is
    here as a safety net.
    """
    links = session.exec(
        select(WorkoutExerciseLink)
        .where(WorkoutExerciseLink.workout_id == w.id)
        .order_by(WorkoutExerciseLink.order_index, WorkoutExerciseLink.exercise_id)
    ).all()

    if not links:
        return WorkoutDetailResponse(
            id=w.id,
            name=w.name,
            tag=w.tag,
            location=w.location,
            equipment=w.equipment,
            duration_min=w.duration_min,
            owner_id=w.owner_id,
            exercises=[],
        )

    exercise_rows = session.exec(
        select(Exercise).where(Exercise.id.in_([link.exercise_id for link in links]))
    ).all()
    by_id = {e.id: e for e in exercise_rows}

    resolved: list[WorkoutExerciseResponse] = []
    for link in links:
        ex = by_id.get(link.exercise_id)
        if ex is None:
            logger.warning(
                "Workout %s links to exercise %s which doesn't exist; "
                "skipping in response",
                w.id,
                link.exercise_id,
            )
            continue
        resolved.append(
            WorkoutExerciseResponse(
                **ex.model_dump(),
                order_index=link.order_index,
                target_sets=link.target_sets,
                target_reps_low=link.target_reps_low,
                target_reps_high=link.target_reps_high,
                target_rest_sec=link.target_rest_sec,
                prescription_notes=link.prescription_notes,
            )
        )

    return WorkoutDetailResponse(
        id=w.id,
        name=w.name,
        tag=w.tag,
        location=w.location,
        equipment=w.equipment,
        duration_min=w.duration_min,
        owner_id=w.owner_id,
        exercises=resolved,
    )

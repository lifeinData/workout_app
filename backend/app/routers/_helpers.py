"""Shared helpers used by both the public and coach workout routers.

Currently exports:
    - `build_workout_detail`: turns a `Workout` row into a fully-populated
      `WorkoutDetailResponse` (exercises ordered by `order_index`, each
      carrying its per-workout prescription from the link row).
      Uses two queries total (links + IN-fetch of exercises), so it's
      safe to call after any mutation without re-fetching the Workout.
    - `workout_summary`: a `WorkoutSummaryResponse` for one workout.
    - `workout_summaries`: batch version (one count query + one user query).
    - `user_public`: `User` -> `UserPublic`.
    - `recompute_equipment`: re-derive `Workout.equipment` from its exercises.
"""

import logging

from sqlalchemy import func
from sqlmodel import Session as SQLModelSession, select

from app.models import Exercise, User, Workout, WorkoutExerciseLink
from app.schemas import (
    UserPublic,
    WorkoutDetailResponse,
    WorkoutExerciseResponse,
    WorkoutSummaryResponse,
)

logger = logging.getLogger(__name__)


def user_public(u: User | None) -> UserPublic | None:
    return UserPublic.model_validate(u) if u is not None else None


def workout_summaries(
    session: SQLModelSession, workouts: list[Workout]
) -> list[WorkoutSummaryResponse]:
    """Batch-build summaries (keeps input order)."""
    if not workouts:
        return []
    ids = [w.id for w in workouts]
    counts = dict(
        session.exec(
            select(
                WorkoutExerciseLink.workout_id,
                func.count(WorkoutExerciseLink.exercise_id),
            )
            .where(WorkoutExerciseLink.workout_id.in_(ids))
            .group_by(WorkoutExerciseLink.workout_id)
        ).all()  # type: ignore[arg-type]
    )
    creator_ids = {w.created_by for w in workouts if w.created_by}
    users: dict[str, User] = {}
    if creator_ids:
        users = {
            u.id: u
            for u in session.exec(select(User).where(User.id.in_(creator_ids))).all()
        }
    return [
        WorkoutSummaryResponse(
            id=w.id,
            name=w.name,
            equipment=w.equipment,
            duration_min=w.duration_min,
            exercise_count=counts.get(w.id, 0),
            created_by=user_public(users.get(w.created_by)) if w.created_by else None,
            created_at=w.created_at,
            owner_id=w.owner_id,
        )
        for w in workouts
    ]


def workout_summary(session: SQLModelSession, w: Workout) -> WorkoutSummaryResponse:
    return workout_summaries(session, [w])[0]


def recompute_equipment(session: SQLModelSession, w: Workout) -> None:
    """Set `w.equipment` to the sorted union of its exercises' equipment
    (dropping "bodyweight" when any other equipment exists). Stages only;
    the caller commits. Autoflush makes just-staged link changes visible."""
    rows = session.exec(
        select(Exercise.equipment)
        .join(WorkoutExerciseLink, WorkoutExerciseLink.exercise_id == Exercise.id)
        .where(WorkoutExerciseLink.workout_id == w.id)
    ).all()
    union: set[str] = set()
    for eq in rows:
        union.update(eq or [])
    if len(union) > 1:
        union.discard("bodyweight")
    w.equipment = sorted(union)
    session.add(w)


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
    summary = workout_summary(session, w)
    links = session.exec(
        select(WorkoutExerciseLink)
        .where(WorkoutExerciseLink.workout_id == w.id)
        .order_by(WorkoutExerciseLink.order_index, WorkoutExerciseLink.exercise_id)
    ).all()

    if not links:
        return WorkoutDetailResponse(**summary.model_dump(), exercises=[])

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
                target_reps=link.target_reps,
                target_weight_kg=link.target_weight_kg,
                target_rest_sec=link.target_rest_sec,
                prescription_notes=link.prescription_notes,
            )
        )

    return WorkoutDetailResponse(**summary.model_dump(), exercises=resolved)

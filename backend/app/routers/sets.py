"""Logging individual sets against an active session, plus PR and
per-exercise history reads.

`/me/history` (the old free-floating-sets endpoint) is gone —
`GET /me/sessions` (see `app.routers.sessions`) is the session-scoped
replacement.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlmodel import Session, func, select

from app.db import get_session
from app.deps import get_current_user
from app.models import Exercise, HistoricalSet, PersonalRecord, User, WorkoutSession
from app.prs import apply_set_to_pr, recompute_pr
from app.schemas import (
    ExerciseSessionRollup,
    HistoricalSetResponse,
    PersonalRecordResponse,
    SetLogCreate,
    SetLogCreatedResponse,
    SetLogPatch,
)
from app.timefmt import utc_now_iso
from app.units import epley_e1rm_kg, to_kg

router = APIRouter(prefix="/me", tags=["me"])


def _next_set_index(session: Session, session_id: str, exercise_id: str) -> int:
    current_max = session.exec(
        select(func.max(HistoricalSet.set_index))
        .where(HistoricalSet.session_id == session_id)
        .where(HistoricalSet.exercise_id == exercise_id)
    ).first()
    return (current_max if current_max is not None else -1) + 1


def _renumber_set_index(session: Session, session_id: str, exercise_id: str) -> None:
    """Rewrite every remaining set's `set_index` to 0..N-1, in current
    order. Stages only — caller commits."""
    rows = session.exec(
        select(HistoricalSet)
        .where(HistoricalSet.session_id == session_id)
        .where(HistoricalSet.exercise_id == exercise_id)
        .order_by(HistoricalSet.set_index)
    ).all()
    for i, row in enumerate(rows):
        if row.set_index != i:
            row.set_index = i
            session.add(row)


@router.post("/sets", response_model=SetLogCreatedResponse, status_code=status.HTTP_201_CREATED)
def log_set(
    body: SetLogCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> SetLogCreatedResponse:
    ws = session.get(WorkoutSession, body.session_id)
    if ws is None or ws.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if ws.status != "active":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session is not active")

    ex = session.get(Exercise, body.exercise_id)
    if ex is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")

    ts = body.timestamp or utc_now_iso()
    weight_kg = to_kg(body.weight, body.weight_unit)

    new_set = HistoricalSet(
        user_id=user.id,
        session_id=body.session_id,
        local_date=ws.local_date,
        exercise_id=body.exercise_id,
        set_index=_next_set_index(session, body.session_id, body.exercise_id),
        kind=body.kind,
        weight=body.weight,
        weight_unit=body.weight_unit,
        weight_kg=weight_kg,
        reps=body.reps,
        rpe=body.rpe,
        was_pr=False,
        timestamp=ts,
    )

    is_pr, pr = apply_set_to_pr(session, user.id, body.exercise_id, new_set)
    new_set.was_pr = is_pr

    session.add(new_set)
    session.commit()
    session.refresh(new_set)

    return SetLogCreatedResponse(
        set=HistoricalSetResponse.model_validate(new_set),
        is_pr=is_pr,
        pr=PersonalRecordResponse.model_validate(pr) if pr else None,
    )


@router.patch("/sets/{set_id}", response_model=SetLogCreatedResponse)
def update_set(
    set_id: int,
    body: SetLogPatch,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> SetLogCreatedResponse:
    target = session.get(HistoricalSet, set_id)
    if target is None or target.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Set not found")

    if body.weight is not None:
        target.weight = body.weight
    if body.weight_unit is not None:
        target.weight_unit = body.weight_unit
    if body.reps is not None:
        target.reps = body.reps
    if body.kind is not None:
        target.kind = body.kind
    if body.rpe is not None:
        target.rpe = body.rpe
    # Any of the three fields above can change the canonical comparison
    # value, so it's always re-derived rather than conditionally patched.
    target.weight_kg = to_kg(target.weight, target.weight_unit)

    session.add(target)
    session.flush()  # so recompute_pr's scan sees the edited row

    pr = recompute_pr(session, user.id, target.exercise_id)
    # `was_pr` is a display snapshot, not the source of truth (the PR
    # table is) — approximate "this row backs a current best" by value
    # match rather than tracking set identity on PersonalRecord.
    is_pr = target.kind == "working" and pr is not None and (
        (target.weight_kg, target.reps) == (pr.best_weight_kg, pr.best_weight_reps)
        or (target.weight_kg == pr.best_e1rm_weight_kg and target.reps == pr.best_e1rm_reps)
    )
    target.was_pr = is_pr
    session.add(target)
    session.commit()
    session.refresh(target)

    return SetLogCreatedResponse(
        set=HistoricalSetResponse.model_validate(target),
        is_pr=is_pr,
        pr=PersonalRecordResponse.model_validate(pr) if pr else None,
    )


@router.delete("/sets/{set_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_set(
    set_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    target = session.get(HistoricalSet, set_id)
    if target is None or target.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Set not found")

    session_id = target.session_id
    exercise_id = target.exercise_id
    session.delete(target)
    session.flush()
    _renumber_set_index(session, session_id, exercise_id)
    recompute_pr(session, user.id, exercise_id)
    # Single commit at the end — stages the delete + renumber + PR
    # changes together.
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/prs", response_model=list[PersonalRecordResponse])
def get_prs(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[PersonalRecordResponse]:
    rows = session.exec(
        select(PersonalRecord).where(PersonalRecord.user_id == user.id)
    ).all()
    return [PersonalRecordResponse.model_validate(r) for r in rows]


@router.get("/exercises/{exercise_id}/history", response_model=list[ExerciseSessionRollup])
def get_exercise_history(
    exercise_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    limit: int = Query(default=20, ge=1, le=200),
) -> list[ExerciseSessionRollup]:
    """Per-session rollup for the progress chart, most recent first.
    Warmup sets are excluded from every aggregate here."""
    rows = session.exec(
        select(HistoricalSet)
        .where(HistoricalSet.user_id == user.id)
        .where(HistoricalSet.exercise_id == exercise_id)
        .where(HistoricalSet.kind == "working")
        .order_by(HistoricalSet.timestamp.desc())
    ).all()

    by_session: dict[str, list[HistoricalSet]] = {}
    session_order: list[str] = []  # rows are DESC, so first-seen == most-recent-first
    for r in rows:
        if r.session_id not in by_session:
            by_session[r.session_id] = []
            session_order.append(r.session_id)
        by_session[r.session_id].append(r)

    rollups: list[ExerciseSessionRollup] = []
    for sid in session_order[:limit]:
        sets = by_session[sid]
        rollups.append(
            ExerciseSessionRollup(
                session_id=sid,
                local_date=sets[0].local_date,
                sets=len(sets),
                best_weight_kg=max(s.weight_kg for s in sets),
                best_e1rm_kg=max(epley_e1rm_kg(s.weight_kg, s.reps) for s in sets),
                volume_kg=sum(s.weight_kg * s.reps for s in sets),
            )
        )
    return rollups

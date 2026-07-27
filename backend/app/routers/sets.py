from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlmodel import Session, select

from app.db import get_session
from app.deps import get_current_user
from app.models import Exercise, HistoricalSet, PersonalRecord, User
from app.schemas import (
    HistoricalSetResponse,
    HistoryResponse,
    PersonalRecordResponse,
    SetLogCreate,
    SetLogCreatedResponse,
)
from app.timefmt import utc_now_iso

router = APIRouter(prefix="/me", tags=["me"])


def _recompute_pr(session: Session, user_id: str, exercise_id: str) -> None:
    """After a delete, recompute PR from remaining sets.

    Stages updates only — the caller commits. If no sets remain, the
    PR row is staged for deletion; otherwise a single PR row is staged
    for insert-or-update.
    """
    remaining = session.exec(
        select(HistoricalSet)
        .where(HistoricalSet.user_id == user_id)
        .where(HistoricalSet.exercise_id == exercise_id)
    ).all()
    pr = session.get(PersonalRecord, (user_id, exercise_id))
    if not remaining:
        if pr is not None:
            session.delete(pr)
        return
    # Tie-breaker: prefer higher weight first, then more reps. Without
    # this, two sets with the same weight*reps score (e.g. 200*5 vs
    # 100*10) resolve to whichever `max()` visits first — i.e. an
    # effectively random pick.
    best = max(remaining, key=lambda s: (s.weight * s.reps, s.weight, s.reps))
    if pr is None:
        session.add(
            PersonalRecord(
                user_id=user_id,
                exercise_id=exercise_id,
                weight=best.weight,
                reps=best.reps,
                date=best.date,
            )
        )
    else:
        pr.weight = best.weight
        pr.reps = best.reps
        pr.date = best.date
        session.add(pr)


@router.get("/history", response_model=HistoryResponse)
def get_history(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    from_: str | None = Query(default=None, alias="from", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    to: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
) -> HistoryResponse:
    stmt = select(HistoricalSet).where(HistoricalSet.user_id == user.id)
    if from_:
        stmt = stmt.where(HistoricalSet.date >= from_)
    if to:
        stmt = stmt.where(HistoricalSet.date <= to)
    stmt = stmt.order_by(HistoricalSet.date.desc(), HistoricalSet.timestamp.desc())
    rows = session.exec(stmt).all()

    grouped: dict[str, dict[str, list[HistoricalSetResponse]]] = {}
    for s in rows:
        by_date = grouped.setdefault(s.date, {})
        by_date.setdefault(s.exercise_id, []).append(
            HistoricalSetResponse.model_validate(s)
        )
    return HistoryResponse(history=grouped)


@router.post("/sets", response_model=SetLogCreatedResponse, status_code=status.HTTP_201_CREATED)
def log_set(
    body: SetLogCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> SetLogCreatedResponse:
    ex = session.get(Exercise, body.exercise_id)
    if ex is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")

    ts = body.timestamp or utc_now_iso()
    today = ts[:10]

    new_set = HistoricalSet(
        user_id=user.id,
        date=today,
        exercise_id=body.exercise_id,
        weight=body.weight,
        reps=body.reps,
        timestamp=ts,
    )
    session.add(new_set)
    session.flush()  # get new_set.id

    # PR detection: highest weight*reps
    is_pr = False
    pr_response: PersonalRecordResponse | None = None
    existing = session.get(PersonalRecord, (user.id, body.exercise_id))
    new_score = body.weight * body.reps
    if existing is None or new_score > (existing.weight * existing.reps):
        if existing is None:
            new_pr = PersonalRecord(
                user_id=user.id,
                exercise_id=body.exercise_id,
                weight=body.weight,
                reps=body.reps,
                date=today,
            )
            session.add(new_pr)
        else:
            existing.weight = body.weight
            existing.reps = body.reps
            existing.date = today
            session.add(existing)
        is_pr = True
        pr_response = PersonalRecordResponse(
            user_id=user.id,
            exercise_id=body.exercise_id,
            weight=body.weight,
            reps=body.reps,
            date=today,
        )

    session.commit()
    session.refresh(new_set)

    return SetLogCreatedResponse(
        set=HistoricalSetResponse.model_validate(new_set),
        is_pr=is_pr,
        pr=pr_response,
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
    ex_id = target.exercise_id
    session.delete(target)
    _recompute_pr(session, user.id, ex_id)
    # Single commit at the end — stages the delete + any PR changes together.
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

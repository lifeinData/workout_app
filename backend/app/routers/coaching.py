"""Coaching routes: coach links, coaches list, athletes, assignments, playbook.

Mounted at `/api/v1` (paths are spelled out in full inside the router, e.g.
`/coaches`, `/me/coach`, `/coach/athletes`).

An *active* link is one with status `pending` or `accepted`; each athlete may
have at most one (enforced here, not in the DB).
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlmodel import Session as SQLModelSession, select

from app.db import get_session
from app.deps import get_current_user, require_coach
from app.models import CoachLink, Message, User, Workout, WorkoutAssignment
from app.routers._helpers import user_public, workout_summaries
from app.schemas import (
    AssignmentsBody,
    AthleteRow,
    AthletesResponse,
    CoachLinkResponse,
    CoachPublic,
    CoachRequestCreate,
    LastMessage,
    PlaybookResponse,
)
from app.timefmt import utc_now_iso

router = APIRouter(tags=["coaching"])

ACTIVE_STATUSES = ("pending", "accepted")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _active_link_for_athlete(db: SQLModelSession, athlete_id: str) -> CoachLink | None:
    return db.exec(
        select(CoachLink)
        .where(CoachLink.athlete_id == athlete_id)
        .where(CoachLink.status.in_(ACTIVE_STATUSES))  # type: ignore[attr-defined]
        .order_by(CoachLink.created_at.desc())  # type: ignore[attr-defined]
    ).first()


def _athlete_counts(db: SQLModelSession, coach_ids: list[str]) -> dict[str, int]:
    if not coach_ids:
        return {}
    rows = db.exec(
        select(CoachLink.coach_id, func.count(CoachLink.id))
        .where(CoachLink.coach_id.in_(coach_ids))  # type: ignore[attr-defined]
        .where(CoachLink.status == "accepted")
        .group_by(CoachLink.coach_id)
    ).all()
    return {cid: n for cid, n in rows}


def _coach_public(db: SQLModelSession, coach: User) -> CoachPublic:
    n = _athlete_counts(db, [coach.id]).get(coach.id, 0)
    return CoachPublic(**user_public(coach).model_dump(), athlete_count=n)  # type: ignore[union-attr]


def _unread_from(db: SQLModelSession, me_id: str, other_id: str) -> int:
    return (
        db.exec(
            select(func.count(Message.id))
            .where(Message.recipient_id == me_id)
            .where(Message.sender_id == other_id)
            .where(Message.read_at.is_(None))  # type: ignore[union-attr]
        ).one()
        or 0
    )


def _link_response(
    db: SQLModelSession, link: CoachLink, me: User
) -> CoachLinkResponse:
    coach = db.get(User, link.coach_id)
    if coach is None:  # pragma: no cover - FK guarantees it
        raise HTTPException(500, "Coach record missing")
    return CoachLinkResponse(
        id=link.id,
        status=link.status,
        coach=_coach_public(db, coach),
        created_at=link.created_at,
        responded_at=link.responded_at,
        unread_count=_unread_from(db, me.id, link.coach_id),
    )


def _athlete_row(db: SQLModelSession, link: CoachLink, coach: User) -> AthleteRow:
    athlete = db.get(User, link.athlete_id)
    if athlete is None:  # pragma: no cover - FK guarantees it
        raise HTTPException(500, "Athlete record missing")
    last = db.exec(
        select(Message)
        .where(
            ((Message.sender_id == coach.id) & (Message.recipient_id == athlete.id))
            | ((Message.sender_id == athlete.id) & (Message.recipient_id == coach.id))
        )
        .order_by(Message.id.desc())  # type: ignore[union-attr]
    ).first()
    assigned = (
        db.exec(
            select(func.count())
            .select_from(WorkoutAssignment)
            .where(WorkoutAssignment.athlete_id == athlete.id)
            .where(WorkoutAssignment.sent_by == coach.id)
        ).one()
        or 0
    )
    return AthleteRow(
        link_id=link.id,
        status=link.status,
        user=user_public(athlete),  # type: ignore[arg-type]
        created_at=link.created_at,
        unread_count=_unread_from(db, coach.id, athlete.id),
        last_message=(
            LastMessage(
                body=last.body,
                created_at=last.created_at,
                from_me=last.sender_id == coach.id,
            )
            if last
            else None
        ),
        assigned_workout_count=assigned,
    )


def _accepted_athlete_ids(db: SQLModelSession, coach_id: str) -> set[str]:
    return set(
        db.exec(
            select(CoachLink.athlete_id)
            .where(CoachLink.coach_id == coach_id)
            .where(CoachLink.status == "accepted")
        ).all()
    )


def _library_workout_or_404(db: SQLModelSession, workout_id: str) -> Workout:
    w = db.get(Workout, workout_id)
    if w is None or w.owner_id is not None:
        raise HTTPException(404, "Workout not found")
    return w


def _name_key(u: User) -> tuple[str, str]:
    return ((u.display_name or u.username).lower(), u.username)


# ---------------------------------------------------------------------------
# Athlete side
# ---------------------------------------------------------------------------


@router.get("/coaches", response_model=list[CoachPublic])
def list_coaches(
    db: SQLModelSession = Depends(get_session),
    _user: User = Depends(get_current_user),
) -> list[CoachPublic]:
    coaches = sorted(db.exec(select(User).where(User.role == "coach")).all(), key=_name_key)
    counts = _athlete_counts(db, [c.id for c in coaches])
    return [
        CoachPublic(**user_public(c).model_dump(), athlete_count=counts.get(c.id, 0))  # type: ignore[union-attr]
        for c in coaches
    ]


@router.get("/me/coach", response_model=CoachLinkResponse | None)
def get_my_coach(
    db: SQLModelSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CoachLinkResponse | None:
    link = _active_link_for_athlete(db, user.id)
    return _link_response(db, link, user) if link else None


@router.post(
    "/me/coach-requests",
    response_model=CoachLinkResponse,
    status_code=status.HTTP_201_CREATED,
)
def request_coach(
    body: CoachRequestCreate,
    db: SQLModelSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CoachLinkResponse:
    if user.role == "coach":
        raise HTTPException(403, "Coaches can't request a coach")
    coach = db.get(User, body.coach_id)
    if coach is None or coach.role != "coach":
        raise HTTPException(404, "Coach not found")
    if _active_link_for_athlete(db, user.id) is not None:
        raise HTTPException(409, "You already have a coach or a pending request")

    now = utc_now_iso()
    link = CoachLink(
        id=f"cl-{uuid.uuid4().hex[:12]}",
        coach_id=coach.id,
        athlete_id=user.id,
        status="pending",
        created_at=now,
    )
    db.add(link)
    message = (body.message or "").strip()
    if message:
        db.add(
            Message(
                sender_id=user.id,
                recipient_id=coach.id,
                body=message,
                created_at=now,
            )
        )
    db.commit()
    db.refresh(link)
    return _link_response(db, link, user)


@router.delete("/me/coach-link", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_coach_link(
    db: SQLModelSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    link = _active_link_for_athlete(db, user.id)
    if link is None:
        raise HTTPException(404, "No coach link")
    link.status = "cancelled" if link.status == "pending" else "ended"
    link.responded_at = link.responded_at or utc_now_iso()
    db.add(link)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me/playbook", response_model=PlaybookResponse)
def get_playbook(
    db: SQLModelSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> PlaybookResponse:
    if user.role == "coach":
        library = db.exec(
            select(Workout)
            .where(Workout.owner_id.is_(None))  # type: ignore[union-attr]
            .order_by(Workout.created_at.desc(), Workout.id)  # type: ignore[attr-defined]
        ).all()
        return PlaybookResponse(
            is_coach=True, coach_link=None, workouts=workout_summaries(db, list(library))
        )

    link = _active_link_for_athlete(db, user.id)
    if link is None:
        return PlaybookResponse(is_coach=False, coach_link=None, workouts=[])
    link_resp = _link_response(db, link, user)
    if link.status != "accepted":
        return PlaybookResponse(is_coach=False, coach_link=link_resp, workouts=[])

    rows = db.exec(
        select(Workout, WorkoutAssignment)
        .join(WorkoutAssignment, WorkoutAssignment.workout_id == Workout.id)
        .where(WorkoutAssignment.athlete_id == user.id)
        .where(WorkoutAssignment.sent_by == link.coach_id)
        .order_by(WorkoutAssignment.sent_at.desc(), Workout.id)  # type: ignore[attr-defined]
    ).all()
    workouts = [w for w, _a in rows]
    return PlaybookResponse(
        is_coach=False, coach_link=link_resp, workouts=workout_summaries(db, workouts)
    )


# ---------------------------------------------------------------------------
# Coach side
# ---------------------------------------------------------------------------


@router.get("/coach/athletes", response_model=AthletesResponse)
def list_athletes(
    db: SQLModelSession = Depends(get_session),
    coach: User = Depends(require_coach),
) -> AthletesResponse:
    links = db.exec(
        select(CoachLink)
        .where(CoachLink.coach_id == coach.id)
        .where(CoachLink.status.in_(ACTIVE_STATUSES))  # type: ignore[attr-defined]
    ).all()
    pending = sorted(
        (lk for lk in links if lk.status == "pending"),
        key=lambda lk: (lk.created_at, lk.id),
    )
    accepted = [lk for lk in links if lk.status == "accepted"]
    rows = {lk.id: _athlete_row(db, lk, coach) for lk in accepted}
    accepted.sort(
        key=lambda lk: (
            (rows[lk.id].user.display_name or rows[lk.id].user.username).lower(),
            rows[lk.id].user.username,
        )
    )
    return AthletesResponse(
        requests=[_athlete_row(db, lk, coach) for lk in pending],
        athletes=[rows[lk.id] for lk in accepted],
    )


def _link_for_coach_or_error(
    db: SQLModelSession, link_id: str, coach: User
) -> CoachLink:
    link = db.get(CoachLink, link_id)
    if link is None or link.coach_id != coach.id:
        raise HTTPException(404, "Link not found")
    if link.status != "pending":
        raise HTTPException(409, "Request is no longer pending")
    return link


@router.post("/coach/links/{link_id}/accept", response_model=AthleteRow)
def accept_link(
    link_id: str,
    db: SQLModelSession = Depends(get_session),
    coach: User = Depends(require_coach),
) -> AthleteRow:
    link = _link_for_coach_or_error(db, link_id, coach)
    link.status = "accepted"
    link.responded_at = utc_now_iso()
    db.add(link)
    db.commit()
    db.refresh(link)
    return _athlete_row(db, link, coach)


@router.post("/coach/links/{link_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
def decline_link(
    link_id: str,
    db: SQLModelSession = Depends(get_session),
    coach: User = Depends(require_coach),
) -> Response:
    link = _link_for_coach_or_error(db, link_id, coach)
    link.status = "declined"
    link.responded_at = utc_now_iso()
    db.add(link)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/coach/workouts/{workout_id}/assignments")
def get_assignments(
    workout_id: str,
    db: SQLModelSession = Depends(get_session),
    coach: User = Depends(require_coach),
) -> dict[str, list[str]]:
    _library_workout_or_404(db, workout_id)
    mine = _accepted_athlete_ids(db, coach.id)
    assigned = db.exec(
        select(WorkoutAssignment.athlete_id).where(
            WorkoutAssignment.workout_id == workout_id
        )
    ).all()
    return {"athlete_ids": sorted(a for a in assigned if a in mine)}


@router.put("/coach/workouts/{workout_id}/assignments")
def put_assignments(
    workout_id: str,
    body: AssignmentsBody,
    db: SQLModelSession = Depends(get_session),
    coach: User = Depends(require_coach),
) -> dict[str, list[str]]:
    _library_workout_or_404(db, workout_id)
    mine = _accepted_athlete_ids(db, coach.id)
    wanted = set(body.athlete_ids)
    invalid = wanted - mine
    if invalid:
        raise HTTPException(
            422, f"Not your accepted athletes: {', '.join(sorted(invalid))}"
        )

    existing = {
        a.athlete_id: a
        for a in db.exec(
            select(WorkoutAssignment).where(WorkoutAssignment.workout_id == workout_id)
        ).all()
    }
    now = utc_now_iso()
    for athlete_id, row in existing.items():
        if athlete_id in mine and athlete_id not in wanted:
            db.delete(row)
    for athlete_id in wanted:
        row = existing.get(athlete_id)
        if row is None:
            db.add(
                WorkoutAssignment(
                    workout_id=workout_id,
                    athlete_id=athlete_id,
                    sent_by=coach.id,
                    sent_at=now,
                )
            )
        elif row.sent_by != coach.id:
            row.sent_by = coach.id
            row.sent_at = now
            db.add(row)
    db.commit()
    return {"athlete_ids": sorted(wanted)}

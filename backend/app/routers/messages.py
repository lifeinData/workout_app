"""Direct messages between a coach and an athlete.

A thread is the (coach, athlete) pair. Read/write is allowed only while a
pending or accepted `CoachLink` exists between the two users (either
direction), else 403. Mounted at `/api/v1`.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import and_, or_
from sqlmodel import Session as SQLModelSession, func, select

from app.db import get_session
from app.deps import get_current_user
from app.models import CoachLink, Message, User
from app.rate_limit import limiter
from app.schemas import MessageCreate, MessageResponse, UnreadResponse
from app.timefmt import utc_now_iso

router = APIRouter(prefix="/me/messages", tags=["messages"])

_ACTIVE = ("pending", "accepted")


def _has_active_link(db: SQLModelSession, a_id: str, b_id: str) -> bool:
    link = db.exec(
        select(CoachLink.id)
        .where(
            CoachLink.status.in_(_ACTIVE),  # type: ignore[attr-defined]
            or_(
                and_(CoachLink.coach_id == a_id, CoachLink.athlete_id == b_id),
                and_(CoachLink.coach_id == b_id, CoachLink.athlete_id == a_id),
            ),
        )
        .limit(1)
    ).first()
    return link is not None


def _require_link(db: SQLModelSession, me_id: str, other_id: str) -> None:
    if me_id == other_id or not _has_active_link(db, me_id, other_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No active coaching link with this user",
        )


@router.get("/unread", response_model=UnreadResponse)
def unread(
    user: User = Depends(get_current_user),
    db: SQLModelSession = Depends(get_session),
) -> UnreadResponse:
    rows = db.exec(
        select(Message.sender_id, func.count(Message.id))
        .where(Message.recipient_id == user.id, Message.read_at.is_(None))  # type: ignore[union-attr]
        .group_by(Message.sender_id)
    ).all()
    by_user = {sender: int(n) for sender, n in rows}
    return UnreadResponse(total=sum(by_user.values()), by_user=by_user)


def _thread_filter(me_id: str, other_id: str):  # type: ignore[no-untyped-def]
    return or_(
        and_(Message.sender_id == me_id, Message.recipient_id == other_id),
        and_(Message.sender_id == other_id, Message.recipient_id == me_id),
    )


@router.get("/{other_user_id}", response_model=list[MessageResponse])
def list_messages(
    other_user_id: str,
    after_id: Optional[int] = Query(default=None, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: SQLModelSession = Depends(get_session),
) -> list[Message]:
    _require_link(db, user.id, other_user_id)
    stmt = select(Message).where(_thread_filter(user.id, other_user_id))
    if after_id is not None:
        rows = db.exec(
            stmt.where(Message.id > after_id).order_by(Message.id).limit(limit)  # type: ignore[arg-type]
        ).all()
        return list(rows)
    rows = db.exec(stmt.order_by(Message.id.desc()).limit(limit)).all()  # type: ignore[union-attr]
    return list(reversed(rows))


@router.post(
    "/{other_user_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("30/minute")
def send_message(
    request: Request,
    other_user_id: str,
    payload: MessageCreate,
    user: User = Depends(get_current_user),
    db: SQLModelSession = Depends(get_session),
) -> Message:
    _require_link(db, user.id, other_user_id)
    msg = Message(
        sender_id=user.id,
        recipient_id=other_user_id,
        body=payload.body,
        created_at=utc_now_iso(),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


@router.post("/{other_user_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(
    other_user_id: str,
    user: User = Depends(get_current_user),
    db: SQLModelSession = Depends(get_session),
) -> Response:
    _require_link(db, user.id, other_user_id)
    now = utc_now_iso()
    rows = db.exec(
        select(Message).where(
            Message.sender_id == other_user_id,
            Message.recipient_id == user.id,
            Message.read_at.is_(None),  # type: ignore[union-attr]
        )
    ).all()
    for m in rows:
        m.read_at = now
        db.add(m)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

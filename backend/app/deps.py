"""FastAPI dependencies for auth + role enforcement.

The header-based `X-User-Id` scheme is gone. Clients now send
`Authorization: Bearer <opaque-session-token>` and we look up the row in
the `sessions` table. Role-gated endpoints add `Depends(require_coach)`.
"""

from __future__ import annotations

from fastapi import Depends, Header, HTTPException
from sqlalchemy import delete
from sqlmodel import Session as SQLModelSession

from app.auth_header import parse_authorization_header
from app.config import get_settings
from app.db import get_session
from app.models import Session, User
from app.timefmt import utc_now_iso as _now_iso

_settings = get_settings()

# Re-exported so existing call sites (`from app.deps import parse_authorization_header`)
# keep working. The canonical implementation lives in `app.auth_header`.
__all__ = [
    "get_current_user",
    "parse_authorization_header",
    "require_coach",
    "revoke_all_user_sessions",
]


def get_current_user_and_session(
    authorization: str = Header(..., min_length=1),
    session: SQLModelSession = Depends(get_session),
) -> tuple[User, Session]:
    """Parse `Authorization: Bearer <token>`, validate session, return (user, session_row).

    On invalid/expired token, deletes the stale row and raises 401.
    Returns both the User and the Session row so callers that need to
    mutate the row (e.g. /logout) don't have to re-look-it-up.
    """
    token = parse_authorization_header(authorization)

    row = session.get(Session, token)
    if row is None:
        raise HTTPException(401, "Invalid token")

    if row.expires_at < _now_iso():
        # Stale session — clean it up.
        session.delete(row)
        session.commit()
        raise HTTPException(401, "Token expired")

    user = session.get(User, row.user_id)
    if user is None:
        # Session points at a deleted user — clean it up.
        session.delete(row)
        session.commit()
        raise HTTPException(401, "User no longer exists")

    return user, row


def get_current_user(
    authorization: str = Header(..., min_length=1),
    session: SQLModelSession = Depends(get_session),
) -> User:
    """Parse `Authorization: Bearer <token>`, validate session, return User.

    Convenience wrapper over `get_current_user_and_session` for callers
    that only need the User.
    """
    user, _row = get_current_user_and_session(authorization=authorization, session=session)
    return user


def require_coach(user: User = Depends(get_current_user)) -> User:
    """Gate coach-only endpoints. 403 (not 401) — caller is known but lacks role."""
    if user.role != "coach":
        raise HTTPException(403, "Coach role required")
    return user


def revoke_all_user_sessions(session: SQLModelSession, user_id: str) -> int:
    """Used by logout-all and (future) password change. Returns count deleted."""
    result = session.exec(delete(Session).where(Session.user_id == user_id))  # type: ignore[union-attr]
    return result.rowcount or 0

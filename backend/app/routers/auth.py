"""Auth router: signup, login, logout, logout-all, me.

All endpoints are mounted under `/api/v1/auth` (prefix on the router
combined with the `/api/v1` prefix in `app.main`):

- `POST /signup`      — create a new account, return a session
- `POST /login`       — authenticate, return a session
- `POST /logout`      — revoke the session used for this request
- `POST /logout-all`  — revoke every session for the current user
- `GET  /me`          — return the current user's profile

Conventions
-----------
- snake_case on the wire (no aliasing).
- Tokens are opaque (`secrets.token_urlsafe(32)` -> 43 chars) and live in
  the `sessions` table; clients send them as `Authorization: Bearer <tok>`.
- All timestamps are UTC ISO 8601 with a literal `Z` suffix
  (`YYYY-MM-DDTHH:MM:SSZ`).
- Passwords are SHA-256 pre-hashed (to bypass bcrypt's 72-byte
  truncation limit) then hashed with bcrypt at `settings.auth.bcrypt_cost`
  rounds. The 60-char bcrypt hash is stored in `users.password_hash`.
- The login path runs bcrypt even when the user does not exist, against
  a fake hash whose cost mirrors `settings.auth.bcrypt_cost`, so the
  no-such-user branch takes the same time as a real wrong-password branch.
- Rate-limited at the IP layer: 10/min on /login, 5/hour on /signup.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid

import bcrypt
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session as SQLModelSession, select

from app.auth_header import parse_authorization_header
from app.config import get_settings
from app.db import get_session
from app.deps import get_current_user, get_current_user_and_session, revoke_all_user_sessions
from app.models import Session, User
from app.rate_limit import limiter
from app.schemas import (
    LoginRequest,
    SessionResponse,
    SignupRequest,
    UserResponse,
)
from app.timefmt import utc_iso_in_days, utc_now_iso

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _normalize_password(pw: str) -> bytes:
    """Pre-hash the password with SHA-256 before bcrypt.

    bcrypt silently truncates inputs at 72 bytes, so any password that
    encodes to more than 72 bytes (e.g. a long passphrase with multi-byte
    characters) would be hashed as if it were its first 72 bytes. SHA-256
    reduces any input to a fixed 32 bytes, sidestepping the limit. The
    stored bcrypt hash is still the strength factor; SHA-256 is just a
    deterministic length-normalizer.
    """
    return hashlib.sha256(pw.encode("utf-8")).digest()


# Lazy-computed fake bcrypt hash for timing-equalization on the login path.
# We use the *real* configured cost (not a low-cost constant) so the
# no-such-user branch takes the same time as a real
# (user-exists, wrong-password) branch. The hash is computed once at first
# use and cached for the lifetime of the process.
_FAKE_HASH: str | None = None


def _get_fake_hash() -> str:
    global _FAKE_HASH
    if _FAKE_HASH is None:
        cost = get_settings().auth.bcrypt_cost
        _FAKE_HASH = bcrypt.hashpw(
            b"timing-equalization-payload-not-a-real-password",
            bcrypt.gensalt(rounds=cost),
        ).decode("utf-8")
    return _FAKE_HASH


def bearer_token(authorization: str = Header(...)) -> str:
    """Dependency: extract the bare token from `Authorization: Bearer <tok>`.

    Wraps the shared `parse_authorization_header` helper (which enforces
    a 48-char cap matching `secrets.token_urlsafe(32)` output) so the
    same token string resolves in both `get_current_user` and the
    /logout endpoint. 401 on any malformed header.
    """
    return parse_authorization_header(authorization)


def _create_session_row(session_user_id: str) -> Session:
    """Build a fresh `Session` row with a unique opaque token.

    The caller is responsible for `session.add(...)` + `session.commit()`.
    """
    settings = get_settings()
    return Session(
        token=secrets.token_urlsafe(32),
        user_id=session_user_id,
        created_at=utc_now_iso(),
        expires_at=utc_iso_in_days(settings.auth.session_ttl_days),
    )


# ---------------------------------------------------------------------------
# POST /signup
# ---------------------------------------------------------------------------


@router.post(
    "/signup",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/hour")
def signup(
    request: Request,  # required by slowapi to read the client IP
    body: SignupRequest,
    session: SQLModelSession = Depends(get_session),
) -> SessionResponse:
    settings = get_settings()

    # Pydantic's `pattern=r"^[a-z0-9_]+$"` is the single source of truth
    # for username charset; we just normalize defensively (trailing
    # newline etc.) before persisting.
    username = body.username.strip().lower()

    # Password length is enforced by Pydantic (`min_length=8`) AND by
    # `settings.auth.password_min_length`; the latter is an extra safety
    # net for the case where a future config relaxes the schema's
    # `min_length`. Both checks share the same config knob upstream.
    if len(body.password) < settings.auth.password_min_length:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password too short",
        )

    # Hash. Pre-hash with SHA-256 to bypass bcrypt's 72-byte truncation
    # limit (see `_normalize_password`).
    password_hash = bcrypt.hashpw(
        _normalize_password(body.password),
        bcrypt.gensalt(rounds=settings.auth.bcrypt_cost),
    ).decode("utf-8")

    now = utc_now_iso()
    user = User(
        id="usr-" + uuid.uuid4().hex,
        username=username,
        password_hash=password_hash,
        role="user",
        display_name=body.display_name,
        initials=body.initials,
        created_at=now,
        last_login_at=now,
    )
    session.add(user)

    # Commit the user first so any unique-index violation on `username`
    # surfaces here, before we mint a session token.
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken",
        )
    session.refresh(user)

    new_session = _create_session_row(user.id)
    session.add(new_session)
    session.commit()
    session.refresh(new_session)

    return SessionResponse(
        token=new_session.token,
        expires_at=new_session.expires_at,
        user=UserResponse.model_validate(user),
    )


# ---------------------------------------------------------------------------
# POST /login
# ---------------------------------------------------------------------------


@router.post("/login", response_model=SessionResponse)
@limiter.limit("10/minute")
def login(
    request: Request,  # required by slowapi to read the client IP
    body: LoginRequest,
    session: SQLModelSession = Depends(get_session),
) -> SessionResponse:
    # LoginRequest has no `pattern=` (Pydantic only enforces length), so
    # normalize the username to lowercase before the lookup.
    username = body.username.strip().lower()
    password = body.password

    user = session.exec(
        select(User).where(User.username == username)
    ).first()

    # Always run bcrypt to equalize timing. Returns False in both
    # "no such user" and "wrong password" branches but burns the same CPU.
    if user is None:
        try:
            bcrypt.checkpw(_normalize_password(password), _get_fake_hash().encode("utf-8"))
        except (ValueError, TypeError):
            # Defensive: a malformed fake hash would never happen, but
            # never let a crypto error become a 500.
            pass
        raise HTTPException(401, "Invalid username or password")

    try:
        ok = bcrypt.checkpw(
            _normalize_password(password),
            user.password_hash.encode("utf-8"),
        )
    except (ValueError, TypeError):
        # Stored hash is corrupted (shouldn't happen, but treat as a
        # failed login rather than a 500).
        ok = False

    if not ok:
        raise HTTPException(401, "Invalid username or password")

    user.last_login_at = utc_now_iso()
    new_session = _create_session_row(user.id)
    session.add(new_session)
    session.add(user)
    session.commit()
    session.refresh(new_session)
    session.refresh(user)

    return SessionResponse(
        token=new_session.token,
        expires_at=new_session.expires_at,
        user=UserResponse.model_validate(user),
    )


# ---------------------------------------------------------------------------
# POST /logout
# ---------------------------------------------------------------------------


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    user_and_session: tuple[User, Session] = Depends(get_current_user_and_session),
    db_session: SQLModelSession = Depends(get_session),
) -> Response:
    """Revoke the session used to make this request.

    Uses `get_current_user_and_session` to do the token parse, the
    session validation, the user lookup, AND the session row lookup
    in a single pass — the row is returned alongside the user, so we
    can delete it without re-querying the DB.

    Idempotent: if the row is already gone (e.g. expired and swept in a
    concurrent request), we still return 204 — the caller's intent is
    satisfied.
    """
    _user, row = user_and_session
    if row is not None:
        db_session.delete(row)
        db_session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# POST /logout-all
# ---------------------------------------------------------------------------


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all(
    user: User = Depends(get_current_user),
    session: SQLModelSession = Depends(get_session),
) -> Response:
    """Revoke every session belonging to the current user."""
    revoke_all_user_sessions(session, user.id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# GET /me
# ---------------------------------------------------------------------------


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)) -> UserResponse:
    """Return the current user's profile."""
    return UserResponse.model_validate(user)

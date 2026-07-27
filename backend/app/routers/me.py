from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.db import get_session
from app.deps import get_current_user
from app.models import User, UserPreference
from app.schemas import PreferencesPatch, PreferencesResponse
from app.timefmt import utc_today_iso

router = APIRouter(prefix="/me", tags=["me"])


def _rollover_date(client_today: Optional[str]) -> str:
    """Resolve the date used to roll over `completed_workouts_today`.

    Trust the client when it supplies its local YYYY-MM-DD; fall back
    to UTC server time. This avoids a midnight mismatch for users in
    non-UTC timezones: at 11pm local on day N, the UTC server might
    already be on day N+1 and would clear the user's list too early.
    """
    return client_today or utc_today_iso()


def _append_unique(target: list[str], extras: list[str]) -> list[str]:
    """Return a new list with `extras` appended in order, deduping
    against the existing entries. Preserves the first occurrence of
    each value (so today's order is stable).
    """
    seen = set(target)
    out = list(target)
    for x in extras:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


@router.get("/preferences", response_model=PreferencesResponse)
def get_preferences(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    client_today: str | None = Query(
        default=None,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description=(
            "Client's local YYYY-MM-DD. Used to determine the daily rollover "
            "for `completed_workouts_today`. If omitted, the server's UTC date "
            "is used, which may be wrong for users east/west of UTC."
        ),
    ),
) -> PreferencesResponse:
    pref = session.get(UserPreference, user.id)
    today = _rollover_date(client_today)
    if pref is None:
        return PreferencesResponse(
            user_id=user.id,
            mode="gym",
            equipment=[],
            completed_workouts_today=[],
            last_reset_date=today,
        )
    # Roll over "completed today" at midnight
    if pref.last_reset_date != today:
        pref.completed_workouts_today = []
        pref.last_reset_date = today
        session.add(pref)
        session.commit()
        session.refresh(pref)
    return PreferencesResponse(
        user_id=pref.user_id,
        mode=pref.mode,
        equipment=pref.equipment,
        completed_workouts_today=pref.completed_workouts_today,
        last_reset_date=pref.last_reset_date,
    )


@router.patch("/preferences", response_model=PreferencesResponse)
def patch_preferences(
    body: PreferencesPatch,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> PreferencesResponse:
    pref = session.get(UserPreference, user.id)
    # `client_today` is part of PreferencesPatch; getattr is defensive
    # so older clients that don't send it still work.
    today = _rollover_date(getattr(body, "client_today", None))
    if pref is None:
        pref = UserPreference(
            user_id=user.id,
            mode=body.mode or "gym",
            equipment=body.equipment or [],
            completed_workouts_today=body.completed_workouts_today or [],
            last_reset_date=today,
        )
        session.add(pref)
    else:
        if body.mode is not None:
            pref.mode = body.mode
        if body.equipment is not None:
            pref.equipment = body.equipment
        if body.completed_workouts_today is not None:
            pref.completed_workouts_today = body.completed_workouts_today
        # `add_completed` is the additive patch: append without
        # overwriting. This is the safe pattern for multi-device use
        # (last-write-wins PATCHes would otherwise drop the other
        # device's updates).
        if getattr(body, "add_completed", None):
            pref.completed_workouts_today = _append_unique(
                pref.completed_workouts_today, body.add_completed
            )
        if pref.last_reset_date != today:
            pref.completed_workouts_today = []
            pref.last_reset_date = today
        session.add(pref)
    session.commit()
    session.refresh(pref)
    return PreferencesResponse(
        user_id=pref.user_id,
        mode=pref.mode,
        equipment=pref.equipment,
        completed_workouts_today=pref.completed_workouts_today,
        last_reset_date=pref.last_reset_date,
    )

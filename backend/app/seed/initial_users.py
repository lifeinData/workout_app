"""Seed the initial coach + user accounts from `settings.seed.initial_users`.

Runs only when the schema-version file in `backend/` is bumped (see
`wger_import.seed_if_schema_changed`). Existing usernames are skipped
case-insensitively, so re-running this is safe.

Usernames are normalized to lowercase before storage (the column has a
unique index and the rest of the app assumes lowercase).
"""

from __future__ import annotations

import logging
import uuid

import bcrypt
from sqlmodel import Session, select

from app.config import Settings
from app.models import User
from app.timefmt import utc_now_iso

logger = logging.getLogger(__name__)


def seed_initial_users(session: Session, settings: Settings) -> int:
    """Insert any configured initial users that don't already exist.

    Returns the count actually inserted (0 if all already present).
    Username comparison is case-insensitive.
    """
    seed_users = settings.seed.initial_users
    if not seed_users:
        return 0

    existing_usernames = {
        u.username.lower()
        for u in session.exec(select(User.username)).all()
    }

    inserted = 0
    for seed in seed_users:
        username = seed.username.strip().lower()
        if not username:
            continue
        if username in existing_usernames:
            logger.info("User %r already exists; skipping", username)
            continue

        # Seed passwords bypass the SHA-256 pre-hash the auth router
        # applies to runtime passwords (Fix 4.8) — the seed is local,
        # trusted, and these passwords are not user input. But applying
        # the same normalization is free and keeps verification logic
        # consistent with the runtime path.
        import hashlib
        normalized = hashlib.sha256(seed.password.encode("utf-8")).digest()
        password_hash = bcrypt.hashpw(
            normalized,
            bcrypt.gensalt(rounds=settings.auth.bcrypt_cost),
        ).decode("utf-8")

        session.add(
            User(
                id=f"usr-{uuid.uuid4().hex}",
                username=username,
                password_hash=password_hash,
                role=seed.role,
                display_name=seed.display_name,
                initials=seed.initials,
                created_at=utc_now_iso(),
                last_login_at=None,
            )
        )
        existing_usernames.add(username)
        inserted += 1
        logger.info("Seeded initial user %r (role=%s)", username, seed.role)

    if inserted:
        session.commit()
    return inserted


def seed_coaching(session: Session, settings: Settings) -> dict[str, int]:
    """Seed coach links (accepted), workout assignments and welcome DMs.

    Must run AFTER users and workouts exist. Unknown usernames are skipped
    with a warning. Idempotent: existing links/assignments are not duplicated.
    """
    from app.models import CoachLink, Message, Workout, WorkoutAssignment

    cfg = settings.seed.coaching
    users = {u.username: u for u in session.exec(select(User)).all()}
    now = utc_now_iso()
    counts = {"links": 0, "assignments": 0, "messages": 0}

    athletes_by_coach: dict[str, list[User]] = {}
    for link in cfg.links:
        coach = users.get(link.coach.lower())
        athlete = users.get(link.athlete.lower())
        if coach is None or athlete is None:
            logger.warning("Skipping seed coach link %s -> %s (user missing)", link.coach, link.athlete)
            continue
        existing = session.exec(
            select(CoachLink).where(
                CoachLink.athlete_id == athlete.id,
                CoachLink.status.in_(["pending", "accepted"]),  # type: ignore[attr-defined]
            )
        ).first()
        if existing is None:
            session.add(
                CoachLink(
                    id=f"cl-{uuid.uuid4().hex[:12]}",
                    coach_id=coach.id,
                    athlete_id=athlete.id,
                    status="accepted",
                    created_at=now,
                    responded_at=now,
                )
            )
            counts["links"] += 1
        athletes_by_coach.setdefault(coach.id, []).append(athlete)
    session.commit()

    if cfg.assign_all_seed_workouts:
        workouts = session.exec(select(Workout).where(Workout.owner_id.is_(None))).all()  # type: ignore[union-attr]
        for coach_id, athletes in athletes_by_coach.items():
            for w in workouts:
                for athlete in athletes:
                    if session.get(WorkoutAssignment, (w.id, athlete.id)) is None:
                        session.add(
                            WorkoutAssignment(
                                workout_id=w.id,
                                athlete_id=athlete.id,
                                sent_by=coach_id,
                                sent_at=now,
                            )
                        )
                        counts["assignments"] += 1
        session.commit()

    for msg in cfg.welcome_messages:
        sender = users.get(msg.from_user.lower())
        recipient = users.get(msg.to.lower())
        if sender is None or recipient is None:
            logger.warning("Skipping seed message %s -> %s (user missing)", msg.from_user, msg.to)
            continue
        session.add(
            Message(
                sender_id=sender.id,
                recipient_id=recipient.id,
                body=msg.body,
                created_at=now,
            )
        )
        counts["messages"] += 1
    session.commit()
    return counts

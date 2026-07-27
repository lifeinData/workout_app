"""Seed the initial admin + user accounts from `settings.seed.initial_users`.

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

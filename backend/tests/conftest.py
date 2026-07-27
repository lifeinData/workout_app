import os
import sys
from collections.abc import Generator
from pathlib import Path

# Ensure backend root is on sys.path
backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))

# Set env BEFORE importing the app modules. Nested-config env var names
# use the `__` delimiter declared in `Settings.model_config`.
os.environ["DATABASE__PATH_TEMPLATE"] = "sqlite:///:memory:"
os.environ["DATABASE__SEED_ON_STARTUP"] = "false"
# Lowest bcrypt cost keeps the test suite fast (~5ms per hash vs ~200ms at 12).
# Security is irrelevant for in-memory tests; the auth code is the same.
os.environ["AUTH__BCRYPT_COST"] = "4"
os.environ["SERVER__LOG_LEVEL"] = "warning"
# Disable the per-IP rate limiter (10/min login, 5/hour signup) so the
# test suite — which logs in many times from the same TestClient IP —
# isn't throttled. The limiter still gets exercised in production.
os.environ["WORKOUT_APP_TESTING"] = "1"

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import StaticPool

from app import config as config_module
from app import db as db_module
from app.db import get_session
from app.main import create_app
from app.seed.exercise_seeds import SEED_EXERCISES
from app.seed.initial_users import seed_initial_users
from app.seed.workout_seeds import seed_workouts
from app.models import Exercise


@pytest.fixture
def engine():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(eng)
    return eng


@pytest.fixture
def seeded_engine(engine):
    """An engine with exercises + default workouts + initial users pre-seeded.

    The hand-curated `SEED_EXERCISES` are inserted first (so the seed
    workouts can link to them), then `seed_workouts` adds the two default
    workouts, then `seed_initial_users` adds admin + user1 (from
    `config/defaults.yaml`). Admin uses the dev creds `admin` / `admin1234`.
    """
    config_module.get_settings.cache_clear()
    settings = config_module.get_settings()
    with Session(engine) as s:
        for ex in SEED_EXERCISES:
            s.add(Exercise(**ex))
        s.commit()
        seed_workouts(s, settings)
        seed_initial_users(s, settings)
    return engine


@pytest.fixture
def session(engine) -> Generator[Session, None, None]:
    """A Session bound to the bare (unseeded) engine."""
    with Session(engine) as s:
        yield s


@pytest.fixture
def db_session(seeded_engine) -> Generator[Session, None, None]:
    """A Session bound to the seeded engine.

    Use this when a test needs to manipulate rows created by the API
    (e.g. expiring a session row to test the /me 401 path) or to
    verify persistence without going through an HTTP round-trip.
    """
    with Session(seeded_engine) as s:
        yield s


def _build_client(eng) -> Generator[TestClient, None, None]:
    """Build a TestClient whose session dep is bound to `eng`.

    Replaces `db_module.engine` AND installs a per-app `dependency_overrides`
    for `get_session` so the test's requests go to `eng` regardless of what
    other fixtures (in the same test) do to the global engine.
    """
    config_module.get_settings.cache_clear()
    db_module.engine = eng
    app = create_app()

    def _override_session():
        with Session(eng) as s:
            yield s

    app.dependency_overrides[get_session] = _override_session
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def client(engine) -> Generator[TestClient, None, None]:
    yield from _build_client(engine)


@pytest.fixture
def seeded_client(seeded_engine) -> Generator[TestClient, None, None]:
    """A client backed by a seeded engine (exercises, workouts, users)."""
    yield from _build_client(seeded_engine)


def _login(client: TestClient, username: str, password: str) -> str:
    r = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture
def admin_bearer_headers(seeded_client) -> dict[str, str]:
    """Bearer token for the YAML-seeded admin user (login: admin / admin1234)."""
    token = _login(seeded_client, "admin", "admin1234")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def user_bearer_headers(seeded_client) -> dict[str, str]:
    """Bearer token for a freshly-signed-up regular user.

    The user is created via /auth/signup (not pulled from the YAML seed
    user1) so test isolation is exact: each test that needs a regular
    user gets its own fresh user with its own fresh session. Use this
    for "non-admin attempts an admin action" tests and for any test
    that needs an authenticated non-admin caller.
    """
    r = seeded_client.post(
        "/api/v1/auth/signup",
        json={
            "username": "testuser",
            "password": "testuserpw",
            "display_name": "Test User",
            "initials": "TU",
        },
    )
    assert r.status_code == 201, f"signup failed: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['token']}"}

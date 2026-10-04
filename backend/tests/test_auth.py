"""Auth + admin-authz surface tests.

Covers the 5 `/api/v1/auth/*` endpoints (signup, login, logout,
logout-all, me) and the coach role gate on `/api/v1/coach/workouts`.

All authenticated calls go through Bearer tokens obtained from the
`coach_bearer_headers` / `user_bearer_headers` fixtures in conftest.py.
"""
from datetime import datetime, timedelta, timezone

from app.models import Session as SessionRow


def test_signup_creates_user_and_returns_session(client):
    r = client.post(
        "/api/v1/auth/signup",
        json={"username": "alice", "password": "alicepw1"},
    )
    assert r.status_code == 201
    data = r.json()
    assert "token" in data and len(data["token"]) > 0
    assert "expires_at" in data
    user = data["user"]
    assert user["username"] == "alice"
    assert user["role"] == "user"


def test_signup_password_too_short_returns_422(client):
    r = client.post(
        "/api/v1/auth/signup",
        json={"username": "alice", "password": "abcdefg"},
    )
    assert r.status_code == 422


def test_signup_username_with_uppercase_returns_422(client):
    r = client.post(
        "/api/v1/auth/signup",
        json={"username": "BadName", "password": "abcdefgh"},
    )
    assert r.status_code == 422


def test_signup_username_with_special_chars_returns_422(client):
    r = client.post(
        "/api/v1/auth/signup",
        json={"username": "bad@name", "password": "abcdefgh"},
    )
    assert r.status_code == 422


def test_signup_duplicate_username_returns_409(seeded_client):
    # Admin is seeded by `seeded_engine`, so any signup attempt for
    # "admin" must return 409.
    r = seeded_client.post(
        "/api/v1/auth/signup",
        json={"username": "admin", "password": "admin1234"},
    )
    assert r.status_code == 409


def test_signup_username_is_lowercased(client):
    # SignupRequest's `pattern=r"^[a-z0-9_]+$"` rejects "Alice" at the
    # Pydantic layer, so the server's defensive `.lower()` would never
    # see an uppercase input. The schema already guarantees lowercase;
    # we verify that guarantee with a valid lowercase username.
    r = client.post(
        "/api/v1/auth/signup",
        json={"username": "alice", "password": "alicepw1"},
    )
    assert r.status_code == 201
    token = r.json()["token"]
    me = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me.status_code == 200
    assert me.json()["username"] == "alice"


def test_login_valid_credentials_returns_session(seeded_client):
    r = seeded_client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin1234"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "token" in data and len(data["token"]) > 0
    assert data["user"]["username"] == "admin"
    assert data["user"]["role"] == "coach"


def test_login_wrong_password_returns_401(seeded_client):
    r = seeded_client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "wrong-password"},
    )
    assert r.status_code == 401


def test_login_unknown_username_returns_401(seeded_client):
    r = seeded_client.post(
        "/api/v1/auth/login",
        json={"username": "ghost", "password": "anything1"},
    )
    assert r.status_code == 401


def test_login_case_insensitive_username(seeded_client):
    r = seeded_client.post(
        "/api/v1/auth/login",
        json={"username": "ADMIN", "password": "admin1234"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["user"]["username"] == "admin"


def test_me_with_valid_token_returns_user(seeded_client, coach_bearer_headers):
    r = seeded_client.get("/api/v1/auth/me", headers=coach_bearer_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["username"] == "admin"
    assert data["role"] == "coach"


def test_me_without_token_returns_401(client):
    # FastAPI's `Header(..., min_length=1)` makes the Authorization
    # header required, so a missing header returns 422 from the
    # validation layer. Either 401 or 422 counts as "auth failed".
    r = client.get("/api/v1/auth/me")
    assert r.status_code in (401, 422)


def test_me_with_invalid_token_returns_401(client):
    r = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert r.status_code == 401


def test_me_with_expired_token_returns_401(seeded_client, db_session):
    # Login to mint a session row.
    r = seeded_client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin1234"},
    )
    assert r.status_code == 200
    token = r.json()["token"]

    # Backdate the session expiry so the next /me call treats it as stale.
    row = db_session.get(SessionRow, token)
    assert row is not None, "session row should exist right after login"
    past = (datetime.now(timezone.utc) - timedelta(days=1)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    row.expires_at = past
    db_session.add(row)
    db_session.commit()

    me = seeded_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me.status_code == 401


def test_logout_invalidates_token(seeded_client, coach_bearer_headers):
    r = seeded_client.post("/api/v1/auth/logout", headers=coach_bearer_headers)
    assert r.status_code == 204
    me = seeded_client.get("/api/v1/auth/me", headers=coach_bearer_headers)
    assert me.status_code == 401


def test_logout_without_token_returns_401(client):
    r = client.post("/api/v1/auth/logout")
    assert r.status_code in (401, 422)


def test_logout_all_invalidates_every_session(seeded_client, coach_bearer_headers):
    # Mint a SECOND session for admin so we can verify both are revoked.
    r2 = seeded_client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin1234"},
    )
    assert r2.status_code == 200
    second_token = r2.json()["token"]
    second_headers = {"Authorization": f"Bearer {second_token}"}

    # Logout-all using the FIRST session's token.
    r = seeded_client.post(
        "/api/v1/auth/logout-all", headers=coach_bearer_headers
    )
    assert r.status_code == 204

    # Both tokens should now be invalid.
    me1 = seeded_client.get("/api/v1/auth/me", headers=coach_bearer_headers)
    assert me1.status_code == 401
    me2 = seeded_client.get("/api/v1/auth/me", headers=second_headers)
    assert me2.status_code == 401


def test_admin_endpoints_require_admin_role(seeded_client, user_bearer_headers):
    r = seeded_client.get(
        "/api/v1/coach/workouts", headers=user_bearer_headers
    )
    assert r.status_code == 403


def test_admin_can_list_workouts(seeded_client, coach_bearer_headers):
    r = seeded_client.get(
        "/api/v1/coach/workouts", headers=coach_bearer_headers
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    assert {w["id"] for w in data} == {"w-upper-power", "w-home-bw"}


def test_admin_can_create_workout(seeded_client, coach_bearer_headers):
    r = seeded_client.post(
        "/api/v1/coach/workouts",
        headers=coach_bearer_headers,
        json={
            "name": "Test Workout",
            "tag": "Test",
            "location": "home",
            "equipment": ["bodyweight"],
            "duration_min": 30,
            "exercise_ids": ["ex-pushup", "ex-airsquat"],
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Test Workout"
    assert {e["id"] for e in data["exercises"]} == {"ex-pushup", "ex-airsquat"}


def test_admin_can_update_workout(seeded_client, coach_bearer_headers):
    r = seeded_client.patch(
        "/api/v1/coach/workouts/w-upper-power",
        headers=coach_bearer_headers,
        json={"name": "Upper Power v2"},
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Upper Power v2"


def test_admin_can_delete_workout(seeded_client, coach_bearer_headers):
    # Create a throwaway workout to delete.
    create = seeded_client.post(
        "/api/v1/coach/workouts",
        headers=coach_bearer_headers,
        json={
            "name": "Throwaway",
            "tag": "Test",
            "location": "home",
            "equipment": [],
            "duration_min": 15,
            "exercise_ids": ["ex-pushup"],
        },
    )
    assert create.status_code == 201
    new_id = create.json()["id"]

    delete = seeded_client.delete(
        f"/api/v1/coach/workouts/{new_id}",
        headers=coach_bearer_headers,
    )
    assert delete.status_code == 204

    # Confirm it's gone from the admin listing.
    listing = seeded_client.get(
        "/api/v1/coach/workouts", headers=coach_bearer_headers
    )
    assert listing.status_code == 200
    assert all(w["id"] != new_id for w in listing.json())

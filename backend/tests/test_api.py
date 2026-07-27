"""Smoke tests for the workout backend API.

These tests don't hit the network — they use an in-memory SQLite
and FastAPI's TestClient. They verify the request/response contract
and the ownership/authorization rules.

Auth model: Bearer tokens via the `user_bearer_headers` fixture
(regular user) or the `_signup_user` helper (multi-user isolation
tests). See conftest.py.
"""
from datetime import datetime, timedelta, timezone


def _signup_user(seeded_client, username, password="testpassword1"):
    """Create a fresh user via /auth/signup and return Bearer headers.

    Used by isolation tests that need two distinct user sessions on the
    same `seeded_client`. The `user_bearer_headers` fixture is for the
    "one user" case.
    """
    r = seeded_client.post(
        "/api/v1/auth/signup",
        json={"username": username, "password": password},
    )
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_health(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_exercises_returns_seed_data(seeded_client):
    r = seeded_client.get("/api/v1/exercises")
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 25
    assert any(e["id"] == "ex-bench" for e in data)


def test_exercises_filter_by_muscle(seeded_client):
    r = seeded_client.get("/api/v1/exercises?muscle_group=Chest")
    assert r.status_code == 200
    data = r.json()
    assert all(e["muscle_group"] == "Chest" for e in data)
    assert len(data) > 0


def test_exercise_by_id(seeded_client):
    r = seeded_client.get("/api/v1/exercises/ex-bench")
    assert r.status_code == 200
    assert r.json()["name"] == "Barbell Bench Press"


def test_exercise_404(seeded_client):
    r = seeded_client.get("/api/v1/exercises/nonexistent")
    assert r.status_code == 404


def test_workouts_list(seeded_client):
    r = seeded_client.get("/api/v1/workouts")
    assert r.status_code == 200
    data = r.json()
    # Default seed config ships exactly 2 workouts (`w-upper-power` + `w-home-bw`).
    assert len(data) == 2
    ids = {w["id"] for w in data}
    assert ids == {"w-upper-power", "w-home-bw"}


def test_workout_detail_includes_ordered_exercises(seeded_client):
    r = seeded_client.get("/api/v1/workouts/w-upper-power")
    assert r.status_code == 200
    data = r.json()
    ids = [e["id"] for e in data["exercises"]]
    assert ids == ["ex-bench", "ex-incline-db", "ex-cable-fly", "ex-ohp", "ex-lateral"]


def test_workout_404(seeded_client):
    r = seeded_client.get("/api/v1/workouts/nope")
    assert r.status_code == 404


def test_me_requires_header(client):
    # No Authorization header → 422 from FastAPI's required-Header
    # validation on the auth-gated routes.
    r = client.get("/api/v1/me/preferences")
    assert r.status_code in (401, 422)


def test_preferences_default_on_first_read(seeded_client, user_bearer_headers):
    r = seeded_client.get("/api/v1/me/preferences", headers=user_bearer_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["mode"] == "gym"
    assert data["completed_workouts_today"] == []


def test_preferences_patch(seeded_client, user_bearer_headers):
    r = seeded_client.patch(
        "/api/v1/me/preferences",
        json={"mode": "home", "equipment": ["bodyweight", "bands"]},
        headers=user_bearer_headers,
    )
    assert r.status_code == 200
    assert r.json()["mode"] == "home"
    assert "bodyweight" in r.json()["equipment"]

    r2 = seeded_client.get("/api/v1/me/preferences", headers=user_bearer_headers)
    assert r2.json()["mode"] == "home"


def test_preferences_user_isolation(seeded_client):
    h_a = _signup_user(seeded_client, "user_a")
    h_b = _signup_user(seeded_client, "user_b")
    seeded_client.patch(
        "/api/v1/me/preferences", json={"mode": "home"}, headers=h_a
    )
    r = seeded_client.get("/api/v1/me/preferences", headers=h_b)
    assert r.json()["mode"] == "gym"


def test_log_set_creates_history_and_pr(seeded_client, user_bearer_headers):
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={"exercise_id": "ex-bench", "weight": 225, "reps": 5},
        headers=user_bearer_headers,
    )
    assert r.status_code == 201
    data = r.json()
    assert data["is_pr"] is True
    assert data["pr"]["weight"] == 225

    r2 = seeded_client.get("/api/v1/me/history", headers=user_bearer_headers)
    assert r2.status_code == 200
    history = r2.json()["history"]
    assert len(history) == 1
    today = list(history.values())[0]
    assert "ex-bench" in today


def test_log_set_pr_comparison(seeded_client, user_bearer_headers):
    seeded_client.post(
        "/api/v1/me/sets",
        json={"exercise_id": "ex-bench", "weight": 100, "reps": 10},
        headers=user_bearer_headers,
    )
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={"exercise_id": "ex-bench", "weight": 200, "reps": 5},
        headers=user_bearer_headers,
    )
    # 100*10 = 1000, 200*5 = 1000 — tie, NOT a PR
    assert r.json()["is_pr"] is False
    r2 = seeded_client.post(
        "/api/v1/me/sets",
        json={"exercise_id": "ex-bench", "weight": 200, "reps": 6},
        headers=user_bearer_headers,
    )
    # 200*6 = 1200 — new PR
    assert r2.json()["is_pr"] is True
    assert r2.json()["pr"]["weight"] == 200
    assert r2.json()["pr"]["reps"] == 6


def test_log_set_unknown_exercise_404(seeded_client, user_bearer_headers):
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={"exercise_id": "ex-nonexistent", "weight": 100, "reps": 5},
        headers=user_bearer_headers,
    )
    assert r.status_code == 404


def test_log_set_validation(seeded_client, user_bearer_headers):
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={"exercise_id": "ex-bench", "weight": -1, "reps": 5},
        headers=user_bearer_headers,
    )
    assert r.status_code == 422
    r2 = seeded_client.post(
        "/api/v1/me/sets",
        json={"exercise_id": "ex-bench", "weight": 100, "reps": 0},
        headers=user_bearer_headers,
    )
    assert r2.status_code == 422


def test_delete_set_recomputes_pr(seeded_client, user_bearer_headers):
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={"exercise_id": "ex-bench", "weight": 300, "reps": 1},
        headers=user_bearer_headers,
    )
    set_id = r.json()["set"]["id"]
    assert r.json()["is_pr"] is True

    seeded_client.post(
        "/api/v1/me/sets",
        json={"exercise_id": "ex-bench", "weight": 100, "reps": 5},
        headers=user_bearer_headers,
    )

    rd = seeded_client.delete(
        f"/api/v1/me/sets/{set_id}", headers=user_bearer_headers
    )
    assert rd.status_code == 204

    prs = seeded_client.get("/api/v1/me/prs", headers=user_bearer_headers).json()
    assert len(prs) == 1
    assert prs[0]["weight"] == 100


def test_delete_set_ownership(seeded_client):
    h_x = _signup_user(seeded_client, "user_x")
    h_y = _signup_user(seeded_client, "user_y")
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={"exercise_id": "ex-bench", "weight": 100, "reps": 5},
        headers=h_x,
    )
    set_id = r.json()["set"]["id"]
    rd = seeded_client.delete(f"/api/v1/me/sets/{set_id}", headers=h_y)
    assert rd.status_code == 404


def test_history_date_filter(seeded_client, user_bearer_headers):
    today = datetime.now(timezone.utc).date().isoformat()
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date().isoformat()
    seeded_client.post(
        "/api/v1/me/sets",
        json={"exercise_id": "ex-bench", "weight": 100, "reps": 5},
        headers=user_bearer_headers,
    )
    seeded_client.post(
        "/api/v1/me/sets",
        json={
            "exercise_id": "ex-bench",
            "weight": 110,
            "reps": 5,
            "timestamp": f"{yesterday}T10:00:00Z",
        },
        headers=user_bearer_headers,
    )
    r = seeded_client.get(
        f"/api/v1/me/history?from={today}", headers=user_bearer_headers
    )
    dates = list(r.json()["history"].keys())
    assert dates == [today]
    r2 = seeded_client.get(
        f"/api/v1/me/history?from={yesterday}&to={yesterday}",
        headers=user_bearer_headers,
    )
    assert r2.status_code == 200
    dates2 = list(r2.json()["history"].keys())
    assert dates2 == [yesterday]


def test_prs_user_isolation(seeded_client):
    h_a = _signup_user(seeded_client, "user_a")
    h_b = _signup_user(seeded_client, "user_b")
    seeded_client.post(
        "/api/v1/me/sets",
        json={"exercise_id": "ex-bench", "weight": 200, "reps": 5},
        headers=h_a,
    )
    r = seeded_client.get("/api/v1/me/prs", headers=h_b)
    assert r.json() == []

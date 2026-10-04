"""Smoke tests for the workout backend API.

These tests don't hit the network — they use an in-memory SQLite
and FastAPI's TestClient. They verify the request/response contract
and the ownership/authorization rules.

Auth model: Bearer tokens via the `user_bearer_headers` fixture
(regular user) or the `_signup_user` helper (multi-user isolation
tests). See conftest.py.

Session model: sets are always logged against an active
`WorkoutSession` — `_start_session` starts one (ad-hoc, no workout)
and returns its id for tests that only care about set/PR behavior.
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


def _start_session(seeded_client, headers, workout_id=None):
    today = datetime.now(timezone.utc).date().isoformat()
    body = {"local_date": today, "tz_offset_min": 0}
    if workout_id:
        body["workout_id"] = workout_id
    r = seeded_client.post("/api/v1/me/sessions", json=body, headers=headers)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


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
    # Compounds (bench, ohp) first, then accessories — see
    # `app/seed/workout_seeds.py`.
    assert ids == ["ex-bench", "ex-ohp", "ex-incline-db", "ex-cable-fly", "ex-lateral"]


def test_workout_detail_includes_prescriptions(seeded_client):
    r = seeded_client.get("/api/v1/workouts/w-upper-power")
    assert r.status_code == 200
    by_id = {e["id"]: e for e in r.json()["exercises"]}
    # Compounds: lower reps, longer rest than accessories.
    assert by_id["ex-bench"]["target_sets"] == 4
    assert by_id["ex-bench"]["target_reps"] == 5
    assert by_id["ex-bench"]["target_rest_sec"] == 150
    assert by_id["ex-cable-fly"]["target_reps"] == 10
    assert by_id["ex-cable-fly"]["target_rest_sec"] == 60


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
    assert data["weight_unit"] == "lb"
    assert data["default_rest_sec"] == 90


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


def test_preferences_weight_unit_and_rest_patch(seeded_client, user_bearer_headers):
    r = seeded_client.patch(
        "/api/v1/me/preferences",
        json={"weight_unit": "kg", "default_rest_sec": 120},
        headers=user_bearer_headers,
    )
    assert r.status_code == 200
    assert r.json()["weight_unit"] == "kg"
    assert r.json()["default_rest_sec"] == 120

    r2 = seeded_client.get("/api/v1/me/preferences", headers=user_bearer_headers)
    assert r2.json()["weight_unit"] == "kg"
    assert r2.json()["default_rest_sec"] == 120


def test_preferences_user_isolation(seeded_client):
    h_a = _signup_user(seeded_client, "user_a")
    h_b = _signup_user(seeded_client, "user_b")
    seeded_client.patch(
        "/api/v1/me/preferences", json={"mode": "home"}, headers=h_a
    )
    r = seeded_client.get("/api/v1/me/preferences", headers=h_b)
    assert r.json()["mode"] == "gym"


def test_log_set_creates_session_row_and_pr(seeded_client, user_bearer_headers):
    session_id = _start_session(seeded_client, user_bearer_headers)
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={
            "session_id": session_id,
            "exercise_id": "ex-bench",
            "weight": 225,
            "weight_unit": "lb",
            "reps": 5,
        },
        headers=user_bearer_headers,
    )
    assert r.status_code == 201
    data = r.json()
    assert data["is_pr"] is True
    assert data["pr"]["best_weight_kg"] == r.json()["set"]["weight_kg"]
    assert data["set"]["session_id"] == session_id
    assert data["set"]["set_index"] == 0

    r2 = seeded_client.get(
        f"/api/v1/me/sessions/{session_id}", headers=user_bearer_headers
    )
    assert r2.status_code == 200
    detail = r2.json()
    block = next(b for b in detail["blocks"] if b["exercise"]["id"] == "ex-bench")
    assert len(block["sets"]) == 1
    assert detail["total_sets"] == 1


def test_log_set_best_weight_beats_best_volume(seeded_client, user_bearer_headers):
    """A heavy low-rep set must win `best_weight_kg` over a
    higher-*volume* light set — the old `weight * reps` scoring let
    135x20 (2700) outrank 315x3 (945)."""
    session_id = _start_session(seeded_client, user_bearer_headers)
    seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-bench", "weight": 135, "reps": 20},
        headers=user_bearer_headers,
    )
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-bench", "weight": 315, "reps": 3},
        headers=user_bearer_headers,
    )
    assert r.json()["is_pr"] is True
    prs = seeded_client.get("/api/v1/me/prs", headers=user_bearer_headers).json()
    pr = next(p for p in prs if p["exercise_id"] == "ex-bench")
    from app.units import to_kg

    assert pr["best_weight_kg"] == to_kg(315, "lb")
    assert pr["best_weight_reps"] == 3


def test_log_set_mixed_units_compare_on_kg(seeded_client, user_bearer_headers):
    session_id = _start_session(seeded_client, user_bearer_headers)
    seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-squat", "weight": 100, "weight_unit": "kg", "reps": 5},
        headers=user_bearer_headers,
    )
    # 220 lb ≈ 99.8 kg — must NOT beat the 100 kg set.
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-squat", "weight": 220, "weight_unit": "lb", "reps": 5},
        headers=user_bearer_headers,
    )
    assert r.json()["is_pr"] is False
    prs = seeded_client.get("/api/v1/me/prs", headers=user_bearer_headers).json()
    pr = next(p for p in prs if p["exercise_id"] == "ex-squat")
    assert pr["best_weight_kg"] == 100.0


def test_log_set_warmup_excluded_from_pr_and_volume(seeded_client, user_bearer_headers):
    session_id = _start_session(seeded_client, user_bearer_headers)
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={
            "session_id": session_id,
            "exercise_id": "ex-bench",
            "weight": 400,
            "reps": 5,
            "kind": "warmup",
        },
        headers=user_bearer_headers,
    )
    assert r.status_code == 201
    assert r.json()["is_pr"] is False
    assert r.json()["pr"] is None

    prs = seeded_client.get("/api/v1/me/prs", headers=user_bearer_headers).json()
    assert prs == []

    detail = seeded_client.get(
        f"/api/v1/me/sessions/{session_id}", headers=user_bearer_headers
    ).json()
    assert detail["total_sets"] == 0
    assert detail["total_volume_kg"] == 0.0


def test_log_set_unknown_exercise_404(seeded_client, user_bearer_headers):
    session_id = _start_session(seeded_client, user_bearer_headers)
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-nonexistent", "weight": 100, "reps": 5},
        headers=user_bearer_headers,
    )
    assert r.status_code == 404


def test_log_set_into_completed_session_succeeds(seeded_client, user_bearer_headers):
    # A1's "no more templates" rework allows editing a completed
    # session in place (e.g. re-opening a past workout from My
    # Workouts) — only `abandoned` sessions are locked.
    session_id = _start_session(seeded_client, user_bearer_headers)
    seeded_client.patch(
        f"/api/v1/me/sessions/{session_id}",
        json={"status": "completed"},
        headers=user_bearer_headers,
    )
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-bench", "weight": 100, "reps": 5},
        headers=user_bearer_headers,
    )
    assert r.status_code == 201


def test_log_set_into_abandoned_session_409(seeded_client, user_bearer_headers):
    session_id = _start_session(seeded_client, user_bearer_headers)
    seeded_client.patch(
        f"/api/v1/me/sessions/{session_id}",
        json={"status": "abandoned"},
        headers=user_bearer_headers,
    )
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-bench", "weight": 100, "reps": 5},
        headers=user_bearer_headers,
    )
    assert r.status_code == 409


def test_log_set_unknown_session_404(seeded_client, user_bearer_headers):
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": "ses-doesnotexist", "exercise_id": "ex-bench", "weight": 100, "reps": 5},
        headers=user_bearer_headers,
    )
    assert r.status_code == 404


def test_log_set_validation(seeded_client, user_bearer_headers):
    session_id = _start_session(seeded_client, user_bearer_headers)
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-bench", "weight": -1, "reps": 5},
        headers=user_bearer_headers,
    )
    assert r.status_code == 422
    r2 = seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-bench", "weight": 100, "reps": 0},
        headers=user_bearer_headers,
    )
    assert r2.status_code == 422


def test_update_set_recomputes_pr(seeded_client, user_bearer_headers):
    session_id = _start_session(seeded_client, user_bearer_headers)
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-bench", "weight": 200, "reps": 5},
        headers=user_bearer_headers,
    )
    set_id = r.json()["set"]["id"]
    assert r.json()["is_pr"] is True

    rp = seeded_client.patch(
        f"/api/v1/me/sets/{set_id}",
        json={"weight": 250},
        headers=user_bearer_headers,
    )
    assert rp.status_code == 200
    assert rp.json()["set"]["weight"] == 250
    assert rp.json()["is_pr"] is True

    prs = seeded_client.get("/api/v1/me/prs", headers=user_bearer_headers).json()
    pr = next(p for p in prs if p["exercise_id"] == "ex-bench")
    assert pr["best_weight_kg"] == rp.json()["set"]["weight_kg"]


def test_delete_set_recomputes_pr(seeded_client, user_bearer_headers):
    session_id = _start_session(seeded_client, user_bearer_headers)
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-bench", "weight": 300, "reps": 1},
        headers=user_bearer_headers,
    )
    set_id = r.json()["set"]["id"]
    assert r.json()["is_pr"] is True

    seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-bench", "weight": 100, "reps": 5},
        headers=user_bearer_headers,
    )

    rd = seeded_client.delete(
        f"/api/v1/me/sets/{set_id}", headers=user_bearer_headers
    )
    assert rd.status_code == 204

    from app.units import to_kg

    prs = seeded_client.get("/api/v1/me/prs", headers=user_bearer_headers).json()
    assert len(prs) == 1
    assert prs[0]["best_weight_kg"] == to_kg(100, "lb")


def test_delete_set_renumbers_set_index(seeded_client, user_bearer_headers):
    session_id = _start_session(seeded_client, user_bearer_headers)
    ids = []
    for w in (100, 105, 110):
        r = seeded_client.post(
            "/api/v1/me/sets",
            json={"session_id": session_id, "exercise_id": "ex-bench", "weight": w, "reps": 5},
            headers=user_bearer_headers,
        )
        ids.append(r.json()["set"]["id"])

    seeded_client.delete(f"/api/v1/me/sets/{ids[0]}", headers=user_bearer_headers)

    detail = seeded_client.get(
        f"/api/v1/me/sessions/{session_id}", headers=user_bearer_headers
    ).json()
    block = next(b for b in detail["blocks"] if b["exercise"]["id"] == "ex-bench")
    indexes = [s["set_index"] for s in block["sets"]]
    assert indexes == [0, 1]


def test_delete_set_ownership(seeded_client):
    h_x = _signup_user(seeded_client, "user_x")
    h_y = _signup_user(seeded_client, "user_y")
    session_id = _start_session(seeded_client, h_x)
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-bench", "weight": 100, "reps": 5},
        headers=h_x,
    )
    set_id = r.json()["set"]["id"]
    rd = seeded_client.delete(f"/api/v1/me/sets/{set_id}", headers=h_y)
    assert rd.status_code == 404


def test_exercise_history_rollup(seeded_client, user_bearer_headers):
    session_id = _start_session(seeded_client, user_bearer_headers)
    seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-bench", "weight": 200, "reps": 5},
        headers=user_bearer_headers,
    )
    seeded_client.patch(
        f"/api/v1/me/sessions/{session_id}",
        json={"status": "completed"},
        headers=user_bearer_headers,
    )

    r = seeded_client.get(
        "/api/v1/me/exercises/ex-bench/history", headers=user_bearer_headers
    )
    assert r.status_code == 200
    rollups = r.json()
    assert len(rollups) == 1
    assert rollups[0]["session_id"] == session_id
    assert rollups[0]["sets"] == 1


def test_update_and_delete_set_on_completed_session_succeed(seeded_client, user_bearer_headers):
    # Same "editable-status" rule as logging: PATCH/DELETE on a set must
    # succeed against a completed session (not just an active one).
    session_id = _start_session(seeded_client, user_bearer_headers)
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-bench", "weight": 200, "reps": 5},
        headers=user_bearer_headers,
    )
    set_id = r.json()["set"]["id"]
    seeded_client.patch(
        f"/api/v1/me/sessions/{session_id}",
        json={"status": "completed"},
        headers=user_bearer_headers,
    )

    rp = seeded_client.patch(
        f"/api/v1/me/sets/{set_id}",
        json={"weight": 225},
        headers=user_bearer_headers,
    )
    assert rp.status_code == 200
    assert rp.json()["set"]["weight"] == 225

    rd = seeded_client.delete(f"/api/v1/me/sets/{set_id}", headers=user_bearer_headers)
    assert rd.status_code == 204


def test_pr_recompute_on_completed_session_excludes_warmups(seeded_client, user_bearer_headers):
    session_id = _start_session(seeded_client, user_bearer_headers)
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-bench", "weight": 200, "reps": 5},
        headers=user_bearer_headers,
    )
    set_id = r.json()["set"]["id"]
    seeded_client.patch(
        f"/api/v1/me/sessions/{session_id}",
        json={"status": "completed"},
        headers=user_bearer_headers,
    )

    # Editing the set on the now-completed session still recomputes PRs.
    rp = seeded_client.patch(
        f"/api/v1/me/sets/{set_id}",
        json={"weight": 300},
        headers=user_bearer_headers,
    )
    assert rp.json()["is_pr"] is True
    prs = seeded_client.get("/api/v1/me/prs", headers=user_bearer_headers).json()
    pr = next(p for p in prs if p["exercise_id"] == "ex-bench")
    assert pr["best_weight_kg"] == rp.json()["set"]["weight_kg"]

    # A warmup logged into the same completed session must not disturb
    # the PR or count toward volume.
    seeded_client.post(
        "/api/v1/me/sets",
        json={
            "session_id": session_id,
            "exercise_id": "ex-bench",
            "weight": 400,
            "reps": 5,
            "kind": "warmup",
        },
        headers=user_bearer_headers,
    )
    prs_after = seeded_client.get("/api/v1/me/prs", headers=user_bearer_headers).json()
    pr_after = next(p for p in prs_after if p["exercise_id"] == "ex-bench")
    assert pr_after["best_weight_kg"] == pr["best_weight_kg"]


def test_prs_user_isolation(seeded_client):
    h_a = _signup_user(seeded_client, "user_a")
    h_b = _signup_user(seeded_client, "user_b")
    session_id = _start_session(seeded_client, h_a)
    seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-bench", "weight": 200, "reps": 5},
        headers=h_a,
    )
    r = seeded_client.get("/api/v1/me/prs", headers=h_b)
    assert r.json() == []

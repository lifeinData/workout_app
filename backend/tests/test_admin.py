"""Admin workout CRUD tests.

Covers the 7 endpoints under `/api/v1/admin/workouts`:
- list (GET), create (POST), update (PATCH), delete (DELETE)
- add exercise (POST .../exercises)
- remove exercise (DELETE .../exercises/{id})
- reorder exercises (PATCH .../exercises/reorder)
"""
from app.models import Workout


def test_admin_create_workout_persists(
    seeded_client, admin_bearer_headers, db_session
):
    r = seeded_client.post(
        "/api/v1/admin/workouts",
        headers=admin_bearer_headers,
        json={
            "name": "Persisted Workout",
            "tag": "Test",
            "location": "home",
            "equipment": ["bodyweight"],
            "duration_min": 20,
            "exercise_ids": ["ex-pushup", "ex-plank"],
        },
    )
    assert r.status_code == 201
    new_id = r.json()["id"]

    # Verify the row landed in the DB.
    row = db_session.get(Workout, new_id)
    assert row is not None
    assert row.name == "Persisted Workout"

    # Verify it shows up in the public /workouts listing.
    listing = seeded_client.get("/api/v1/workouts")
    assert listing.status_code == 200
    assert any(w["id"] == new_id for w in listing.json())


def test_admin_create_with_explicit_id(seeded_client, admin_bearer_headers):
    r = seeded_client.post(
        "/api/v1/admin/workouts",
        headers=admin_bearer_headers,
        json={
            "id": "w-test-explicit",
            "name": "Explicit ID",
            "tag": "Test",
            "location": "home",
            "equipment": [],
            "duration_min": 15,
            "exercise_ids": ["ex-pushup"],
        },
    )
    assert r.status_code == 201
    assert r.json()["id"] == "w-test-explicit"


def test_admin_create_duplicate_id_returns_409(seeded_client, admin_bearer_headers):
    body = {
        "id": "w-test-dup",
        "name": "First",
        "tag": "Test",
        "location": "home",
        "equipment": [],
        "duration_min": 15,
        "exercise_ids": ["ex-pushup"],
    }
    r1 = seeded_client.post(
        "/api/v1/admin/workouts", headers=admin_bearer_headers, json=body
    )
    assert r1.status_code == 201
    body["name"] = "Second"
    r2 = seeded_client.post(
        "/api/v1/admin/workouts", headers=admin_bearer_headers, json=body
    )
    assert r2.status_code == 409


def test_admin_create_with_unknown_exercise_returns_404(
    seeded_client, admin_bearer_headers
):
    r = seeded_client.post(
        "/api/v1/admin/workouts",
        headers=admin_bearer_headers,
        json={
            "name": "Bogus Exercise",
            "tag": "Test",
            "location": "home",
            "equipment": [],
            "duration_min": 15,
            "exercise_ids": ["ex-bogus"],
        },
    )
    assert r.status_code == 404


def test_admin_create_requires_at_least_one_exercise(
    seeded_client, admin_bearer_headers
):
    r = seeded_client.post(
        "/api/v1/admin/workouts",
        headers=admin_bearer_headers,
        json={
            "name": "Empty",
            "tag": "Test",
            "location": "home",
            "equipment": [],
            "duration_min": 15,
            "exercise_ids": [],
        },
    )
    assert r.status_code == 422


def test_admin_partial_update(seeded_client, admin_bearer_headers):
    # Capture baseline so we can assert the un-touched fields survive.
    r0 = seeded_client.get("/api/v1/workouts/w-upper-power")
    assert r0.status_code == 200
    baseline = r0.json()
    baseline_name = baseline["name"]
    baseline_duration = baseline["duration_min"]
    baseline_exercise_count = len(baseline["exercises"])

    # PATCH only the tag.
    r = seeded_client.patch(
        "/api/v1/admin/workouts/w-upper-power",
        headers=admin_bearer_headers,
        json={"tag": "Push v2"},
    )
    assert r.status_code == 200
    updated = r.json()
    assert updated["tag"] == "Push v2"
    # Other fields preserved.
    assert updated["name"] == baseline_name
    assert updated["duration_min"] == baseline_duration
    assert len(updated["exercises"]) == baseline_exercise_count


def test_admin_update_missing_workout_returns_404(
    seeded_client, admin_bearer_headers
):
    r = seeded_client.patch(
        "/api/v1/admin/workouts/w-bogus",
        headers=admin_bearer_headers,
        json={"name": "Doesn't matter"},
    )
    assert r.status_code == 404


def test_admin_delete_then_list(seeded_client, admin_bearer_headers):
    body = {
        "id": "w-test-delete",
        "name": "Delete Me",
        "tag": "Test",
        "location": "home",
        "equipment": [],
        "duration_min": 15,
        "exercise_ids": ["ex-pushup"],
    }
    create = seeded_client.post(
        "/api/v1/admin/workouts", headers=admin_bearer_headers, json=body
    )
    assert create.status_code == 201

    delete = seeded_client.delete(
        "/api/v1/admin/workouts/w-test-delete", headers=admin_bearer_headers
    )
    assert delete.status_code == 204

    listing = seeded_client.get(
        "/api/v1/admin/workouts", headers=admin_bearer_headers
    )
    assert listing.status_code == 200
    assert all(w["id"] != "w-test-delete" for w in listing.json())


def test_admin_add_exercise_to_workout(seeded_client, admin_bearer_headers):
    r = seeded_client.post(
        "/api/v1/admin/workouts/w-upper-power/exercises",
        headers=admin_bearer_headers,
        json={"exercise_id": "ex-pushup"},
    )
    assert r.status_code == 200
    ids = [e["id"] for e in r.json()["exercises"]]
    assert "ex-pushup" in ids
    # No after_exercise_id → appended at the end.
    assert ids[-1] == "ex-pushup"


def test_admin_add_exercise_duplicate_returns_409(
    seeded_client, admin_bearer_headers
):
    r = seeded_client.post(
        "/api/v1/admin/workouts/w-upper-power/exercises",
        headers=admin_bearer_headers,
        json={"exercise_id": "ex-bench"},  # already in w-upper-power
    )
    assert r.status_code == 409


def test_admin_remove_exercise_from_workout(seeded_client, admin_bearer_headers):
    # Baseline.
    r0 = seeded_client.get("/api/v1/workouts/w-upper-power")
    original_ids = [e["id"] for e in r0.json()["exercises"]]
    assert "ex-cable-fly" in original_ids

    # Remove ex-cable-fly (originally at index 2).
    r = seeded_client.delete(
        "/api/v1/admin/workouts/w-upper-power/exercises/ex-cable-fly",
        headers=admin_bearer_headers,
    )
    assert r.status_code == 204

    after = seeded_client.get("/api/v1/workouts/w-upper-power").json()
    after_ids = [e["id"] for e in after["exercises"]]
    assert "ex-cable-fly" not in after_ids
    # order_index should be renormed to 0..N-1.
    assert after_ids == ["ex-bench", "ex-incline-db", "ex-ohp", "ex-lateral"]


def test_admin_reorder_exercises(seeded_client, admin_bearer_headers):
    new_order = [
        "ex-lateral",
        "ex-ohp",
        "ex-cable-fly",
        "ex-incline-db",
        "ex-bench",
    ]
    r = seeded_client.patch(
        "/api/v1/admin/workouts/w-upper-power/exercises/reorder",
        headers=admin_bearer_headers,
        json={"exercise_ids": new_order},
    )
    assert r.status_code == 200
    after_ids = [e["id"] for e in r.json()["exercises"]]
    assert after_ids == new_order


def test_admin_reorder_with_wrong_set_returns_422(
    seeded_client, admin_bearer_headers
):
    # Drop one exercise → set mismatch (length differs).
    r = seeded_client.patch(
        "/api/v1/admin/workouts/w-upper-power/exercises/reorder",
        headers=admin_bearer_headers,
        json={
            "exercise_ids": [
                "ex-bench",
                "ex-incline-db",
                "ex-cable-fly",
                "ex-ohp",
            ],
        },
    )
    assert r.status_code == 422


def test_non_admin_cannot_create_workout(seeded_client, user_bearer_headers):
    r = seeded_client.post(
        "/api/v1/admin/workouts",
        headers=user_bearer_headers,
        json={
            "name": "Forbidden",
            "tag": "Test",
            "location": "home",
            "equipment": [],
            "duration_min": 15,
            "exercise_ids": ["ex-pushup"],
        },
    )
    assert r.status_code == 403


def test_unauthenticated_cannot_create_workout(client):
    r = client.post(
        "/api/v1/admin/workouts",
        json={
            "name": "Anonymous",
            "tag": "Test",
            "location": "home",
            "equipment": [],
            "duration_min": 15,
            "exercise_ids": ["ex-pushup"],
        },
    )
    assert r.status_code in (401, 422)

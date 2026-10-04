"""Coach workout library CRUD tests.

Covers the 7 endpoints under `/api/v1/coach/workouts`:
- list (GET), create (POST), update (PATCH), delete (DELETE)
- add exercise (POST .../exercises)
- remove exercise (DELETE .../exercises/{id})
- reorder exercises (PATCH .../exercises/reorder)
"""
from app.models import CoachLink, User, Workout
from sqlmodel import select


def test_coach_create_workout_persists(
    seeded_client, coach_bearer_headers, db_session
):
    r = seeded_client.post(
        "/api/v1/coach/workouts",
        headers=coach_bearer_headers,
        json={
            "name": "Persisted Workout",
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


def test_coach_create_with_explicit_id(seeded_client, coach_bearer_headers):
    r = seeded_client.post(
        "/api/v1/coach/workouts",
        headers=coach_bearer_headers,
        json={
            "id": "w-test-explicit",
            "name": "Explicit ID",
            "duration_min": 15,
            "exercise_ids": ["ex-pushup"],
        },
    )
    assert r.status_code == 201
    assert r.json()["id"] == "w-test-explicit"


def test_coach_create_duplicate_id_returns_409(seeded_client, coach_bearer_headers):
    body = {
        "id": "w-test-dup",
        "name": "First",
        "duration_min": 15,
        "exercise_ids": ["ex-pushup"],
    }
    r1 = seeded_client.post(
        "/api/v1/coach/workouts", headers=coach_bearer_headers, json=body
    )
    assert r1.status_code == 201
    body["name"] = "Second"
    r2 = seeded_client.post(
        "/api/v1/coach/workouts", headers=coach_bearer_headers, json=body
    )
    assert r2.status_code == 409


def test_coach_create_with_unknown_exercise_returns_404(
    seeded_client, coach_bearer_headers
):
    r = seeded_client.post(
        "/api/v1/coach/workouts",
        headers=coach_bearer_headers,
        json={
            "name": "Bogus Exercise",
            "duration_min": 15,
            "exercise_ids": ["ex-bogus"],
        },
    )
    assert r.status_code == 404


def test_coach_create_allows_empty_exercise_list(
    seeded_client, coach_bearer_headers
):
    r = seeded_client.post(
        "/api/v1/coach/workouts",
        headers=coach_bearer_headers,
        json={
            "name": "Empty",
            "duration_min": 15,
            "exercise_ids": [],
        },
    )
    assert r.status_code == 201
    assert r.json()["exercises"] == []
    assert r.json()["equipment"] == []


def test_coach_partial_update(seeded_client, coach_bearer_headers):
    # Capture baseline so we can assert the un-touched fields survive.
    r0 = seeded_client.get("/api/v1/workouts/w-upper-power")
    assert r0.status_code == 200
    baseline = r0.json()
    baseline_duration = baseline["duration_min"]
    baseline_exercise_count = len(baseline["exercises"])

    # PATCH only the name.
    r = seeded_client.patch(
        "/api/v1/coach/workouts/w-upper-power",
        headers=coach_bearer_headers,
        json={"name": "Push v2"},
    )
    assert r.status_code == 200
    updated = r.json()
    assert updated["name"] == "Push v2"
    # Other fields preserved.
    assert updated["duration_min"] == baseline_duration
    assert len(updated["exercises"]) == baseline_exercise_count


def test_coach_update_missing_workout_returns_404(
    seeded_client, coach_bearer_headers
):
    r = seeded_client.patch(
        "/api/v1/coach/workouts/w-bogus",
        headers=coach_bearer_headers,
        json={"name": "Doesn't matter"},
    )
    assert r.status_code == 404


def test_coach_delete_then_list(seeded_client, coach_bearer_headers):
    body = {
        "id": "w-test-delete",
        "name": "Delete Me",
        "duration_min": 15,
        "exercise_ids": ["ex-pushup"],
    }
    create = seeded_client.post(
        "/api/v1/coach/workouts", headers=coach_bearer_headers, json=body
    )
    assert create.status_code == 201

    delete = seeded_client.delete(
        "/api/v1/coach/workouts/w-test-delete", headers=coach_bearer_headers
    )
    assert delete.status_code == 204

    listing = seeded_client.get(
        "/api/v1/coach/workouts", headers=coach_bearer_headers
    )
    assert listing.status_code == 200
    assert all(w["id"] != "w-test-delete" for w in listing.json())


def test_coach_add_exercise_to_workout(seeded_client, coach_bearer_headers):
    r = seeded_client.post(
        "/api/v1/coach/workouts/w-upper-power/exercises",
        headers=coach_bearer_headers,
        json={"exercise_id": "ex-pushup"},
    )
    assert r.status_code == 200
    ids = [e["id"] for e in r.json()["exercises"]]
    assert "ex-pushup" in ids
    # No after_exercise_id → appended at the end.
    assert ids[-1] == "ex-pushup"


def test_coach_add_exercise_duplicate_returns_409(
    seeded_client, coach_bearer_headers
):
    r = seeded_client.post(
        "/api/v1/coach/workouts/w-upper-power/exercises",
        headers=coach_bearer_headers,
        json={"exercise_id": "ex-bench"},  # already in w-upper-power
    )
    assert r.status_code == 409


def test_coach_remove_exercise_from_workout(seeded_client, coach_bearer_headers):
    # Baseline.
    r0 = seeded_client.get("/api/v1/workouts/w-upper-power")
    original_ids = [e["id"] for e in r0.json()["exercises"]]
    assert "ex-cable-fly" in original_ids

    # Remove ex-cable-fly (originally at index 3 — seed order is
    # compounds [bench, ohp] then accessories [incline-db, cable-fly,
    # lateral]).
    r = seeded_client.delete(
        "/api/v1/coach/workouts/w-upper-power/exercises/ex-cable-fly",
        headers=coach_bearer_headers,
    )
    assert r.status_code == 204

    after = seeded_client.get("/api/v1/workouts/w-upper-power").json()
    after_ids = [e["id"] for e in after["exercises"]]
    assert "ex-cable-fly" not in after_ids
    # order_index should be renormed to 0..N-1.
    assert after_ids == ["ex-bench", "ex-ohp", "ex-incline-db", "ex-lateral"]


def test_coach_reorder_exercises(seeded_client, coach_bearer_headers):
    new_order = [
        "ex-lateral",
        "ex-ohp",
        "ex-cable-fly",
        "ex-incline-db",
        "ex-bench",
    ]
    r = seeded_client.patch(
        "/api/v1/coach/workouts/w-upper-power/exercises/reorder",
        headers=coach_bearer_headers,
        json={"exercise_ids": new_order},
    )
    assert r.status_code == 200
    after_ids = [e["id"] for e in r.json()["exercises"]]
    assert after_ids == new_order


def test_coach_reorder_with_wrong_set_returns_422(
    seeded_client, coach_bearer_headers
):
    # Drop one exercise → set mismatch (length differs).
    r = seeded_client.patch(
        "/api/v1/coach/workouts/w-upper-power/exercises/reorder",
        headers=coach_bearer_headers,
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


def test_non_coach_cannot_create_workout(seeded_client, user_bearer_headers):
    r = seeded_client.post(
        "/api/v1/coach/workouts",
        headers=user_bearer_headers,
        json={
            "name": "Forbidden",
            "duration_min": 15,
            "exercise_ids": ["ex-pushup"],
        },
    )
    assert r.status_code == 403


def test_unauthenticated_cannot_create_workout(client):
    r = client.post(
        "/api/v1/coach/workouts",
        json={
            "name": "Anonymous",
            "duration_min": 15,
            "exercise_ids": ["ex-pushup"],
        },
    )
    assert r.status_code in (401, 422)


# ---------------------------------------------------------------------------
# Coach-model additions (duration null, equipment, prescription, attribution)
# ---------------------------------------------------------------------------

_BASE = "/api/v1/coach/workouts"


def test_coach_create_without_duration_is_null(seeded_client, coach_bearer_headers):
    r = seeded_client.post(
        _BASE, headers=coach_bearer_headers,
        json={"name": "No duration", "exercise_ids": ["ex-pushup"]},
    )
    assert r.status_code == 201
    assert r.json()["duration_min"] is None


def test_coach_patch_duration_null_clears(seeded_client, coach_bearer_headers):
    r = seeded_client.patch(
        f"{_BASE}/w-upper-power", headers=coach_bearer_headers,
        json={"duration_min": None},
    )
    assert r.status_code == 200
    assert r.json()["duration_min"] is None


def test_coach_created_by_populated(seeded_client, coach_bearer_headers):
    r = seeded_client.post(
        _BASE, headers=coach_bearer_headers,
        json={"name": "Attributed", "exercise_ids": ["ex-pushup"]},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["created_by"]["username"] == "admin"
    assert body["created_at"]
    # Seeded workouts are attributed to `ad`.
    seeded = seeded_client.get(f"{_BASE}/w-upper-power", headers=coach_bearer_headers)
    assert seeded.json()["created_by"]["username"] == "ad"


def test_coach_equipment_recomputed_on_add_and_remove(
    seeded_client, coach_bearer_headers
):
    r = seeded_client.post(
        _BASE, headers=coach_bearer_headers,
        json={"name": "Equip", "exercise_ids": ["ex-pushup"]},
    )
    wid = r.json()["id"]
    assert r.json()["equipment"] == ["bodyweight"]

    r = seeded_client.post(
        f"{_BASE}/{wid}/exercises", headers=coach_bearer_headers,
        json={"exercise_id": "ex-bench"},
    )
    assert r.status_code == 200
    assert "barbell" in r.json()["equipment"]
    assert "bodyweight" not in r.json()["equipment"]

    r = seeded_client.delete(
        f"{_BASE}/{wid}/exercises/ex-bench", headers=coach_bearer_headers
    )
    assert r.status_code == 204
    after = seeded_client.get(f"{_BASE}/{wid}", headers=coach_bearer_headers).json()
    assert after["equipment"] == ["bodyweight"]


def test_coach_prescription_weight_lb_to_kg_roundtrip(
    seeded_client, coach_bearer_headers
):
    r = seeded_client.patch(
        f"{_BASE}/w-upper-power/exercises/ex-bench/prescription",
        headers=coach_bearer_headers,
        json={"target_sets": 5, "target_reps": 6, "target_weight": 135,
              "target_weight_unit": "lb", "target_rest_sec": 120},
    )
    assert r.status_code == 200
    ex = {e["id"]: e for e in r.json()["exercises"]}["ex-bench"]
    assert ex["target_sets"] == 5
    assert ex["target_reps"] == 6
    assert ex["target_rest_sec"] == 120
    assert abs(ex["target_weight_kg"] - 135 * 0.45359237) < 1e-6

    # kg stored as-is.
    r = seeded_client.patch(
        f"{_BASE}/w-upper-power/exercises/ex-bench/prescription",
        headers=coach_bearer_headers,
        json={"target_weight": 60, "target_weight_unit": "kg"},
    )
    ex = {e["id"]: e for e in r.json()["exercises"]}["ex-bench"]
    assert ex["target_weight_kg"] == 60

    # null clears.
    r = seeded_client.patch(
        f"{_BASE}/w-upper-power/exercises/ex-bench/prescription",
        headers=coach_bearer_headers,
        json={"target_weight": None},
    )
    assert r.status_code == 200
    ex = {e["id"]: e for e in r.json()["exercises"]}["ex-bench"]
    assert ex["target_weight_kg"] is None


def test_coach_prescription_weight_without_unit_is_422(
    seeded_client, coach_bearer_headers
):
    r = seeded_client.patch(
        f"{_BASE}/w-upper-power/exercises/ex-bench/prescription",
        headers=coach_bearer_headers,
        json={"target_weight": 100},
    )
    assert r.status_code == 422


def test_non_coach_gets_403_on_every_library_route(seeded_client, user_bearer_headers):
    assert seeded_client.get(_BASE, headers=user_bearer_headers).status_code == 403
    assert seeded_client.get(f"{_BASE}/w-upper-power", headers=user_bearer_headers).status_code == 403
    assert seeded_client.patch(
        f"{_BASE}/w-upper-power", headers=user_bearer_headers, json={"name": "x"}
    ).status_code == 403
    assert seeded_client.delete(
        f"{_BASE}/w-upper-power", headers=user_bearer_headers
    ).status_code == 403


def test_coach_list_returns_library_with_attribution(seeded_client, coach_bearer_headers):
    r = seeded_client.get(_BASE, headers=coach_bearer_headers)
    assert r.status_code == 200
    ids = {w["id"] for w in r.json()}
    assert {"w-upper-power", "w-home-bw"} <= ids
    assert all("tag" not in w and "location" not in w for w in r.json())


def test_seeded_ad_has_accepted_athletes(db_session):
    users = {u.username: u for u in db_session.exec(select(User)).all()}
    assert users["ad"].role == "coach" and users["admin"].role == "coach"
    links = db_session.exec(
        select(CoachLink).where(CoachLink.coach_id == users["ad"].id)
    ).all()
    assert {l.athlete_id for l in links if l.status == "accepted"} == {
        users["a"].id, users["user1"].id,
    }

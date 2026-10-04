"""Tests for the WorkoutSession lifecycle: create/idempotency, the
active-session gate on set logging, stale auto-abandon, deletion
cascade, and block assembly (prescribed vs. ad-hoc ordering, last-time
lookups).
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.models import WorkoutSession


def _signup_user(seeded_client, username, password="testpassword1"):
    r = seeded_client.post(
        "/api/v1/auth/signup",
        json={"username": username, "password": password},
    )
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _today():
    return datetime.now(timezone.utc).date().isoformat()


def test_create_session_ad_hoc(seeded_client, user_bearer_headers):
    r = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": _today(), "tz_offset_min": -300},
        headers=user_bearer_headers,
    )
    assert r.status_code == 201
    data = r.json()
    assert data["workout_id"] is None
    assert data["status"] == "active"
    assert data["blocks"] == []
    assert data["total_sets"] == 0


def test_create_session_from_workout_snapshots_name(seeded_client, user_bearer_headers):
    r = seeded_client.post(
        "/api/v1/me/sessions",
        json={"workout_id": "w-upper-power", "local_date": _today(), "tz_offset_min": 0},
        headers=user_bearer_headers,
    )
    assert r.status_code == 201
    data = r.json()
    assert data["workout_id"] == "w-upper-power"
    assert data["name"] == "Upper Body Power"
    # Blocks come pre-populated from the workout's prescription, with
    # no logged sets yet.
    assert len(data["blocks"]) == 5
    bench = next(b for b in data["blocks"] if b["exercise"]["id"] == "ex-bench")
    assert bench["target_sets"] == 4
    assert bench["sets"] == []


def test_create_session_unknown_workout_404(seeded_client, user_bearer_headers):
    r = seeded_client.post(
        "/api/v1/me/sessions",
        json={"workout_id": "nope", "local_date": _today(), "tz_offset_min": 0},
        headers=user_bearer_headers,
    )
    assert r.status_code == 404


def test_create_session_idempotent_returns_existing_active(seeded_client, user_bearer_headers):
    r1 = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": _today(), "tz_offset_min": 0},
        headers=user_bearer_headers,
    )
    assert r1.status_code == 201
    first_id = r1.json()["id"]

    r2 = seeded_client.post(
        "/api/v1/me/sessions",
        json={"workout_id": "w-upper-power", "local_date": _today(), "tz_offset_min": 0},
        headers=user_bearer_headers,
    )
    assert r2.status_code == 200
    assert r2.json()["id"] == first_id
    # The second call's workout_id is ignored — the existing active
    # session wins, unchanged.
    assert r2.json()["workout_id"] is None


def test_get_active_none(seeded_client, user_bearer_headers):
    r = seeded_client.get("/api/v1/me/sessions/active", headers=user_bearer_headers)
    assert r.status_code == 200
    assert r.json() is None


def test_get_active_returns_current(seeded_client, user_bearer_headers):
    created = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": _today(), "tz_offset_min": 0},
        headers=user_bearer_headers,
    ).json()
    r = seeded_client.get("/api/v1/me/sessions/active", headers=user_bearer_headers)
    assert r.status_code == 200
    assert r.json()["id"] == created["id"]


def test_finish_session_clears_active(seeded_client, user_bearer_headers):
    session_id = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": _today(), "tz_offset_min": 0},
        headers=user_bearer_headers,
    ).json()["id"]

    r = seeded_client.patch(
        f"/api/v1/me/sessions/{session_id}",
        json={"status": "completed"},
        headers=user_bearer_headers,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "completed"
    assert r.json()["ended_at"] is not None

    active = seeded_client.get("/api/v1/me/sessions/active", headers=user_bearer_headers)
    assert active.json() is None


def test_patch_already_finished_session_409(seeded_client, user_bearer_headers):
    session_id = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": _today(), "tz_offset_min": 0},
        headers=user_bearer_headers,
    ).json()["id"]
    seeded_client.patch(
        f"/api/v1/me/sessions/{session_id}",
        json={"status": "completed"},
        headers=user_bearer_headers,
    )
    r = seeded_client.patch(
        f"/api/v1/me/sessions/{session_id}",
        json={"status": "abandoned"},
        headers=user_bearer_headers,
    )
    assert r.status_code == 409


def test_log_set_into_finished_session_succeeds_but_not_abandoned(
    seeded_client, user_bearer_headers
):
    # A1's "no more templates" rework: re-opening a past (completed)
    # session for editing must work; only `abandoned` sessions 409.
    completed_id = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": _today(), "tz_offset_min": 0},
        headers=user_bearer_headers,
    ).json()["id"]
    seeded_client.patch(
        f"/api/v1/me/sessions/{completed_id}",
        json={"status": "completed"},
        headers=user_bearer_headers,
    )
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": completed_id, "exercise_id": "ex-bench", "weight": 100, "reps": 5},
        headers=user_bearer_headers,
    )
    assert r.status_code == 201

    abandoned_id = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": _today(), "tz_offset_min": 0},
        headers=user_bearer_headers,
    ).json()["id"]
    seeded_client.patch(
        f"/api/v1/me/sessions/{abandoned_id}",
        json={"status": "abandoned"},
        headers=user_bearer_headers,
    )
    r2 = seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": abandoned_id, "exercise_id": "ex-bench", "weight": 100, "reps": 5},
        headers=user_bearer_headers,
    )
    assert r2.status_code == 409


def test_other_users_session_is_404(seeded_client):
    h_x = _signup_user(seeded_client, "user_x")
    h_y = _signup_user(seeded_client, "user_y")
    session_id = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": _today(), "tz_offset_min": 0},
        headers=h_x,
    ).json()["id"]

    r_get = seeded_client.get(f"/api/v1/me/sessions/{session_id}", headers=h_y)
    assert r_get.status_code == 404

    r_patch = seeded_client.patch(
        f"/api/v1/me/sessions/{session_id}", json={"status": "abandoned"}, headers=h_y
    )
    assert r_patch.status_code == 404

    r_post = seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-bench", "weight": 100, "reps": 5},
        headers=h_y,
    )
    assert r_post.status_code == 404


def test_stale_active_session_auto_abandoned(seeded_client, user_bearer_headers, db_session):
    session_id = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": _today(), "tz_offset_min": 0},
        headers=user_bearer_headers,
    ).json()["id"]

    stale_started_at = (datetime.now(timezone.utc) - timedelta(hours=25)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    ws = db_session.get(WorkoutSession, session_id)
    ws.started_at = stale_started_at
    db_session.add(ws)
    db_session.commit()

    r = seeded_client.get("/api/v1/me/sessions/active", headers=user_bearer_headers)
    assert r.status_code == 200
    assert r.json() is None

    detail = seeded_client.get(
        f"/api/v1/me/sessions/{session_id}", headers=user_bearer_headers
    ).json()
    assert detail["status"] == "abandoned"
    assert detail["ended_at"] is not None


def test_delete_session_cascades_and_recomputes_pr(seeded_client, user_bearer_headers):
    session_id = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": _today(), "tz_offset_min": 0},
        headers=user_bearer_headers,
    ).json()["id"]
    seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-bench", "weight": 300, "reps": 3},
        headers=user_bearer_headers,
    )

    r = seeded_client.delete(f"/api/v1/me/sessions/{session_id}", headers=user_bearer_headers)
    assert r.status_code == 204

    assert (
        seeded_client.get(f"/api/v1/me/sessions/{session_id}", headers=user_bearer_headers).status_code
        == 404
    )
    prs = seeded_client.get("/api/v1/me/prs", headers=user_bearer_headers).json()
    assert prs == []


def test_blocks_ordering_prescribed_then_adhoc(seeded_client, user_bearer_headers):
    session_id = seeded_client.post(
        "/api/v1/me/sessions",
        json={"workout_id": "w-upper-power", "local_date": _today(), "tz_offset_min": 0},
        headers=user_bearer_headers,
    ).json()["id"]

    # Log an exercise that ISN'T in w-upper-power's prescription.
    seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-pushup", "weight": 0, "reps": 15},
        headers=user_bearer_headers,
    )

    detail = seeded_client.get(
        f"/api/v1/me/sessions/{session_id}", headers=user_bearer_headers
    ).json()
    ids = [b["exercise"]["id"] for b in detail["blocks"]]
    # Prescribed blocks (compounds then accessories) first, ad-hoc addition last.
    assert ids == ["ex-bench", "ex-ohp", "ex-incline-db", "ex-cable-fly", "ex-lateral", "ex-pushup"]
    adhoc = detail["blocks"][-1]
    assert adhoc["target_sets"] == 3  # ad-hoc default, not a real prescription
    # The client hides target_* on blocks that aren't prescribed.
    assert adhoc["is_prescribed"] is False
    assert all(b["is_prescribed"] for b in detail["blocks"][:-1])


def test_blocks_ad_hoc_session_ordered_by_first_logged(seeded_client, user_bearer_headers):
    session_id = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": _today(), "tz_offset_min": 0},
        headers=user_bearer_headers,
    ).json()["id"]
    seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-squat", "weight": 200, "reps": 5},
        headers=user_bearer_headers,
    )
    seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-bench", "weight": 150, "reps": 5},
        headers=user_bearer_headers,
    )

    detail = seeded_client.get(
        f"/api/v1/me/sessions/{session_id}", headers=user_bearer_headers
    ).json()
    ids = [b["exercise"]["id"] for b in detail["blocks"]]
    assert ids == ["ex-squat", "ex-bench"]


def test_last_time_populated_from_prior_session_only(seeded_client, user_bearer_headers):
    session_1 = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": _today(), "tz_offset_min": 0},
        headers=user_bearer_headers,
    ).json()["id"]
    seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_1, "exercise_id": "ex-bench", "weight": 185, "reps": 8},
        headers=user_bearer_headers,
    )
    seeded_client.patch(
        f"/api/v1/me/sessions/{session_1}",
        json={"status": "completed"},
        headers=user_bearer_headers,
    )

    session_2 = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": _today(), "tz_offset_min": 0},
        headers=user_bearer_headers,
    ).json()["id"]

    detail = seeded_client.get(
        f"/api/v1/me/sessions/{session_2}", headers=user_bearer_headers
    ).json()
    # Ad-hoc session with nothing logged yet, but the exercise has
    # history from session_1 — last_time is only visible once we log
    # something against it in session_2, since blocks are built from
    # logged-or-prescribed exercises. Log an empty-workout set to
    # surface the block, then check last_time.
    seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_2, "exercise_id": "ex-bench", "weight": 190, "reps": 6},
        headers=user_bearer_headers,
    )
    detail2 = seeded_client.get(
        f"/api/v1/me/sessions/{session_2}", headers=user_bearer_headers
    ).json()
    block = next(b for b in detail2["blocks"] if b["exercise"]["id"] == "ex-bench")
    assert len(block["last_time"]) == 1
    assert block["last_time"][0]["weight"] == 185
    assert block["last_time"][0]["session_id"] == session_1


def test_list_sessions_filters_by_local_date(seeded_client, user_bearer_headers):
    today = _today()
    session_id = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": today, "tz_offset_min": 0},
        headers=user_bearer_headers,
    ).json()["id"]
    seeded_client.patch(
        f"/api/v1/me/sessions/{session_id}",
        json={"status": "completed"},
        headers=user_bearer_headers,
    )

    r = seeded_client.get(
        f"/api/v1/me/sessions?from={today}&to={today}", headers=user_bearer_headers
    )
    assert r.status_code == 200
    ids = [s["id"] for s in r.json()]
    assert session_id in ids

    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date().isoformat()
    r2 = seeded_client.get(
        f"/api/v1/me/sessions?from={yesterday}&to={yesterday}", headers=user_bearer_headers
    )
    assert r2.json() == []


def test_list_sessions_summary_shape(seeded_client, user_bearer_headers):
    session_id = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": _today(), "tz_offset_min": 0},
        headers=user_bearer_headers,
    ).json()["id"]
    seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-bench", "weight": 300, "reps": 1},
        headers=user_bearer_headers,
    )
    seeded_client.patch(
        f"/api/v1/me/sessions/{session_id}",
        json={"status": "completed"},
        headers=user_bearer_headers,
    )

    r = seeded_client.get("/api/v1/me/sessions", headers=user_bearer_headers)
    summary = next(s for s in r.json() if s["id"] == session_id)
    assert summary["total_sets"] == 1
    assert summary["exercise_count"] == 1
    assert summary["pr_count"] == 1
    assert summary["status"] == "completed"


# ---------------------------------------------------------------------------
# Session rename
# ---------------------------------------------------------------------------


def test_rename_session_via_patch(seeded_client, user_bearer_headers):
    session_id = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": _today(), "tz_offset_min": 0, "name": "workout_2026_Aug_2_5:23PM"},
        headers=user_bearer_headers,
    ).json()["id"]

    r = seeded_client.patch(
        f"/api/v1/me/sessions/{session_id}",
        json={"name": "Leg Day"},
        headers=user_bearer_headers,
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Leg Day"

    # Persists, and is renameable even after the session is completed.
    seeded_client.patch(
        f"/api/v1/me/sessions/{session_id}",
        json={"status": "completed"},
        headers=user_bearer_headers,
    )
    r2 = seeded_client.patch(
        f"/api/v1/me/sessions/{session_id}",
        json={"name": "Leg Day (renamed after finish)"},
        headers=user_bearer_headers,
    )
    assert r2.status_code == 200
    assert r2.json()["name"] == "Leg Day (renamed after finish)"


def test_client_supplied_session_name_wins(seeded_client, user_bearer_headers):
    # A self-started (ad-hoc) session gets whatever name the client sends,
    # not the "Workout" server fallback.
    r = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": _today(), "tz_offset_min": 0, "name": "workout_2026_Aug_2_5:23PM"},
        headers=user_bearer_headers,
    )
    assert r.json()["name"] == "workout_2026_Aug_2_5:23PM"


# ---------------------------------------------------------------------------
# "My Workouts" — the caller's own past (completed) sessions
# ---------------------------------------------------------------------------
# Personal `Workout` templates ("save as template") were removed in the
# 2026-08-22 "no more templates" rework. `GET /me/workouts` now returns
# the user's own completed WorkoutSessions instead — see
# `app/routers/sessions.py::list_my_workouts`.


def _log_working_set(seeded_client, headers, session_id, exercise_id, weight, reps):
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": exercise_id, "weight": weight, "reps": reps},
        headers=headers,
    )
    assert r.status_code == 201, r.text


def test_coach_catalog_excludes_personal_templates(seeded_client, user_bearer_headers):
    # Baseline: the coach catalog is the 2 seeded workouts, none owned.
    # Personal Workout rows never get created (no writer remains after
    # the "no more templates" rework), so this stays trivially true.
    coach = seeded_client.get("/api/v1/workouts").json()
    assert {w["id"] for w in coach} == {"w-upper-power", "w-home-bw"}
    assert all(w["owner_id"] is None for w in coach)


def test_my_workouts_returns_completed_sessions_newest_first(seeded_client, user_bearer_headers):
    # Distinct local_dates (rather than relying on `started_at`'s
    # second-resolution tiebreak within the same second) make the
    # expected order unambiguous.
    dates = ["2026-01-10", "2026-01-11", "2026-01-12"]
    ids = []
    for local_date, reps in zip(dates, (5, 6, 7)):
        sid = seeded_client.post(
            "/api/v1/me/sessions",
            json={"local_date": local_date, "tz_offset_min": 0},
            headers=user_bearer_headers,
        ).json()["id"]
        _log_working_set(seeded_client, user_bearer_headers, sid, "ex-bench", 185, reps)
        seeded_client.patch(
            f"/api/v1/me/sessions/{sid}",
            json={"status": "completed"},
            headers=user_bearer_headers,
        )
        ids.append(sid)

    mine = seeded_client.get("/api/v1/me/workouts", headers=user_bearer_headers).json()
    mine_ids = [w["id"] for w in mine]
    # Newest local_date first.
    assert mine_ids[: len(ids)] == list(reversed(ids))
    for w in mine:
        assert w["status"] == "completed"


def test_my_workouts_excludes_active_and_abandoned(seeded_client, user_bearer_headers):
    active_id = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": _today(), "tz_offset_min": 0},
        headers=user_bearer_headers,
    ).json()["id"]

    abandoned_id = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": _today(), "tz_offset_min": 0},
        headers=user_bearer_headers,
    )
    # `create_session` is idempotent — abandon the currently-active one
    # first so a second session can actually be created.
    seeded_client.patch(
        f"/api/v1/me/sessions/{active_id}", json={"status": "abandoned"}, headers=user_bearer_headers
    )
    second_id = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": _today(), "tz_offset_min": 0},
        headers=user_bearer_headers,
    ).json()["id"]

    mine = seeded_client.get("/api/v1/me/workouts", headers=user_bearer_headers).json()
    mine_ids = {w["id"] for w in mine}
    assert active_id not in mine_ids  # abandoned now, not completed
    assert second_id not in mine_ids  # still active


def test_my_workouts_respects_limit_and_offset(seeded_client, user_bearer_headers):
    for _ in range(3):
        sid = seeded_client.post(
            "/api/v1/me/sessions",
            json={"local_date": _today(), "tz_offset_min": 0},
            headers=user_bearer_headers,
        ).json()["id"]
        seeded_client.patch(
            f"/api/v1/me/sessions/{sid}",
            json={"status": "completed"},
            headers=user_bearer_headers,
        )

    page1 = seeded_client.get(
        "/api/v1/me/workouts?limit=2&offset=0", headers=user_bearer_headers
    ).json()
    page2 = seeded_client.get(
        "/api/v1/me/workouts?limit=2&offset=2", headers=user_bearer_headers
    ).json()
    assert len(page1) == 2
    assert len(page2) == 1
    assert {w["id"] for w in page1}.isdisjoint({w["id"] for w in page2})


def test_my_workouts_is_per_user(seeded_client):
    h_a = _signup_user(seeded_client, "owner_a")
    h_b = _signup_user(seeded_client, "owner_b")
    session_id = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": _today(), "tz_offset_min": 0},
        headers=h_a,
    ).json()["id"]
    _log_working_set(seeded_client, h_a, session_id, "ex-bench", 185, 5)
    seeded_client.patch(
        f"/api/v1/me/sessions/{session_id}", json={"status": "completed"}, headers=h_a
    )

    mine_a = seeded_client.get("/api/v1/me/workouts", headers=h_a).json()
    assert any(w["id"] == session_id for w in mine_a)

    # B does not see A's session.
    mine_b = seeded_client.get("/api/v1/me/workouts", headers=h_b).json()
    assert mine_b == []
    # And B cannot open it directly either → 404 (no existence leak).
    r = seeded_client.get(f"/api/v1/me/sessions/{session_id}", headers=h_b)
    assert r.status_code == 404


def test_start_session_from_coach_template(seeded_client, user_bearer_headers):
    # Personal templates no longer exist to start from — only the coach
    # catalog remains a valid `workout_id` source.
    r_coach = seeded_client.post(
        "/api/v1/me/sessions",
        json={"workout_id": "w-upper-power", "local_date": _today(), "tz_offset_min": 0},
        headers=user_bearer_headers,
    )
    assert r_coach.status_code in (200, 201)
    assert r_coach.json()["name"] == "Upper Body Power"
    assert r_coach.json()["workout_id"] == "w-upper-power"


# ---------------------------------------------------------------------------
# Editing a past (completed) session in place
# ---------------------------------------------------------------------------


def test_set_added_to_past_session_inherits_its_local_date(seeded_client, user_bearer_headers):
    past_date = "2026-01-15"
    session_id = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": past_date, "tz_offset_min": 0},
        headers=user_bearer_headers,
    ).json()["id"]
    seeded_client.patch(
        f"/api/v1/me/sessions/{session_id}",
        json={"status": "completed"},
        headers=user_bearer_headers,
    )

    # Logging a set "today" against an old session must NOT re-date it —
    # the set inherits the session's local_date, never utc_today_iso().
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-bench", "weight": 100, "reps": 5},
        headers=user_bearer_headers,
    )
    assert r.status_code == 201
    assert r.json()["set"]["local_date"] == past_date
    assert r.json()["set"]["local_date"] != _today()

    detail = seeded_client.get(
        f"/api/v1/me/sessions/{session_id}", headers=user_bearer_headers
    ).json()
    assert detail["local_date"] == past_date


def test_editing_past_session_does_not_move_started_or_ended_at(
    seeded_client, user_bearer_headers
):
    session_id = seeded_client.post(
        "/api/v1/me/sessions",
        json={"local_date": "2026-01-15", "tz_offset_min": 0},
        headers=user_bearer_headers,
    ).json()["id"]
    seeded_client.patch(
        f"/api/v1/me/sessions/{session_id}",
        json={"status": "completed"},
        headers=user_bearer_headers,
    )
    before = seeded_client.get(
        f"/api/v1/me/sessions/{session_id}", headers=user_bearer_headers
    ).json()

    # Add, edit, and delete a set on the old session.
    r = seeded_client.post(
        "/api/v1/me/sets",
        json={"session_id": session_id, "exercise_id": "ex-bench", "weight": 100, "reps": 5},
        headers=user_bearer_headers,
    )
    set_id = r.json()["set"]["id"]
    seeded_client.patch(
        f"/api/v1/me/sets/{set_id}", json={"weight": 120}, headers=user_bearer_headers
    )
    seeded_client.delete(f"/api/v1/me/sets/{set_id}", headers=user_bearer_headers)
    # Also rename the session — still shouldn't touch dates.
    seeded_client.patch(
        f"/api/v1/me/sessions/{session_id}",
        json={"name": "Renamed Later"},
        headers=user_bearer_headers,
    )

    after = seeded_client.get(
        f"/api/v1/me/sessions/{session_id}", headers=user_bearer_headers
    ).json()
    assert after["started_at"] == before["started_at"]
    assert after["ended_at"] == before["ended_at"]
    assert after["local_date"] == before["local_date"] == "2026-01-15"
    assert after["name"] == "Renamed Later"

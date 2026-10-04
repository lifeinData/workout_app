"""Tests for the coaching router (links, coaches list, athletes, assignments, playbook)."""

import pytest
from sqlmodel import select

from app.models import CoachLink, Message, User, WorkoutAssignment
from tests.conftest import _login

API = "/api/v1"


def _h(client, username, password):
    return {"Authorization": f"Bearer {_login(client, username, password)}"}


def _uid(db_session, username):
    return db_session.exec(select(User).where(User.username == username)).one().id


@pytest.fixture
def ad_h(seeded_client):
    return _h(seeded_client, "ad", "ad")


@pytest.fixture
def a_h(seeded_client):
    return _h(seeded_client, "a", "a")


def test_list_coaches(seeded_client, user_bearer_headers):
    r = seeded_client.get(f"{API}/coaches", headers=user_bearer_headers)
    assert r.status_code == 200
    by_name = {c["username"]: c for c in r.json()}
    assert set(by_name) == {"ad", "admin"}
    assert by_name["ad"]["athlete_count"] == 2
    assert by_name["admin"]["athlete_count"] == 0


def test_request_creates_pending_link_and_first_dm(
    seeded_client, user_bearer_headers, db_session
):
    admin_id = _uid(db_session, "admin")
    r = seeded_client.post(
        f"{API}/me/coach-requests",
        json={"coach_id": admin_id, "message": "  Help me get strong  "},
        headers=user_bearer_headers,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "pending"
    assert body["coach"]["id"] == admin_id
    msgs = db_session.exec(select(Message).where(Message.recipient_id == admin_id)).all()
    assert [m.body for m in msgs] == ["Help me get strong"]
    # /me/coach reflects it
    me = seeded_client.get(f"{API}/me/coach", headers=user_bearer_headers).json()
    assert me["id"] == body["id"]


def test_request_without_message_creates_no_dm(
    seeded_client, user_bearer_headers, db_session
):
    admin_id = _uid(db_session, "admin")
    r = seeded_client.post(
        f"{API}/me/coach-requests",
        json={"coach_id": admin_id},
        headers=user_bearer_headers,
    )
    assert r.status_code == 201
    assert db_session.exec(select(Message).where(Message.recipient_id == admin_id)).all() == []


def test_duplicate_request_409(seeded_client, user_bearer_headers, db_session):
    admin_id = _uid(db_session, "admin")
    payload = {"coach_id": admin_id}
    assert seeded_client.post(
        f"{API}/me/coach-requests", json=payload, headers=user_bearer_headers
    ).status_code == 201
    r = seeded_client.post(
        f"{API}/me/coach-requests", json=payload, headers=user_bearer_headers
    )
    assert r.status_code == 409


def test_already_coached_athlete_cannot_request_409(seeded_client, a_h, db_session):
    r = seeded_client.post(
        f"{API}/me/coach-requests",
        json={"coach_id": _uid(db_session, "admin")},
        headers=a_h,
    )
    assert r.status_code == 409


def test_coach_cannot_request_403(seeded_client, coach_bearer_headers, db_session):
    r = seeded_client.post(
        f"{API}/me/coach-requests",
        json={"coach_id": _uid(db_session, "ad")},
        headers=coach_bearer_headers,
    )
    assert r.status_code == 403


def test_request_unknown_or_non_coach_404(seeded_client, user_bearer_headers, db_session):
    for cid in ("usr-nope", _uid(db_session, "user1")):
        r = seeded_client.post(
            f"{API}/me/coach-requests",
            json={"coach_id": cid},
            headers=user_bearer_headers,
        )
        assert r.status_code == 404


def test_cancel_pending_then_no_coach(seeded_client, user_bearer_headers, db_session):
    admin_id = _uid(db_session, "admin")
    seeded_client.post(
        f"{API}/me/coach-requests",
        json={"coach_id": admin_id},
        headers=user_bearer_headers,
    )
    r = seeded_client.delete(f"{API}/me/coach-link", headers=user_bearer_headers)
    assert r.status_code == 204
    assert seeded_client.get(f"{API}/me/coach", headers=user_bearer_headers).json() is None
    link = db_session.exec(select(CoachLink).where(CoachLink.coach_id == admin_id)).one()
    assert link.status == "cancelled"
    # No link left -> 404
    assert seeded_client.delete(
        f"{API}/me/coach-link", headers=user_bearer_headers
    ).status_code == 404


def test_leave_accepted_coach_marks_ended(seeded_client, a_h, db_session):
    assert seeded_client.delete(f"{API}/me/coach-link", headers=a_h).status_code == 204
    assert seeded_client.get(f"{API}/me/coach", headers=a_h).json() is None
    a_id = _uid(db_session, "a")
    link = db_session.exec(select(CoachLink).where(CoachLink.athlete_id == a_id)).one()
    assert link.status == "ended"


def test_me_coach_seeded_athlete_has_unread_welcome(seeded_client, a_h):
    me = seeded_client.get(f"{API}/me/coach", headers=a_h).json()
    assert me["status"] == "accepted"
    assert me["coach"]["username"] == "ad"
    assert me["unread_count"] == 1


def _request_to(seeded_client, db_session, headers, coach_username="admin"):
    r = seeded_client.post(
        f"{API}/me/coach-requests",
        json={"coach_id": _uid(db_session, coach_username), "message": "hi"},
        headers=headers,
    )
    assert r.status_code == 201
    return r.json()["id"]


def test_accept_by_wrong_coach_404(
    seeded_client, user_bearer_headers, ad_h, db_session
):
    link_id = _request_to(seeded_client, db_session, user_bearer_headers, "admin")
    r = seeded_client.post(f"{API}/coach/links/{link_id}/accept", headers=ad_h)
    assert r.status_code == 404


def test_accept_requires_coach_role(seeded_client, user_bearer_headers):
    r = seeded_client.post(
        f"{API}/coach/links/cl-x/accept", headers=user_bearer_headers
    )
    assert r.status_code == 403


def test_accept_then_non_pending_409(
    seeded_client, user_bearer_headers, coach_bearer_headers, db_session
):
    link_id = _request_to(seeded_client, db_session, user_bearer_headers)
    r = seeded_client.post(
        f"{API}/coach/links/{link_id}/accept", headers=coach_bearer_headers
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "accepted"
    assert r.json()["user"]["username"] == "testuser"
    for action in ("accept", "decline"):
        again = seeded_client.post(
            f"{API}/coach/links/{link_id}/{action}", headers=coach_bearer_headers
        )
        assert again.status_code == 409


def test_decline_returns_athlete_to_no_coach(
    seeded_client, user_bearer_headers, coach_bearer_headers, db_session
):
    link_id = _request_to(seeded_client, db_session, user_bearer_headers)
    r = seeded_client.post(
        f"{API}/coach/links/{link_id}/decline", headers=coach_bearer_headers
    )
    assert r.status_code == 204
    assert seeded_client.get(f"{API}/me/coach", headers=user_bearer_headers).json() is None
    # Can request again after a decline
    _request_to(seeded_client, db_session, user_bearer_headers)


def test_coach_athletes_splits_requests_and_athletes(
    seeded_client, user_bearer_headers, ad_h, db_session
):
    _request_to(seeded_client, db_session, user_bearer_headers, "ad")
    r = seeded_client.get(f"{API}/coach/athletes", headers=ad_h)
    assert r.status_code == 200
    body = r.json()
    assert [x["user"]["username"] for x in body["requests"]] == ["testuser"]
    req = body["requests"][0]
    assert req["status"] == "pending"
    assert req["unread_count"] == 1
    assert req["last_message"] == {
        "body": "hi",
        "created_at": req["last_message"]["created_at"],
        "from_me": False,
    }
    assert {x["user"]["username"] for x in body["athletes"]} == {"a", "user1"}
    assert all(x["status"] == "accepted" for x in body["athletes"])
    by_user = {x["user"]["username"]: x for x in body["athletes"]}
    assert by_user["a"]["last_message"]["from_me"] is True  # welcome DM
    assert by_user["a"]["assigned_workout_count"] == 2
    assert by_user["a"]["unread_count"] == 0


def test_coach_athletes_requires_coach(seeded_client, user_bearer_headers):
    assert seeded_client.get(
        f"{API}/coach/athletes", headers=user_bearer_headers
    ).status_code == 403


def test_assignments_get_limited_to_my_athletes(seeded_client, ad_h, coach_bearer_headers, db_session):
    r = seeded_client.get(f"{API}/coach/workouts/w-home-bw/assignments", headers=ad_h)
    assert r.status_code == 200
    assert set(r.json()["athlete_ids"]) == {
        _uid(db_session, "a"),
        _uid(db_session, "user1"),
    }
    # admin has no athletes, so sees nothing
    r2 = seeded_client.get(
        f"{API}/coach/workouts/w-home-bw/assignments", headers=coach_bearer_headers
    )
    assert r2.json() == {"athlete_ids": []}


def test_assignments_put_replace_semantics(seeded_client, ad_h, db_session):
    a_id, u1_id = _uid(db_session, "a"), _uid(db_session, "user1")
    url = f"{API}/coach/workouts/w-home-bw/assignments"
    r = seeded_client.put(url, json={"athlete_ids": [a_id]}, headers=ad_h)
    assert r.status_code == 200
    assert r.json() == {"athlete_ids": [a_id]}
    assert seeded_client.get(url, headers=ad_h).json() == {"athlete_ids": [a_id]}
    r = seeded_client.put(url, json={"athlete_ids": [u1_id, a_id, a_id]}, headers=ad_h)
    assert set(r.json()["athlete_ids"]) == {a_id, u1_id}
    r = seeded_client.put(url, json={"athlete_ids": []}, headers=ad_h)
    assert r.json() == {"athlete_ids": []}
    # The other workout is untouched
    other = seeded_client.get(
        f"{API}/coach/workouts/w-upper-power/assignments", headers=ad_h
    ).json()
    assert set(other["athlete_ids"]) == {a_id, u1_id}


def test_assignments_put_non_athlete_422_writes_nothing(seeded_client, ad_h, db_session):
    a_id = _uid(db_session, "a")
    url = f"{API}/coach/workouts/w-home-bw/assignments"
    before = len(db_session.exec(select(WorkoutAssignment)).all())
    r = seeded_client.put(
        url, json={"athlete_ids": [a_id, "usr-stranger"]}, headers=ad_h
    )
    assert r.status_code == 422
    db_session.expire_all()
    assert len(db_session.exec(select(WorkoutAssignment)).all()) == before
    # Another coach's athlete is not mine either
    r = seeded_client.put(
        f"{API}/coach/workouts/w-home-bw/assignments",
        json={"athlete_ids": [a_id]},
        headers=_h(seeded_client, "admin", "admin1234"),
    )
    assert r.status_code == 422


def test_assignments_unknown_workout_404(seeded_client, ad_h):
    assert seeded_client.get(
        f"{API}/coach/workouts/nope/assignments", headers=ad_h
    ).status_code == 404
    assert seeded_client.put(
        f"{API}/coach/workouts/nope/assignments", json={"athlete_ids": []}, headers=ad_h
    ).status_code == 404


def test_assignments_require_coach(seeded_client, user_bearer_headers):
    assert seeded_client.get(
        f"{API}/coach/workouts/w-home-bw/assignments", headers=user_bearer_headers
    ).status_code == 403


def test_playbook_no_coach_empty(seeded_client, user_bearer_headers):
    r = seeded_client.get(f"{API}/me/playbook", headers=user_bearer_headers)
    assert r.status_code == 200
    assert r.json() == {"is_coach": False, "coach_link": None, "workouts": []}


def test_playbook_pending_athlete_empty_with_link(
    seeded_client, user_bearer_headers, db_session
):
    _request_to(seeded_client, db_session, user_bearer_headers)
    body = seeded_client.get(f"{API}/me/playbook", headers=user_bearer_headers).json()
    assert body["workouts"] == []
    assert body["coach_link"]["status"] == "pending"


def test_playbook_accepted_athlete_sees_only_current_coach_assignments(
    seeded_client, a_h, ad_h, db_session
):
    body = seeded_client.get(f"{API}/me/playbook", headers=a_h).json()
    assert body["is_coach"] is False
    assert body["coach_link"]["coach"]["username"] == "ad"
    assert {w["id"] for w in body["workouts"]} == {"w-upper-power", "w-home-bw"}
    assert body["workouts"][0]["created_by"]["username"] == "ad"
    # An assignment from a different coach is not shown
    stray = WorkoutAssignment(
        workout_id="w-home-bw",
        athlete_id=_uid(db_session, "a"),
        sent_by=_uid(db_session, "admin"),
        sent_at="2026-01-01T00:00:00Z",
    )
    existing = db_session.get(WorkoutAssignment, ("w-home-bw", stray.athlete_id))
    db_session.delete(existing)
    db_session.add(stray)
    db_session.commit()
    body = seeded_client.get(f"{API}/me/playbook", headers=a_h).json()
    assert {w["id"] for w in body["workouts"]} == {"w-upper-power"}


def test_playbook_coach_sees_library(seeded_client, ad_h):
    body = seeded_client.get(f"{API}/me/playbook", headers=ad_h).json()
    assert body["is_coach"] is True
    assert body["coach_link"] is None
    assert {w["id"] for w in body["workouts"]} == {"w-upper-power", "w-home-bw"}


def test_deleting_workout_removes_it_from_playbook(
    seeded_client, a_h, coach_bearer_headers
):
    r = seeded_client.delete(
        f"{API}/coach/workouts/w-home-bw", headers=coach_bearer_headers
    )
    assert r.status_code == 204
    body = seeded_client.get(f"{API}/me/playbook", headers=a_h).json()
    assert {w["id"] for w in body["workouts"]} == {"w-upper-power"}


def test_new_assignment_appears_in_playbook(
    seeded_client, user_bearer_headers, coach_bearer_headers, db_session
):
    link_id = _request_to(seeded_client, db_session, user_bearer_headers)
    seeded_client.post(f"{API}/coach/links/{link_id}/accept", headers=coach_bearer_headers)
    me_id = _uid(db_session, "testuser")
    r = seeded_client.put(
        f"{API}/coach/workouts/w-upper-power/assignments",
        json={"athlete_ids": [me_id]},
        headers=coach_bearer_headers,
    )
    assert r.status_code == 200
    body = seeded_client.get(f"{API}/me/playbook", headers=user_bearer_headers).json()
    assert [w["id"] for w in body["workouts"]] == ["w-upper-power"]

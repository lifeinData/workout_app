"""Tests for /api/v1/me/messages."""

import uuid

import pytest

from app.models import CoachLink
from app.timefmt import utc_now_iso
from tests.conftest import _login

API = "/api/v1/me/messages"


def _h(client, username, password):
    return {"Authorization": f"Bearer {_login(client, username, password)}"}


def _me_id(client, headers):
    r = client.get("/api/v1/auth/me", headers=headers)
    assert r.status_code == 200
    return r.json()["id"]


def _link(db, coach_id, athlete_id, status="pending"):
    link = CoachLink(
        id=f"cl-{uuid.uuid4().hex[:12]}",
        coach_id=coach_id,
        athlete_id=athlete_id,
        status=status,
        created_at=utc_now_iso(),
    )
    db.add(link)
    db.commit()
    return link


@pytest.fixture
def pair(seeded_client, db_session):
    """Coach `ad` + a fresh athlete with a PENDING link (no seeded DMs)."""
    coach_h = _h(seeded_client, "ad", "ad")
    r = seeded_client.post(
        "/api/v1/auth/signup",
        json={"username": "fresh", "password": "freshpw1", "display_name": "Fresh", "initials": "FR"},
    )
    assert r.status_code == 201
    ath_h = {"Authorization": f"Bearer {r.json()['token']}"}
    coach_id = _me_id(seeded_client, coach_h)
    ath_id = _me_id(seeded_client, ath_h)
    link = _link(db_session, coach_id, ath_id, "pending")
    return {
        "c": seeded_client,
        "coach_h": coach_h,
        "ath_h": ath_h,
        "coach_id": coach_id,
        "ath_id": ath_id,
        "link": link,
        "db": db_session,
    }


def _send(p, who, body):
    c = p["c"]
    if who == "coach":
        return c.post(f"{API}/{p['ath_id']}", json={"body": body}, headers=p["coach_h"])
    return c.post(f"{API}/{p['coach_id']}", json={"body": body}, headers=p["ath_h"])


def test_send_receive_while_pending(pair):
    r = _send(pair, "athlete", "  hi coach  ")
    assert r.status_code == 201
    assert r.json()["body"] == "hi coach"
    assert r.json()["sender_id"] == pair["ath_id"]
    assert r.json()["read_at"] is None
    got = pair["c"].get(f"{API}/{pair['ath_id']}", headers=pair["coach_h"])
    assert got.status_code == 200
    assert [m["body"] for m in got.json()] == ["hi coach"]


def test_send_while_accepted(pair):
    pair["link"].status = "accepted"
    pair["db"].add(pair["link"])
    pair["db"].commit()
    assert _send(pair, "coach", "welcome").status_code == 201
    got = pair["c"].get(f"{API}/{pair['coach_id']}", headers=pair["ath_h"])
    assert got.json()[-1]["body"] == "welcome"


def test_403_without_link(seeded_client, user_bearer_headers):
    coach_h = _h(seeded_client, "ad", "ad")
    coach_id = _me_id(seeded_client, coach_h)
    r = seeded_client.get(f"{API}/{coach_id}", headers=user_bearer_headers)
    assert r.status_code == 403
    r = seeded_client.post(f"{API}/{coach_id}", json={"body": "x"}, headers=user_bearer_headers)
    assert r.status_code == 403
    r = seeded_client.post(f"{API}/{coach_id}/read", headers=user_bearer_headers)
    assert r.status_code == 403


def test_403_after_cancel(pair):
    assert _send(pair, "athlete", "x").status_code == 201
    pair["link"].status = "cancelled"
    pair["db"].add(pair["link"])
    pair["db"].commit()
    assert _send(pair, "athlete", "y").status_code == 403
    r = pair["c"].get(f"{API}/{pair['ath_id']}", headers=pair["coach_h"])
    assert r.status_code == 403


def test_after_id_paging(pair):
    ids = [_send(pair, "coach", f"m{i}").json()["id"] for i in range(5)]
    r = pair["c"].get(f"{API}/{pair['coach_id']}?after_id={ids[1]}", headers=pair["ath_h"])
    assert [m["id"] for m in r.json()] == ids[2:]
    r = pair["c"].get(f"{API}/{pair['coach_id']}?after_id={ids[-1]}", headers=pair["ath_h"])
    assert r.json() == []


def test_limit_returns_latest_ascending(pair):
    ids = [_send(pair, "coach", f"m{i}").json()["id"] for i in range(5)]
    r = pair["c"].get(f"{API}/{pair['coach_id']}?limit=3", headers=pair["ath_h"])
    assert [m["id"] for m in r.json()] == ids[-3:]


def test_limit_bounds(pair):
    r = pair["c"].get(f"{API}/{pair['coach_id']}?limit=101", headers=pair["ath_h"])
    assert r.status_code == 422
    r = pair["c"].get(f"{API}/{pair['coach_id']}?limit=0", headers=pair["ath_h"])
    assert r.status_code == 422


def test_unread_by_user_and_total(pair):
    for i in range(3):
        _send(pair, "coach", f"c{i}")
    _send(pair, "athlete", "from athlete")
    r = pair["c"].get(f"{API}/unread", headers=pair["ath_h"])
    assert r.status_code == 200
    assert r.json()["by_user"][pair["coach_id"]] == 3
    assert r.json()["total"] == 3
    r = pair["c"].get(f"{API}/unread", headers=pair["coach_h"])
    assert r.json()["by_user"][pair["ath_id"]] == 1


def test_mark_read_clears_unread(pair):
    _send(pair, "coach", "a")
    _send(pair, "coach", "b")
    r = pair["c"].post(f"{API}/{pair['coach_id']}/read", headers=pair["ath_h"])
    assert r.status_code == 204
    u = pair["c"].get(f"{API}/unread", headers=pair["ath_h"]).json()
    assert pair["coach_id"] not in u["by_user"]
    assert u["total"] == 0
    msgs = pair["c"].get(f"{API}/{pair['coach_id']}", headers=pair["ath_h"]).json()
    assert all(m["read_at"] for m in msgs)


def test_mark_read_only_affects_messages_to_me(pair):
    _send(pair, "athlete", "mine")
    pair["c"].post(f"{API}/{pair['coach_id']}/read", headers=pair["ath_h"])
    u = pair["c"].get(f"{API}/unread", headers=pair["coach_h"]).json()
    assert u["by_user"][pair["ath_id"]] == 1


@pytest.mark.parametrize("body", ["", "   ", "\n\t "])
def test_empty_body_422(pair, body):
    assert _send(pair, "coach", body).status_code == 422


def test_body_2001_chars_422_and_2000_ok(pair):
    assert _send(pair, "coach", "x" * 2001).status_code == 422
    assert _send(pair, "coach", "x" * 2000).status_code == 201


def test_unauthenticated_401(seeded_client):
    bad = {"Authorization": "Bearer nope"}
    assert seeded_client.get(f"{API}/unread", headers=bad).status_code == 401
    assert seeded_client.get(f"{API}/someone", headers=bad).status_code == 401

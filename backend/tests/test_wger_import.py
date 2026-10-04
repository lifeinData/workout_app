"""Tests for A1: the wger import's genuine-English-only acceptance, and
the non-destructive reconcile's referenced-row safety.

Network policy: `wger_import.py`'s network-fetching path
(`_fetch_wger_payload` / `_fetch_or_cached_raw` / `reconcile_exercises`
itself, which calls the former) is NEVER exercised here. Two techniques
keep these tests offline and deterministic:

  1. `_normalize_wger` and `_is_exercise_referenced` are pure/DB-only
     functions with no I/O of their own -- called directly with
     synthetic fixture data.
  2. `_fetch_translation_index` takes an `httpx.Client` only to hand it
     to `_paginate`; monkeypatching `_paginate` to return a synthetic
     translations list lets us exercise the actual per-record
     `language != WGER_LANG_EN` check without any HTTP call.

`reconcile_exercises`'s phase-2 delete logic is re-created inline in
`test_reconcile_delete_phase_*` against a controlled `accepted_ids` set
(mirroring the real function body) rather than calling
`reconcile_exercises` itself, per the task's instruction to avoid the
network-fetching path.
"""
from sqlmodel import select

from app.models import Exercise, HistoricalSet, User, Workout, WorkoutExerciseLink, WorkoutSession
from app.seed import wger_import


# --- _fetch_translation_index: genuine-English-only check -----------------


def test_translation_index_admits_only_records_with_english_language_field(monkeypatch):
    """wger's `?language=` query filter is not reliably honored (see the
    function's docstring); the fix checks each translation record's own
    `language` field. A wrong-language record for an id that ALSO has a
    genuine English record must not win the slot, and an id with no
    English record at all must be entirely absent from the index.
    """
    synthetic_translations = [
        # id 165: a non-English record arrives in the response despite
        # the query filter -- must be rejected...
        {"exercise": 165, "name": "Abdominales en Bola de Estabilidad", "language": 4},
        # ...while the genuine English record for the same id is admitted.
        {"exercise": 165, "name": "Ball crunches", "language": wger_import.WGER_LANG_EN},
        # id 200 has only a foreign-language record -- must not appear
        # in the index at all (not even under a foreign name).
        {"exercise": 200, "name": "Beinpresse mit Zusatzgewicht", "language": 1},
    ]
    monkeypatch.setattr(
        wger_import,
        "_paginate",
        lambda client, start_url, max_pages=30: synthetic_translations,
    )

    index = wger_import._fetch_translation_index(client=None)

    assert index[165] == "Ball crunches"
    assert 200 not in index


# --- _normalize_wger: rows with no English translation are skipped --------


def test_normalize_wger_skips_row_with_no_english_translation():
    """`_en_name` is populated exclusively by `_fetch_translation_index`,
    so an empty `_en_name` here stands in for "no genuine English
    translation exists for this row" -- it must be skipped, never
    substituted with a foreign name.
    """
    raw = [
        {"id": 9001, "muscles": [11], "equipment": [10], "_en_name": ""},
        {"id": 9002, "muscles": [11], "equipment": [10], "_en_name": "Ball Crunches"},
    ]

    normalized = wger_import._normalize_wger(raw)

    assert len(normalized) == 1
    assert normalized[0]["name"] == "Ball Crunches"
    assert normalized[0]["id"].startswith("wger-9002-")


# --- Reconcile safety: referenced rows are never deleted -------------------
#
# These use `db_session` (seeded engine: 27 hand-curated exercises, the
# 2 seed workouts, admin + user1) to set up synthetic `wger-...` rows
# exactly as `reconcile_exercises` would find them mid-catalog, without
# ever calling that function (which would attempt a live wger fetch).


def _make_session(db_session, user_id: str, session_id: str) -> WorkoutSession:
    ws = WorkoutSession(
        id=session_id,
        user_id=user_id,
        workout_id=None,
        name="Reconcile test session",
        local_date="2026-08-22",
        started_at="2026-08-22T00:00:00Z",
        ended_at="2026-08-22T00:10:00Z",
        status="completed",
    )
    db_session.add(ws)
    db_session.commit()
    return ws


def _make_historical_set(db_session, user_id: str, session_id: str, exercise_id: str) -> None:
    db_session.add(
        HistoricalSet(
            user_id=user_id,
            session_id=session_id,
            local_date="2026-08-22",
            exercise_id=exercise_id,
            set_index=0,
            kind="working",
            weight=100,
            weight_unit="lb",
            weight_kg=45.36,
            reps=5,
            timestamp="2026-08-22T00:05:00Z",
        )
    )
    db_session.commit()


def test_is_exercise_referenced_true_when_used_by_historical_set(db_session):
    user = db_session.exec(select(User)).first()
    assert user is not None
    exercise_id = "wger-888-referenced-foreign"
    db_session.add(
        Exercise(id=exercise_id, name="Otro Nombre", muscle_group="Other", equipment=["bodyweight"])
    )
    db_session.commit()
    _make_session(db_session, user.id, "ses-reconcile-ref-1")
    _make_historical_set(db_session, user.id, "ses-reconcile-ref-1", exercise_id)

    assert wger_import._is_exercise_referenced(db_session, exercise_id) is True


def test_is_exercise_referenced_true_when_used_by_workout_link(db_session):
    # A row can also be "referenced" via a template link, never having
    # been logged as a set. Use one of the seeded workouts.
    workout = db_session.exec(select(Workout).where(Workout.id == "w-upper-power")).first()
    assert workout is not None
    exercise_id = "wger-777-referenced-via-link"
    db_session.add(
        Exercise(id=exercise_id, name="Otro Ejercicio", muscle_group="Other", equipment=["bodyweight"])
    )
    db_session.commit()
    db_session.add(
        WorkoutExerciseLink(workout_id=workout.id, exercise_id=exercise_id, order_index=99)
    )
    db_session.commit()

    assert wger_import._is_exercise_referenced(db_session, exercise_id) is True


def test_is_exercise_referenced_false_for_unreferenced_row(db_session):
    exercise_id = "wger-999-unreferenced-foreign"
    db_session.add(
        Exercise(id=exercise_id, name="Nombre Extranjero", muscle_group="Other", equipment=["bodyweight"])
    )
    db_session.commit()

    assert wger_import._is_exercise_referenced(db_session, exercise_id) is False


def test_reconcile_delete_phase_keeps_referenced_deletes_unreferenced(db_session):
    """Re-creates `reconcile_exercises`'s phase-2 delete logic inline
    against a controlled `accepted_ids` set that excludes BOTH rows (as
    if a fresh genuine-English import rejected both names) -- the
    critical case from the agenda: a referenced foreign row must survive
    even though it would otherwise be a delete candidate, while an
    unreferenced one is removed.
    """
    user = db_session.exec(select(User)).first()
    assert user is not None
    referenced_id = "wger-888-referenced-foreign"
    unreferenced_id = "wger-999-unreferenced-foreign"
    db_session.add(
        Exercise(id=referenced_id, name="Otro Nombre", muscle_group="Other", equipment=["bodyweight"])
    )
    db_session.add(
        Exercise(id=unreferenced_id, name="Nombre Extranjero", muscle_group="Other", equipment=["bodyweight"])
    )
    db_session.commit()
    _make_session(db_session, user.id, "ses-reconcile-ref-2")
    _make_historical_set(db_session, user.id, "ses-reconcile-ref-2", referenced_id)

    accepted_ids: set[str] = set()  # controlled: neither row is "accepted"

    existing = db_session.exec(select(Exercise).where(Exercise.id.like("wger-%"))).all()
    rejected = [ex for ex in existing if ex.id not in accepted_ids]
    to_delete = [
        ex for ex in rejected if not wger_import._is_exercise_referenced(db_session, ex.id)
    ]
    kept_referenced = [
        ex for ex in rejected if wger_import._is_exercise_referenced(db_session, ex.id)
    ]
    for ex in to_delete:
        db_session.delete(ex)
    db_session.commit()

    remaining_ids = {
        ex.id for ex in db_session.exec(select(Exercise).where(Exercise.id.like("wger-%"))).all()
    }
    assert referenced_id in remaining_ids
    assert unreferenced_id not in remaining_ids
    assert len(kept_referenced) == 1 and kept_referenced[0].id == referenced_id

    # The referenced row's HistoricalSet must still be intact (not
    # orphaned) -- the whole point of the reconcile safety rule.
    still_has_set = db_session.exec(
        select(HistoricalSet).where(HistoricalSet.exercise_id == referenced_id)
    ).first()
    assert still_has_set is not None

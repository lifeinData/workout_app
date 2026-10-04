"""Unit tests for the English-only exercise-name heuristic, plus (A2)
API-level coverage for the normalized/token search and pagination on
`GET /exercises`.

`_is_probably_english` is a pure function (see `app/routers/exercises.py`)
used to filter wger's leaked non-English exercise names out of
`GET /exercises`. Tested directly here since it needs no DB/HTTP fixture.

The search/pagination tests below use `seeded_client`, whose engine only
carries the 27 hand-curated `SEED_EXERCISES` (see conftest.py) -- no wger
import runs for tests, so result counts against that fixed catalog are
deterministic and asserted exactly where convenient.
"""
from app.routers.exercises import _is_probably_english


def test_accepts_plain_english_names():
    assert _is_probably_english("Barbell Bench Press") is True
    assert _is_probably_english("Overhead Press x5") is True


def test_accepts_hyphenated_and_notation_heavy_names():
    # Hyphens, parentheses, digits and the multiplication sign are all
    # legitimate in English exercise names/rep notation.
    assert _is_probably_english("Biceps Curls With SZ-bar") is True
    assert _is_probably_english("Incline Dumbbell Press (2x15)") is True
    assert _is_probably_english("Rep Scheme 2×15") is True


def test_rejects_accented_and_non_latin_names():
    assert _is_probably_english("Abdominales en Bola de Estabilidad") is False
    assert _is_probably_english("Élévation latérale") is False
    assert _is_probably_english("Beinpresse mit Zusatzgewicht") is False


def test_rejects_ascii_names_with_blocklisted_stopwords():
    assert _is_probably_english("Extension Con Mancuerna") is False


def test_does_not_false_positive_on_de_or_do_substrings():
    # "de"/"do" are deliberately excluded from the stopword blocklist —
    # they collide with legitimate English text (e.g. "Deadlift",
    # "Donkey Calf Raise").
    assert _is_probably_english("Deadlift") is True
    assert _is_probably_english("Donkey Calf Raise") is True


def test_empty_name_is_accepted():
    assert _is_probably_english("") is True


# --- A2: normalized/token search, via the API -----------------------------
#
# Headline bug (measured live pre-fix): `q=pullup` -> 0 results even
# though "Pull-ups" (`ex-pullup`) exists, because the old search was a
# raw `ilike '%q%'` and the hyphen in the stored name defeats a plain
# substring match. These assert the fix at the HTTP boundary (the layer
# the client actually calls), not just the normalization helpers.


def _ids(response_json: list[dict]) -> set[str]:
    return {row["id"] for row in response_json}


def test_search_pullup_no_space_finds_pull_ups(seeded_client):
    r = seeded_client.get("/api/v1/exercises", params={"q": "pullup"})
    assert r.status_code == 200
    assert "ex-pullup" in _ids(r.json())


def test_search_pull_up_with_space_finds_pull_ups(seeded_client):
    r = seeded_client.get("/api/v1/exercises", params={"q": "pull up"})
    assert r.status_code == 200
    assert "ex-pullup" in _ids(r.json())


def test_search_pull_hyphen_up_finds_pull_ups(seeded_client):
    r = seeded_client.get("/api/v1/exercises", params={"q": "pull-up"})
    assert r.status_code == 200
    assert "ex-pullup" in _ids(r.json())


def test_search_mixed_case_and_hyphen_finds_pull_ups(seeded_client):
    r = seeded_client.get("/api/v1/exercises", params={"q": "Pull-Ups"})
    assert r.status_code == 200
    assert "ex-pullup" in _ids(r.json())


def test_search_multi_word_token_and_matches_db_floor_press(seeded_client):
    # Token-AND: "db press" -> ["db", "press"], both of which must appear
    # (in either field) for a row to match -- "DB Floor Press" isn't a
    # contiguous substring of "db press" (or vice-versa), so this only
    # passes with token matching, not a single substring check.
    r = seeded_client.get("/api/v1/exercises", params={"q": "db press"})
    assert r.status_code == 200
    assert "ex-db-press" in _ids(r.json())


def test_search_nonsense_query_returns_empty_list(seeded_client):
    r = seeded_client.get("/api/v1/exercises", params={"q": "zzqqxx-nonsense-query"})
    assert r.status_code == 200
    assert r.json() == []
    assert r.headers["X-Total-Count"] == "0"


# --- A2: pagination + total count -----------------------------------------


def test_total_count_header_reflects_filtered_not_raw_total(seeded_client):
    # Full unfiltered catalog is the 27 hand-curated seeds; a narrower
    # search must report the FILTERED total, not 27.
    full = seeded_client.get("/api/v1/exercises", params={"limit": 200})
    assert full.headers["X-Total-Count"] == str(len(full.json()))
    assert full.headers["X-Total-Count"] == "27"

    # "press" (single token) matches exactly 7 seeded names: "Barbell
    # Bench Press", "Incline Dumbbell Press", "Overhead Press", "Leg
    # Press", "DB Floor Press", "DB Shoulder Press", "KB Shoulder Press"
    # (verified directly against `_matches_search_tokens` over
    # `SEED_EXERCISES`, not eyeballed).
    filtered = seeded_client.get("/api/v1/exercises", params={"q": "press"})
    assert filtered.status_code == 200
    assert filtered.headers["X-Total-Count"] == "7"
    assert filtered.headers["X-Total-Count"] != full.headers["X-Total-Count"]
    assert len(filtered.json()) == 7


def test_limit_offset_slice_the_filtered_set(seeded_client):
    # Same 7-row "press" filtered set as above, paged 3-at-a-time.
    page1 = seeded_client.get(
        "/api/v1/exercises", params={"q": "press", "limit": 3, "offset": 0}
    )
    page2 = seeded_client.get(
        "/api/v1/exercises", params={"q": "press", "limit": 3, "offset": 3}
    )
    page3 = seeded_client.get(
        "/api/v1/exercises", params={"q": "press", "limit": 3, "offset": 6}
    )
    assert page1.status_code == 200 and page2.status_code == 200 and page3.status_code == 200
    assert len(page1.json()) == 3
    assert len(page2.json()) == 3
    assert len(page3.json()) == 1

    # Total count is stable across pages and equals the filtered total,
    # not the raw table count.
    assert page1.headers["X-Total-Count"] == "7"
    assert page2.headers["X-Total-Count"] == "7"
    assert page3.headers["X-Total-Count"] == "7"

    # The pages are pairwise disjoint and together cover the whole
    # filtered set.
    ids1, ids2, ids3 = _ids(page1.json()), _ids(page2.json()), _ids(page3.json())
    assert ids1.isdisjoint(ids2)
    assert ids1.isdisjoint(ids3)
    assert ids2.isdisjoint(ids3)
    whole = seeded_client.get("/api/v1/exercises", params={"q": "press", "limit": 10})
    assert ids1 | ids2 | ids3 == _ids(whole.json())


def test_offset_past_filtered_total_returns_empty_but_keeps_total(seeded_client):
    r = seeded_client.get(
        "/api/v1/exercises", params={"q": "press", "limit": 10, "offset": 7}
    )
    assert r.status_code == 200
    assert r.json() == []
    # The total count still reflects the full filtered set (7), even
    # though this page itself is empty.
    assert r.headers["X-Total-Count"] == "7"

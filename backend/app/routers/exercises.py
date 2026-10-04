import re

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import Exercise
from app.schemas import ExerciseResponse

router = APIRouter(prefix="/exercises", tags=["exercises"])

# Max page size: large enough for the exercise picker to show every
# wger seed + hand-curated rows in one page. Past 1000 the JSON
# payload starts to feel heavy on cold start; 500 is the sweet spot.
EXERCISES_MAX_LIMIT = 500

# --- English-only name filter -----------------------------------------
#
# wger's seed data leaks non-English exercise names even though
# `wger_import.py` requests `language={WGER_LANG_EN}` on both the
# `/exercise/` and `/exercise-translation/` endpoints. Confirmed by
# inspecting `backend/fixtures/wger_cache.json`: many exercise ids
# (e.g. id 165, "_en_name": "Abdominales en Bola de Estabilidad") simply
# have NO English translation upstream in wger's dataset, so the
# translation index falls back to whatever the API actually returned for
# that id under the `language=2` filter — Spanish in these cases. This is
# a data-quality gap in wger's own translation coverage, not a bug in our
# request. The rows are real Exercise rows in the DB (we don't delete
# them — a future language-preference feature may want them), so they
# must be filtered out at query time instead.
#
# Any character outside the ASCII range signals a non-English name,
# EXCEPT the multiplication sign "×" (U+00D7), which legitimately shows
# up in English exercise names/notation (e.g. rep schemes like "2×15").
# This single regex catches accented Latin letters (á é í ó ú ñ ü ö ä ß
# ç, etc.) as well as any other non-Latin script.
_NON_ASCII_EXCEPT_TIMES = re.compile(r"[^\x00-\x7F×]")

# Small blocklist of high-signal foreign stopwords, matched as a whole
# word (case-insensitive) so it doesn't fire on substrings inside
# legitimate English words (e.g. "de" must not match inside "Deadlift").
#
# "de" and "do" are deliberately EXCLUDED even though they're common
# Spanish/Portuguese words: both collide with plausible English exercise
# text/abbreviations, and a non-English name with no diacritics at all
# (already caught by `_NON_ASCII_EXCEPT_TIMES`) is rare. Rejecting on
# "de"/"do" alone would trade a small leak-catch for real false
# positives, so they are not used as a standalone signal.
_STOPWORD_BLOCKLIST = {"en", "con", "para", "mit", "und", "der", "die", "com", "da"}
_STOPWORD_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(w) for w in _STOPWORD_BLOCKLIST) + r")\b",
    re.IGNORECASE,
)


def _is_probably_english(name: str) -> bool:
    """Heuristic: does `name` look like an English exercise name?

    Rule (exact, in order):
      1. Reject if the name contains any character outside ASCII, other
         than "×" (allowed because it's used in English rep notation like
         "2×15"). This catches accented Latin letters (á é í ó ú ñ ü ö ä
         ß ç, ...) and any non-Latin script.
      2. Otherwise reject if the (ASCII-only) name contains a whole-word,
         case-insensitive match against a small foreign-stopword
         blocklist: en, con, para, mit, und, der, die, com, da.
         ("de"/"do" are intentionally excluded — see blocklist comment.)
      3. Otherwise accept.

    Pure function, no I/O — safe to unit test directly.
    """
    if not name:
        return True
    if _NON_ASCII_EXCEPT_TIMES.search(name):
        return False
    if _STOPWORD_PATTERN.search(name):
        return False
    return True


# --- Search normalization -----------------------------------------------
#
# The old search was a raw `ilike '%q%'` against `name`/`muscle_group`.
# Measured live: `q=pullup` -> 0 results, `q=pull up` -> 1, even though
# "Pull-ups" exists — the hyphen in the stored name defeats a plain
# substring match. Fix: normalize both the query and the candidate text
# (lowercase, strip punctuation, collapse whitespace) before comparing,
# and split the query into tokens so multi-word queries don't need to be
# a contiguous substring of the name.
_PUNCTUATION_RE = re.compile(r"[-.,/'()]")
_WHITESPACE_RE = re.compile(r"\s+")


def _normalize_search_text(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace.

    Punctuation (- . ( ) , / ') is removed outright rather than replaced
    with a space, so "pull-up" and "pullup" both normalize toward the
    same substring ("pullup"/"pullups"). Genuine word breaks (spaces)
    are preserved and collapsed so multi-word queries can still be split
    into tokens.
    """
    if not text:
        return ""
    text = text.lower()
    text = _PUNCTUATION_RE.sub("", text)
    text = _WHITESPACE_RE.sub(" ", text).strip()
    return text


def _matches_search_tokens(tokens: list[str], name_norm: str, muscle_group_norm: str) -> bool:
    """True if every token is a substring of the normalized name or muscle group.

    Each token is checked independently against (name_norm OR
    muscle_group_norm). This is an AND across tokens — `"db press"` ->
    tokens `["db", "press"]`, both of which must appear (in either
    field) for a row to match, e.g. both appear in "db floor press"
    even though "db press" isn't a contiguous substring of that name.
    """
    return all(token in name_norm or token in muscle_group_norm for token in tokens)


@router.get("", response_model=list[ExerciseResponse])
def list_exercises(
    response: Response,
    session: Session = Depends(get_session),
    muscle_group: str | None = Query(default=None, max_length=100),
    equipment: str | None = Query(default=None, max_length=50),
    q: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=EXERCISES_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    lang: str = Query(default="en", max_length=10),
) -> list[Exercise]:
    # `muscle_group` is an exact-match filter (unrelated to free-text
    # search) and stays in SQL — cheap and precise.
    stmt = select(Exercise)
    if muscle_group:
        stmt = stmt.where(Exercise.muscle_group == muscle_group)
    rows = session.exec(stmt).all()

    # Equipment, the English-only filter, and free-text search all need
    # per-row logic SQLite can't express portably (JSON membership,
    # ASCII/diacritic detection, punctuation-normalized substring/token
    # matching). We apply them here, in Python, over the catalog
    # (~1k rows — cheap), THEN paginate, so `limit`/`offset` and the
    # total count describe the real filtered result set rather than
    # under-counting rows that get dropped after the SQL query runs.
    if equipment:
        rows = [r for r in rows if equipment in r.equipment]

    # `lang` is a seam for a future settings toggle; only "en" (the
    # default) is actually enforced today. Any other value skips the
    # English-only filter rather than erroring, so the param is
    # forward-compatible with a future multi-language catalog.
    if lang == "en":
        rows = [r for r in rows if _is_probably_english(r.name)]

    if q:
        query_tokens = _normalize_search_text(q).split()
        if not query_tokens:
            rows = []
        else:
            rows = [
                r
                for r in rows
                if _matches_search_tokens(
                    query_tokens,
                    _normalize_search_text(r.name),
                    _normalize_search_text(r.muscle_group or ""),
                )
            ]

    response.headers["X-Total-Count"] = str(len(rows))
    return rows[offset : offset + limit]


@router.get("/{exercise_id}", response_model=ExerciseResponse)
def get_exercise(exercise_id: str, session: Session = Depends(get_session)) -> Exercise:
    ex = session.get(Exercise, exercise_id)
    if ex is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    return ex

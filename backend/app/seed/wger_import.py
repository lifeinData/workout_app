"""Seed the database with exercises, default workouts, and initial users.

Idempotent at the row level. The whole seed chain only fires when the
on-disk schema version (`backend/.schema_version`) doesn't match
`settings.app.schema_version`. Bumping the version in `defaults.yaml`
wipes `workout.db` and re-seeds from scratch — so admin-edited workouts,
user history, and PRs are lost on schema bumps. Don't bump it casually.

wger v2 API quirk: the `/exercise/` endpoint returns exercises
without English names. The names live in `/exercise-translation/`
indexed by `language=2` (English). To build a complete exercise
catalog we need TWO paged fetches and a join.

CLI: python -m app.seed.wger_import
"""

from __future__ import annotations

import json
import logging
import re
import time
from pathlib import Path
from typing import Any

import httpx
from sqlmodel import Session, select

from app import db as db_module
from app.config import get_settings
from app.db import get_session, init_db
from app.models import Exercise
from app.seed.exercise_seeds import SEED_EXERCISES
from app.seed.initial_users import seed_initial_users
from app.seed.mappings import wger_equipment_to_enum, wger_muscle_to_group
from app.seed.workout_seeds import seed_workouts

logger = logging.getLogger(__name__)

WGER_API = "https://wger.de/api/v2"
WGER_TIMEOUT = 20.0
WGER_LANG_EN = 2
WGER_PAGE_SIZE = 100

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
WGER_CACHE_PATH = BACKEND_DIR / "fixtures" / "wger_cache.json"
SCHEMA_VERSION_FILE = BACKEND_DIR / ".schema_version"


def _slugify(text: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return text[:48] or "exercise"


def _generate_exercise_id(wger_id: int, name: str) -> str:
    """Stable ID derived from wger's own row ID + a slug, so re-seeding
    the same wger data produces the same row IDs (idempotent at the
    row level, not just the slug).
    """
    return f"wger-{wger_id}-{_slugify(name)[:20]}"


def _get_json(client: httpx.Client, url: str) -> tuple[list[dict[str, Any]], str | None]:
    """Fetch one page from a wger list endpoint."""
    resp = client.get(url)
    resp.raise_for_status()
    data = resp.json()
    return list(data.get("results", [])), data.get("next")


def _paginate(client: httpx.Client, start_url: str, max_pages: int = 30) -> list[dict[str, Any]]:
    """Paged fetch using the wger 'next' link. Safety-capped at max_pages."""
    results: list[dict[str, Any]] = []
    url: str | None = start_url
    pages = 0
    while url and pages < max_pages:
        page, next_url = _get_json(client, url)
        results.extend(page)
        url = next_url
        pages += 1
    return results


def _fetch_translation_index(client: httpx.Client) -> dict[int, str]:
    """Fetch all English translations and return {exercise_id: name}."""
    url = f"{WGER_API}/exercise-translation/?language={WGER_LANG_EN}&limit={WGER_PAGE_SIZE}"
    translations = _paginate(client, url)
    index: dict[int, str] = {}
    for t in translations:
        ex_id = t.get("exercise")
        name = (t.get("name") or "").strip()
        if ex_id and name and ex_id not in index:
            index[ex_id] = name
    logger.info("Built translation index: %d unique exercise names", len(index))
    return index


def _fetch_exercises_raw(client: httpx.Client) -> list[dict[str, Any]]:
    """Fetch all exercise records (metadata, no names)."""
    url = f"{WGER_API}/exercise/?language={WGER_LANG_EN}&limit={WGER_PAGE_SIZE}"
    return _paginate(client, url)


def _fetch_wger_payload() -> list[dict[str, Any]] | None:
    """Fetch exercises AND their English names from wger. Returns None on failure."""
    headers = {"Accept": "application/json", "User-Agent": "workout-app-seed/0.1"}
    try:
        with httpx.Client(timeout=WGER_TIMEOUT, headers=headers) as client:
            exercises = _fetch_exercises_raw(client)
            logger.info("Fetched %d exercise records from wger (raw)", len(exercises))
            # wger's pagination occasionally yields duplicate rows across
            # page boundaries; dedupe by `id` keeping the first occurrence.
            seen: set[int] = set()
            unique: list[dict[str, Any]] = []
            for ex in exercises:
                pk = ex.get("id")
                if pk in seen:
                    continue
                seen.add(pk)
                unique.append(ex)
            logger.info("After dedup: %d unique exercise records", len(unique))
            name_index = _fetch_translation_index(client)
            for ex in unique:
                ex["_en_name"] = name_index.get(ex.get("id"), "")
            return unique
    except (httpx.HTTPError, httpx.RequestError, json.JSONDecodeError) as exc:
        logger.warning("wger fetch failed: %s", exc)
        return None


def _load_cache() -> list[dict[str, Any]] | None:
    if not WGER_CACHE_PATH.exists():
        return None
    try:
        return json.loads(WGER_CACHE_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Cache load failed: %s", exc)
        return None


def _save_cache(data: list[dict[str, Any]]) -> None:
    WGER_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    WGER_CACHE_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _normalize_wger(raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert wger exercise+translation records into our Exercise row dicts.

    Also dedupes: two raw records with the same `id` (one with an
    English translation, one without) become a single row.
    """
    by_id: dict[int, dict[str, Any]] = {}
    for item in raw:
        name = (item.get("_en_name") or "").strip()
        if not name:
            continue
        wger_pk = int(item.get("id", 0))
        if not wger_pk:
            continue
        if wger_pk in by_id:
            existing = by_id[wger_pk]
            if existing.get("muscles") or existing.get("equipment"):
                continue
        primary_muscles = item.get("muscles") or []
        muscle_group = wger_muscle_to_group(primary_muscles[0]) if primary_muscles else "Other"
        equipment_ids = item.get("equipment") or []
        equipment = [wger_equipment_to_enum(eid) for eid in equipment_ids if eid is not None]
        if not equipment:
            equipment = ["bodyweight"]
        by_id[wger_pk] = {
            "id": _generate_exercise_id(wger_pk, name),
            "name": name[:200],
            "muscle_group": muscle_group,
            "equipment": equipment,
            "yt_id": None,
            "default_sets": 3,
            "default_reps_label": "8-12",
            "pr_trackable": False,
        }
    return list(by_id.values())


def _upsert_exercises(session: Session, exercises: list[dict[str, Any]]) -> int:
    existing_ids = {e.id for e in session.exec(select(Exercise)).all()}
    added = 0
    for ex in exercises:
        if ex["id"] in existing_ids:
            continue
        session.add(Exercise(**ex))
        added += 1
    session.commit()
    return added


def _ensure_seed_exercises(session: Session) -> int:
    return _upsert_exercises(session, SEED_EXERCISES)


def seed_exercises(session: Session) -> int:
    """Pull exercises from wger (with cache + hand-curated fallback).

    Returns the count of exercises added. Does NOT seed workouts or users;
    call `seed_workouts` and `seed_initial_users` separately.
    """
    raw = _fetch_wger_payload()
    if raw:
        _save_cache(raw)
        normalized = _normalize_wger(raw)
        added = _upsert_exercises(session, normalized)
        logger.info("Inserted %d wger exercises (of %d with English names)", added, len(normalized))
    else:
        cached = _load_cache()
        if cached:
            normalized = _normalize_wger(cached)
            added = _upsert_exercises(session, normalized)
            logger.info("Inserted %d exercises from cache", added)
        else:
            logger.warning("No wger, no cache; relying on hand-curated seeds only")

    seed_added = _ensure_seed_exercises(session)
    if seed_added:
        logger.info("Inserted %d hand-curated exercises", seed_added)

    return len(session.exec(select(Exercise)).all())


def _read_schema_version_file() -> int | None:
    if not SCHEMA_VERSION_FILE.exists():
        return None
    try:
        return int(SCHEMA_VERSION_FILE.read_text(encoding="utf-8").strip())
    except (ValueError, OSError) as exc:
        logger.warning("Could not read %s: %s", SCHEMA_VERSION_FILE, exc)
        return None


def _write_schema_version_file(version: int) -> None:
    SCHEMA_VERSION_FILE.write_text(str(version), encoding="utf-8")


def _wipe_sqlite_db() -> None:
    """Dispose connections and delete the SQLite file (if file-backed)."""
    url = db_module.engine.url
    db_module.engine.dispose()
    db_path: Path | None = None
    if url.drivername.startswith("sqlite") and url.database and url.database != ":memory:":
        db_path = Path(url.database)
    if db_path is not None and db_path.exists():
        db_path.unlink()
        logger.info("Deleted DB file at %s", db_path)


def seed_if_schema_changed() -> int:
    """Seed the DB iff the on-disk schema version differs from config.

    Behavior:
      - If `.schema_version` matches `settings.app.schema_version` AND the
        `exercises` table is non-empty, return 0 (preserves user data).
      - Otherwise: wipe the DB file, re-create tables, seed exercises +
        the configured default workouts + the configured initial users,
        then write the new schema version to disk. Wipe + seed is
        wrapped in try/except so a failure leaves an empty (recoverable)
        DB rather than a half-populated one.

    Returns the total exercise count after seeding (0 on no-op).
    """
    settings = get_settings()
    target_version = settings.app.schema_version
    current_version = _read_schema_version_file()

    init_db()  # cheap; safe to call on a non-empty DB.

    if current_version == target_version:
        session = next(get_session())
        try:
            existing = session.exec(select(Exercise)).first()
        finally:
            session.close()
        if existing is not None:
            logger.info(
                "Schema version %d matches and DB is populated; skipping seed",
                target_version,
            )
            return 0
        logger.info(
            "Schema version %d matches but DB is empty; re-seeding",
            target_version,
        )

    logger.info(
        "Schema version change: on-disk=%s, target=%d. Wiping and re-seeding.",
        current_version,
        target_version,
    )

    try:
        _wipe_sqlite_db()
        init_db()

        session = next(get_session())
        try:
            total_exercises = seed_exercises(session)
            workout_count = seed_workouts(session, settings)
            user_count = seed_initial_users(session, settings)
            logger.info(
                "Seed: %d exercises, %d workouts, %d users",
                total_exercises,
                workout_count,
                user_count,
            )
        finally:
            session.close()

        _write_schema_version_file(target_version)
        return total_exercises
    except Exception:
        # Roll back to a clean empty DB so the next start doesn't see
        # a half-seeded state. Schema-version file is intentionally
        # NOT written so a retry will trigger a re-seed.
        logger.exception("Seed failed; wiping back to empty DB")
        try:
            _wipe_sqlite_db()
            init_db()
        except Exception:
            logger.exception("Recovery wipe also failed")
        raise


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    started = time.time()
    count = seed_if_schema_changed()
    logger.info("Seed complete. %d exercises total. Took %.1fs", count, time.time() - started)


if __name__ == "__main__":
    main()

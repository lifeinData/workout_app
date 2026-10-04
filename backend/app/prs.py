"""Personal-record maintenance.

Two independently-tracked bests per (user, exercise):
  - `best_weight_kg`   the heaviest single working set
  - `best_e1rm_kg`     the best estimated 1RM (Epley), which can come
                       from a different set than the heaviest single
                       (e.g. 5x225 has a higher e1RM than 1x235)

Warmup sets (`kind == "warmup"`) never count towards either best and
are excluded from every volume total elsewhere in the codebase.

Callers stage changes onto the passed `session` and are responsible for
committing — these functions never call `session.commit()`.
"""

from __future__ import annotations

from sqlmodel import Session as SQLModelSession, select

from app.models import HistoricalSet, PersonalRecord
from app.timefmt import utc_now_iso
from app.units import epley_e1rm_kg


def recompute_pr(
    session: SQLModelSession, user_id: str, exercise_id: str
) -> PersonalRecord | None:
    """Rebuild both bests from every remaining working set.

    Used after a delete or an edit, where the previous best set may no
    longer qualify. If no working sets remain, the PR row is deleted
    (staged) and `None` is returned.
    """
    working_sets = session.exec(
        select(HistoricalSet)
        .where(HistoricalSet.user_id == user_id)
        .where(HistoricalSet.exercise_id == exercise_id)
        .where(HistoricalSet.kind == "working")
    ).all()

    pr = session.get(PersonalRecord, (user_id, exercise_id))

    if not working_sets:
        if pr is not None:
            session.delete(pr)
        return None

    best_weight_set = max(
        working_sets, key=lambda s: (s.weight_kg, s.reps)
    )
    best_e1rm_set = max(
        working_sets, key=lambda s: epley_e1rm_kg(s.weight_kg, s.reps)
    )
    now = utc_now_iso()

    if pr is None:
        pr = PersonalRecord(
            user_id=user_id,
            exercise_id=exercise_id,
            best_weight_kg=best_weight_set.weight_kg,
            best_weight_reps=best_weight_set.reps,
            best_weight_date=best_weight_set.local_date,
            best_e1rm_kg=epley_e1rm_kg(best_e1rm_set.weight_kg, best_e1rm_set.reps),
            best_e1rm_weight_kg=best_e1rm_set.weight_kg,
            best_e1rm_reps=best_e1rm_set.reps,
            best_e1rm_date=best_e1rm_set.local_date,
            updated_at=now,
        )
    else:
        pr.best_weight_kg = best_weight_set.weight_kg
        pr.best_weight_reps = best_weight_set.reps
        pr.best_weight_date = best_weight_set.local_date
        pr.best_e1rm_kg = epley_e1rm_kg(best_e1rm_set.weight_kg, best_e1rm_set.reps)
        pr.best_e1rm_weight_kg = best_e1rm_set.weight_kg
        pr.best_e1rm_reps = best_e1rm_set.reps
        pr.best_e1rm_date = best_e1rm_set.local_date
        pr.updated_at = now
    session.add(pr)
    return pr


def apply_set_to_pr(
    session: SQLModelSession,
    user_id: str,
    exercise_id: str,
    s: HistoricalSet,
) -> tuple[bool, PersonalRecord | None]:
    """Incremental PR update for a single newly-inserted set.

    Cheaper than `recompute_pr` for the common insert path (no need to
    re-scan every set). Returns `(is_pr, pr_row)` where `is_pr` is True
    if EITHER the weight best or the e1RM best improved. Warmup sets
    never affect PRs and short-circuit to `(False, existing)`.
    """
    if s.kind == "warmup":
        return False, session.get(PersonalRecord, (user_id, exercise_id))

    pr = session.get(PersonalRecord, (user_id, exercise_id))
    e1rm = epley_e1rm_kg(s.weight_kg, s.reps)
    now = utc_now_iso()

    if pr is None:
        pr = PersonalRecord(
            user_id=user_id,
            exercise_id=exercise_id,
            best_weight_kg=s.weight_kg,
            best_weight_reps=s.reps,
            best_weight_date=s.local_date,
            best_e1rm_kg=e1rm,
            best_e1rm_weight_kg=s.weight_kg,
            best_e1rm_reps=s.reps,
            best_e1rm_date=s.local_date,
            updated_at=now,
        )
        session.add(pr)
        return True, pr

    improved = False
    if (s.weight_kg, s.reps) > (pr.best_weight_kg, pr.best_weight_reps):
        pr.best_weight_kg = s.weight_kg
        pr.best_weight_reps = s.reps
        pr.best_weight_date = s.local_date
        improved = True
    if e1rm > pr.best_e1rm_kg:
        pr.best_e1rm_kg = e1rm
        pr.best_e1rm_weight_kg = s.weight_kg
        pr.best_e1rm_reps = s.reps
        pr.best_e1rm_date = s.local_date
        improved = True

    if improved:
        pr.updated_at = now
        session.add(pr)
    return improved, pr

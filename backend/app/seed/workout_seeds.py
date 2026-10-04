"""Seeds the default starter workouts.

The IDs match those used in the React Native app so the client's
existing references (e.g. 'ex-bench', 'w-upper-power') continue
to work without migration.

The catalog below is the full hand-curated set; the seeder only
inserts the subset listed in `settings.seed.default_workout_ids`
(typically just `w-upper-power` and `w-home-bw`). Keeping the rest
around as inert data makes it easy to re-introduce them later by
just bumping `schema_version` and adding the id to the config.
"""

from sqlmodel import Session, select

from app.config import Settings
from app.models import Exercise, User, Workout, WorkoutExerciseLink
from app.routers._helpers import recompute_equipment
from app.timefmt import utc_now_iso
from app.seed.exercise_seeds import SEED_EXERCISES

# Idempotent: existing rows are left untouched, even if their name differs from SEED_EXERCISES.

# (id, name, equipment, duration_min, [exercises in order])
#
# Each exercise entry carries a per-workout prescription
# (target_sets/target_reps/target_rest_sec) — the
# same exercise can be prescribed differently in a different workout,
# so this lives on the link, not on the Exercise row.
SEED_WORKOUTS: list[dict] = [
    {
        "id": "w-upper-power",
        "name": "Upper Body Power",
        "equipment": ["barbell", "dumbbells", "cable"],
        "duration_min": 60,
        "exercises": [
            # Compounds: lower reps, longer rest.
            {"id": "ex-bench", "target_sets": 4, "target_reps": 5, "target_rest_sec": 150},
            {"id": "ex-ohp", "target_sets": 4, "target_reps": 5, "target_rest_sec": 150},
            # Accessories: higher reps, shorter rest.
            {"id": "ex-incline-db", "target_sets": 3, "target_reps": 10, "target_rest_sec": 60},
            {"id": "ex-cable-fly", "target_sets": 3, "target_reps": 10, "target_rest_sec": 60},
            {"id": "ex-lateral", "target_sets": 3, "target_reps": 10, "target_rest_sec": 60},
        ],
    },
    {
        "id": "w-home-bw",
        "name": "No-Equipment Burner",
        "equipment": ["bodyweight"],
        "duration_min": 25,
        "exercises": [
            {"id": "ex-pushup", "target_sets": 3, "target_reps": 12, "target_rest_sec": 45},
            {"id": "ex-airsquat", "target_sets": 3, "target_reps": 12, "target_rest_sec": 45},
            {"id": "ex-lunge", "target_sets": 3, "target_reps": 12, "target_rest_sec": 45},
            {"id": "ex-plank", "target_sets": 3, "target_reps": 12, "target_rest_sec": 45},
        ],
    },
]


def seed_workouts(session: Session, settings: Settings) -> int:
    """Insert the configured default workouts and their exercise links.

    Only inserts workouts whose ID appears in
    `settings.seed.default_workout_ids`. Skips silently if a workout
    with the same ID already exists (so coach edits survive re-seed).

    Ensures the referenced exercises exist first by upserting from
    SEED_EXERCISES (so seed workouts work even if wger import failed).
    """
    for ex_def in SEED_EXERCISES:
        if session.get(Exercise, ex_def["id"]) is None:
            session.add(Exercise(**ex_def))
    session.commit()

    wanted_ids = settings.seed.default_workout_ids
    by_id = {w["id"]: w for w in SEED_WORKOUTS}

    # Attribution: the creator user must already be seeded (users run first).
    creator_name = settings.seed.coaching.default_workout_creator
    creator_id: str | None = None
    if creator_name:
        creator = session.exec(select(User).where(User.username == creator_name.lower())).first()
        creator_id = creator.id if creator else None

    count = 0
    for wid in wanted_ids:
        w_def = by_id.get(wid)
        if w_def is None:
            continue
        if session.get(Workout, wid) is not None:
            continue

        session.add(
            Workout(
                id=w_def["id"],
                name=w_def["name"],
                equipment=w_def["equipment"],
                duration_min=w_def["duration_min"],
                created_by=creator_id,
                created_at=utc_now_iso(),
            )
        )

        existing_links = session.exec(
            select(WorkoutExerciseLink).where(WorkoutExerciseLink.workout_id == wid)
        ).all()
        for link in existing_links:
            session.delete(link)
        session.flush()

        for idx, ex_def in enumerate(w_def["exercises"]):
            session.add(
                WorkoutExerciseLink(
                    workout_id=wid,
                    exercise_id=ex_def["id"],
                    order_index=idx,
                    target_sets=ex_def["target_sets"],
                    target_reps=ex_def["target_reps"],
                    target_rest_sec=ex_def["target_rest_sec"],
                )
            )
        session.flush()
        recompute_equipment(session, session.get(Workout, wid))
        count += 1

    session.commit()
    return count

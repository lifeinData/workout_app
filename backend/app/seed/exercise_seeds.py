"""Exercise seed data — the 25 hand-curated exercises from
workoutLibrary.ts. Used as a fallback when wger is unavailable
and as a guarantee that the IDs the app references exist in DB.
"""

SEED_EXERCISES: list[dict] = [
    {"id": "ex-bench",         "name": "Barbell Bench Press",    "muscle_group": "Chest",      "equipment": ["barbell"],   "yt_id": "rT7DgCr-3pg", "default_sets": 4, "default_reps_label": "6-8",   "pr_trackable": True},
    {"id": "ex-incline-db",    "name": "Incline Dumbbell Press", "muscle_group": "Chest",      "equipment": ["dumbbells"], "yt_id": "8iPEnn-ltC8", "default_sets": 3, "default_reps_label": "8-10"},
    {"id": "ex-cable-fly",     "name": "Cable Flyes",            "muscle_group": "Chest",      "equipment": ["cable"],     "yt_id": "Iwe6AmxVf7o", "default_sets": 3, "default_reps_label": "12-15"},
    {"id": "ex-ohp",           "name": "Overhead Press",         "muscle_group": "Shoulders",  "equipment": ["barbell"],   "yt_id": "2yjwXTZQDDI", "default_sets": 4, "default_reps_label": "6-8",   "pr_trackable": True},
    {"id": "ex-lateral",       "name": "Lateral Raises",         "muscle_group": "Shoulders",  "equipment": ["dumbbells"], "yt_id": "OuG1smZTsQQ", "default_sets": 3, "default_reps_label": "12-15"},
    {"id": "ex-deadlift",      "name": "Conventional Deadlift",  "muscle_group": "Back",       "equipment": ["barbell"],   "yt_id": "op9kVnSso6Q", "default_sets": 4, "default_reps_label": "3-5",   "pr_trackable": True},
    {"id": "ex-pullup",        "name": "Pull-ups",               "muscle_group": "Back",       "equipment": ["bodyweight"], "yt_id": "eGo4IYlbE5g", "default_sets": 4, "default_reps_label": "AMRAP", "pr_trackable": True},
    {"id": "ex-row",           "name": "Barbell Row",            "muscle_group": "Back",       "equipment": ["barbell"],   "yt_id": "vT2GjY_Umpw", "default_sets": 3, "default_reps_label": "8-10"},
    {"id": "ex-curl",          "name": "DB Bicep Curl",          "muscle_group": "Biceps",     "equipment": ["dumbbells"], "yt_id": "ykJmrZ5v0Oo", "default_sets": 3, "default_reps_label": "10-12"},
    {"id": "ex-squat",         "name": "Back Squat",             "muscle_group": "Quads",      "equipment": ["barbell"],   "yt_id": "ultWZbUMPL8", "default_sets": 5, "default_reps_label": "5",     "pr_trackable": True},
    {"id": "ex-rdl",           "name": "Romanian Deadlift",      "muscle_group": "Hamstrings", "equipment": ["barbell"],   "yt_id": "jEy_czb3RKA", "default_sets": 4, "default_reps_label": "8-10"},
    {"id": "ex-legpress",      "name": "Leg Press",              "muscle_group": "Quads",      "equipment": ["machine"],   "yt_id": "IZxyjW7MPJQ", "default_sets": 3, "default_reps_label": "10-12"},
    {"id": "ex-calf",          "name": "Calf Raises",            "muscle_group": "Calves",     "equipment": ["machine"],   "yt_id": "JbyjNymZOt0", "default_sets": 4, "default_reps_label": "12-15"},
    {"id": "ex-db-press",      "name": "DB Floor Press",         "muscle_group": "Chest",      "equipment": ["dumbbells"], "yt_id": "qOSb86_LDXE", "default_sets": 4, "default_reps_label": "8-10"},
    {"id": "ex-db-row",        "name": "DB Bent Row",            "muscle_group": "Back",       "equipment": ["dumbbells"], "yt_id": "roCP6wCXPqo", "default_sets": 4, "default_reps_label": "10"},
    {"id": "ex-db-press-sh",   "name": "DB Shoulder Press",      "muscle_group": "Shoulders",  "equipment": ["dumbbells"], "yt_id": "qEwKCR5JCog", "default_sets": 3, "default_reps_label": "10-12"},
    {"id": "ex-db-curl",       "name": "DB Curl",                "muscle_group": "Biceps",     "equipment": ["dumbbells"], "yt_id": "ykJmrZ5v0Oo", "default_sets": 3, "default_reps_label": "12"},
    {"id": "ex-pushup",        "name": "Push-ups",               "muscle_group": "Chest",      "equipment": ["bodyweight"], "yt_id": "IODxDxX7oi4", "default_sets": 4, "default_reps_label": "AMRAP"},
    {"id": "ex-airsquat",      "name": "Air Squats",             "muscle_group": "Quads",      "equipment": ["bodyweight"], "yt_id": "aclHkVaku9U", "default_sets": 4, "default_reps_label": "20"},
    {"id": "ex-lunge",         "name": "Walking Lunges",         "muscle_group": "Legs",       "equipment": ["bodyweight"], "yt_id": "L8fvypPrzzs", "default_sets": 3, "default_reps_label": "12/leg"},
    {"id": "ex-plank",         "name": "Plank",                  "muscle_group": "Core",       "equipment": ["bodyweight"], "yt_id": "pSHjTRCQxIw", "default_sets": 3, "default_reps_label": "45 sec"},
    {"id": "ex-band-row",      "name": "Band Bent Row",          "muscle_group": "Back",       "equipment": ["bands"],     "yt_id": "fH6KK_T8X28", "default_sets": 4, "default_reps_label": "15"},
    {"id": "ex-band-pull",     "name": "Band Pull-Apart",        "muscle_group": "Rear Delt",  "equipment": ["bands"],     "yt_id": "I_5wIYzzUmU", "default_sets": 3, "default_reps_label": "20"},
    {"id": "ex-band-curl",     "name": "Band Curl",              "muscle_group": "Biceps",     "equipment": ["bands"],     "yt_id": "NFzTWp2qpiE", "default_sets": 3, "default_reps_label": "15"},
    {"id": "ex-kb-swing",      "name": "Kettlebell Swing",       "muscle_group": "Posterior",  "equipment": ["kettlebell"], "yt_id": "sSESeQRpA08", "default_sets": 5, "default_reps_label": "20"},
    {"id": "ex-kb-goblet",     "name": "Goblet Squat",           "muscle_group": "Quads",      "equipment": ["kettlebell"], "yt_id": "MeIiIdhvXT4", "default_sets": 4, "default_reps_label": "12"},
    {"id": "ex-kb-press",      "name": "KB Shoulder Press",      "muscle_group": "Shoulders",  "equipment": ["kettlebell"], "yt_id": "lFV9NQpWAQU", "default_sets": 4, "default_reps_label": "8/side"},
]

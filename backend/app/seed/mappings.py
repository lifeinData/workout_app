"""Maps wger's integer IDs for muscles and equipment to our enum strings.

Source: wger's `muscles` and `equipment` API endpoints
(https://wger.de/api/v2/).

Add new mappings here when wger's data changes. Keep this file
data-only and side-effect-free.
"""

# wger muscle IDs -> our muscle group strings
# https://github.com/wger-project/wger/blob/master/wger/exercises/models/muscle.py
WGER_MUSCLE_MAP: dict[int, str] = {
    1: "Biceps",
    2: "Triceps",
    3: "Shoulders",  # Anterior deltoid
    4: "Chest",      # Pectoralis major
    5: "Lats",       # Latissimus dorsi
    6: "Upper Back", # Trapezius
    7: "Lower Back", # Erector spinae
    8: "Quads",
    9: "Hamstrings",
    10: "Glutes",
    11: "Calves",
    12: "Forearms",
    13: "Core",       # Abdominis
    14: "Traps",      # Trapezius (lower)
    15: "Hip Flexors",
    16: "Adductors",
}

# wger equipment IDs -> our Equipment enum
# https://github.com/wger-project/wger/blob/master/wger/exercises/models/equipment.py
WGER_EQUIPMENT_MAP: dict[int, str] = {
    1: "barbell",
    2: "dumbbells",
    3: "machine",  # gym machine
    4: "bodyweight",  # none / mat
    5: "bands",    # Swiss ball -> keep as bands; wger Swiss ball != resistance band but we don't have a better bucket
    6: "kettlebell",
    7: "bodyweight",  # bodyweight (no explicit ID 7 in old versions; placeholder)
    8: "cable",
    9: "bands",     # resistance band
    10: "barbell",  # barbell (EZ bar etc.) -> barbell
    11: "dumbbells",  # dumbbell
}


def wger_muscle_to_group(muscle_id: int) -> str:
    return WGER_MUSCLE_MAP.get(muscle_id, "Other")


def wger_equipment_to_enum(equipment_id: int) -> str:
    return WGER_EQUIPMENT_MAP.get(equipment_id, "bodyweight")

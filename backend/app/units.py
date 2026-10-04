"""Weight-unit conversion and estimated-1RM math.

All PR/e1RM comparisons happen in kg (see `app.prs`); this module is the
only place the lb<->kg conversion factor and the Epley formula live.
"""

KG_PER_LB = 0.45359237


def to_kg(weight: float, unit: str) -> float:
    if unit == "kg":
        return weight
    if unit == "lb":
        return weight * KG_PER_LB
    raise ValueError(f"Unknown weight unit: {unit!r}")


def from_kg(kg: float, unit: str) -> float:
    if unit == "kg":
        return kg
    if unit == "lb":
        return kg / KG_PER_LB
    raise ValueError(f"Unknown weight unit: {unit!r}")


def epley_e1rm_kg(weight_kg: float, reps: int) -> float:
    """Epley estimated 1RM. Single-rep sets are already a 1RM."""
    if reps <= 1:
        return weight_kg
    return weight_kg * (1 + reps / 30)

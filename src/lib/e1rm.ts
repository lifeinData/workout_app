/**
 * Estimated 1-rep-max (Epley formula). Mirrors
 * `backend/app/units.py::epley_e1rm_kg` — client-side use is display
 * only (e.g. a progress chart); the server's PR table is authoritative.
 */
export function epley(weightKg: number, reps: number): number {
  if (reps <= 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

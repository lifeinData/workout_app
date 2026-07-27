/* ------------------------------------------------------------------ *
 * Type exports (formerly in the in-memory store).                    *
 * The store itself has been replaced by React Query hooks in          *
 * `src/lib/queries.ts` which talk to the FastAPI backend.            *
 * ------------------------------------------------------------------ */

export type Mode = "home" | "gym" | "all";

export type Equipment =
  | "bodyweight"
  | "dumbbells"
  | "barbell"
  | "cable"
  | "machine"
  | "bands"
  | "kettlebell";

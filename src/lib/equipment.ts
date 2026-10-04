import type { Equipment } from "@/state/trainingStore";

/** Equipment filter chips. Single source of truth — used by the Add-exercise
 * picker in `SessionScreen.tsx` (B4). Formerly duplicated as a local const in
 * `StartScreen.tsx`'s now-removed "Available equipment" card; do not copy this
 * array into another file, import it instead. */
export const EQUIPMENT_CHIPS: { id: Equipment; label: string }[] = [
  { id: "bodyweight", label: "Bodyweight" },
  { id: "dumbbells", label: "Dumbbells" },
  { id: "bands", label: "Bands" },
  { id: "kettlebell", label: "Kettlebell" },
  { id: "barbell", label: "Barbell" },
  { id: "cable", label: "Cable" },
  { id: "machine", label: "Machine" },
];

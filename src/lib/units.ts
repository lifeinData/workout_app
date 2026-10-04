/**
 * Weight-unit conversion and display formatting.
 *
 * Mirrors `backend/app/units.py` — the server is the source of truth
 * for every stored comparison (`weight_kg`), this module only exists
 * so the client can convert for display/input without a round trip.
 */

import type { WeightUnit } from "./api";

export type { WeightUnit };

const KG_PER_LB = 0.45359237;

export function toKg(weight: number, unit: WeightUnit): number {
  return unit === "kg" ? weight : weight * KG_PER_LB;
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === "kg" ? kg : kg / KG_PER_LB;
}

/** Round to the nearest common plate increment: 2.5 lb / 1.25 kg. */
export function roundToIncrement(value: number, unit: WeightUnit): number {
  const increment = unit === "kg" ? 1.25 : 2.5;
  return Math.round(value / increment) * increment;
}

/** Format a canonical kg weight for display in the user's unit, e.g.
 * `fmtWeight(61.235, "lb") -> "135"`, `fmtWeight(100, "kg") -> "100"`. */
export function fmtWeight(kg: number, unit: WeightUnit): string {
  const rounded = Math.round(fromKg(kg, unit) * 10) / 10;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
}

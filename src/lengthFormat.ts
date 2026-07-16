/**
 * Dual-unit length rendering — one formatter for every surface that shows a length
 * (connection inspector, cable inventory, on-canvas run label, cable schedule, BOM).
 *
 * The unit mode is a VIEW preference, not document data: the same file reads as metric to one
 * designer and imperial to the next, so it lives in the store rather than in `DistanceSettings`
 * (which keeps owning the document's own unit and slack maths). That also keeps this change off
 * the schema — no migration, no version bump.
 */

/** Matches FEET_PER_METER in cableFit.ts and cableSchedule.ts. */
export const FEET_PER_METER = 3.28084;

const INCHES_PER_FOOT = 12;

/** How lengths render. "both" shows metric and imperial together. */
export type LengthUnitMode = "m" | "ft" | "both";

/** Shown wherever a length exists but isn't a finite number. */
const NO_VALUE = "—";

function isFinitePositive(meters: number): boolean {
  return Number.isFinite(meters);
}

/**
 * Split metres into whole feet plus inches, carrying at 12″.
 *
 * The carry is the whole point: rounding inches independently produces `3′ 12″`, which is not
 * a length anyone writes. Rounding happens BEFORE the carry so `11.6″` becomes `1′ 0″`, never
 * `0′ 12″`.
 */
export function metersToFeetInches(meters: number): { feet: number; inches: number } {
  if (!isFinitePositive(meters)) return { feet: 0, inches: 0 };
  const totalInches = Math.round(meters * FEET_PER_METER * INCHES_PER_FOOT);
  const sign = totalInches < 0 ? -1 : 1;
  const abs = Math.abs(totalInches);
  return {
    feet: sign * Math.floor(abs / INCHES_PER_FOOT),
    inches: abs % INCHES_PER_FOOT,
  };
}

/** Imperial, e.g. `59′ 1″`. */
export function formatFeetInches(meters: number): string {
  if (!isFinitePositive(meters)) return NO_VALUE;
  const { feet, inches } = metersToFeetInches(meters);
  return `${feet}′ ${inches}″`;
}

/** Metric, e.g. `18.0 m`. */
export function formatMeters(meters: number): string {
  if (!isFinitePositive(meters)) return NO_VALUE;
  return `${meters.toFixed(1)} m`;
}

/**
 * Format a length in metres for display under the active unit mode:
 * `18.0 m` · `59′ 1″` · `18.0 m · 59′ 1″`.
 */
export function formatLengthMode(meters: number, mode: LengthUnitMode): string {
  if (!isFinitePositive(meters)) return NO_VALUE;
  if (mode === "m") return formatMeters(meters);
  if (mode === "ft") return formatFeetInches(meters);
  return `${formatMeters(meters)} · ${formatFeetInches(meters)}`;
}

/**
 * The two halves of a dual-unit reading, for surfaces that render the primary large and the
 * secondary small (the inspector's exact-length field) rather than as one string.
 * `secondary` is null in single-unit modes.
 */
export function formatLengthParts(
  meters: number,
  mode: LengthUnitMode,
): { primary: string; secondary: string | null } {
  if (!isFinitePositive(meters)) return { primary: NO_VALUE, secondary: null };
  if (mode === "m") return { primary: formatMeters(meters), secondary: null };
  if (mode === "ft") return { primary: formatFeetInches(meters), secondary: null };
  return { primary: formatMeters(meters), secondary: formatFeetInches(meters) };
}

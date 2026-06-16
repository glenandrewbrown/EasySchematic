import type { CableScheduleRow } from "./cableSchedule";

/** The estimated cable run for a single connection, plus whether it exceeds the cable's max. */
export interface ConnectionRun {
  /** Estimated run length as display text (in the user's distance unit), if known. */
  text?: string;
  /** Estimated run length in metres, if known. */
  meters?: number;
  /** True only when the estimate AND a max are both known and the estimate exceeds it. */
  overMax: boolean;
}

/**
 * Resolve one connection's estimated run from precomputed cable-schedule rows
 * (`computeCableSchedule`), flagging when it exceeds the cable type's practical maximum.
 * Pure — the heavy room-to-room distance walk lives in cableSchedule and is reused here.
 * Returns an empty result (overMax false) when the edge is unknown or has no estimate
 * (e.g. no room distances set).
 */
export function connectionRun(
  rows: readonly CableScheduleRow[],
  edgeId: string,
  maxRunM?: number,
): ConnectionRun {
  const matchRow = rows.find((r) => r.edgeId === edgeId);
  const meters = matchRow?.computedLengthM;
  const text = matchRow?.computedLength;
  const overMax =
    typeof meters === "number" && typeof maxRunM === "number" && meters > maxRunM;
  return {
    ...(text !== undefined ? { text } : {}),
    ...(meters !== undefined ? { meters } : {}),
    overMax,
  };
}

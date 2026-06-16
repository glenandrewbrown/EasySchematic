/**
 * Bridges the cable schedule to the cable BOM and max-run checks.
 *
 * `cableSchedule.computeCableSchedule` already walks the graph and estimates each
 * run's length (room-to-room distance + slack). This module maps those rows into
 * `CableBomInput`s for `buildCableBom`, and flags runs whose estimated length
 * exceeds the catalog max for their signal's cable type (`cableRules`). Pure — no
 * graph walking is duplicated here.
 */

import type { CableScheduleRow } from "./cableSchedule";
import type { CableBomInput } from "./cableBom";
import type { CableTypeRule } from "./cableRules";
import { cableTypesForSignal, maxRunWarning } from "./cableRules";
import type { SignalType } from "./types";

/** A single run flagged as exceeding its cable type's practical maximum length. */
export interface RunLengthWarning {
  edgeId: string;
  cableId: string;
  /** Source device label. */
  from: string;
  /** Target device label. */
  to: string;
  /** Signal display label (e.g. "HDMI"). */
  signalType: string;
  /** Resolved catalog cable-type label (e.g. "HDMI Passive"). */
  cableType: string;
  /** Estimated run length in metres. */
  lengthM: number;
  /** Catalog practical maximum for this cable type, in metres. */
  maxRunM: number;
  /** lengthM / maxRunM (> 1 means over). */
  ratio: number;
}

/**
 * Resolve the canonical catalog cable type for a schedule row's signal. Uses the
 * first cable type registered for that signal (e.g. ethernet → Cat6). Returns
 * undefined when the signal id is missing or has no catalog entry (e.g. power).
 */
function resolveCableRule(row: CableScheduleRow): CableTypeRule | undefined {
  if (!row.signalTypeId) return undefined;
  return cableTypesForSignal(row.signalTypeId as SignalType)[0];
}

/**
 * Map schedule rows to BOM inputs. The cable type prefers the resolved catalog
 * label, falling back to the row's own cable-type string. The metre length is
 * carried through when known so `buildCableBom` can group and total by length.
 */
export function scheduleToBomInputs(rows: readonly CableScheduleRow[]): CableBomInput[] {
  return rows.map((row) => {
    const rule = resolveCableRule(row);
    const cableType = rule?.label ?? (row.cableType || undefined);
    return {
      signalType: row.signalType,
      ...(cableType !== undefined ? { cableType } : {}),
      ...(typeof row.computedLengthM === "number" ? { lengthM: row.computedLengthM } : {}),
    };
  });
}

/**
 * Flag every run whose estimated length exceeds its cable type's catalog maximum.
 * Rows without a known catalog rule or without an estimated metre length are
 * skipped (nothing meaningful to warn about). Deterministic input order.
 */
export function runLengthWarnings(rows: readonly CableScheduleRow[]): RunLengthWarning[] {
  const out: RunLengthWarning[] = [];
  for (const row of rows) {
    const rule = resolveCableRule(row);
    if (!rule || typeof row.computedLengthM !== "number") continue;
    const warning = maxRunWarning(rule.id, row.computedLengthM);
    if (warning?.exceeded) {
      out.push({
        edgeId: row.edgeId,
        cableId: row.cableId,
        from: row.sourceDevice,
        to: row.targetDevice,
        signalType: row.signalType,
        cableType: rule.label,
        lengthM: row.computedLengthM,
        maxRunM: warning.maxRunM,
        ratio: warning.ratio,
      });
    }
  }
  return out;
}

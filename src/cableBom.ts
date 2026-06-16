/**
 * Cable bill-of-materials aggregation. Pure: the orchestrator maps schematic
 * connections into CableBomInput[]; this groups identical runs into quantity-counted
 * rows and serializes them to RFC4180 CSV for the BOM export.
 */

export interface CableBomInput {
  signalType: string;
  /** Optional cable-type id/label (e.g. a cableRules CABLE_TYPES key). */
  cableType?: string;
  /** Run length in metres, if known. */
  lengthM?: number;
  /** Optional human label (reference only; not used for grouping). */
  label?: string;
}

export interface CableBomRow {
  signalType: string;
  cableType?: string;
  /** Rounded length used for grouping; undefined when the run length is unknown. */
  lengthM?: number;
  /** Number of identical runs in this row. */
  quantity: number;
  /** lengthM × quantity when the length is known; undefined otherwise. */
  totalLengthM?: number;
}

const CSV_HEADER = "Signal,Cable Type,Length (m),Qty,Total (m)";

/** Round a length to one decimal place (matches the on-canvas label precision). */
function roundLen(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Group connection inputs into BOM rows keyed by signal type + cable type + length
 * (rounded to 0.1 m; unknown-length runs group together). Quantity counts identical
 * runs; totalLengthM sums them when the length is known. Deterministically sorted;
 * never mutates the input.
 */
export function buildCableBom(items: readonly CableBomInput[]): CableBomRow[] {
  const groups = new Map<string, CableBomRow>();
  for (const item of items) {
    const len =
      typeof item.lengthM === "number" && item.lengthM > 0 ? roundLen(item.lengthM) : undefined;
    const key = `${item.signalType}|${item.cableType ?? ""}|${len ?? "?"}`;
    const existing = groups.get(key);
    if (existing) {
      groups.set(key, {
        ...existing,
        quantity: existing.quantity + 1,
        totalLengthM: len !== undefined ? roundLen((existing.totalLengthM ?? 0) + len) : undefined,
      });
    } else {
      groups.set(key, {
        signalType: item.signalType,
        ...(item.cableType !== undefined ? { cableType: item.cableType } : {}),
        ...(len !== undefined ? { lengthM: len, totalLengthM: len } : {}),
        quantity: 1,
      });
    }
  }
  return [...groups.values()].sort((a, b) => {
    if (a.signalType !== b.signalType) return a.signalType < b.signalType ? -1 : 1;
    const at = a.cableType ?? "";
    const bt = b.cableType ?? "";
    if (at !== bt) return at < bt ? -1 : 1;
    return (a.lengthM ?? Infinity) - (b.lengthM ?? Infinity);
  });
}

/** Quote a CSV cell per RFC4180 when it contains a comma, quote, or newline. */
function csvCell(value: string | number | undefined): string {
  if (value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize BOM rows to an RFC4180 CSV string (header + one line per row). */
export function bomToCsv(rows: readonly CableBomRow[]): string {
  const lines = [CSV_HEADER];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.signalType),
        csvCell(r.cableType),
        csvCell(r.lengthM),
        csvCell(r.quantity),
        csvCell(r.totalLengthM),
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

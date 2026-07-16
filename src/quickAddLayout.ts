/**
 * Pure layout + parsing helpers for the QuickAdd spotlight's bulk/rapid add modes.
 *
 * Kept free of React and store imports so it can be unit-tested in the node env
 * (repo convention: no jsdom). GRID_SIZE comes from gridConstants, not the store,
 * to avoid pulling the whole store into a utility module.
 */
import { GRID_SIZE } from "./gridConstants";
import type { DeviceTemplate } from "./types";

/** Max copies a single quantity/list place will drop, to avoid accidental flooding. */
export const MAX_BULK_COUNT = 100;

/** Default columns before a bulk grid wraps to a new row. */
export const DEFAULT_MAX_COLS = 5;

/** Device body width in px — matches the width DeviceNode renders. */
const DEVICE_BODY_W = 144;

/** Device height with zero port rows — matches deviceHeight() in snapUtils. */
const DEVICE_BASE_H = 48;

export interface Footprint {
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Snap a single coordinate to the canvas grid (normalizing -0 to 0). */
function snap(value: number): number {
  const snapped = Math.round(value / GRID_SIZE) * GRID_SIZE;
  return snapped === 0 ? 0 : snapped;
}

/**
 * Estimate a device node's rendered footprint from its template, matching the
 * sizing math used when a single device is placed. Used to space bulk grids so
 * devices don't overlap.
 */
export function deviceFootprint(template: DeviceTemplate): Footprint {
  const ports = template.ports ?? [];
  const inputs = ports.filter((p) => p.direction === "input").length;
  const outputs = ports.filter((p) => p.direction === "output").length;
  const bidir = ports.filter((p) => p.direction === "bidirectional").length;
  const portRows = Math.max(inputs, outputs) + bidir;
  // Mirrors the real sizing math: DeviceNode's 144px body and deviceHeight() in snapUtils
  // (48 + rows × GRID_SIZE). Drifting from those makes bulk-added devices overlap.
  return { w: DEVICE_BODY_W, h: DEVICE_BASE_H + portRows * GRID_SIZE };
}

export interface GridOptions {
  /** Columns before wrapping to a new row. Defaults to DEFAULT_MAX_COLS. */
  maxCols?: number;
  /** Extra gap (px) between footprints, on top of the footprint size. */
  gap?: number;
}

/**
 * Build grid-snapped positions for `count` devices, starting at `anchor` (which
 * is treated as the CENTER of the first device, matching single-place behavior).
 * Lays out left-to-right, wrapping to a new row after `maxCols` columns.
 */
export function gridPositions(
  anchor: Point,
  footprint: Footprint,
  count: number,
  opts: GridOptions = {},
): Point[] {
  const maxCols = Math.max(1, opts.maxCols ?? DEFAULT_MAX_COLS);
  const gap = opts.gap ?? GRID_SIZE;
  const stepX = footprint.w + gap;
  const stepY = footprint.h + gap;

  // Top-left of the first device (anchor is its center).
  const originX = anchor.x - footprint.w / 2;
  const originY = anchor.y - footprint.h / 2;

  const positions: Point[] = [];
  for (let i = 0; i < Math.max(0, count); i++) {
    const col = i % maxCols;
    const row = Math.floor(i / maxCols);
    positions.push({
      x: snap(originX + col * stepX),
      y: snap(originY + row * stepY),
    });
  }
  return positions;
}

/**
 * The grid position of the `index`-th device relative to an anchor — used by
 * rapid-fire mode to advance the cascade after each place without recomputing
 * the whole grid.
 */
export function cascadePosition(
  anchor: Point,
  footprint: Footprint,
  index: number,
  opts: GridOptions = {},
): Point {
  return gridPositions(anchor, footprint, index + 1, opts)[index];
}

export interface ParsedQuantity {
  count: number;
  /** The query with the count token stripped out. */
  rest: string;
}

/**
 * Parse a leading or trailing count token from a query.
 *   "8x JBL"   -> { count: 8, rest: "JBL" }
 *   "8 JBL"    -> { count: 8, rest: "JBL" }
 *   "JBL x8"   -> { count: 8, rest: "JBL" }
 *   "JBL 24"   -> { count: 1, rest: "JBL 24" }   (model numbers are NOT counts)
 *   "JBL"      -> { count: 1, rest: "JBL" }
 *
 * Conservative: a bare trailing integer (no `x`) is treated as part of the name
 * (model numbers), so only leading integers or explicit `Nx`/`xN` set a count.
 */
export function parseQuantity(query: string): ParsedQuantity {
  const trimmed = query.trim();
  if (!trimmed) return { count: 1, rest: "" };

  // Leading "8x Foo" / "8 Foo"
  const lead = trimmed.match(/^(\d{1,3})\s*[x*]?\s+(.+)$/i);
  if (lead && /^(\d{1,3})\s*[x*]\s+/i.test(trimmed)) {
    return { count: clampCount(parseInt(lead[1], 10)), rest: lead[2].trim() };
  }
  // Leading "8 Foo" (no x) — only when the remainder starts with a non-digit word.
  if (lead && !/^\d/.test(lead[2])) {
    return { count: clampCount(parseInt(lead[1], 10)), rest: lead[2].trim() };
  }

  // Trailing "Foo x8" / "Foo *8"
  const trail = trimmed.match(/^(.+?)\s*[x*]\s*(\d{1,3})$/i);
  if (trail) {
    return { count: clampCount(parseInt(trail[2], 10)), rest: trail[1].trim() };
  }

  return { count: 1, rest: trimmed };
}

export interface ParsedListLine {
  count: number;
  query: string;
}

/**
 * Parse one line of a pasted list into a count + search query.
 *   "3x Foo" / "3 Foo" / "3* Foo" / "3) Foo" / "3. Foo" -> { count: 3, query: "Foo" }
 *   "Foo"                                                -> { count: 1, query: "Foo" }
 */
export function parseListLine(line: string): ParsedListLine {
  const trimmed = line.trim();
  if (!trimmed) return { count: 1, query: "" };

  // Leading count with a separator: "3x ", "3 ", "3* ", "3) ", "3. ", "3 - "
  const m = trimmed.match(/^(\d{1,4})\s*(?:[x*).-]\s*|\s+)(.+)$/i);
  if (m && !/^\d/.test(m[2])) {
    return { count: clampCount(parseInt(m[1], 10)), query: m[2].trim() };
  }
  return { count: 1, query: trimmed };
}

/** Whether a raw input string looks like a multi-line list (paste). */
export function isMultiLine(value: string): boolean {
  return /\r?\n/.test(value.trim());
}

/** Split a pasted block into non-empty trimmed lines. */
export function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function clampCount(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(MAX_BULK_COUNT, Math.floor(n));
}

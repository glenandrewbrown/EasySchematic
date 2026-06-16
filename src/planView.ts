/**
 * Pure geometry helpers for the to-scale plan (top-down) canvas view.
 *
 * A device's plan footprint is its physical width × depth (as seen from above),
 * scaled by the parent room's real-world scale (pixels per metre). When the room
 * has no real dimensions or the device has no width, callers fall back to a fixed
 * icon box so the device is still visible and clickable.
 */

/** Side of the fallback icon box (px) used when a to-scale footprint can't be computed. */
export const PLAN_FALLBACK_BOX_PX = 40;

export interface PlanFootprint {
  /** Footprint width in px (device physical width scaled to the room). */
  widthPx: number;
  /** Footprint depth in px (device physical depth scaled to the room). */
  depthPx: number;
  /** True when a real to-scale footprint was computed; false = fallback icon box. */
  toScale: boolean;
}

/** Minimal shape of a room node needed to derive its plan scale. */
export interface RoomScaleInput {
  data?: { widthM?: number } | undefined;
  /** React Flow explicit pixel width. */
  width?: number;
  /** React Flow measured pixel width. */
  measured?: { width?: number } | undefined;
  /** Inline style width (may be a non-numeric CSS value like "auto"). */
  style?: { width?: number | string } | undefined;
}

/**
 * Pixels-per-metre for a room given its rendered pixel width and real-world width.
 * Returns null when either input is non-positive (→ caller falls back to an icon box).
 */
export function planScalePxPerMeter(roomWidthPx: number, roomWidthM: number): number | null {
  if (!(roomWidthPx > 0) || !(roomWidthM > 0)) return null;
  return roomWidthPx / roomWidthM;
}

/**
 * Resolve a room node's plan scale (px per metre), or null when it has no real
 * width or no usable pixel width. Pixel width is taken in priority order:
 * explicit `width`, then `measured.width`, then a numeric `style.width`.
 */
export function resolveRoomScale(room: RoomScaleInput | null | undefined): number | null {
  if (!room) return null;
  const widthM = room.data?.widthM;
  if (!(typeof widthM === "number" && widthM > 0)) return null;

  const px =
    typeof room.width === "number"
      ? room.width
      : typeof room.measured?.width === "number"
        ? room.measured.width
        : typeof room.style?.width === "number"
          ? room.style.width
          : null;

  if (px == null) return null;
  return planScalePxPerMeter(px, widthM);
}

/**
 * Compute a device's to-scale plan footprint in px from its physical dimensions
 * and the parent room's scale. Falls back to a square icon box when the room
 * scale or the device width is unavailable. Depth falls back to width when
 * `depthMm` is absent (square footprint).
 */
export function deviceFootprintPx(
  dims: { widthMm?: number; depthMm?: number },
  pxPerMeter: number | null,
): PlanFootprint {
  const widthMm = typeof dims.widthMm === "number" && dims.widthMm > 0 ? dims.widthMm : null;

  if (pxPerMeter == null || pxPerMeter <= 0 || widthMm == null) {
    return { widthPx: PLAN_FALLBACK_BOX_PX, depthPx: PLAN_FALLBACK_BOX_PX, toScale: false };
  }

  const depthMm = typeof dims.depthMm === "number" && dims.depthMm > 0 ? dims.depthMm : widthMm;
  return {
    widthPx: (widthMm / 1000) * pxPerMeter,
    depthPx: (depthMm / 1000) * pxPerMeter,
    toScale: true,
  };
}

/** Normalize a stored rotation (deg) to a finite number, defaulting to 0. */
export function normalizeRotationDeg(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Apply a relative rotation (deg) to a stored rotation, wrapping the result into
 * the [0, 360) range. A non-finite current value is treated as 0; a non-finite
 * delta is treated as no rotation. Backs the plan-view "Rotate" action so that
 * repeated 90° steps cycle cleanly (270 + 90 → 0, 0 − 90 → 270).
 */
export function rotateBy(current: unknown, deltaDeg: number): number {
  const base = normalizeRotationDeg(current);
  const delta = Number.isFinite(deltaDeg) ? deltaDeg : 0;
  // (((x % 360) + 360) % 360) keeps the result in [0, 360) and avoids -0.
  return (((base + delta) % 360) + 360) % 360;
}

/**
 * Absolute aim angle (deg, [0, 360)) for a pointer offset from a device's centre,
 * in screen space where y grows DOWN. Matches the coverage-wedge / CSS-rotate
 * convention: 0° = +x (right), 90° = down, 180° = left, 270° = up, clockwise.
 * Backs the plan-view drag-to-aim handle. Non-finite input normalizes to 0.
 */
export function aimAngleDeg(dx: number, dy: number): number {
  // rotateBy(0, x) wraps into [0, 360) and maps a non-finite x → 0.
  return rotateBy(0, (Math.atan2(dy, dx) * 180) / Math.PI);
}

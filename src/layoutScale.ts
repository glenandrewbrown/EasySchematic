/**
 * Document-level Layout scale: one real-world ⇄ canvas-pixel mapping for the whole
 * document (`metresPerPixel`), replacing the old per-room scale. Pure + unit-testable;
 * the React layer (ruler, plan footprints, cable distance) reads `metresPerPixel` from
 * GridSettings and converts through these helpers.
 */

import { DEFAULT_METRES_PER_PIXEL } from "./types";

export { DEFAULT_METRES_PER_PIXEL };

/** Canvas pixels → real-world metres at the document scale. */
export function pxToMeters(px: number, metresPerPixel: number): number {
  return px * metresPerPixel;
}

/** Real-world metres → canvas pixels at the document scale. */
export function metersToPx(metres: number, metresPerPixel: number): number {
  return metresPerPixel > 0 ? metres / metresPerPixel : 0;
}

/** Canvas pixels-per-metre at the document scale (the inverse of metresPerPixel). */
export function pxPerMeter(metresPerPixel: number): number {
  return metresPerPixel > 0 ? 1 / metresPerPixel : 0;
}

export interface RoomScaleSample {
  /** Room real-world width in metres. */
  widthM: number;
  /** Room rendered width in canvas pixels. */
  pxWidth: number;
}

/**
 * The most-common per-room scale (metres per pixel) among rooms that carry both a
 * real width and a pixel width. Used by the v43→v44 migration to choose the single
 * document scale that leaves the largest number of rooms unchanged. Ties resolve to
 * the first-seen bucket. Returns null when no room has usable dimensions.
 */
export function mostCommonRoomScale(samples: readonly RoomScaleSample[]): number | null {
  const buckets = new Map<string, { scale: number; count: number; order: number }>();
  let order = 0;
  for (const s of samples) {
    if (!(s.widthM > 0) || !(s.pxWidth > 0)) continue;
    const scale = s.widthM / s.pxWidth;
    // Bucket on 6 significant figures so floating-point noise doesn't split a shared scale.
    const key = scale.toPrecision(6);
    const existing = buckets.get(key);
    if (existing) existing.count += 1;
    else buckets.set(key, { scale, count: 1, order: order++ });
  }

  let best: { scale: number; count: number; order: number } | null = null;
  for (const b of buckets.values()) {
    if (
      !best ||
      b.count > best.count ||
      (b.count === best.count && b.order < best.order)
    ) {
      best = b;
    }
  }
  return best ? best.scale : null;
}

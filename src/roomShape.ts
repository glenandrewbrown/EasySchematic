/** Normalized polygon point: 0..1 relative to the room node's pixel box. */
export interface ShapePoint {
  x: number;
  y: number;
}

export const DEFAULT_RECT_SHAPE: ShapePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

const MIN_VERTICES = 3;

/** Scale normalized shape points to the node's pixel box. */
export function shapeToPx(
  shape: readonly ShapePoint[],
  widthPx: number,
  heightPx: number,
): ShapePoint[] {
  return shape.map((p) => ({ x: p.x * widthPx, y: p.y * heightPx }));
}

/** Format pixel points for an SVG <polygon points> attribute. */
export function polygonPointsAttr(pointsPx: readonly ShapePoint[]): string {
  return pointsPx.map((p) => `${p.x},${p.y}`).join(" ");
}

/**
 * Real-world length of each polygon edge in meters, derived from the room's
 * declared real width (widthM) against its canvas pixel width. Edge i runs
 * from vertex i to vertex i+1 (wrapping).
 */
export function edgeLengthsM(
  shape: readonly ShapePoint[],
  widthPx: number,
  heightPx: number,
  widthM: number,
): number[] {
  const px = shapeToPx(shape, widthPx, heightPx);
  const metersPerPx = widthM / widthPx;
  return px.map((p, i) => {
    const q = px[(i + 1) % px.length];
    return Math.hypot(q.x - p.x, q.y - p.y) * metersPerPx;
  });
}

/** Pixel midpoint of each edge (for measurement labels and add-vertex handles). */
export function edgeMidpointsPx(pointsPx: readonly ShapePoint[]): ShapePoint[] {
  return pointsPx.map((p, i) => {
    const q = pointsPx[(i + 1) % pointsPx.length];
    return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  });
}

/** Insert a vertex at the midpoint of edge `edgeIndex` (after its start vertex). */
export function insertVertex(
  shape: readonly ShapePoint[],
  edgeIndex: number,
): ShapePoint[] {
  const p = shape[edgeIndex];
  const q = shape[(edgeIndex + 1) % shape.length];
  const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  return [...shape.slice(0, edgeIndex + 1), mid, ...shape.slice(edgeIndex + 1)];
}

/** Remove vertex `index`, refusing to go below a triangle. */
export function removeVertex(
  shape: readonly ShapePoint[],
  index: number,
): ShapePoint[] {
  if (shape.length <= MIN_VERTICES) return [...shape];
  return shape.filter((_, i) => i !== index);
}

/** Clamp a normalized point into the 0..1 box. */
export function clampPoint(p: ShapePoint): ShapePoint {
  return {
    x: Math.min(1, Math.max(0, p.x)),
    y: Math.min(1, Math.max(0, p.y)),
  };
}

/**
 * Map a normalized shape into an absolute pixel/coordinate box whose top-left
 * is (originX, originY) and whose size is (widthPx, heightPx). Used for both
 * canvas overlays and to-scale exports (DXF polygon rooms).
 */
export function shapeToAbsPx(
  shape: readonly ShapePoint[],
  originX: number,
  originY: number,
  widthPx: number,
  heightPx: number,
): ShapePoint[] {
  return shape.map((p) => ({
    x: originX + p.x * widthPx,
    y: originY + p.y * heightPx,
  }));
}

/**
 * Real-world floor area of the polygon in square meters, via the shoelace
 * formula. Uses the same uniform scale as edgeLengthsM (widthM / widthPx) so
 * area and edge labels stay consistent.
 */
export function polygonAreaM2(
  shape: readonly ShapePoint[],
  widthPx: number,
  heightPx: number,
  widthM: number,
): number {
  const px = shapeToPx(shape, widthPx, heightPx);
  let twiceArea = 0;
  for (let i = 0; i < px.length; i++) {
    const p = px[i];
    const q = px[(i + 1) % px.length];
    twiceArea += p.x * q.y - q.x * p.y;
  }
  const metersPerPx = widthM / widthPx;
  return (Math.abs(twiceArea) / 2) * metersPerPx * metersPerPx;
}

/** Real-world room dimensions derived by calibrating one edge to a known length. */
export interface RoomScaleCalibration {
  /** Real width in metres (the canonical scale field: metersPerPx = widthM / widthPx). */
  widthM: number;
  /** Real depth in metres, consistent with the same uniform scale. */
  depthM: number;
}

/**
 * Calibrate a room's real-world scale from a single edge of known length.
 * Setting an edge of pixel length `edgePx` to `targetM` metres fixes the uniform
 * scale (metersPerPx = targetM / edgePx); widthM and depthM then follow from the
 * room's pixel box. Returns null for non-positive inputs.
 */
export function calibrateRoomScale(
  widthPx: number,
  heightPx: number,
  edgePx: number,
  targetM: number,
): RoomScaleCalibration | null {
  if (!(widthPx > 0) || !(heightPx > 0) || !(edgePx > 0) || !(targetM > 0)) return null;
  const metersPerPx = targetM / edgePx;
  return {
    widthM: widthPx * metersPerPx,
    depthM: heightPx * metersPerPx,
  };
}

const M_TO_FT = 3.280839895;
const M2_TO_FT2 = 10.76391042;

/** Round to one decimal place (avoids -0 and floating noise in labels). */
function round1(n: number): number {
  return Math.round(n * 10) / 10 + 0;
}

/**
 * Format a distance (stored in meters) for an on-canvas label, in the schematic's
 * display unit. Pure and independent of the React Flow zoom transform.
 */
export function formatDistanceLabel(meters: number, unit: "m" | "ft" = "m"): string {
  return unit === "ft"
    ? `${round1(meters * M_TO_FT)} ft`
    : `${round1(meters)} m`;
}

/** Format a floor area (stored in m²) for an on-canvas label, in the display unit. */
export function formatAreaLabel(areaM2: number, unit: "m" | "ft" = "m"): string {
  return unit === "ft"
    ? `${round1(areaM2 * M2_TO_FT2)} ft²`
    : `${round1(areaM2)} m²`;
}

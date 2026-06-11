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

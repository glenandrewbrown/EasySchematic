/** Pure helpers for the per-unit owned-gear inventory (SchematicFile.gearUnits[]).
 *
 *  Every list operation is immutable: the input array and its member objects are
 *  never mutated — a new array (and new objects where a field changes) is returned.
 *  Assignment is kept consistent so that any given device node maps to at most one
 *  gear unit.
 *
 *  See src/types.ts for the GearUnit shape. The photo helper mirrors the
 *  FileReader → Image → canvas → toDataURL rasterization pattern used by
 *  src/components/TitleBlockDialog.tsx (resizeImage). */
import type { GearUnit } from "./types";

/** Default max photo dimensions (px) for the gear-photo compressor. */
const DEFAULT_PHOTO_MAX_W = 800;
const DEFAULT_PHOTO_MAX_H = 600;
/** Default JPEG quality (0–1) for the gear-photo compressor. */
const DEFAULT_PHOTO_QUALITY = 0.75;

/** Append a new unit built from `unit` with the caller-supplied `id`
 *  (e.g. `crypto.randomUUID()`). */
export function addUnit(
  units: GearUnit[],
  unit: Omit<GearUnit, "id">,
  id: string,
): GearUnit[] {
  return [...units, { ...unit, id }];
}

/** Merge `patch` into the unit with the given `id`.
 *  Unknown id → array returned unchanged. The `id` field is never overwritten. */
export function updateUnit(
  units: GearUnit[],
  id: string,
  patch: Partial<GearUnit>,
): GearUnit[] {
  return units.map((u) => (u.id === id ? { ...u, ...patch, id: u.id } : u));
}

/** Remove the unit with the given `id`. Unknown id → array returned unchanged. */
export function removeUnit(units: GearUnit[], id: string): GearUnit[] {
  return units.filter((u) => u.id !== id);
}

/** Assign `unitId` to `nodeId`. To keep a node mapped to at most one unit, any
 *  OTHER unit currently pointing at `nodeId` has its assignment cleared.
 *  Unknown unitId → only the clearing of stale assignments still applies (a no-op
 *  if no other unit referenced `nodeId`). */
export function assignUnit(
  units: GearUnit[],
  unitId: string,
  nodeId: string,
): GearUnit[] {
  return units.map((u) => {
    if (u.id === unitId) {
      if (u.assignedNodeId === nodeId) return u;
      return { ...u, assignedNodeId: nodeId };
    }
    // Clear the SAME node from any other unit so the node maps to one unit.
    if (u.assignedNodeId === nodeId) {
      const { assignedNodeId: _removed, ...rest } = u;
      return rest;
    }
    return u;
  });
}

/** Clear the assignment on the unit with the given `id`.
 *  Unknown id (or already-unassigned unit) → array returned unchanged. */
export function unassignUnit(units: GearUnit[], unitId: string): GearUnit[] {
  return units.map((u) => {
    if (u.id !== unitId || u.assignedNodeId === undefined) return u;
    const { assignedNodeId: _removed, ...rest } = u;
    return rest;
  });
}

/** Clear `assignedNodeId` on every unit pointing at `nodeId`
 *  (called when a device node is deleted). */
export function clearAssignmentsForNode(
  units: GearUnit[],
  nodeId: string,
): GearUnit[] {
  return units.map((u) => {
    if (u.assignedNodeId !== nodeId) return u;
    const { assignedNodeId: _removed, ...rest } = u;
    return rest;
  });
}

/** The unit currently assigned to `nodeId`, or undefined when none. */
export function unitForNode(
  units: GearUnit[],
  nodeId: string,
): GearUnit | undefined {
  return units.find((u) => u.assignedNodeId === nodeId);
}

/** Aspect-preserving downscale of (`w`×`h`) to fit within (`maxW`×`maxH`).
 *  Never upscales (scale capped at 1). Returns integer-rounded dimensions. */
export function fitDimensions(
  w: number,
  h: number,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: 0, h: 0 };
  const scale = Math.min(1, maxW / w, maxH / h);
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

/** Compress a photo data URL to a JPEG capped at `maxW`×`maxH` (browser-only).
 *  Mirrors TitleBlockDialog's resizeImage canvas pattern. In a non-DOM
 *  environment (or on decode failure) it resolves to the original `dataUrl`. */
export function compressGearPhoto(
  dataUrl: string,
  maxW: number = DEFAULT_PHOTO_MAX_W,
  maxH: number = DEFAULT_PHOTO_MAX_H,
  quality: number = DEFAULT_PHOTO_QUALITY,
): Promise<string> {
  if (typeof document === "undefined") return Promise.resolve(dataUrl);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { w, h } = fitDimensions(img.width, img.height, maxW, maxH);
      if (w === 0 || h === 0) {
        resolve(dataUrl);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    // Never reject — fall back to the original data URL on decode failure.
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/** Sorted, de-duplicated, non-empty manufacturer/model values across all units
 *  (for autocomplete suggestions). Values are trimmed before comparison. */
export function buildGearSuggestions(units: GearUnit[]): {
  manufacturers: string[];
  models: string[];
} {
  const manufacturers = new Set<string>();
  const models = new Set<string>();
  for (const u of units) {
    const manufacturer = u.manufacturer?.trim();
    if (manufacturer) manufacturers.add(manufacturer);
    const model = u.model?.trim();
    if (model) models.add(model);
  }
  return {
    manufacturers: [...manufacturers].sort((a, b) => a.localeCompare(b)),
    models: [...models].sort((a, b) => a.localeCompare(b)),
  };
}

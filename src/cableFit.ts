import type {
  ConnectionEdge,
  DistanceSettings,
  OwnedCableItem,
  RoomData,
  SchematicNode,
} from "./types";

/** A chain longer than required × EXCESS_RATIO is flagged as wasteful. */
export const EXCESS_RATIO = 1.6;

const FEET_PER_METER = 3.28084;

/** Maximum number of cables the suggester will join into one run. */
const MAX_CHAIN_SEGMENTS = 3;

export type FitStatus = "short" | "ok" | "excess" | "unknown";

/** Total physical length of a chain of cables (couplers assumed zero-length). */
export function chainLength(cables: readonly OwnedCableItem[]): number {
  return cables.reduce((sum, c) => sum + c.length, 0);
}

/**
 * Compare an assigned chain against the required run length.
 * "unknown" when there is nothing to compare (no estimate or no assignment).
 */
export function fitStatus(
  required: number | undefined,
  chainTotal: number,
): FitStatus {
  if (required === undefined || chainTotal <= 0) return "unknown";
  if (chainTotal < required) return "short";
  if (chainTotal > required * EXCESS_RATIO) return "excess";
  return "ok";
}

/**
 * Remaining quantity per owned cable after subtracting every assignment
 * across all connections. Clamped at zero so stale assignments (e.g. after
 * lowering a quantity) don't produce negative stock.
 */
export function remainingQuantities(
  ownedCables: readonly OwnedCableItem[],
  edges: readonly ConnectionEdge[],
): Map<string, number> {
  const used = new Map<string, number>();
  for (const edge of edges) {
    for (const id of edge.data?.assignedCableIds ?? []) {
      used.set(id, (used.get(id) ?? 0) + 1);
    }
  }
  const remaining = new Map<string, number>();
  for (const cable of ownedCables) {
    remaining.set(cable.id, Math.max(0, cable.quantity - (used.get(cable.id) ?? 0)));
  }
  return remaining;
}

export interface CablePoolEntry {
  cable: OwnedCableItem;
  remaining: number;
}

/**
 * Pick the best chain from available stock to cover a required run length.
 * Preference order: fewest segments, then least overage. Returns null when
 * no combination of up to MAX_CHAIN_SEGMENTS cables can cover the run.
 */
export function suggestChain(
  required: number,
  pool: readonly CablePoolEntry[],
  maxSegments: number = MAX_CHAIN_SEGMENTS,
): OwnedCableItem[] | null {
  let best: { chain: OwnedCableItem[]; total: number } | null = null;

  const consider = (chain: OwnedCableItem[], total: number) => {
    if (total < required) return;
    if (
      !best ||
      chain.length < best.chain.length ||
      (chain.length === best.chain.length && total < best.total)
    ) {
      best = { chain: [...chain], total };
    }
  };

  const walk = (
    startIndex: number,
    usedCounts: Map<string, number>,
    chain: OwnedCableItem[],
    total: number,
  ) => {
    consider(chain, total);
    if (chain.length >= maxSegments) return;
    for (let i = startIndex; i < pool.length; i++) {
      const { cable, remaining } = pool[i];
      const used = usedCounts.get(cable.id) ?? 0;
      if (used >= remaining) continue;
      usedCounts.set(cable.id, used + 1);
      chain.push(cable);
      walk(i, usedCounts, chain, total + cable.length);
      chain.pop();
      usedCounts.set(cable.id, used);
    }
  };

  walk(0, new Map(), [], 0);
  return best ? (best as { chain: OwnedCableItem[] }).chain : null;
}

/** Convert meters into the schematic's distance unit. */
export function metersToUnit(meters: number, unit: DistanceSettings["unit"]): number {
  return unit === "ft" ? meters * FEET_PER_METER : meters;
}

/**
 * Manhattan distance in meters between two devices placed in the same room,
 * derived from the room's real-world width (RoomData.widthM) against its
 * canvas pixel width. Returns undefined when the devices are in different
 * rooms (use room-to-room distances instead) or the room has no dimensions.
 */
export function intraRoomDistance(
  nodes: readonly SchematicNode[],
  deviceIdA: string,
  deviceIdB: string,
): number | undefined {
  const a = nodes.find((n) => n.id === deviceIdA);
  const b = nodes.find((n) => n.id === deviceIdB);
  if (!a || !b) return undefined;
  if (!a.parentId || a.parentId !== b.parentId) return undefined;

  const room = nodes.find((n) => n.id === a.parentId && n.type === "room");
  if (!room) return undefined;
  const widthM = (room.data as RoomData).widthM;
  const roomPxWidth = room.width ?? room.measured?.width;
  if (!widthM || widthM <= 0 || !roomPxWidth || roomPxWidth <= 0) return undefined;

  const metersPerPx = widthM / roomPxWidth;
  const manhattanPx =
    Math.abs(a.position.x - b.position.x) + Math.abs(a.position.y - b.position.y);
  return manhattanPx * metersPerPx;
}

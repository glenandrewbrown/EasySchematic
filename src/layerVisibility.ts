import { DEFAULT_LAYER_ID } from "./types";

/**
 * Minimal node shape needed to resolve presentation visibility. Kept structural
 * (not the full SchematicNode) so this stays a pure, trivially-testable module.
 */
export interface VisibilityNode {
  id: string;
  /** Spatial parent (a device's room, a nested room's outer room). */
  parentId?: string;
  type?: string;
  /**
   * Node data — only `layerId` and `groupId` are read. Typed loosely (the
   * SchematicNode data union carries a `[key: string]: unknown` index
   * signature) and narrowed at read time.
   */
  data?: Record<string, unknown>;
}

/** Read a string field from loosely-typed node data, else undefined. */
function strField(data: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = data?.[key];
  return typeof v === "string" ? v : undefined;
}

export interface NodeVisibility {
  /** Node ids that must render hidden. */
  hidden: Set<string>;
  /** Node ids that must render non-draggable / non-selectable. */
  locked: Set<string>;
}

/**
 * Resolve which nodes are hidden/locked, cascading layer state down BOTH the
 * spatial `parentId` tree (rooms → their devices) and the logical `groupId`
 * membership. This closes the bug where hiding a layer that contains a room
 * hid the room box but left its child devices floating, because React Flow's
 * `hidden` flag does not propagate to children.
 *
 * A node inherits hidden/locked from any ancestor (via parentId) or its group
 * whose layer is in the corresponding set. Pure: no React Flow, no store.
 */
/** Per-item overrides layered on top of layer-level visibility (P5 Layers/Groups tree). */
export interface VisibilityOptions {
  /** Node ids hidden individually — cascades to their children and group members. */
  hiddenNodeIds?: ReadonlySet<string>;
  /** Node ids locked individually — cascades the same way. */
  lockedNodeIds?: ReadonlySet<string>;
  /** When non-null, only nodes in (or descended from) this layer stay visible. */
  soloLayerId?: string | null;
}

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

export function resolveNodeVisibility(
  nodes: readonly VisibilityNode[],
  hiddenLayers: ReadonlySet<string>,
  lockedLayers: ReadonlySet<string>,
  opts?: VisibilityOptions,
): NodeVisibility {
  const byId = new Map<string, VisibilityNode>();
  for (const n of nodes) byId.set(n.id, n);

  const layerOf = (n: VisibilityNode): string => strField(n.data, "layerId") ?? DEFAULT_LAYER_ID;

  // Walk self → group → ancestors; true if `pred` holds for any visited node.
  // `seen` guards against cyclic parent/group references.
  const anyAncestor = (start: VisibilityNode, pred: (n: VisibilityNode) => boolean): boolean => {
    const stack: VisibilityNode[] = [start];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (seen.has(cur.id)) continue;
      seen.add(cur.id);
      if (pred(cur)) return true;
      if (cur.parentId) {
        const p = byId.get(cur.parentId);
        if (p) stack.push(p);
      }
      const gid = strField(cur.data, "groupId");
      if (gid) {
        const g = byId.get(gid);
        if (g) stack.push(g);
      }
    }
    return false;
  };

  const hiddenNodeIds = opts?.hiddenNodeIds ?? EMPTY_SET;
  const lockedNodeIds = opts?.lockedNodeIds ?? EMPTY_SET;
  const soloLayerId = opts?.soloLayerId ?? null;

  const hidden = new Set<string>();
  const locked = new Set<string>();
  const runHidden = hiddenLayers.size > 0 || hiddenNodeIds.size > 0;
  const runLocked = lockedLayers.size > 0 || lockedNodeIds.size > 0;

  for (const n of nodes) {
    if (runHidden && anyAncestor(n, (c) => hiddenLayers.has(layerOf(c)) || hiddenNodeIds.has(c.id))) {
      hidden.add(n.id);
    } else if (soloLayerId !== null && !anyAncestor(n, (c) => layerOf(c) === soloLayerId)) {
      hidden.add(n.id);
    }
    if (runLocked && anyAncestor(n, (c) => lockedLayers.has(layerOf(c)) || lockedNodeIds.has(c.id))) {
      locked.add(n.id);
    }
  }
  return { hidden, locked };
}

/**
 * layerTree.ts
 *
 * Pure tree builder for the Layers/Groups panel.
 *
 * Produces a hierarchy:  Layer → (Group → members) | ungrouped node
 *
 * Called by: a future LayersGroupsTree panel component that renders the
 * collapsible Layers/Groups sidebar.
 *
 * Data fields: LayerTreeNode (id, kind, label, visible, locked, nodeType?,
 * children), BuildLayerTreeInput (nodes, layers).
 *
 * Verbatim instruction: "PURE tree builder that produces the panel's
 * hierarchy: Layer → (Group → members) and ungrouped members."
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Discriminates a row in the panel tree. */
export type TreeKind = "layer" | "group" | "node";

/** One row in the Layers/Groups panel tree. */
export interface LayerTreeNode {
  /** Layer id, group id, or node id — unique within its kind at each level. */
  id: string;
  kind: TreeKind;
  label: string;
  /** Layers: the layer's own visible flag. Groups/nodes: always true (UI applies per-item state). */
  visible: boolean;
  /** Layers: the layer's own locked flag. Groups/nodes: always false. */
  locked: boolean;
  /** For kind "node": the underlying React-Flow node type (e.g. "device", "room"). */
  nodeType?: string;
  /** For kind "layer": the user-chosen swatch colour (hex), if any. */
  color?: string;
  /** For kind "layer": nested child layers (SchematicLayer.parentId pointing at this
   *  layer) — the "Audio ▸ Speakers ▸ Kiis" hierarchy. Rendered above `children`. */
  subLayers?: LayerTreeNode[];
  /**
   * Short muted summary line. Layers: a per-type tally of direct contents
   * (e.g. "4 devices · 1 room · 2 notes"). Room nodes: their child count
   * (e.g. "3 devices"), optionally prefixed with real dimensions.
   */
  secondaryText?: string;
  /**
   * For a room node acting as a container: the device/note rows whose
   * React-Flow parentId points at this room. Excluded from the layer's flat list.
   */
  roomChildren?: LayerTreeNode[];
  /** Ordered child rows. Layer → groups then nodes. Group → member nodes. */
  children: LayerTreeNode[];
}

/** Minimal node shape accepted by buildLayerTree — subset of React-Flow Node. */
export interface InputNode {
  id: string;
  type?: string;
  /** React-Flow parentId (node-level field) — used to nest nodes under a room. */
  parentId?: string;
  data?: {
    layerId?: string;
    groupId?: string;
    label?: string;
    /** Real room width in metres (rooms only) — surfaced in secondary text. */
    widthM?: number;
    /** Real room depth in metres (rooms only) — surfaced in secondary text. */
    depthM?: number;
  };
}

/** Minimal layer shape accepted by buildLayerTree — matches SchematicLayer. */
export interface InputLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  /** Optional swatch colour (hex) carried through to the layer tree node. */
  color?: string;
  /** Parent layer id for nested layer groups (schema v50). Absent = root layer. */
  parentId?: string;
}

/** Input contract for buildLayerTree. Both arrays are treated as read-only. */
export interface BuildLayerTreeInput {
  nodes: ReadonlyArray<InputNode>;
  layers: ReadonlyArray<InputLayer>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LAYER_ID = "default";
const DEFAULT_LAYER_LABEL = "Default";

/** Node type that acts as a container for the nodes nested inside it. */
const ROOM_NODE_TYPE = "room";

/** Node types that are internal helpers and must not appear as tree items. */
const EXCLUDED_NODE_TYPES = new Set(["waypoint", "stub-label"]);

/** Human label for a given node type, used when summarising layer/room contents. */
const NODE_TYPE_LABELS: Record<string, { singular: string; plural: string }> = {
  device: { singular: "device", plural: "devices" },
  room: { singular: "room", plural: "rooms" },
  note: { singular: "note", plural: "notes" },
  annotation: { singular: "annotation", plural: "annotations" },
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns true when the node should be omitted from the tree. */
function isHelperNode(node: InputNode): boolean {
  return EXCLUDED_NODE_TYPES.has(node.type ?? "");
}

/** Resolves the effective layer id for a node (absent or "default" → DEFAULT_LAYER_ID). */
function resolveLayerId(node: InputNode): string {
  const id = node.data?.layerId;
  return id && id !== DEFAULT_LAYER_ID ? id : DEFAULT_LAYER_ID;
}

/** Returns the singular/plural label for a node type (falls back to "item"). */
function labelForType(type: string): { singular: string; plural: string } {
  return NODE_TYPE_LABELS[type] ?? { singular: "item", plural: "items" };
}

/** Pluralises a single type count, e.g. (3, "device") → "3 devices". */
function countLabel(type: string, count: number): string {
  const { singular, plural } = labelForType(type);
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Builds a muted summary line tallying nodes by type, e.g.
 * "4 devices · 1 room · 2 notes". Zero counts are omitted. Returns undefined
 * when there is nothing to summarise.
 */
function summarizeByType(nodes: ReadonlyArray<InputNode>): string | undefined {
  if (nodes.length === 0) return undefined;

  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const node of nodes) {
    const type = node.type ?? "item";
    if (!counts.has(type)) order.push(type);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  const parts = order.map((type) => countLabel(type, counts.get(type) ?? 0));
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** Formats a room's real dimensions as a prefix, e.g. "6.0 × 4.0 m · ", when present. */
function roomDimensionPrefix(node: InputNode): string {
  const { widthM, depthM } = node.data ?? {};
  if (typeof widthM !== "number" || typeof depthM !== "number") return "";
  return `${widthM.toFixed(1)} × ${depthM.toFixed(1)} m · `;
}

/**
 * Builds a LayerTreeNode for a leaf node entry. When the node is a room and
 * `childrenByParent` contains entries keyed by its id, those become its
 * `roomChildren` and drive a "<dims> · N devices" secondary line.
 */
function buildNodeEntry(
  node: InputNode,
  childrenByParent: Map<string, InputNode[]>,
): LayerTreeNode {
  const base: LayerTreeNode = {
    id: node.id,
    kind: "node",
    label: node.data?.label ?? node.id,
    visible: true,
    locked: false,
    nodeType: node.type,
    children: [],
  };

  if (node.type !== ROOM_NODE_TYPE) return base;

  const nested = childrenByParent.get(node.id) ?? [];
  const roomChildren = nested.map((child) => buildNodeEntry(child, childrenByParent));
  const summary = summarizeByType(nested);
  const prefix = roomDimensionPrefix(node);
  const secondaryText =
    summary !== undefined
      ? `${prefix}${summary}`
      : prefix
        ? prefix.replace(/ · $/, "")
        : undefined;

  return { ...base, roomChildren, secondaryText };
}

/** Builds a LayerTreeNode for a group, given its ordered member entries. */
function buildGroupEntry(groupId: string, members: LayerTreeNode[]): LayerTreeNode {
  return {
    id: groupId,
    kind: "group",
    label: `Group (${members.length})`,
    visible: true,
    locked: false,
    children: members,
  };
}

/** Builds a LayerTreeNode for a layer row. */
function buildLayerEntry(
  layer: InputLayer,
  children: LayerTreeNode[],
  subLayers: LayerTreeNode[],
  secondaryText: string | undefined,
): LayerTreeNode {
  return {
    id: layer.id,
    kind: "layer",
    label: layer.name,
    visible: layer.visible,
    locked: layer.locked,
    color: layer.color,
    secondaryText,
    subLayers,
    children,
  };
}

/**
 * Groups a flat list of user-facing nodes into the ordered child list for one
 * layer: grouped nodes first (in first-seen group order), then ungrouped nodes
 * (preserving input order within each bucket).
 *
 * Nodes whose parentId points at a room on the same layer are NOT placed in the
 * flat list — they are nested under that room's `roomChildren` instead.
 */
function buildLayerChildren(
  layerNodes: ReadonlyArray<InputNode>,
  childrenByParent: Map<string, InputNode[]>,
): LayerTreeNode[] {
  // Ids of rooms on this layer — their nested children are rendered inside them.
  const roomIds = new Set(
    layerNodes.filter((n) => n.type === ROOM_NODE_TYPE).map((n) => n.id),
  );
  const layerNodeIds = new Set(layerNodes.map((n) => n.id));

  // Scope the parent→children map to THIS layer's rooms only, so a child that
  // sits on a different layer than its parent room is never nested here.
  const scopedChildrenByParent = new Map<string, InputNode[]>();
  for (const roomId of roomIds) {
    const kids = childrenByParent.get(roomId);
    if (kids) {
      scopedChildrenByParent.set(roomId, kids.filter((k) => layerNodeIds.has(k.id)));
    }
  }

  // Accumulate grouped members, preserving insertion order of groups.
  const groupOrder: string[] = [];
  const groupMembers = new Map<string, LayerTreeNode[]>();
  const ungrouped: LayerTreeNode[] = [];

  for (const node of layerNodes) {
    // Skip nodes that nest inside a room on this layer; they appear under the room.
    if (node.parentId && roomIds.has(node.parentId)) continue;

    const gid = node.data?.groupId;
    if (gid) {
      if (!groupMembers.has(gid)) {
        groupOrder.push(gid);
        groupMembers.set(gid, []);
      }
      // Non-null assertion safe: we just set it above if missing.
      groupMembers.get(gid)!.push(buildNodeEntry(node, scopedChildrenByParent));
    } else {
      ungrouped.push(buildNodeEntry(node, scopedChildrenByParent));
    }
  }

  const groupEntries = groupOrder.map((gid) =>
    buildGroupEntry(gid, groupMembers.get(gid)!),
  );

  return [...groupEntries, ...ungrouped];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds the full Layers/Groups panel tree from a flat list of nodes and
 * layer definitions.
 *
 * Layers themselves nest via `InputLayer.parentId` (schema v50, e.g.
 * "Audio ▸ Speakers ▸ Kiis") — the returned array holds only ROOT layers;
 * each layer's `subLayers` carries its nested child layers recursively.
 *
 * Ordering contract:
 * - The synthetic "default" layer is placed first when not already present in
 *   `layers`; if `layers` contains an entry with id "default" it is used as-is
 *   (no duplicate). It is always a root (matches the store's invariant that
 *   the base layer can't be re-parented).
 * - Root layers follow in the order given by `layers`; a layer whose
 *   `parentId` is self-referential or points at an unknown layer id is
 *   treated as a root (defensive against corrupt data).
 * - A layer's `subLayers` follow in the order given by `layers`.
 * - Within a layer: groups first (first-seen group order), then ungrouped nodes
 *   (input order).
 * - Within a group: member nodes in input order.
 *
 * Never mutates the input arrays or objects.
 */
export function buildLayerTree(input: BuildLayerTreeInput): LayerTreeNode[] {
  const { nodes, layers } = input;

  // ------------------------------------------------------------------
  // 1. Partition user-facing nodes by layer id (skip helper types),
  //    and index user-facing nodes by parentId in a single O(n) pass so
  //    rooms can later claim the nodes nested inside them.
  // ------------------------------------------------------------------
  const nodesByLayer = new Map<string, InputNode[]>();
  const childrenByParent = new Map<string, InputNode[]>();

  for (const node of nodes) {
    if (isHelperNode(node)) continue;
    const lid = resolveLayerId(node);
    if (!nodesByLayer.has(lid)) {
      nodesByLayer.set(lid, []);
    }
    nodesByLayer.get(lid)!.push(node);

    if (node.parentId) {
      if (!childrenByParent.has(node.parentId)) {
        childrenByParent.set(node.parentId, []);
      }
      childrenByParent.get(node.parentId)!.push(node);
    }
  }

  // ------------------------------------------------------------------
  // 2. Build the ordered list of layer definitions, and index them by
  //    parent so sub-layers can be nested under their owner recursively.
  //    Synthetic "default" is prepended if not already present.
  // ------------------------------------------------------------------
  const hasExplicitDefault = layers.some((l) => l.id === DEFAULT_LAYER_ID);

  const syntheticDefault: InputLayer = {
    id: DEFAULT_LAYER_ID,
    name: DEFAULT_LAYER_LABEL,
    visible: true,
    locked: false,
  };

  const allLayers: ReadonlyArray<InputLayer> = hasExplicitDefault
    ? layers
    : [syntheticDefault, ...layers];

  const layerIds = new Set(allLayers.map((l) => l.id));
  const childLayersByParent = new Map<string, InputLayer[]>();
  const rootLayers: InputLayer[] = [];

  for (const layer of allLayers) {
    const pid = layer.parentId;
    if (pid && pid !== layer.id && layerIds.has(pid)) {
      if (!childLayersByParent.has(pid)) childLayersByParent.set(pid, []);
      childLayersByParent.get(pid)!.push(layer);
    } else {
      rootLayers.push(layer);
    }
  }

  // ------------------------------------------------------------------
  // 3. Build a LayerTreeNode for every layer (even empty ones), recursing
  //    into sub-layers. Secondary text tallies the layer's DIRECT contents:
  //    nodes nested inside a room on this layer are counted under the room,
  //    not the layer, and sub-layer contents are counted on their own row.
  //    `visiting` guards against a cycle in corrupt saved data.
  // ------------------------------------------------------------------
  const buildLayerNode = (layer: InputLayer, visiting: ReadonlySet<string>): LayerTreeNode => {
    const layerNodes = nodesByLayer.get(layer.id) ?? [];
    const children = buildLayerChildren(layerNodes, childrenByParent);
    const roomIds = new Set(
      layerNodes.filter((n) => n.type === ROOM_NODE_TYPE).map((n) => n.id),
    );
    const directNodes = layerNodes.filter(
      (n) => !(n.parentId && roomIds.has(n.parentId)),
    );
    const secondaryText = summarizeByType(directNodes);

    const nextVisiting = new Set(visiting).add(layer.id);
    const subLayers = (childLayersByParent.get(layer.id) ?? [])
      .filter((child) => !nextVisiting.has(child.id))
      .map((child) => buildLayerNode(child, nextVisiting));

    return buildLayerEntry(layer, children, subLayers, secondaryText);
  };

  return rootLayers.map((layer) => buildLayerNode(layer, new Set()));
}

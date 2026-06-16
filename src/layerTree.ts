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
  /** Ordered child rows. Layer → groups then nodes. Group → member nodes. */
  children: LayerTreeNode[];
}

/** Minimal node shape accepted by buildLayerTree — subset of React-Flow Node. */
export interface InputNode {
  id: string;
  type?: string;
  data?: {
    layerId?: string;
    groupId?: string;
    label?: string;
  };
}

/** Minimal layer shape accepted by buildLayerTree — matches SchematicLayer. */
export interface InputLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
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

/** Node types that are internal helpers and must not appear as tree items. */
const EXCLUDED_NODE_TYPES = new Set(["waypoint", "stub-label"]);

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

/** Builds a LayerTreeNode for a leaf node entry. */
function buildNodeEntry(node: InputNode): LayerTreeNode {
  return {
    id: node.id,
    kind: "node",
    label: node.data?.label ?? node.id,
    visible: true,
    locked: false,
    nodeType: node.type,
    children: [],
  };
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
  id: string,
  label: string,
  visible: boolean,
  locked: boolean,
  children: LayerTreeNode[],
): LayerTreeNode {
  return { id, kind: "layer", label, visible, locked, children };
}

/**
 * Groups a flat list of user-facing nodes into the ordered child list for one
 * layer: grouped nodes first (in first-seen group order), then ungrouped nodes
 * (preserving input order within each bucket).
 */
function buildLayerChildren(layerNodes: ReadonlyArray<InputNode>): LayerTreeNode[] {
  // Accumulate grouped members, preserving insertion order of groups.
  const groupOrder: string[] = [];
  const groupMembers = new Map<string, LayerTreeNode[]>();
  const ungrouped: LayerTreeNode[] = [];

  for (const node of layerNodes) {
    const gid = node.data?.groupId;
    if (gid) {
      if (!groupMembers.has(gid)) {
        groupOrder.push(gid);
        groupMembers.set(gid, []);
      }
      // Non-null assertion safe: we just set it above if missing.
      groupMembers.get(gid)!.push(buildNodeEntry(node));
    } else {
      ungrouped.push(buildNodeEntry(node));
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
 * Ordering contract:
 * - The synthetic "default" layer is placed first when not already present in
 *   `layers`; if `layers` contains an entry with id "default" it is used as-is
 *   (no duplicate).
 * - Named layers follow in the order given by `layers`.
 * - Within a layer: groups first (first-seen group order), then ungrouped nodes
 *   (input order).
 * - Within a group: member nodes in input order.
 *
 * Never mutates the input arrays or objects.
 */
export function buildLayerTree(input: BuildLayerTreeInput): LayerTreeNode[] {
  const { nodes, layers } = input;

  // ------------------------------------------------------------------
  // 1. Partition user-facing nodes by layer id (skip helper types).
  // ------------------------------------------------------------------
  const nodesByLayer = new Map<string, InputNode[]>();

  for (const node of nodes) {
    if (isHelperNode(node)) continue;
    const lid = resolveLayerId(node);
    if (!nodesByLayer.has(lid)) {
      nodesByLayer.set(lid, []);
    }
    nodesByLayer.get(lid)!.push(node);
  }

  // ------------------------------------------------------------------
  // 2. Build the ordered list of layer definitions to render.
  //    Synthetic "default" is prepended if not already present.
  // ------------------------------------------------------------------
  const hasExplicitDefault = layers.some((l) => l.id === DEFAULT_LAYER_ID);

  const syntheticDefault: InputLayer = {
    id: DEFAULT_LAYER_ID,
    name: DEFAULT_LAYER_LABEL,
    visible: true,
    locked: false,
  };

  const orderedLayers: ReadonlyArray<InputLayer> = hasExplicitDefault
    ? layers
    : [syntheticDefault, ...layers];

  // ------------------------------------------------------------------
  // 3. Build a LayerTreeNode for every layer (even empty ones).
  // ------------------------------------------------------------------
  return orderedLayers.map((layer) => {
    const layerNodes = nodesByLayer.get(layer.id) ?? [];
    const children = buildLayerChildren(layerNodes);
    return buildLayerEntry(layer.id, layer.name, layer.visible, layer.locked, children);
  });
}

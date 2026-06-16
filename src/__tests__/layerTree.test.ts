import { describe, it, expect } from "vitest";
import { buildLayerTree } from "../layerTree";
import type { BuildLayerTreeInput, LayerTreeNode } from "../layerTree";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findById(nodes: LayerTreeNode[], id: string): LayerTreeNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findById(n.children, id);
    if (found) return found;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildLayerTree", () => {
  it("a node with no layerId lands under the Default layer", () => {
    const input: BuildLayerTreeInput = {
      nodes: [{ id: "n1", type: "device", data: {} }],
      layers: [],
    };
    const tree = buildLayerTree(input);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("default");
    expect(tree[0].kind).toBe("layer");
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe("n1");
    expect(tree[0].children[0].kind).toBe("node");
  });

  it("a node with layerId 'default' lands under the Default layer", () => {
    const input: BuildLayerTreeInput = {
      nodes: [{ id: "n2", type: "device", data: { layerId: "default" } }],
      layers: [],
    };
    const tree = buildLayerTree(input);

    expect(tree[0].id).toBe("default");
    expect(tree[0].children[0].id).toBe("n2");
  });

  it("two layers keep the given order", () => {
    const input: BuildLayerTreeInput = {
      nodes: [],
      layers: [
        { id: "layerA", name: "Layer A", visible: true, locked: false },
        { id: "layerB", name: "Layer B", visible: false, locked: true },
      ],
    };
    const tree = buildLayerTree(input);

    // default synthetic entry comes first when not in layers array
    expect(tree[0].id).toBe("default");
    expect(tree[1].id).toBe("layerA");
    expect(tree[2].id).toBe("layerB");
  });

  it("visible and locked flags reflect the layer definition", () => {
    const input: BuildLayerTreeInput = {
      nodes: [],
      layers: [{ id: "layerX", name: "X", visible: false, locked: true }],
    };
    const tree = buildLayerTree(input);
    const layerX = tree.find((t) => t.id === "layerX");

    expect(layerX?.visible).toBe(false);
    expect(layerX?.locked).toBe(true);
  });

  it("two nodes sharing a groupId collapse into one group with 2 children", () => {
    const input: BuildLayerTreeInput = {
      nodes: [
        { id: "n1", type: "device", data: { groupId: "grp1" } },
        { id: "n2", type: "device", data: { groupId: "grp1" } },
      ],
      layers: [],
    };
    const tree = buildLayerTree(input);
    const defaultLayer = tree[0];

    expect(defaultLayer.children).toHaveLength(1);
    const group = defaultLayer.children[0];
    expect(group.kind).toBe("group");
    expect(group.id).toBe("grp1");
    expect(group.children).toHaveLength(2);
    expect(group.children[0].id).toBe("n1");
    expect(group.children[1].id).toBe("n2");
  });

  it("ungrouped nodes are direct children of the layer", () => {
    const input: BuildLayerTreeInput = {
      nodes: [
        { id: "n1", type: "device", data: {} },
        { id: "n2", type: "room", data: {} },
      ],
      layers: [],
    };
    const tree = buildLayerTree(input);
    const defaultLayer = tree[0];

    expect(defaultLayer.children.every((c) => c.kind === "node")).toBe(true);
    expect(defaultLayer.children.map((c) => c.id)).toEqual(["n1", "n2"]);
  });

  it("waypoint nodes are excluded from the tree", () => {
    const input: BuildLayerTreeInput = {
      nodes: [
        { id: "n1", type: "device", data: {} },
        { id: "wp1", type: "waypoint", data: {} },
      ],
      layers: [],
    };
    const tree = buildLayerTree(input);
    const allIds = tree.flatMap((l) => l.children.map((c) => c.id));

    expect(allIds).toContain("n1");
    expect(allIds).not.toContain("wp1");
  });

  it("stub-label nodes are excluded from the tree", () => {
    const input: BuildLayerTreeInput = {
      nodes: [
        { id: "n1", type: "device", data: {} },
        { id: "sl1", type: "stub-label", data: {} },
      ],
      layers: [],
    };
    const tree = buildLayerTree(input);
    const allIds = tree.flatMap((l) => l.children.map((c) => c.id));

    expect(allIds).toContain("n1");
    expect(allIds).not.toContain("sl1");
  });

  it("a layer with no nodes still appears in the tree", () => {
    const input: BuildLayerTreeInput = {
      nodes: [],
      layers: [{ id: "emptyLayer", name: "Empty", visible: true, locked: false }],
    };
    const tree = buildLayerTree(input);
    const emptyLayer = tree.find((t) => t.id === "emptyLayer");

    expect(emptyLayer).toBeDefined();
    expect(emptyLayer?.children).toHaveLength(0);
  });

  it("node label falls back to node id when data.label is absent", () => {
    const input: BuildLayerTreeInput = {
      nodes: [{ id: "node-without-label", type: "device", data: {} }],
      layers: [],
    };
    const tree = buildLayerTree(input);
    const nodeEntry = findById(tree, "node-without-label");

    expect(nodeEntry?.label).toBe("node-without-label");
  });

  it("node label uses data.label when present", () => {
    const input: BuildLayerTreeInput = {
      nodes: [{ id: "n1", type: "device", data: { label: "My Mixer" } }],
      layers: [],
    };
    const tree = buildLayerTree(input);
    const nodeEntry = findById(tree, "n1");

    expect(nodeEntry?.label).toBe("My Mixer");
  });

  it("group/node rows default visible=true and locked=false", () => {
    const input: BuildLayerTreeInput = {
      nodes: [
        { id: "n1", type: "device", data: { groupId: "grp1" } },
        { id: "n2", type: "device", data: {} },
      ],
      layers: [],
    };
    const tree = buildLayerTree(input);
    const defaultLayer = tree[0];
    const group = defaultLayer.children.find((c) => c.kind === "group");
    const ungrouped = defaultLayer.children.find((c) => c.kind === "node");

    expect(group?.visible).toBe(true);
    expect(group?.locked).toBe(false);
    expect(ungrouped?.visible).toBe(true);
    expect(ungrouped?.locked).toBe(false);
    expect(group?.children[0].visible).toBe(true);
    expect(group?.children[0].locked).toBe(false);
  });

  it("node kind entries carry the underlying nodeType", () => {
    const input: BuildLayerTreeInput = {
      nodes: [{ id: "n1", type: "room", data: {} }],
      layers: [],
    };
    const tree = buildLayerTree(input);
    const nodeEntry = findById(tree, "n1");

    expect(nodeEntry?.nodeType).toBe("room");
  });

  it("layers array already containing 'default' is not duplicated", () => {
    const input: BuildLayerTreeInput = {
      nodes: [{ id: "n1", type: "device", data: { layerId: "default" } }],
      layers: [{ id: "default", name: "Base Layer", visible: true, locked: false }],
    };
    const tree = buildLayerTree(input);
    const defaultEntries = tree.filter((t) => t.id === "default");

    expect(defaultEntries).toHaveLength(1);
    expect(defaultEntries[0].label).toBe("Base Layer");
  });

  it("nodes are routed to the correct named layer", () => {
    const input: BuildLayerTreeInput = {
      nodes: [
        { id: "n1", type: "device", data: { layerId: "layerA" } },
        { id: "n2", type: "device", data: { layerId: "layerB" } },
      ],
      layers: [
        { id: "layerA", name: "Layer A", visible: true, locked: false },
        { id: "layerB", name: "Layer B", visible: true, locked: false },
      ],
    };
    const tree = buildLayerTree(input);
    const layerA = tree.find((t) => t.id === "layerA");
    const layerB = tree.find((t) => t.id === "layerB");

    expect(layerA?.children.map((c) => c.id)).toEqual(["n1"]);
    expect(layerB?.children.map((c) => c.id)).toEqual(["n2"]);
  });

  it("groups appear before ungrouped nodes within a layer", () => {
    const input: BuildLayerTreeInput = {
      nodes: [
        { id: "ungrouped", type: "device", data: {} },
        { id: "member1", type: "device", data: { groupId: "g1" } },
      ],
      layers: [],
    };
    const tree = buildLayerTree(input);
    const children = tree[0].children;

    expect(children[0].kind).toBe("group");
    expect(children[1].kind).toBe("node");
  });

  it("group label encodes member count", () => {
    const input: BuildLayerTreeInput = {
      nodes: [
        { id: "m1", type: "device", data: { groupId: "g1" } },
        { id: "m2", type: "device", data: { groupId: "g1" } },
        { id: "m3", type: "device", data: { groupId: "g1" } },
      ],
      layers: [],
    };
    const tree = buildLayerTree(input);
    const group = tree[0].children[0];

    expect(group.kind).toBe("group");
    expect(group.label).toBe("Group (3)");
  });

  it("never mutates the input arrays", () => {
    const nodes = [{ id: "n1", type: "device", data: {} }] as const;
    const layers = [{ id: "l1", name: "L1", visible: true, locked: false }] as const;
    const input: BuildLayerTreeInput = { nodes, layers };

    buildLayerTree(input);

    expect(input.nodes).toHaveLength(1);
    expect(input.layers).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Rooms as containers
  // -------------------------------------------------------------------------

  it("a room nests nodes whose parentId points at it", () => {
    const input: BuildLayerTreeInput = {
      nodes: [
        { id: "room1", type: "room", data: {} },
        { id: "d1", type: "device", parentId: "room1", data: {} },
        { id: "d2", type: "device", parentId: "room1", data: {} },
      ],
      layers: [],
    };
    const tree = buildLayerTree(input);
    const room = findById(tree, "room1");

    expect(room?.roomChildren?.map((c) => c.id)).toEqual(["d1", "d2"]);
    expect(room?.roomChildren?.every((c) => c.kind === "node")).toBe(true);
  });

  it("room-nested children are excluded from the layer's flat list", () => {
    const input: BuildLayerTreeInput = {
      nodes: [
        { id: "room1", type: "room", data: {} },
        { id: "d1", type: "device", parentId: "room1", data: {} },
        { id: "loose", type: "device", data: {} },
      ],
      layers: [],
    };
    const tree = buildLayerTree(input);
    const flatIds = tree[0].children.map((c) => c.id);

    expect(flatIds).toContain("room1");
    expect(flatIds).toContain("loose");
    expect(flatIds).not.toContain("d1");
  });

  it("a child whose parentId targets a room on another layer is NOT nested", () => {
    const input: BuildLayerTreeInput = {
      nodes: [
        { id: "room1", type: "room", data: { layerId: "layerA" } },
        // Child lives on a different layer than its parent room.
        { id: "d1", type: "device", parentId: "room1", data: { layerId: "layerB" } },
      ],
      layers: [
        { id: "layerA", name: "A", visible: true, locked: false },
        { id: "layerB", name: "B", visible: true, locked: false },
      ],
    };
    const tree = buildLayerTree(input);
    const room = findById(tree, "room1");
    const layerB = tree.find((t) => t.id === "layerB");

    expect(room?.roomChildren ?? []).toHaveLength(0);
    expect(layerB?.children.map((c) => c.id)).toEqual(["d1"]);
  });

  it("a room with no children has an empty roomChildren list and no count summary", () => {
    const input: BuildLayerTreeInput = {
      nodes: [{ id: "room1", type: "room", data: {} }],
      layers: [],
    };
    const tree = buildLayerTree(input);
    const room = findById(tree, "room1");

    expect(room?.roomChildren ?? []).toHaveLength(0);
    expect(room?.secondaryText).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Colour pass-through
  // -------------------------------------------------------------------------

  it("layer colour passes through onto the layer tree node", () => {
    const input: BuildLayerTreeInput = {
      nodes: [],
      layers: [{ id: "layerA", name: "A", visible: true, locked: false, color: "#3b82f6" }],
    };
    const tree = buildLayerTree(input);
    const layerA = tree.find((t) => t.id === "layerA");

    expect(layerA?.color).toBe("#3b82f6");
  });

  it("a layer without a colour has color undefined", () => {
    const input: BuildLayerTreeInput = {
      nodes: [],
      layers: [{ id: "layerA", name: "A", visible: true, locked: false }],
    };
    const tree = buildLayerTree(input);
    const layerA = tree.find((t) => t.id === "layerA");

    expect(layerA?.color).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Secondary text
  // -------------------------------------------------------------------------

  it("layer secondaryText tallies direct contents by type with pluralisation", () => {
    const input: BuildLayerTreeInput = {
      nodes: [
        { id: "d1", type: "device", data: {} },
        { id: "d2", type: "device", data: {} },
        { id: "d3", type: "device", data: {} },
        { id: "d4", type: "device", data: {} },
        { id: "room1", type: "room", data: {} },
        { id: "note1", type: "note", data: {} },
        { id: "note2", type: "note", data: {} },
      ],
      layers: [],
    };
    const tree = buildLayerTree(input);

    expect(tree[0].secondaryText).toBe("4 devices · 1 room · 2 notes");
  });

  it("layer secondaryText counts a room once and omits its nested children", () => {
    const input: BuildLayerTreeInput = {
      nodes: [
        { id: "room1", type: "room", data: {} },
        { id: "d1", type: "device", parentId: "room1", data: {} },
        { id: "d2", type: "device", parentId: "room1", data: {} },
      ],
      layers: [],
    };
    const tree = buildLayerTree(input);

    // Room counts as a room; its two nested devices are NOT tallied at layer level.
    expect(tree[0].secondaryText).toBe("1 room");
  });

  it("an empty layer has no secondaryText", () => {
    const input: BuildLayerTreeInput = {
      nodes: [],
      layers: [{ id: "empty", name: "Empty", visible: true, locked: false }],
    };
    const tree = buildLayerTree(input);
    const empty = tree.find((t) => t.id === "empty");

    expect(empty?.secondaryText).toBeUndefined();
  });

  it("room secondaryText reports its child count", () => {
    const input: BuildLayerTreeInput = {
      nodes: [
        { id: "room1", type: "room", data: {} },
        { id: "d1", type: "device", parentId: "room1", data: {} },
        { id: "d2", type: "device", parentId: "room1", data: {} },
        { id: "d3", type: "device", parentId: "room1", data: {} },
      ],
      layers: [],
    };
    const tree = buildLayerTree(input);
    const room = findById(tree, "room1");

    expect(room?.secondaryText).toBe("3 devices");
  });

  it("room secondaryText is prefixed with real dimensions when present", () => {
    const input: BuildLayerTreeInput = {
      nodes: [
        { id: "room1", type: "room", data: { widthM: 6, depthM: 4 } },
        { id: "d1", type: "device", parentId: "room1", data: {} },
        { id: "d2", type: "device", parentId: "room1", data: {} },
        { id: "d3", type: "device", parentId: "room1", data: {} },
      ],
      layers: [],
    };
    const tree = buildLayerTree(input);
    const room = findById(tree, "room1");

    expect(room?.secondaryText).toBe("6.0 × 4.0 m · 3 devices");
  });

  it("an empty room with dimensions shows only the dimension text", () => {
    const input: BuildLayerTreeInput = {
      nodes: [{ id: "room1", type: "room", data: { widthM: 6, depthM: 4 } }],
      layers: [],
    };
    const tree = buildLayerTree(input);
    const room = findById(tree, "room1");

    expect(room?.secondaryText).toBe("6.0 × 4.0 m");
  });
});

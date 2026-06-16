import { describe, expect, test } from "vitest";
import { resolveNodeVisibility, type VisibilityNode } from "../layerVisibility";

const L_HIDDEN = new Set(["L1"]);
const NONE = new Set<string>();

describe("resolveNodeVisibility", () => {
  test("hides a node by its own layer", () => {
    const nodes: VisibilityNode[] = [{ id: "a", data: { layerId: "L1" } }];
    const { hidden } = resolveNodeVisibility(nodes, L_HIDDEN, NONE);
    expect([...hidden]).toEqual(["a"]);
  });

  test("cascades a hidden room layer to its child devices (the bug fix)", () => {
    const nodes: VisibilityNode[] = [
      { id: "room1", type: "room", data: { layerId: "L1" } },
      { id: "dev1", type: "device", parentId: "room1", data: { layerId: "default" } },
      { id: "dev2", type: "device", parentId: "room1" }, // no layerId → default
    ];
    const { hidden } = resolveNodeVisibility(nodes, L_HIDDEN, NONE);
    expect(hidden).toEqual(new Set(["room1", "dev1", "dev2"]));
  });

  test("does not hide devices in a visible room", () => {
    const nodes: VisibilityNode[] = [
      { id: "room1", type: "room", data: { layerId: "default" } },
      { id: "dev1", type: "device", parentId: "room1", data: { layerId: "default" } },
    ];
    const { hidden } = resolveNodeVisibility(nodes, L_HIDDEN, NONE);
    expect(hidden.size).toBe(0);
  });

  test("cascades through nested rooms (grandparent hidden → grandchild hidden)", () => {
    const nodes: VisibilityNode[] = [
      { id: "outer", type: "room", data: { layerId: "L1" } },
      { id: "inner", type: "room", parentId: "outer", data: { layerId: "default" } },
      { id: "dev", type: "device", parentId: "inner", data: { layerId: "default" } },
    ];
    const { hidden } = resolveNodeVisibility(nodes, L_HIDDEN, NONE);
    expect(hidden).toEqual(new Set(["outer", "inner", "dev"]));
  });

  test("cascades hidden state through group membership", () => {
    const nodes: VisibilityNode[] = [
      { id: "grp", data: { layerId: "L1" } },
      { id: "dev", data: { layerId: "default", groupId: "grp" } },
    ];
    const { hidden } = resolveNodeVisibility(nodes, L_HIDDEN, NONE);
    expect(hidden).toEqual(new Set(["grp", "dev"]));
  });

  test("resolves locked the same way, independently of hidden", () => {
    const nodes: VisibilityNode[] = [
      { id: "room1", type: "room", data: { layerId: "L2" } },
      { id: "dev1", type: "device", parentId: "room1", data: { layerId: "default" } },
    ];
    const { hidden, locked } = resolveNodeVisibility(nodes, NONE, new Set(["L2"]));
    expect(hidden.size).toBe(0);
    expect(locked).toEqual(new Set(["room1", "dev1"]));
  });

  test("survives cyclic parent references without infinite looping", () => {
    const nodes: VisibilityNode[] = [
      { id: "a", parentId: "b", data: { layerId: "default" } },
      { id: "b", parentId: "a", data: { layerId: "default" } },
    ];
    const { hidden } = resolveNodeVisibility(nodes, L_HIDDEN, NONE);
    expect(hidden.size).toBe(0);
  });

  test("returns empty sets when no layers are hidden or locked", () => {
    const nodes: VisibilityNode[] = [{ id: "a", data: { layerId: "L1" } }];
    const { hidden, locked } = resolveNodeVisibility(nodes, NONE, NONE);
    expect(hidden.size).toBe(0);
    expect(locked.size).toBe(0);
  });

  test("hides a node by its own id (per-item hide)", () => {
    const nodes: VisibilityNode[] = [
      { id: "a", data: { layerId: "default" } },
      { id: "b", data: { layerId: "default" } },
    ];
    const { hidden } = resolveNodeVisibility(nodes, NONE, NONE, { hiddenNodeIds: new Set(["a"]) });
    expect([...hidden]).toEqual(["a"]);
  });

  test("cascades a per-item hidden parent to its children", () => {
    const nodes: VisibilityNode[] = [
      { id: "room1", type: "room", data: { layerId: "default" } },
      { id: "dev1", type: "device", parentId: "room1", data: { layerId: "default" } },
    ];
    const { hidden } = resolveNodeVisibility(nodes, NONE, NONE, { hiddenNodeIds: new Set(["room1"]) });
    expect(hidden).toEqual(new Set(["room1", "dev1"]));
  });

  test("locks a node by its own id (per-item lock)", () => {
    const nodes: VisibilityNode[] = [{ id: "a", data: { layerId: "default" } }];
    const { locked } = resolveNodeVisibility(nodes, NONE, NONE, { lockedNodeIds: new Set(["a"]) });
    expect([...locked]).toEqual(["a"]);
  });

  test("solo: hides everything not in (or descended from) the soloed layer", () => {
    const nodes: VisibilityNode[] = [
      { id: "a", data: { layerId: "L1" } },
      { id: "b", data: { layerId: "L2" } },
      { id: "room", type: "room", data: { layerId: "L1" } },
      { id: "dev", type: "device", parentId: "room", data: { layerId: "default" } },
    ];
    const { hidden } = resolveNodeVisibility(nodes, NONE, NONE, { soloLayerId: "L1" });
    expect(hidden).toEqual(new Set(["b"]));
  });

  test("absent or empty opts preserves backward-compatible behavior", () => {
    const nodes: VisibilityNode[] = [{ id: "a", data: { layerId: "L1" } }];
    expect(resolveNodeVisibility(nodes, NONE, NONE).hidden.size).toBe(0);
    expect(resolveNodeVisibility(nodes, NONE, NONE, {}).hidden.size).toBe(0);
    expect(resolveNodeVisibility(nodes, NONE, NONE, { soloLayerId: null }).hidden.size).toBe(0);
  });
});

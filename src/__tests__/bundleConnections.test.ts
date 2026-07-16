import { describe, expect, test, beforeEach } from "vitest";
import { useSchematicStore } from "../store";
import type { ConnectionEdge } from "../types";

/** A selectable connection carrying a signal, optionally already bundled. */
const edge = (id: string, selected: boolean, bundleId?: string): ConnectionEdge =>
  ({
    id,
    source: "a",
    target: "b",
    sourceHandle: "out",
    targetHandle: "in",
    selected,
    data: { signalType: "analog-audio", ...(bundleId ? { bundleId } : {}) },
  }) as unknown as ConnectionEdge;

const bundleIds = () => useSchematicStore.getState().edges.map((e) => e.data?.bundleId);

describe("bundleSelectedConnections", () => {
  beforeEach(() => {
    useSchematicStore.setState({ edges: [] });
  });

  test("bundles every selected connection under one id", () => {
    useSchematicStore.setState({ edges: [edge("e1", true), edge("e2", true), edge("e3", false)] });

    useSchematicStore.getState().bundleSelectedConnections();

    const [b1, b2, b3] = bundleIds();
    expect(b1).toBeTruthy();
    expect(b2).toBe(b1); // same trunk
    expect(b3).toBeUndefined(); // unselected run untouched
  });

  test("a single connection is not a multicore — no-op below two", () => {
    // Bundling one run would draw a trunk around it and claim a snake that does not exist.
    useSchematicStore.setState({ edges: [edge("e1", true), edge("e2", false)] });

    useSchematicStore.getState().bundleSelectedConnections();

    expect(bundleIds()).toEqual([undefined, undefined]);
  });

  test("extends an existing trunk rather than splitting it in two", () => {
    // e1 is already in "snake-1"; selecting it with a loose run must widen that snake.
    useSchematicStore.setState({ edges: [edge("e1", true, "snake-1"), edge("e2", true)] });

    useSchematicStore.getState().bundleSelectedConnections();

    expect(bundleIds()).toEqual(["snake-1", "snake-1"]);
  });

  test("never changes the connection count — bundling groups, it does not merge", () => {
    useSchematicStore.setState({ edges: [edge("e1", true), edge("e2", true), edge("e3", true)] });

    useSchematicStore.getState().bundleSelectedConnections();

    // A 3-run snake is still three cables to pull.
    expect(useSchematicStore.getState().edges).toHaveLength(3);
    expect(useSchematicStore.getState().edges.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
  });
});

describe("unbundleSelectedConnections", () => {
  beforeEach(() => {
    useSchematicStore.setState({ edges: [] });
  });

  test("clears the bundle on selected members only", () => {
    useSchematicStore.setState({
      edges: [edge("e1", true, "snake-1"), edge("e2", false, "snake-1")],
    });

    useSchematicStore.getState().unbundleSelectedConnections();

    expect(bundleIds()).toEqual([undefined, "snake-1"]);
  });

  test("is a no-op when nothing selected is bundled", () => {
    useSchematicStore.setState({ edges: [edge("e1", true), edge("e2", false, "snake-1")] });

    useSchematicStore.getState().unbundleSelectedConnections();

    expect(bundleIds()).toEqual([undefined, "snake-1"]);
  });
});

describe("bundleConnections", () => {
  beforeEach(() => {
    useSchematicStore.setState({ edges: [] });
  });

  test("preserves other connection data", () => {
    useSchematicStore.setState({ edges: [edge("e1", false)] });

    useSchematicStore.getState().bundleConnections(["e1"], "snake-9");

    expect(useSchematicStore.getState().edges[0].data?.signalType).toBe("analog-audio");
    expect(useSchematicStore.getState().edges[0].data?.bundleId).toBe("snake-9");
  });

  test("ignores an empty id list", () => {
    useSchematicStore.setState({ edges: [edge("e1", false, "snake-1")] });

    useSchematicStore.getState().bundleConnections([], null);

    expect(bundleIds()).toEqual(["snake-1"]);
  });
});

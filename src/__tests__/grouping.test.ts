import { describe, expect, test } from "vitest";
import {
  groupIdOf,
  expandToGroupSiblings,
  withGroupId,
  withoutGroupId,
} from "../grouping";

const nodes = [
  { id: "a", data: { groupId: "g1" } },
  { id: "b", data: { groupId: "g1" } },
  { id: "c", data: { groupId: "g2" } },
  { id: "d", data: {} },
];

describe("groupIdOf", () => {
  test("returns the group id when set", () => {
    expect(groupIdOf({ id: "a", data: { groupId: "g1" } })).toBe("g1");
  });
  test("returns undefined for ungrouped or empty-string group", () => {
    expect(groupIdOf({ id: "d", data: {} })).toBeUndefined();
    expect(groupIdOf({ id: "e", data: { groupId: "" } })).toBeUndefined();
    expect(groupIdOf({ id: "f" })).toBeUndefined();
  });
});

describe("expandToGroupSiblings", () => {
  test("dragging one group member expands to all members (the B3 fix)", () => {
    expect(expandToGroupSiblings(nodes, ["a"])).toEqual(new Set(["a", "b"]));
  });

  test("an ungrouped node expands to only itself", () => {
    expect(expandToGroupSiblings(nodes, ["d"])).toEqual(new Set(["d"]));
  });

  test("a multi-selection across groups expands each group", () => {
    expect(expandToGroupSiblings(nodes, ["a", "c"])).toEqual(
      new Set(["a", "b", "c"]),
    );
  });

  test("preserves ungrouped seeds alongside expanded groups", () => {
    expect(expandToGroupSiblings(nodes, ["a", "d"])).toEqual(
      new Set(["a", "b", "d"]),
    );
  });
});

describe("withGroupId", () => {
  test("sets groupId on the targeted ids and keeps other refs", () => {
    const seed = [
      { id: "x", data: { layerId: "L1" } },
      { id: "y", data: {} },
    ];
    const out = withGroupId(seed, new Set(["x"]), "gNew");
    expect(out[0].data).toEqual({ layerId: "L1", groupId: "gNew" });
    expect(out[1]).toBe(seed[1]); // untouched node keeps its reference
  });
});

describe("withoutGroupId", () => {
  test("removes groupId from the targeted ids", () => {
    const out = withoutGroupId(nodes, new Set(["a", "b"]));
    expect(groupIdOf(out[0])).toBeUndefined();
    expect(groupIdOf(out[1])).toBeUndefined();
    expect(groupIdOf(out[2])).toBe("g2"); // c untouched
  });

  test("leaves already-ungrouped nodes by reference", () => {
    const out = withoutGroupId(nodes, new Set(["d"]));
    expect(out[3]).toBe(nodes[3]);
  });
});

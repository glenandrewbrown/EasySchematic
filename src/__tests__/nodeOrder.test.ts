import { describe, expect, it } from "vitest";
import { reorderNodesByZ } from "../nodeOrder";

const ids = (ns: ReadonlyArray<{ id: string }>) => ns.map((n) => n.id);

describe("reorderNodesByZ", () => {
  // room is the parent; a/b/c are its children (paint order a→b→c, c on top).
  const base = [
    { id: "room" },
    { id: "a", parentId: "room" },
    { id: "b", parentId: "room" },
    { id: "c", parentId: "room" },
  ];

  it("moves a node after a later sibling", () => {
    expect(ids(reorderNodesByZ(base, "a", "c", "after"))).toEqual(["room", "b", "c", "a"]);
  });

  it("moves a node before a later sibling", () => {
    expect(ids(reorderNodesByZ(base, "a", "c", "before"))).toEqual(["room", "b", "a", "c"]);
  });

  it("moves a node before an earlier sibling", () => {
    expect(ids(reorderNodesByZ(base, "c", "a", "before"))).toEqual(["room", "c", "a", "b"]);
  });

  it("moves a node after an earlier sibling", () => {
    expect(ids(reorderNodesByZ(base, "c", "a", "after"))).toEqual(["room", "a", "c", "b"]);
  });

  it("is a no-op when dragged === target", () => {
    expect(ids(reorderNodesByZ(base, "a", "a", "before"))).toEqual(["room", "a", "b", "c"]);
  });

  it("is a no-op when an id is missing", () => {
    expect(ids(reorderNodesByZ(base, "x", "a", "before"))).toEqual(["room", "a", "b", "c"]);
    expect(ids(reorderNodesByZ(base, "a", "y", "after"))).toEqual(["room", "a", "b", "c"]);
  });

  it("refuses cross-parent reorder (preserves parent-before-child invariant)", () => {
    const mixed = [
      { id: "r1" },
      { id: "d1", parentId: "r1" },
      { id: "r2" },
      { id: "d2", parentId: "r2" },
    ];
    expect(ids(reorderNodesByZ(mixed, "d1", "d2", "after"))).toEqual(["r1", "d1", "r2", "d2"]);
  });

  it("reorders top-level siblings (both parentless)", () => {
    const top = [{ id: "r1" }, { id: "r2" }, { id: "r3" }];
    expect(ids(reorderNodesByZ(top, "r1", "r3", "after"))).toEqual(["r2", "r3", "r1"]);
  });

  it("does not mutate the input array", () => {
    const input = base.map((n) => ({ ...n }));
    const snapshot = ids(input);
    reorderNodesByZ(input, "a", "c", "after");
    expect(ids(input)).toEqual(snapshot);
  });

  it("preserves the full node set", () => {
    const out = reorderNodesByZ(base, "a", "c", "after");
    expect([...ids(out)].sort()).toEqual(["a", "b", "c", "room"]);
  });
});

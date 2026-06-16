import { describe, expect, test } from "vitest";
import {
  chainLength,
  fitStatus,
  remainingQuantities,
  suggestChain,
  intraRoomDistance,
  metersToUnit,
  EXCESS_RATIO,
} from "../cableFit";
import type { OwnedCableItem, SchematicNode, ConnectionEdge } from "../types";

const cable = (id: string, length: number, quantity = 1): OwnedCableItem => ({
  id,
  label: `${id} ${length}m`,
  length,
  quantity,
});

describe("chainLength", () => {
  test("sums the lengths of all cables in a chain", () => {
    // Arrange
    const chain = [cable("a", 10), cable("b", 5), cable("c", 2.5)];

    // Act / Assert
    expect(chainLength(chain)).toBe(17.5);
  });

  test("returns 0 for an empty chain", () => {
    expect(chainLength([])).toBe(0);
  });
});

describe("fitStatus", () => {
  test("returns short when the chain cannot cover the required run", () => {
    expect(fitStatus(20, 15)).toBe("short");
  });

  test("returns ok when the chain covers the run within the excess ratio", () => {
    expect(fitStatus(20, 20)).toBe("ok");
    expect(fitStatus(20, 20 * EXCESS_RATIO)).toBe("ok");
  });

  test("returns excess when the chain is wastefully long", () => {
    expect(fitStatus(10, 10 * EXCESS_RATIO + 0.1)).toBe("excess");
  });

  test("returns unknown when no required length is available", () => {
    expect(fitStatus(undefined, 15)).toBe("unknown");
  });

  test("returns unknown when nothing is assigned yet", () => {
    expect(fitStatus(20, 0)).toBe("unknown");
  });
});

describe("remainingQuantities", () => {
  const edges = [
    { id: "e1", data: { signalType: "sdi", assignedCableIds: ["a", "b"] } },
    { id: "e2", data: { signalType: "sdi", assignedCableIds: ["a"] } },
  ] as unknown as ConnectionEdge[];

  test("subtracts every use across all edges from the owned quantity", () => {
    const remaining = remainingQuantities([cable("a", 10, 3), cable("b", 5, 1)], edges);
    expect(remaining.get("a")).toBe(1);
    expect(remaining.get("b")).toBe(0);
  });

  test("never reports negative remaining quantities", () => {
    const remaining = remainingQuantities([cable("a", 10, 1)], edges);
    expect(remaining.get("a")).toBe(0);
  });
});

describe("suggestChain", () => {
  test("prefers a single cable that covers the run with least overage", () => {
    const pool = [
      { cable: cable("ten", 10), remaining: 1 },
      { cable: cable("twenty", 20), remaining: 1 },
      { cable: cable("fifty", 50), remaining: 1 },
    ];
    const chain = suggestChain(18, pool);
    expect(chain?.map((c) => c.id)).toEqual(["twenty"]);
  });

  test("chains multiple cables when no single cable is long enough", () => {
    const pool = [
      { cable: cable("ten", 10), remaining: 2 },
      { cable: cable("five", 5), remaining: 1 },
    ];
    const chain = suggestChain(18, pool);
    expect(chainLength(chain ?? [])).toBeGreaterThanOrEqual(18);
    expect(chain?.length).toBe(2);
  });

  test("respects remaining quantities", () => {
    const pool = [{ cable: cable("ten", 10), remaining: 1 }];
    expect(suggestChain(18, pool)).toBeNull();
  });

  test("returns null when the run cannot be covered at all", () => {
    const pool = [{ cable: cable("two", 2), remaining: 3 }];
    expect(suggestChain(100, pool)).toBeNull();
  });
});

describe("metersToUnit", () => {
  test("passes meters through unchanged", () => {
    expect(metersToUnit(10, "m")).toBe(10);
  });

  test("converts meters to feet", () => {
    expect(metersToUnit(10, "ft")).toBeCloseTo(32.8084, 3);
  });
});

describe("intraRoomDistance", () => {
  const nodes = [
    {
      id: "room1",
      type: "room",
      position: { x: 0, y: 0 },
      width: 400,
      data: { label: "Stage", widthM: 8 },
    },
    {
      id: "devA",
      type: "device",
      parentId: "room1",
      position: { x: 0, y: 0 },
      data: { label: "A" },
    },
    {
      id: "devB",
      type: "device",
      parentId: "room1",
      position: { x: 200, y: 100 },
      data: { label: "B" },
    },
    {
      id: "devC",
      type: "device",
      position: { x: 900, y: 0 },
      data: { label: "C" },
    },
  ] as unknown as SchematicNode[];

  test("derives meters from manhattan pixel distance at the document scale", () => {
    // Document scale 0.02 m/px. Manhattan distance 300px = 6m.
    expect(intraRoomDistance(nodes, "devA", "devB", 0.02)).toBeCloseTo(6, 5);
  });

  test("returns undefined when devices are not in the same room", () => {
    expect(intraRoomDistance(nodes, "devA", "devC", 0.02)).toBeUndefined();
  });

  test("returns undefined when the document scale is non-positive", () => {
    expect(intraRoomDistance(nodes, "devA", "devB", 0)).toBeUndefined();
  });
});

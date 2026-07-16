import { describe, expect, test } from "vitest";
import {
  buildCableScheduleCsv,
  computeCableSchedule,
  groupCableScheduleByBundle,
} from "../cableSchedule";
import type { CableScheduleRow } from "../cableSchedule";
import type { SchematicNode, ConnectionEdge } from "../types";

/** A desk feeding a sub — the design's SNAKE-1 case: several legs down one multicore. */
function nodes(): SchematicNode[] {
  return [
    {
      id: "apollo",
      type: "device",
      position: { x: 0, y: 0 },
      data: {
        label: "UA Apollo 8p",
        ports: [
          { id: "o1", label: "Monitor L", signalType: "analog-audio", direction: "output", connectorType: "xlr3" },
          { id: "o2", label: "Monitor R", signalType: "analog-audio", direction: "output", connectorType: "xlr3" },
          { id: "o3", label: "Line Out 3", signalType: "analog-audio", direction: "output", connectorType: "xlr3" },
        ],
      },
    },
    {
      id: "sub",
      type: "device",
      position: { x: 400, y: 0 },
      data: {
        label: "Genelec 7360A",
        ports: [
          { id: "i1", label: "Input 1", signalType: "analog-audio", direction: "input", connectorType: "xlr3" },
          { id: "i2", label: "Input 2", signalType: "analog-audio", direction: "input", connectorType: "xlr3" },
          { id: "i3", label: "Input 3", signalType: "analog-audio", direction: "input", connectorType: "xlr3" },
        ],
      },
    },
  ] as unknown as SchematicNode[];
}

const edge = (
  id: string,
  sourceHandle: string,
  targetHandle: string,
  bundleId?: string,
): ConnectionEdge =>
  ({
    id,
    source: "apollo",
    sourceHandle,
    target: "sub",
    targetHandle,
    data: { signalType: "analog-audio", ...(bundleId ? { bundleId } : {}) },
  }) as unknown as ConnectionEdge;

/** Minimal row for the pure grouping function — only the fields it reads. */
const row = (cableId: string, bundleId?: string): CableScheduleRow =>
  ({ edgeId: cableId, cableId, bundleId }) as unknown as CableScheduleRow;

describe("computeCableSchedule — bundle column", () => {
  test("carries bundleId through onto each member's row", () => {
    // Arrange: two legs down one snake, one loose run.
    const rows = computeCableSchedule(nodes(), [
      edge("e1", "o1", "i1", "snake1"),
      edge("e2", "o2", "i2", "snake1"),
      edge("e3", "o3", "i3"),
    ]);

    // Assert: bundling is presentation — every leg still has its own row.
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.bundleId)).toEqual(["snake1", "snake1", undefined]);
  });

  test("bundled legs keep their own cable IDs — a trunk is not one cable", () => {
    const rows = computeCableSchedule(nodes(), [
      edge("e1", "o1", "i1", "snake1"),
      edge("e2", "o2", "i2", "snake1"),
    ]);

    expect(rows.map((r) => r.cableId)).toEqual(["C001", "C002"]);
  });

  test("bundleId survives the type-prefix naming scheme", () => {
    const rows = computeCableSchedule(
      nodes(),
      [edge("e1", "o1", "i1", "snake1"), edge("e2", "o2", "i2", "snake1")],
      "type-prefix",
    );

    expect(rows.map((r) => r.cableId)).toEqual(["A001", "A002"]);
    expect(rows.map((r) => r.bundleId)).toEqual(["snake1", "snake1"]);
  });

  test("a document with no bundles leaves bundleId unset on every row", () => {
    // The inert case: nothing in the schedule changes until a connection is actually bundled.
    const rows = computeCableSchedule(nodes(), [edge("e1", "o1", "i1"), edge("e2", "o2", "i2")]);

    expect(rows.every((r) => r.bundleId === undefined)).toBe(true);
  });
});

describe("groupCableScheduleByBundle", () => {
  test("moves a bundle's legs together without merging them", () => {
    // Arrange: snake legs interleaved with loose runs, as drawn order would leave them.
    const grouped = groupCableScheduleByBundle([
      row("C001", "snake1"),
      row("C002"),
      row("C003", "snake1"),
      row("C004"),
    ]);

    expect(grouped).toHaveLength(4); // never merges rows
    expect(grouped.map((r) => r.cableId)).toEqual(["C001", "C003", "C002", "C004"]);
  });

  test("keeps schedule order within a bundle", () => {
    const grouped = groupCableScheduleByBundle([
      row("C003", "snake1"),
      row("C001", "snake1"),
      row("C002", "snake1"),
    ]);

    // Stable: cable numbering order inside the trunk is preserved, not re-sorted by id.
    expect(grouped.map((r) => r.cableId)).toEqual(["C003", "C001", "C002"]);
  });

  test("orders bundles by id and puts loose runs last", () => {
    const grouped = groupCableScheduleByBundle([
      row("C001"),
      row("C002", "snake2"),
      row("C003", "snake1"),
    ]);

    expect(grouped.map((r) => r.bundleId)).toEqual(["snake1", "snake2", undefined]);
  });

  test("is a no-op ordering when nothing is bundled", () => {
    const rows = [row("C001"), row("C002"), row("C003")];

    expect(groupCableScheduleByBundle(rows).map((r) => r.cableId)).toEqual([
      "C001",
      "C002",
      "C003",
    ]);
  });

  test("does not mutate the input array", () => {
    const rows = [row("C001"), row("C002", "snake1")];

    groupCableScheduleByBundle(rows);

    expect(rows.map((r) => r.cableId)).toEqual(["C001", "C002"]);
  });
});

describe("buildCableScheduleCsv — bundle column", () => {
  /** Split a CSV line on commas that are not inside quotes. */
  const cells = (line: string): string[] =>
    (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? [])
      .map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'))
      .slice(0, -1);

  test("exports a Bundle column carrying each leg's bundle", () => {
    // The CSV is what someone packs a van from — it must agree with the on-screen schedule.
    const csv = buildCableScheduleCsv(
      computeCableSchedule(nodes(), [
        edge("e1", "o1", "i1", "snake1"),
        edge("e2", "o2", "i2"),
      ]),
      "Studio",
    );
    const lines = csv.split("\n");
    const header = cells(lines[3]);
    const bundleCol = header.indexOf("Bundle");

    expect(bundleCol).toBeGreaterThan(-1);
    expect(cells(lines[4])[bundleCol]).toBe("snake1");
    expect(cells(lines[5])[bundleCol]).toBe(""); // loose run — blank, not "undefined"
  });

  test("emits one CSV row per bundled leg — a trunk is never merged into one line", () => {
    const csv = buildCableScheduleCsv(
      computeCableSchedule(nodes(), [
        edge("e1", "o1", "i1", "snake1"),
        edge("e2", "o2", "i2", "snake1"),
        edge("e3", "o3", "i3", "snake1"),
      ]),
      "Studio",
    );

    // 3 preamble lines (title/date/blank) + 1 header + 3 legs.
    expect(csv.split("\n")).toHaveLength(7);
  });
});

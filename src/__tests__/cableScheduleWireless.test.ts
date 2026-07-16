import { describe, expect, test } from "vitest";
import { computeCableSchedule } from "../cableSchedule";
import type { SchematicNode, ConnectionEdge } from "../types";

/** Two devices, wired mic → mixer, plus a wireless TX → RX pair. */
function nodes(): SchematicNode[] {
  return [
    {
      id: "mic",
      type: "device",
      position: { x: 0, y: 0 },
      data: {
        label: "Wired Mic",
        ports: [{ id: "out", label: "Out", signalType: "analog-audio", direction: "output", connectorType: "xlr3" }],
      },
    },
    {
      id: "mixer",
      type: "device",
      position: { x: 400, y: 0 },
      data: {
        label: "Mixer",
        ports: [
          { id: "in1", label: "In 1", signalType: "analog-audio", direction: "input", connectorType: "xlr3" },
          { id: "in2", label: "In 2", signalType: "analog-audio", direction: "input", connectorType: "wireless" },
        ],
      },
    },
    {
      id: "tx",
      type: "device",
      position: { x: 0, y: 200 },
      data: {
        label: "Wireless TX",
        ports: [{ id: "air", label: "Air", signalType: "analog-audio", direction: "output", connectorType: "wireless" }],
      },
    },
  ] as unknown as SchematicNode[];
}

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): ConnectionEdge =>
  ({ id, source, sourceHandle, target, targetHandle, data: { signalType: "analog-audio" } }) as unknown as ConnectionEdge;

describe("computeCableSchedule — wireless exclusion", () => {
  test("a wireless link produces no schedule row", () => {
    // Arrange: one real cable run, one wireless broadcast into the same mixer.
    const rows = computeCableSchedule(nodes(), [
      edge("wired", "mic", "out", "mixer", "in1"),
      edge("air", "tx", "air", "mixer", "in2"),
    ]);

    // Assert: only the physical run is scheduled — a broadcast has no cable to pull.
    expect(rows).toHaveLength(1);
    expect(rows[0].edgeId).toBe("wired");
  });

  test("keeps ordinary wired runs", () => {
    const rows = computeCableSchedule(nodes(), [edge("wired", "mic", "out", "mixer", "in1")]);
    expect(rows.map((r) => r.edgeId)).toEqual(["wired"]);
  });

  test("excludes the link whichever end carries the wireless connector", () => {
    // The wireless connector on the TARGET side alone is enough to exclude the run.
    const rows = computeCableSchedule(nodes(), [edge("air", "mic", "out", "mixer", "in2")]);
    expect(rows).toHaveLength(0);
  });
});

import { describe, it, expect } from "vitest";
import { buildSignalFlowTrace, type TraceHop } from "../signalFlowTrace";
import { patchbayArtifacts } from "../devices/_helpers";
import type { ConnectionEdge, DeviceData, SchematicNode } from "../types";

/** Minimal device node — the trace engine only reads label/connectors/ports/channels/patchbay. */
function deviceNode(id: string, data: Partial<DeviceData>): SchematicNode {
  return {
    id,
    type: "device",
    position: { x: 0, y: 0 },
    data: { id, label: id, ports: [], ...data } as DeviceData,
  } as unknown as SchematicNode;
}

function conn(id: string, source: string, sourceConnectorId: string, target: string, targetConnectorId: string): ConnectionEdge {
  return {
    id,
    source,
    target,
    data: { signalType: "analog-audio", sourceConnectorId, targetConnectorId },
  } as unknown as ConnectionEdge;
}

function leaves(root: TraceHop): TraceHop[] {
  const out: TraceHop[] = [];
  const stack = [root];
  while (stack.length) {
    const h = stack.pop() as TraceHop;
    if (h.children.length === 0) out.push(h);
    else stack.push(...h.children);
  }
  return out;
}

function firstPatchHop(root: TraceHop): TraceHop | undefined {
  const stack = [root];
  while (stack.length) {
    const h = stack.pop() as TraceHop;
    if (h.kind === "patch") return h;
    stack.push(...h.children);
  }
  return undefined;
}

/** A half-normalled patchbay wired: Console → pt1 rearA, pt1 rearB → Monitor. */
function baseNodes(): SchematicNode[] {
  const pb = patchbayArtifacts(2, { signalType: "analog-audio", mode: "half-normalled" });
  return [
    deviceNode("console", { label: "Console", connectors: [{ id: "con-out", label: "Main Out", type: "trs-quarter", role: "physical", carries: [] }] }),
    deviceNode("monitor", { label: "Monitor", connectors: [{ id: "mon-in", label: "Line In", type: "trs-quarter", role: "physical", carries: [] }] }),
    deviceNode("recorder", { label: "Recorder", connectors: [{ id: "rec-in", label: "Rec In", type: "trs-quarter", role: "physical", carries: [] }] }),
    deviceNode("pb", { label: "Patchbay", connectors: pb.connectors, channels: pb.channels, patchbay: pb.patchbay }),
  ];
}

describe("buildSignalFlowTrace — patchbay normalling", () => {
  it("classic case: Console → half-normal → Monitor still fed AND a Recorder tap flags a passive split", () => {
    const nodes = baseNodes();
    const edges: ConnectionEdge[] = [
      conn("e1", "console", "con-out", "pb", "pt1-rearA"),
      conn("e2", "pb", "pt1-rearB", "monitor", "mon-in"),
      conn("e3", "pb", "pt1-frontA", "recorder", "rec-in"), // front-A patched → tap
    ];

    const trace = buildSignalFlowTrace({ kind: "connection", edgeId: "e1" }, nodes, edges);
    expect(trace).not.toBeNull();
    if (!trace) return;

    expect(trace.root.kind).toBe("source");
    expect(trace.root.ref.deviceLabel).toBe("Console");
    expect(trace.hasPassiveSplit).toBe(true);
    expect(trace.hasBreak).toBe(false);

    const patch = firstPatchHop(trace.root);
    expect(patch?.marker).toBe("passive-split");
    expect(patch?.advisory).toMatch(/passive mult/);
    expect(patch?.children.length).toBe(2); // fork: monitor + recorder

    const sinkLabels = leaves(trace.root).map((l) => l.ref.deviceLabel);
    expect(sinkLabels).toContain("Monitor"); // monitor still fed
    expect(sinkLabels).toContain("Recorder");
  });

  it("broken normal: a front-B insert severs the normal so the tie-line dead-ends with a break marker", () => {
    const nodes = baseNodes();
    const edges: ConnectionEdge[] = [
      conn("e1", "console", "con-out", "pb", "pt1-rearA"),
      conn("e2", "pb", "pt1-rearB", "monitor", "mon-in"),
      conn("e3", "pb", "pt1-frontB", "recorder", "rec-in"), // front-B insert breaks the normal
    ];

    const trace = buildSignalFlowTrace({ kind: "connection", edgeId: "e1" }, nodes, edges);
    expect(trace).not.toBeNull();
    if (!trace) return;

    expect(trace.hasBreak).toBe(true);
    const patch = firstPatchHop(trace.root);
    expect(patch?.marker).toBe("break");
    expect(patch?.patch?.normalBroken).toBe(true);
    // The normal is broken, so Console no longer reaches the Monitor through this point.
    const sinkLabels = leaves(trace.root).map((l) => l.ref.deviceLabel);
    expect(sinkLabels).not.toContain("Monitor");
  });

  it("returns null for a stale trigger", () => {
    const trace = buildSignalFlowTrace({ kind: "connection", edgeId: "nope" }, baseNodes(), []);
    expect(trace).toBeNull();
  });
});

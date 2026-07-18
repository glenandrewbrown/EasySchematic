import { describe, it, expect } from "vitest";
import { migrateSchematic, CURRENT_SCHEMA_VERSION } from "../migrations";
import { DEVICE_TEMPLATES } from "../deviceLibrary";
import { patchbayArtifacts } from "../devices/_helpers";

/** Minimal v50 file overlaid with the given fields. */
function v50File(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { version: 50, name: "t", nodes: [], edges: [], ...extra };
}

describe("v50 → v51 channel/connector migration (pure bump)", () => {
  it("bumps a v50 file to the current schema version", () => {
    const out = migrateSchematic(v50File());
    expect(out.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(CURRENT_SCHEMA_VERSION).toBe(51);
  });

  it("leaves an existing single-port device untouched (legacy Port[] survives)", () => {
    const device = {
      id: "d1",
      type: "device",
      position: { x: 0, y: 0 },
      data: {
        label: "Simple",
        deviceType: "audio-mixer",
        ports: [{ id: "p1", label: "In 1", signalType: "analog-audio", direction: "input" }],
      },
    };
    const out = migrateSchematic(v50File({ nodes: [device] }));
    const d = out.nodes.find((n: { id: string }) => n.id === "d1");
    expect(d.data.ports).toHaveLength(1);
    expect(d.data.ports[0].id).toBe("p1");
    expect(d.data.channels).toBeUndefined();
    expect(d.data.connectors).toBeUndefined();
  });

  it("preserves additive channel/connector/patchbay data through migration", () => {
    const artifacts = patchbayArtifacts(2);
    const device = {
      id: "pb",
      type: "device",
      position: { x: 0, y: 0 },
      data: { label: "Patchbay", deviceType: "patch-panel", ports: [], ...artifacts },
    };
    const out = migrateSchematic(v50File({ nodes: [device] }));
    const d = out.nodes.find((n: { id: string }) => n.id === "pb");
    expect(d.data.channels).toHaveLength(4); // 2 points × A/B
    expect(d.data.connectors).toHaveLength(8); // 2 points × 4 jacks
    expect(d.data.patchbay.points).toHaveLength(2);
    expect(d.data.patchbay.points[0].mode).toBe("half-normalled");
  });

  it("preserves additive connection fields through migration", () => {
    const edge = {
      id: "e1",
      source: "a",
      target: "b",
      data: { signalType: "analog-audio", sourceConnectorId: "db25-out", targetConnectorId: "db25-in", channelCount: 8 },
    };
    const internalEdge = {
      id: "e2",
      source: "d",
      target: "d",
      sourceHandle: "ain1",
      targetHandle: "mix-bus",
      data: { signalType: "analog-audio", internal: true },
    };
    const out = migrateSchematic(v50File({ edges: [edge, internalEdge] }));
    const e = out.edges.find((x: { id: string }) => x.id === "e1");
    expect(e.data.channelCount).toBe(8);
    expect(e.data.sourceConnectorId).toBe("db25-out");
    const ie = out.edges.find((x: { id: string }) => x.id === "e2");
    expect(ie.data.internal).toBe(true);
  });

  it("is idempotent: migrating an already-v51 file is a no-op version-wise", () => {
    const once = migrateSchematic(v50File());
    const twice = migrateSchematic(once);
    expect(twice.version).toBe(CURRENT_SCHEMA_VERSION);
  });
});

describe("patchbayArtifacts builder", () => {
  it("builds A/B channels + four jacks per point with correct jack roles + mutex", () => {
    const { channels, connectors, patchbay } = patchbayArtifacts(1);
    expect(channels.map((c) => c.id)).toEqual(["pt1-a", "pt1-b"]);
    expect(channels[0].direction).toBe("in");
    expect(channels[1].direction).toBe("out");

    const roles = connectors.map((c) => c.jackRole);
    expect(roles).toEqual(["rearA", "rearB", "frontA", "frontB"]);
    // frontA and rearA both carry channel A → patching the front occupies the rear.
    const frontA = connectors.find((c) => c.jackRole === "frontA")!;
    const rearA = connectors.find((c) => c.jackRole === "rearA")!;
    expect(frontA.carries).toEqual(["pt1-a"]);
    expect(rearA.carries).toEqual(["pt1-a"]);
    expect(connectors.every((c) => c.patchPointId === "pt1")).toBe(true);

    expect(patchbay.points).toEqual([{ id: "pt1", label: "1", mode: "half-normalled" }]);
  });
});

describe("Neutrik NYS-SPP-L1 patchbay template", () => {
  const patchbay = DEVICE_TEMPLATES.find((t) => t.modelNumber === "NYS-SPP-L1");

  it("is registered in the device library", () => {
    expect(patchbay).toBeDefined();
  });

  it("carries the 24-point / 48-channel / 96-jack channel model + half-normal mode", () => {
    expect(patchbay!.channels).toHaveLength(48); // 24 × A/B
    expect(patchbay!.connectors).toHaveLength(96); // 24 × 4 jacks
    expect(patchbay!.patchbay!.points).toHaveLength(24);
    expect(patchbay!.patchbay!.points.every((p) => p.mode === "half-normalled")).toBe(true);
  });

  it("still carries the legacy passthrough ports for canvas render/anchoring", () => {
    expect(patchbay!.ports).toHaveLength(24);
    expect(patchbay!.ports.every((p) => p.direction === "passthrough")).toBe(true);
  });
});

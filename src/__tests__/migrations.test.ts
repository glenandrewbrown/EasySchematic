import { describe, it, expect, vi } from "vitest";
import { migrateSchematic, CURRENT_SCHEMA_VERSION, STUB_LABEL_Z_INDEX } from "../migrations";
import { DEFAULT_GRID_SETTINGS, DEFAULT_METRES_PER_PIXEL } from "../types";

/** Minimal v46 file with the given room/device nodes. */
function v46File(nodes: unknown[]): Record<string, unknown> {
  return { version: 46, name: "t", nodes, edges: [] };
}

/** Minimal v47 file, overlaid with the given fields. */
function v47File(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { version: 47, name: "t", nodes: [], edges: [], ...extra };
}

describe("v46 → v47 document-scale migration", () => {
  it("adopts the most-common room scale as metresPerPixel", () => {
    const file = v46File([
      { id: "r1", type: "room", position: { x: 0, y: 0 }, width: 400, data: { widthM: 8 } }, // 0.02
      { id: "r2", type: "room", position: { x: 0, y: 0 }, width: 250, data: { widthM: 5 } }, // 0.02
      { id: "r3", type: "room", position: { x: 0, y: 0 }, width: 200, data: { widthM: 10 } }, // 0.05
    ]);
    const out = migrateSchematic(file);
    expect(out.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.gridSettings.metresPerPixel).toBeCloseTo(0.02, 6);
  });

  it("writes a complete GridSettings so other grid defaults survive load", () => {
    const out = migrateSchematic(v46File([]));
    // No rooms → default scale, but every other GridSettings field must be present.
    expect(out.gridSettings.metresPerPixel).toBeCloseTo(DEFAULT_METRES_PER_PIXEL, 6);
    expect(out.gridSettings.snapStep).toBe(DEFAULT_GRID_SETTINGS.snapStep);
    expect(out.gridSettings.layoutGridStyle).toBe(DEFAULT_GRID_SETTINGS.layoutGridStyle);
  });

  it("leaves a room already at the document scale untouched", () => {
    const file = v46File([
      { id: "r1", type: "room", position: { x: 0, y: 0 }, width: 400, data: { widthM: 8 } },
      { id: "r2", type: "room", position: { x: 0, y: 0 }, width: 250, data: { widthM: 5 } },
    ]);
    const out = migrateSchematic(file);
    const r1 = out.nodes.find((n: { id: string }) => n.id === "r1");
    expect(r1.width).toBe(400); // unchanged
    expect(r1.data.widthM).toBe(8); // real dimension preserved
  });

  it("rescales an off-scale room's box to match the document scale, preserving widthM", () => {
    const file = v46File([
      { id: "r1", type: "room", position: { x: 0, y: 0 }, width: 400, data: { widthM: 8 } }, // 0.02 (document)
      { id: "r2", type: "room", position: { x: 0, y: 0 }, width: 200, data: { widthM: 10 } }, // 0.05 → rescale
    ]);
    const out = migrateSchematic(file);
    const r2 = out.nodes.find((n: { id: string }) => n.id === "r2");
    // New px width must equal widthM / documentScale = 10 / 0.02 = 500.
    expect(r2.width).toBeCloseTo(500, 4);
    // Real dimension is preserved.
    expect(r2.data.widthM).toBe(10);
    // The room is now consistent with the document scale.
    expect(r2.data.widthM / r2.width).toBeCloseTo(0.02, 6);
  });

  it("scales an off-scale room's children by the same factor (preserves real geometry)", () => {
    const file = v46File([
      { id: "r1", type: "room", position: { x: 0, y: 0 }, width: 400, data: { widthM: 8 } }, // document 0.02
      { id: "r2", type: "room", position: { x: 0, y: 0 }, width: 200, data: { widthM: 10 } }, // 0.05 → k = 0.05/0.02 = 2.5
      { id: "d1", type: "device", parentId: "r2", position: { x: 40, y: 20 }, data: {} },
    ]);
    const out = migrateSchematic(file);
    const d1 = out.nodes.find((n: { id: string }) => n.id === "d1");
    expect(d1.position.x).toBeCloseTo(100, 4); // 40 * 2.5
    expect(d1.position.y).toBeCloseTo(50, 4); // 20 * 2.5
  });

  it("does not move children of an on-scale room", () => {
    const file = v46File([
      { id: "r1", type: "room", position: { x: 0, y: 0 }, width: 400, data: { widthM: 8 } },
      { id: "r2", type: "room", position: { x: 0, y: 0 }, width: 250, data: { widthM: 5 } },
      { id: "d1", type: "device", parentId: "r1", position: { x: 40, y: 20 }, data: {} },
    ]);
    const out = migrateSchematic(file);
    const d1 = out.nodes.find((n: { id: string }) => n.id === "d1");
    expect(d1.position.x).toBe(40);
    expect(d1.position.y).toBe(20);
  });

  it("is replay-safe — a second pass over an already-scaled document is a no-op", () => {
    const once = migrateSchematic(
      v46File([
        { id: "r1", type: "room", position: { x: 0, y: 0 }, width: 400, data: { widthM: 8 } },
        { id: "r2", type: "room", position: { x: 0, y: 0 }, width: 200, data: { widthM: 10 } },
      ]),
    );
    const twice = migrateSchematic({ ...structuredClone(once), version: 46 });
    expect(twice.nodes).toEqual(once.nodes);
    expect(twice.gridSettings.metresPerPixel).toBeCloseTo(once.gridSettings.metresPerPixel, 6);
  });
});

describe("v47 → v48 additive-fields migration", () => {
  it("bumps the version and changes nothing else", () => {
    const file = v47File({
      nodes: [
        {
          id: "d1",
          type: "device",
          position: { x: 0, y: 0 },
          data: { label: "Apollo", ports: [{ id: "p1", label: "Input 1" }] },
        },
      ],
      edges: [{ id: "e1", source: "d1", target: "d2", data: { signalType: "analog-audio" } }],
      ownedCables: [{ id: "c1", label: "XLR 10 m", length: 10, quantity: 4 }],
    });
    const before = structuredClone(file);

    const out = migrateSchematic(file);

    expect(out.version).toBe(CURRENT_SCHEMA_VERSION);
    // Every v48 field is optional, so a v47 file is already valid — the version is the only edit.
    expect(out).toEqual({ ...before, version: CURRENT_SCHEMA_VERSION });
  });

  it("round-trips a file already carrying the v48 fields", () => {
    const file = v47File({
      nodes: [
        {
          id: "d1",
          type: "device",
          position: { x: 0, y: 0 },
          data: {
            label: "Apollo",
            ports: [
              { id: "p1", label: "Input 1" },
              { id: "p2", label: "Aux 1", virtual: true },
            ],
            internalLinks: [{ from: "Input 1", to: "Aux 1" }],
          },
        },
      ],
      edges: [
        { id: "e1", source: "d1", target: "d2", data: { signalType: "analog-audio", bundleId: "snake1" } },
      ],
      ownedCables: [
        { id: "c1", label: "XLR 10 m", length: 10, quantity: 1, partNumber: "CBL-XLR-10M", assetTag: "AV-0042" },
      ],
    });

    const out = migrateSchematic(file);

    expect(out.version).toBe(CURRENT_SCHEMA_VERSION);
    const d1 = out.nodes.find((n: { id: string }) => n.id === "d1");
    expect(d1.data.ports[1].virtual).toBe(true);
    expect(d1.data.internalLinks).toEqual([{ from: "Input 1", to: "Aux 1" }]);
    expect(out.edges[0].data.bundleId).toBe("snake1");
    expect(out.ownedCables[0].partNumber).toBe("CBL-XLR-10M");
    expect(out.ownedCables[0].assetTag).toBe("AV-0042");
  });

  it("leaves the new fields absent on a file that predates them", () => {
    const out = migrateSchematic(
      v47File({
        nodes: [
          {
            id: "d1",
            type: "device",
            position: { x: 0, y: 0 },
            data: { label: "Apollo", ports: [{ id: "p1", label: "Input 1" }] },
          },
        ],
      }),
    );

    const d1 = out.nodes.find((n: { id: string }) => n.id === "d1");
    expect(d1.data.ports[0].virtual).toBeUndefined();
    expect(d1.data.internalLinks).toBeUndefined();
  });
});

describe("migration registry", () => {
  it("covers every version up to CURRENT_SCHEMA_VERSION", () => {
    // migrateSchematic warns and skips when a step is missing, so a silent run from the
    // oldest schema proves the registry has no holes below the constant.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const out = migrateSchematic({ version: 1, name: "t", nodes: [], edges: [] });

    expect(out.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("fork-numbered file normalization", () => {
  // This fork shipped versions 40–45 meaning something different from upstream's 40–42 of
  // the same name. Files written by the pre-merge fork build have to land on the unified
  // chain without re-running fork steps or skipping upstream's.

  it("rewinds a fork-numbered file and applies upstream's 16px rescale exactly once", () => {
    const out = migrateSchematic({
      version: 44, // fork numbering — no bundles map, so it cannot be an upstream v44
      name: "t",
      nodes: [{ id: "d1", type: "device", position: { x: 100, y: 200 }, width: 180, data: {} }],
      edges: [],
    });
    expect(out.version).toBe(CURRENT_SCHEMA_VERSION);
    // Rescaled by exactly 0.8 — once, not twice (64/128/115.2) and not zero times (100/200/180).
    expect(out.nodes[0].position.x).toBeCloseTo(80, 6);
    expect(out.nodes[0].position.y).toBeCloseTo(160, 6);
    expect(out.nodes[0].width).toBeCloseTo(144, 6);
  });

  it("leaves a genuine upstream file's numbering alone", () => {
    // An upstream v41 file already carries a bundles map, so it must NOT be rewound —
    // rewinding would re-apply the 16px rescale and shrink every coordinate a second time.
    const out = migrateSchematic({
      version: 41,
      name: "t",
      nodes: [{ id: "d1", type: "device", position: { x: 100, y: 200 }, data: {} }],
      edges: [],
      bundles: {},
    });
    expect(out.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.nodes[0].position.x).toBe(100); // untouched — v41 is already past the rescale
    expect(out.nodes[0].position.y).toBe(200);
  });

  it("carries fork bundle membership into upstream's bundles map instead of dropping it", () => {
    // Upstream's v39→v40 deletes any bundleId whose bundle has no meta. The fork stored a
    // bare bundleId with no map, so the meta is synthesized first and membership survives.
    const out = migrateSchematic({
      version: 45,
      name: "t",
      nodes: [],
      edges: [
        { id: "e1", source: "d1", target: "d2", data: { signalType: "sdi", bundleId: "snake1" } },
        { id: "e2", source: "d1", target: "d3", data: { signalType: "hdmi", bundleId: "snake1" } },
      ],
    });
    expect(out.edges[0].data.bundleId).toBe("snake1");
    expect(out.edges[1].data.bundleId).toBe("snake1");
    expect(out.bundles.snake1).toEqual({ id: "snake1" });
  });

  it("still dissolves a fork bundle that has fewer than 2 members", () => {
    // Synthesizing meta must not defeat upstream's <2-member rule.
    const out = migrateSchematic({
      version: 45,
      name: "t",
      nodes: [],
      edges: [{ id: "e1", source: "d1", target: "d2", data: { signalType: "sdi", bundleId: "lonely" } }],
    });
    expect(out.edges[0].data.bundleId).toBeUndefined();
    expect(out.bundles).toEqual({});
  });

  it("does not touch a current-version file", () => {
    const out = migrateSchematic({
      version: CURRENT_SCHEMA_VERSION,
      name: "t",
      nodes: [{ id: "d1", type: "device", position: { x: 100, y: 200 }, data: {} }],
      edges: [],
    });
    expect(out.nodes[0].position.x).toBe(100);
  });
});

describe("stub-label z-index normalization (#178)", () => {
  it("stamps a z-index on a stub-label node that lacks one (current-version file)", () => {
    const out = migrateSchematic({
      version: CURRENT_SCHEMA_VERSION,
      nodes: [
        { id: "s1", type: "stub-label", position: { x: 0, y: 0 }, data: {} },
        { id: "d1", type: "device", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
    });
    const stub = out.nodes.find((n: { id: string }) => n.id === "s1");
    const device = out.nodes.find((n: { id: string }) => n.id === "d1");
    expect(stub.zIndex).toBe(STUB_LABEL_Z_INDEX);
    expect(device.zIndex).toBeUndefined(); // only stub-labels are touched
  });

  it("leaves an already-correct z-index untouched (no needless rewrite)", () => {
    const nodes = [{ id: "s1", type: "stub-label", position: { x: 0, y: 0 }, zIndex: STUB_LABEL_Z_INDEX, data: {} }];
    const out = migrateSchematic({ version: CURRENT_SCHEMA_VERSION, nodes, edges: [] });
    expect(out.nodes).toBe(nodes); // same reference — nothing changed
  });
});

describe("v39→v40 bundles migration", () => {
  it("adds an empty bundles map and bumps version", () => {
    const out = migrateSchematic({ version: 39, nodes: [], edges: [] });
    expect(out.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.bundles).toEqual({});
  });

  it("drops a dangling bundleId and dissolves <2-member bundles", () => {
    const out = migrateSchematic({
      version: 39,
      nodes: [],
      edges: [
        { id: "e1", data: { signalType: "sdi", bundleId: "ghost" } }, // no such bundle
        { id: "e2", data: { signalType: "sdi", bundleId: "b1" } }, // bundle with only 1 member
      ],
      bundles: { b1: { id: "b1" } },
    });
    expect(out.edges[0].data.bundleId).toBeUndefined();
    expect(out.edges[1].data.bundleId).toBeUndefined();
    expect(out.bundles).toEqual({});
  });

  it("keeps a valid ≥2-member bundle", () => {
    const out = migrateSchematic({
      version: 39,
      nodes: [],
      edges: [
        { id: "e1", data: { signalType: "sdi", bundleId: "b1" } },
        { id: "e2", data: { signalType: "hdmi", bundleId: "b1" } },
      ],
      bundles: { b1: { id: "b1", label: "Snake A" } },
    });
    expect(out.edges[0].data.bundleId).toBe("b1");
    expect(out.edges[1].data.bundleId).toBe("b1");
    expect(out.bundles.b1.label).toBe("Snake A");
  });
});

describe("v48→v49 artwork migration (emoji → symbol)", () => {
  it("maps known legacy emoji icons to library symbols and drops the icon field", () => {
    const out = migrateSchematic({
      version: 48,
      nodes: [
        { id: "n1", type: "device", position: { x: 0, y: 0 }, data: { label: "Speaker", deviceType: "speaker", ports: [], icon: "🔊" } },
        { id: "n2", type: "device", position: { x: 0, y: 0 }, data: { label: "Switch", deviceType: "network-switch", ports: [], icon: "🌐" } },
      ],
      edges: [],
    });
    expect(out.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.nodes[0].data.artworkAssetId).toBe("audio/loudspeaker");
    expect(out.nodes[0].data.icon).toBeUndefined();
    expect(out.nodes[1].data.artworkAssetId).toBe("network/router");
    expect(out.nodes[1].data.icon).toBeUndefined();
  });

  it("leaves artworkAssetId unset for unknown emoji (class default renders) and never overwrites an existing assignment", () => {
    const out = migrateSchematic({
      version: 48,
      nodes: [
        { id: "n1", type: "device", position: { x: 0, y: 0 }, data: { label: "X", deviceType: "custom", ports: [], icon: "🦄" } },
        { id: "n2", type: "device", position: { x: 0, y: 0 }, data: { label: "Y", deviceType: "custom", ports: [], icon: "🔊", artworkAssetId: "generic/star" } },
        { id: "note", type: "note", position: { x: 0, y: 0 }, data: { label: "note" } },
      ],
      edges: [],
    });
    expect(out.nodes[0].data.artworkAssetId).toBeUndefined();
    expect(out.nodes[0].data.icon).toBeUndefined();
    expect(out.nodes[1].data.artworkAssetId).toBe("generic/star");
    expect(out.nodes[2].data.label).toBe("note");
  });
});

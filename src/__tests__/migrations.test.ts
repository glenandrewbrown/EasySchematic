import { describe, it, expect } from "vitest";
import { migrateSchematic, CURRENT_SCHEMA_VERSION } from "../migrations";
import { DEFAULT_GRID_SETTINGS, DEFAULT_METRES_PER_PIXEL } from "../types";

/** Minimal v43 file with the given room/device nodes. */
function v43File(nodes: unknown[]): Record<string, unknown> {
  return { version: 43, name: "t", nodes, edges: [] };
}

describe("v43 → v44 document-scale migration", () => {
  it("adopts the most-common room scale as metresPerPixel", () => {
    const file = v43File([
      { id: "r1", type: "room", position: { x: 0, y: 0 }, width: 400, data: { widthM: 8 } }, // 0.02
      { id: "r2", type: "room", position: { x: 0, y: 0 }, width: 250, data: { widthM: 5 } }, // 0.02
      { id: "r3", type: "room", position: { x: 0, y: 0 }, width: 200, data: { widthM: 10 } }, // 0.05
    ]);
    const out = migrateSchematic(file);
    expect(out.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.gridSettings.metresPerPixel).toBeCloseTo(0.02, 6);
  });

  it("writes a complete GridSettings so other grid defaults survive load", () => {
    const out = migrateSchematic(v43File([]));
    // No rooms → default scale, but every other GridSettings field must be present.
    expect(out.gridSettings.metresPerPixel).toBeCloseTo(DEFAULT_METRES_PER_PIXEL, 6);
    expect(out.gridSettings.snapStep).toBe(DEFAULT_GRID_SETTINGS.snapStep);
    expect(out.gridSettings.layoutGridStyle).toBe(DEFAULT_GRID_SETTINGS.layoutGridStyle);
  });

  it("leaves a room already at the document scale untouched", () => {
    const file = v43File([
      { id: "r1", type: "room", position: { x: 0, y: 0 }, width: 400, data: { widthM: 8 } },
      { id: "r2", type: "room", position: { x: 0, y: 0 }, width: 250, data: { widthM: 5 } },
    ]);
    const out = migrateSchematic(file);
    const r1 = out.nodes.find((n: { id: string }) => n.id === "r1");
    expect(r1.width).toBe(400); // unchanged
    expect(r1.data.widthM).toBe(8); // real dimension preserved
  });

  it("rescales an off-scale room's box to match the document scale, preserving widthM", () => {
    const file = v43File([
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
    const file = v43File([
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
    const file = v43File([
      { id: "r1", type: "room", position: { x: 0, y: 0 }, width: 400, data: { widthM: 8 } },
      { id: "r2", type: "room", position: { x: 0, y: 0 }, width: 250, data: { widthM: 5 } },
      { id: "d1", type: "device", parentId: "r1", position: { x: 40, y: 20 }, data: {} },
    ]);
    const out = migrateSchematic(file);
    const d1 = out.nodes.find((n: { id: string }) => n.id === "d1");
    expect(d1.position.x).toBe(40);
    expect(d1.position.y).toBe(20);
  });
});

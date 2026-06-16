import { describe, it, expect } from "vitest";
import {
  deviceFootprint,
  gridPositions,
  cascadePosition,
  parseQuantity,
  parseListLine,
  isMultiLine,
  splitLines,
  MAX_BULK_COUNT,
  DEFAULT_MAX_COLS,
} from "../quickAddLayout";
import type { DeviceTemplate, Port } from "../types";

function port(direction: Port["direction"]): Port {
  return {
    id: `p-${Math.random().toString(36).slice(2)}`,
    label: "P",
    direction,
    signalType: "dante",
  } as Port;
}

function template(ports: Port[]): DeviceTemplate {
  return {
    deviceType: "test",
    label: "Test",
    ports,
  } as DeviceTemplate;
}

describe("deviceFootprint", () => {
  it("returns base height for a portless device", () => {
    expect(deviceFootprint(template([]))).toEqual({ w: 180, h: 60 });
  });

  it("uses the larger of input/output rows plus bidirectional rows", () => {
    const t = template([port("input"), port("input"), port("output"), port("bidirectional")]);
    // max(2 inputs, 1 output) + 1 bidir = 3 rows → 60 + 60
    expect(deviceFootprint(t)).toEqual({ w: 180, h: 120 });
  });

  it("tolerates a template with no ports array", () => {
    expect(deviceFootprint({ deviceType: "x", label: "X" } as DeviceTemplate)).toEqual({
      w: 180,
      h: 60,
    });
  });
});

describe("gridPositions", () => {
  const fp = { w: 180, h: 60 };

  it("returns one grid-snapped position centered on the anchor", () => {
    const [p] = gridPositions({ x: 100, y: 100 }, fp, 1);
    // origin = (100-90, 100-30) = (10, 70) → snap (round half-up) → (20, 80)
    expect(p).toEqual({ x: 20, y: 80 });
  });

  it("lays devices left-to-right then wraps after maxCols", () => {
    const pts = gridPositions({ x: 0, y: 0 }, fp, DEFAULT_MAX_COLS + 1, { gap: 20 });
    const stepX = 180 + 20;
    // First row shares a y; the wrapped one drops to the next row.
    expect(pts[0].y).toBe(pts[DEFAULT_MAX_COLS - 1].y);
    expect(pts[DEFAULT_MAX_COLS].y).toBeGreaterThan(pts[0].y);
    // Columns advance by stepX (already grid-aligned since 200 % 20 === 0).
    expect(pts[1].x - pts[0].x).toBe(stepX);
  });

  it("respects a custom maxCols", () => {
    const pts = gridPositions({ x: 0, y: 0 }, fp, 4, { maxCols: 2, gap: 20 });
    expect(pts[0].y).toBe(pts[1].y); // row 0
    expect(pts[2].y).toBe(pts[3].y); // row 1
    expect(pts[2].y).toBeGreaterThan(pts[0].y);
  });

  it("returns an empty array for count <= 0", () => {
    expect(gridPositions({ x: 0, y: 0 }, fp, 0)).toEqual([]);
    expect(gridPositions({ x: 0, y: 0 }, fp, -3)).toEqual([]);
  });

  it("snaps every position to the grid", () => {
    const pts = gridPositions({ x: 37, y: 91 }, { w: 180, h: 100 }, 6, { gap: 13 });
    for (const p of pts) {
      expect(p.x % 20 === 0).toBe(true);
      expect(p.y % 20 === 0).toBe(true);
    }
  });
});

describe("cascadePosition", () => {
  it("matches the nth gridPositions entry", () => {
    const fp = { w: 180, h: 60 };
    const anchor = { x: 50, y: 50 };
    const grid = gridPositions(anchor, fp, 8, { gap: 20 });
    for (let i = 0; i < 8; i++) {
      expect(cascadePosition(anchor, fp, i, { gap: 20 })).toEqual(grid[i]);
    }
  });
});

describe("parseQuantity", () => {
  it("parses leading 'Nx Foo'", () => {
    expect(parseQuantity("8x JBL Control")).toEqual({ count: 8, rest: "JBL Control" });
  });

  it("parses leading 'N Foo' when the rest is non-numeric", () => {
    expect(parseQuantity("3 Shure SM58")).toEqual({ count: 3, rest: "Shure SM58" });
  });

  it("parses trailing 'Foo xN'", () => {
    expect(parseQuantity("JBL Control x8")).toEqual({ count: 8, rest: "JBL Control" });
  });

  it("treats a bare trailing number as a model number, not a count", () => {
    expect(parseQuantity("JBL Control 24")).toEqual({ count: 1, rest: "JBL Control 24" });
  });

  it("defaults to a count of 1 with no count token", () => {
    expect(parseQuantity("Shure SM58")).toEqual({ count: 1, rest: "Shure SM58" });
  });

  it("clamps absurd counts to MAX_BULK_COUNT", () => {
    expect(parseQuantity("999x speaker").count).toBe(MAX_BULK_COUNT);
  });

  it("handles empty input", () => {
    expect(parseQuantity("   ")).toEqual({ count: 1, rest: "" });
  });
});

describe("parseListLine", () => {
  it("parses 'Nx Foo'", () => {
    expect(parseListLine("3x JBL")).toEqual({ count: 3, query: "JBL" });
  });

  it("parses 'N Foo'", () => {
    expect(parseListLine("2 Shure SM58")).toEqual({ count: 2, query: "Shure SM58" });
  });

  it("parses numbered-list separators like '3) Foo' and '3. Foo'", () => {
    expect(parseListLine("3) JBL")).toEqual({ count: 3, query: "JBL" });
    expect(parseListLine("3. JBL")).toEqual({ count: 3, query: "JBL" });
  });

  it("defaults bare lines to count 1", () => {
    expect(parseListLine("JBL Control 24")).toEqual({ count: 1, query: "JBL Control 24" });
  });

  it("clamps absurd counts", () => {
    expect(parseListLine("5000 mic").count).toBe(MAX_BULK_COUNT);
  });
});

describe("isMultiLine / splitLines", () => {
  it("detects newlines", () => {
    expect(isMultiLine("a\nb")).toBe(true);
    expect(isMultiLine("a")).toBe(false);
    expect(isMultiLine(" a ")).toBe(false);
  });

  it("splits into trimmed non-empty lines", () => {
    expect(splitLines("a\n\n  b  \r\nc\n")).toEqual(["a", "b", "c"]);
  });
});

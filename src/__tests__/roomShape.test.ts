import { describe, expect, test } from "vitest";
import {
  DEFAULT_RECT_SHAPE,
  shapeToPx,
  polygonPointsAttr,
  edgeLengthsM,
  edgeMidpointsPx,
  insertVertex,
  removeVertex,
} from "../roomShape";

describe("shapeToPx", () => {
  test("scales normalized points to the node's pixel box", () => {
    const px = shapeToPx(DEFAULT_RECT_SHAPE, 400, 200);
    expect(px).toEqual([
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 200 },
      { x: 0, y: 200 },
    ]);
  });
});

describe("polygonPointsAttr", () => {
  test("formats points for an SVG polygon attribute", () => {
    expect(polygonPointsAttr([{ x: 0, y: 0 }, { x: 10.5, y: 20 }])).toBe("0,0 10.5,20");
  });
});

describe("edgeLengthsM", () => {
  test("derives per-edge meters from room scale (widthM over px width)", () => {
    // 400px wide box represents 8m → 0.02 m/px. Rect edges: 400px, 200px alternating.
    const lengths = edgeLengthsM(DEFAULT_RECT_SHAPE, 400, 200, 8);
    expect(lengths).toHaveLength(4);
    expect(lengths[0]).toBeCloseTo(8, 5); // top
    expect(lengths[1]).toBeCloseTo(4, 5); // right
    expect(lengths[2]).toBeCloseTo(8, 5); // bottom
    expect(lengths[3]).toBeCloseTo(4, 5); // left
  });

  test("handles diagonal edges", () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
    // 100px box at 10m wide → 0.1 m/px. Hypotenuse 100√2 px ≈ 14.142m
    const lengths = edgeLengthsM(tri, 100, 100, 10);
    expect(lengths[1]).toBeCloseTo(Math.sqrt(2) * 10, 3);
  });
});

describe("edgeMidpointsPx", () => {
  test("returns the midpoint of every edge including the closing edge", () => {
    const mids = edgeMidpointsPx(shapeToPx(DEFAULT_RECT_SHAPE, 400, 200));
    expect(mids).toEqual([
      { x: 200, y: 0 },
      { x: 400, y: 100 },
      { x: 200, y: 200 },
      { x: 0, y: 100 },
    ]);
  });
});

describe("insertVertex", () => {
  test("inserts the edge midpoint after the edge's start vertex", () => {
    const next = insertVertex(DEFAULT_RECT_SHAPE, 0);
    expect(next).toHaveLength(5);
    expect(next[1]).toEqual({ x: 0.5, y: 0 });
  });
});

describe("removeVertex", () => {
  test("removes a vertex", () => {
    const five = insertVertex(DEFAULT_RECT_SHAPE, 0);
    expect(removeVertex(five, 1)).toEqual(DEFAULT_RECT_SHAPE);
  });

  test("refuses to drop below a triangle", () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
    expect(removeVertex(tri, 0)).toEqual(tri);
  });
});

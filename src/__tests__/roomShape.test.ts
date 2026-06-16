import { describe, expect, test } from "vitest";
import {
  DEFAULT_RECT_SHAPE,
  shapeToPx,
  shapeToAbsPx,
  polygonPointsAttr,
  polygonAreaM2,
  edgeLengthsM,
  edgeMidpointsPx,
  insertVertex,
  removeVertex,
  formatDistanceLabel,
  formatAreaLabel,
  calibrateRoomScale,
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

describe("shapeToAbsPx", () => {
  test("offsets the normalized box by the absolute origin", () => {
    const pts = shapeToAbsPx(DEFAULT_RECT_SHAPE, 100, 50, 400, 200);
    expect(pts).toEqual([
      { x: 100, y: 50 },
      { x: 500, y: 50 },
      { x: 500, y: 250 },
      { x: 100, y: 250 },
    ]);
  });

  test("maps a custom polygon's vertices to absolute coordinates (DXF fix core)", () => {
    const lshape = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 1 },
      { x: 0, y: 1 },
    ];
    const pts = shapeToAbsPx(lshape, 0, 0, 200, 200);
    expect(pts[2]).toEqual({ x: 200, y: 100 });
    expect(pts[3]).toEqual({ x: 100, y: 100 });
    expect(pts).toHaveLength(6); // not a 4-vertex rectangle
  });
});

describe("polygonAreaM2", () => {
  test("computes rectangle floor area from the room scale", () => {
    // 400px×200px box at widthM=8 → 0.02 m/px → 8m × 4m = 32 m²
    expect(polygonAreaM2(DEFAULT_RECT_SHAPE, 400, 200, 8)).toBeCloseTo(32, 5);
  });

  test("computes a right-triangle area (half the bounding box)", () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
    // 100px box at 10m wide → 0.1 m/px → bounding 10m×10m=100m², triangle = 50 m²
    expect(polygonAreaM2(tri, 100, 100, 10)).toBeCloseTo(50, 5);
  });

  test("is winding-order independent (uses |signed area|)", () => {
    const cw = [...DEFAULT_RECT_SHAPE].reverse();
    expect(polygonAreaM2(cw, 400, 200, 8)).toBeCloseTo(32, 5);
  });
});

describe("formatDistanceLabel", () => {
  test("rounds meters to one decimal with a unit suffix", () => {
    expect(formatDistanceLabel(8)).toBe("8 m");
    expect(formatDistanceLabel(6.04)).toBe("6 m");
    expect(formatDistanceLabel(6.05)).toBe("6.1 m");
  });

  test("converts to feet when the display unit is ft", () => {
    expect(formatDistanceLabel(1, "ft")).toBe("3.3 ft");
  });

  test("is independent of zoom — a pure function of the meter value", () => {
    // Same geometry length renders the same label regardless of canvas zoom.
    expect(formatDistanceLabel(5)).toBe(formatDistanceLabel(5));
    expect(formatDistanceLabel(5)).toBe("5 m");
  });
});

describe("formatAreaLabel", () => {
  test("formats square meters", () => {
    expect(formatAreaLabel(32)).toBe("32 m²");
  });

  test("converts to square feet when requested", () => {
    expect(formatAreaLabel(10, "ft")).toBe("107.6 ft²");
  });
});

describe("calibrateRoomScale", () => {
  test("setting the width edge sets widthM directly and depthM from the uniform scale", () => {
    // 400×300px box; set the 400px width edge = 10 m → 0.025 m/px → 10 m × 7.5 m
    const cal = calibrateRoomScale(400, 300, 400, 10);
    expect(cal).not.toBeNull();
    expect(cal!.widthM).toBeCloseTo(10, 6);
    expect(cal!.depthM).toBeCloseTo(7.5, 6);
  });

  test("setting the depth edge yields the same uniform scale", () => {
    // Set the 300px depth edge = 7.5 m → 0.025 m/px → identical widthM/depthM
    const cal = calibrateRoomScale(400, 300, 300, 7.5);
    expect(cal!.widthM).toBeCloseTo(10, 6);
    expect(cal!.depthM).toBeCloseTo(7.5, 6);
  });

  test("calibrates from an arbitrary (diagonal) edge length", () => {
    // An edge measuring 500px set to 5 m → 0.01 m/px → 4 m × 3 m bounding dims
    const cal = calibrateRoomScale(400, 300, 500, 5);
    expect(cal!.widthM).toBeCloseTo(4, 6);
    expect(cal!.depthM).toBeCloseTo(3, 6);
  });

  test("returns null for non-positive inputs", () => {
    expect(calibrateRoomScale(400, 300, 400, 0)).toBeNull();
    expect(calibrateRoomScale(400, 300, 0, 10)).toBeNull();
    expect(calibrateRoomScale(0, 300, 400, 10)).toBeNull();
    expect(calibrateRoomScale(400, 0, 400, 10)).toBeNull();
    expect(calibrateRoomScale(400, 300, 400, -5)).toBeNull();
  });
});

/**
 * Tests for speakerCoverage.ts — pure acoustic geometry functions.
 * All functions are on-axis, direct-field nominal estimates, not measured SPL.
 */

import { describe, it, expect } from "vitest";
import {
  splAtDistanceDb,
  coverageRadiusM,
  sumSplDb,
  wedgeGeometry,
} from "../speakerCoverage";

// ---------------------------------------------------------------------------
// splAtDistanceDb
// ---------------------------------------------------------------------------
describe("splAtDistanceDb", () => {
  it("computes SPL using inverse-square law: 90 dB sensitivity, 100 W, 4 m", () => {
    // Expected: 90 + 10*log10(100) - 20*log10(4)
    //         = 90 + 20 - 20*log10(4)
    //         = 110 - 20*0.60206 ≈ 110 - 12.04 ≈ 97.96 dB
    const result = splAtDistanceDb(90, 100, 4);
    expect(result).not.toBeNull();
    expect(result as number).toBeCloseTo(97.96, 1);
  });

  it("returns correct SPL at 1 m with 1 W (sensitivity reference point)", () => {
    // At 1 m, 1 W: 90 + 10*log10(1) - 20*log10(1) = 90 + 0 - 0 = 90 dB
    const result = splAtDistanceDb(90, 1, 1);
    expect(result).not.toBeNull();
    expect(result as number).toBeCloseTo(90, 5);
  });

  it("returns null for zero power", () => {
    expect(splAtDistanceDb(90, 0, 4)).toBeNull();
  });

  it("returns null for negative power", () => {
    expect(splAtDistanceDb(90, -10, 4)).toBeNull();
  });

  it("returns null for zero distance", () => {
    expect(splAtDistanceDb(90, 100, 0)).toBeNull();
  });

  it("returns null for negative distance", () => {
    expect(splAtDistanceDb(90, 100, -5)).toBeNull();
  });

  it("handles fractional distance: 90 dB, 1 W, 0.5 m", () => {
    // 90 + 0 - 20*log10(0.5) = 90 - 20*(-0.30103) = 90 + 6.02 = 96.02 dB
    const result = splAtDistanceDb(90, 1, 0.5);
    expect(result).not.toBeNull();
    expect(result as number).toBeCloseTo(96.02, 1);
  });
});

// ---------------------------------------------------------------------------
// coverageRadiusM
// ---------------------------------------------------------------------------
describe("coverageRadiusM", () => {
  it("computes coverage radius: ceiling 3 m, listener 1.2 m, angle 90°", () => {
    // height diff = 3 - 1.2 = 1.8 m
    // half angle = 45°
    // radius = 1.8 * tan(45°) = 1.8 * 1 = 1.8 m
    const result = coverageRadiusM(3, 1.2, 90);
    expect(result).not.toBeNull();
    expect(result as number).toBeCloseTo(1.8, 5);
  });

  it("computes coverage radius: ceiling 4 m, listener 1 m, angle 60°", () => {
    // height diff = 3 m, half angle = 30°, tan(30°) ≈ 0.57735
    // radius = 3 * tan(30°) ≈ 1.732 m
    const result = coverageRadiusM(4, 1, 60);
    expect(result).not.toBeNull();
    expect(result as number).toBeCloseTo(3 * Math.tan(Math.PI / 6), 5);
  });

  it("returns null when ceiling equals listener height (zero height diff)", () => {
    expect(coverageRadiusM(1.2, 1.2, 90)).toBeNull();
  });

  it("returns null when ceiling is below listener height (negative height diff)", () => {
    expect(coverageRadiusM(1.0, 1.5, 90)).toBeNull();
  });

  it("returns null for zero coverage angle", () => {
    expect(coverageRadiusM(3, 1, 0)).toBeNull();
  });

  it("returns null for negative coverage angle", () => {
    expect(coverageRadiusM(3, 1, -90)).toBeNull();
  });

  it("returns null for coverage angle of exactly 180 degrees", () => {
    expect(coverageRadiusM(3, 1, 180)).toBeNull();
  });

  it("returns null for coverage angle > 180 degrees", () => {
    expect(coverageRadiusM(3, 1, 270)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// sumSplDb
// ---------------------------------------------------------------------------
describe("sumSplDb", () => {
  it("returns null for an empty array", () => {
    expect(sumSplDb([])).toBeNull();
  });

  it("two equal 90 dB sources sum to ~93.01 dB", () => {
    // 10*log10(10^9 + 10^9) = 10*log10(2 * 10^9) = 90 + 10*log10(2) ≈ 93.01 dB
    const result = sumSplDb([90, 90]);
    expect(result).not.toBeNull();
    expect(result as number).toBeCloseTo(93.01, 1);
  });

  it("single source returns itself", () => {
    const result = sumSplDb([85]);
    expect(result).not.toBeNull();
    expect(result as number).toBeCloseTo(85, 5);
  });

  it("three equal 80 dB sources sum to ~84.77 dB", () => {
    // 80 + 10*log10(3) ≈ 80 + 4.77 = 84.77 dB
    const result = sumSplDb([80, 80, 80]);
    expect(result).not.toBeNull();
    expect(result as number).toBeCloseTo(80 + 10 * Math.log10(3), 4);
  });

  it("handles mixed levels: 90 dB and 80 dB → dominated by 90 dB", () => {
    // 10^(90/10) + 10^(80/10) = 10^9 + 10^8 = 1.1e9
    // 10*log10(1.1e9) ≈ 90.41 dB
    const result = sumSplDb([90, 80]);
    expect(result).not.toBeNull();
    expect(result as number).toBeCloseTo(10 * Math.log10(10 ** (90 / 10) + 10 ** (80 / 10)), 4);
  });
});

// ---------------------------------------------------------------------------
// wedgeGeometry
// ---------------------------------------------------------------------------
describe("wedgeGeometry", () => {
  it("returns null for zero radius", () => {
    expect(wedgeGeometry(0, 0, 0, 90, 0)).toBeNull();
  });

  it("returns null for negative radius", () => {
    expect(wedgeGeometry(0, 0, 0, 90, -10)).toBeNull();
  });

  it("returns null for zero coverage angle", () => {
    expect(wedgeGeometry(0, 0, 0, 0, 10)).toBeNull();
  });

  it("returns null for negative coverage angle", () => {
    expect(wedgeGeometry(0, 0, 0, -90, 10)).toBeNull();
  });

  it("returns null for coverage angle of 360 degrees", () => {
    expect(wedgeGeometry(0, 0, 0, 360, 10)).toBeNull();
  });

  it("returns null for coverage angle greater than 360 degrees", () => {
    expect(wedgeGeometry(0, 0, 0, 400, 10)).toBeNull();
  });

  it("apex equals origin", () => {
    const result = wedgeGeometry(5, 10, 0, 90, 20);
    expect(result).not.toBeNull();
    expect((result as NonNullable<ReturnType<typeof wedgeGeometry>>).apex).toEqual({ x: 5, y: 10 });
  });

  it("aim 0° (right), angle 90°, radius 10 — screen space (y grows down)", () => {
    // aimDeg = 0° means pointing right (+x direction)
    // coverageAngleDeg = 90° → half-angle = 45°
    // Screen coords: 0° = +x (right), 90° = +y (down), measured clockwise
    // right endpoint: aim + half = 0° + 45° = 45° (below-right in screen space)
    //   x = cos(45° in radians) * 10 ≈ 7.071
    //   y = sin(45° in radians) * 10 ≈ 7.071  (positive y = down)
    // left endpoint: aim - half = 0° - 45° = -45° (above-right)
    //   x = cos(-45°) * 10 ≈ 7.071
    //   y = sin(-45°) * 10 ≈ -7.071
    const result = wedgeGeometry(0, 0, 0, 90, 10);
    expect(result).not.toBeNull();
    const { left, right, midAngleDeg } = result as NonNullable<ReturnType<typeof wedgeGeometry>>;

    // right = aimDeg + halfAngle = 45° (screen-clockwise from +x)
    expect(right.x).toBeCloseTo(10 * Math.cos(Math.PI / 4), 4);
    expect(right.y).toBeCloseTo(10 * Math.sin(Math.PI / 4), 4);

    // left = aimDeg - halfAngle = -45°
    expect(left.x).toBeCloseTo(10 * Math.cos(-Math.PI / 4), 4);
    expect(left.y).toBeCloseTo(10 * Math.sin(-Math.PI / 4), 4);

    expect(midAngleDeg).toBeCloseTo(0, 5);
  });

  it("aim 90° (down), angle 90°, radius 10 — speaker pointing straight down", () => {
    // aimDeg = 90° → pointing down
    // right = 90 + 45 = 135° → x = cos(135°)*10 ≈ -7.071, y = sin(135°)*10 ≈ 7.071
    // left  = 90 - 45 = 45°  → x = cos(45°)*10  ≈  7.071, y = sin(45°)*10  ≈ 7.071
    const result = wedgeGeometry(0, 0, 90, 90, 10);
    expect(result).not.toBeNull();
    const { left, right, midAngleDeg } = result as NonNullable<ReturnType<typeof wedgeGeometry>>;

    expect(right.x).toBeCloseTo(10 * Math.cos((135 * Math.PI) / 180), 4);
    expect(right.y).toBeCloseTo(10 * Math.sin((135 * Math.PI) / 180), 4);

    expect(left.x).toBeCloseTo(10 * Math.cos((45 * Math.PI) / 180), 4);
    expect(left.y).toBeCloseTo(10 * Math.sin((45 * Math.PI) / 180), 4);

    expect(midAngleDeg).toBeCloseTo(90, 5);
  });

  it("origin offset is added to all arc endpoints", () => {
    const result = wedgeGeometry(100, 200, 0, 90, 10);
    expect(result).not.toBeNull();
    const { apex, left, right } = result as NonNullable<ReturnType<typeof wedgeGeometry>>;

    expect(apex).toEqual({ x: 100, y: 200 });
    expect(right.x).toBeCloseTo(100 + 10 * Math.cos(Math.PI / 4), 4);
    expect(right.y).toBeCloseTo(200 + 10 * Math.sin(Math.PI / 4), 4);
    expect(left.x).toBeCloseTo(100 + 10 * Math.cos(-Math.PI / 4), 4);
    expect(left.y).toBeCloseTo(200 + 10 * Math.sin(-Math.PI / 4), 4);
  });
});

import { describe, expect, it } from "vitest";
import { aimAngleDeg } from "../planView";
import { combinedOnAxisSplDb, splAtDistanceDb } from "../speakerCoverage";

describe("aimAngleDeg", () => {
  it("maps screen-space deltas to clockwise degrees (0° = +x right, y grows down)", () => {
    expect(aimAngleDeg(1, 0)).toBe(0); // right
    expect(aimAngleDeg(0, 1)).toBe(90); // down
    expect(aimAngleDeg(-1, 0)).toBe(180); // left
    expect(aimAngleDeg(0, -1)).toBe(270); // up
  });

  it("handles diagonals", () => {
    expect(aimAngleDeg(1, 1)).toBeCloseTo(45, 6);
    expect(aimAngleDeg(-1, -1)).toBeCloseTo(225, 6);
  });

  it("returns 0 for a zero delta", () => {
    expect(aimAngleDeg(0, 0)).toBe(0);
  });

  it("normalizes non-finite input to 0", () => {
    expect(aimAngleDeg(Number.NaN, 5)).toBe(0);
    expect(aimAngleDeg(3, Number.NaN)).toBe(0);
  });
});

describe("combinedOnAxisSplDb", () => {
  it("returns null with no sources", () => {
    expect(combinedOnAxisSplDb([])).toBeNull();
  });

  it("equals the single-source SPL for one valid source", () => {
    const src = { sensitivityDb: 88, powerW: 100, distanceM: 4 };
    expect(combinedOnAxisSplDb([src])).toBeCloseTo(
      splAtDistanceDb(src.sensitivityDb, src.powerW, src.distanceM)!,
      6,
    );
  });

  it("adds ~3 dB for two identical sources (incoherent power sum)", () => {
    const src = { sensitivityDb: 90, powerW: 50, distanceM: 3 };
    const single = combinedOnAxisSplDb([src])!;
    const doubled = combinedOnAxisSplDb([src, src])!;
    expect(doubled - single).toBeCloseTo(10 * Math.log10(2), 6);
  });

  it("skips invalid sources (powerW ≤ 0 or distanceM ≤ 0)", () => {
    const valid = { sensitivityDb: 90, powerW: 50, distanceM: 3 };
    const mixed = combinedOnAxisSplDb([
      valid,
      { sensitivityDb: 90, powerW: 0, distanceM: 3 },
      { sensitivityDb: 90, powerW: 50, distanceM: 0 },
    ]);
    expect(mixed).toBeCloseTo(combinedOnAxisSplDb([valid])!, 6);
  });

  it("returns null when every source is invalid", () => {
    expect(
      combinedOnAxisSplDb([{ sensitivityDb: 90, powerW: 0, distanceM: 3 }]),
    ).toBeNull();
  });
});

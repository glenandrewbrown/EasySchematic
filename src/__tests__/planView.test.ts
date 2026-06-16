import { describe, expect, it } from "vitest";
import {
  PLAN_FALLBACK_BOX_PX,
  planScalePxPerMeter,
  resolveRoomScale,
  deviceFootprintPx,
  normalizeRotationDeg,
  rotateBy,
} from "../planView";

describe("planScalePxPerMeter", () => {
  it("derives pixels-per-metre from a room's pixel width and real width", () => {
    // A 1860px-wide room that is 10 m wide → 186 px per metre.
    expect(planScalePxPerMeter(1860, 10)).toBeCloseTo(186, 6);
  });

  it("returns null when either input is non-positive", () => {
    expect(planScalePxPerMeter(0, 10)).toBeNull();
    expect(planScalePxPerMeter(1860, 0)).toBeNull();
    expect(planScalePxPerMeter(-5, 10)).toBeNull();
    expect(planScalePxPerMeter(1860, -2)).toBeNull();
  });
});

describe("resolveRoomScale", () => {
  it("returns px-per-metre from a sized room with a real width", () => {
    expect(resolveRoomScale({ data: { widthM: 10 }, width: 1860 })).toBeCloseTo(186, 6);
  });

  it("prefers explicit width, then measured, then style", () => {
    expect(
      resolveRoomScale({ data: { widthM: 10 }, width: 1860, measured: { width: 999 } }),
    ).toBeCloseTo(186, 6);
    expect(
      resolveRoomScale({ data: { widthM: 10 }, measured: { width: 1860 } }),
    ).toBeCloseTo(186, 6);
    expect(
      resolveRoomScale({ data: { widthM: 10 }, style: { width: 1860 } }),
    ).toBeCloseTo(186, 6);
  });

  it("returns null when the room has no real-world width", () => {
    expect(resolveRoomScale({ width: 1860 })).toBeNull();
    expect(resolveRoomScale({ data: {}, width: 1860 })).toBeNull();
    expect(resolveRoomScale({ data: { widthM: 0 }, width: 1860 })).toBeNull();
  });

  it("returns null when no usable pixel width is present", () => {
    expect(resolveRoomScale({ data: { widthM: 10 } })).toBeNull();
    expect(resolveRoomScale({ data: { widthM: 10 }, style: { width: "auto" } })).toBeNull();
  });

  it("returns null for missing rooms", () => {
    expect(resolveRoomScale(null)).toBeNull();
    expect(resolveRoomScale(undefined)).toBeNull();
  });
});

describe("deviceFootprintPx", () => {
  it("scales a device's width and depth to the room (Genelec 8040b)", () => {
    // 237 mm × 223 mm at 186 px/m
    const fp = deviceFootprintPx({ widthMm: 237, depthMm: 223 }, 186);
    expect(fp.toScale).toBe(true);
    expect(fp.widthPx).toBeCloseTo(0.237 * 186, 6);
    expect(fp.depthPx).toBeCloseTo(0.223 * 186, 6);
  });

  it("falls back to a square icon box when there is no room scale", () => {
    const fp = deviceFootprintPx({ widthMm: 237, depthMm: 223 }, null);
    expect(fp.toScale).toBe(false);
    expect(fp.widthPx).toBe(PLAN_FALLBACK_BOX_PX);
    expect(fp.depthPx).toBe(PLAN_FALLBACK_BOX_PX);
  });

  it("falls back to a square icon box when the device has no width", () => {
    const fp = deviceFootprintPx({ depthMm: 223 }, 186);
    expect(fp.toScale).toBe(false);
    expect(fp.widthPx).toBe(PLAN_FALLBACK_BOX_PX);
    expect(fp.depthPx).toBe(PLAN_FALLBACK_BOX_PX);
  });

  it("uses width for depth when depth is missing (square footprint)", () => {
    const fp = deviceFootprintPx({ widthMm: 237 }, 186);
    expect(fp.toScale).toBe(true);
    expect(fp.widthPx).toBeCloseTo(0.237 * 186, 6);
    expect(fp.depthPx).toBeCloseTo(0.237 * 186, 6);
  });

  it("treats non-positive dimensions as missing", () => {
    expect(deviceFootprintPx({ widthMm: 0, depthMm: 100 }, 186).toScale).toBe(false);
    const fp = deviceFootprintPx({ widthMm: 237, depthMm: -1 }, 186);
    expect(fp.toScale).toBe(true);
    expect(fp.depthPx).toBeCloseTo(0.237 * 186, 6); // depth falls back to width
  });
});

describe("normalizeRotationDeg", () => {
  it("passes through finite numbers", () => {
    expect(normalizeRotationDeg(90)).toBe(90);
    expect(normalizeRotationDeg(-45.5)).toBe(-45.5);
    expect(normalizeRotationDeg(0)).toBe(0);
  });

  it("defaults to 0 for missing or invalid values", () => {
    expect(normalizeRotationDeg(undefined)).toBe(0);
    expect(normalizeRotationDeg(null)).toBe(0);
    expect(normalizeRotationDeg(NaN)).toBe(0);
    expect(normalizeRotationDeg("90")).toBe(0);
  });
});

describe("rotateBy", () => {
  it("adds the delta to the current rotation", () => {
    expect(rotateBy(0, 90)).toBe(90);
    expect(rotateBy(90, 90)).toBe(180);
    expect(rotateBy(45, 90)).toBe(135);
  });

  it("wraps the result into [0, 360)", () => {
    expect(rotateBy(270, 90)).toBe(0); // 360 → 0
    expect(rotateBy(180, 180)).toBe(0);
    expect(rotateBy(350, 30)).toBe(20); // 380 → 20
  });

  it("wraps negative deltas into [0, 360)", () => {
    expect(rotateBy(0, -90)).toBe(270);
    expect(rotateBy(90, -180)).toBe(270);
  });

  it("treats a missing or invalid current rotation as 0", () => {
    expect(rotateBy(undefined, 90)).toBe(90);
    expect(rotateBy(null, 90)).toBe(90);
    expect(rotateBy(NaN, 90)).toBe(90);
    expect(rotateBy("90", 90)).toBe(90);
  });

  it("treats an invalid delta as no rotation", () => {
    expect(rotateBy(90, NaN)).toBe(90);
    expect(rotateBy(90, Infinity)).toBe(90);
  });

  it("returns positive zero, never -0, for a full turn", () => {
    expect(Object.is(rotateBy(0, 360), 0)).toBe(true);
    expect(Object.is(rotateBy(0, -360), 0)).toBe(true);
  });
});

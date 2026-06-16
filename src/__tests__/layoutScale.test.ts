import { describe, it, expect } from "vitest";
import {
  pxToMeters,
  metersToPx,
  pxPerMeter,
  mostCommonRoomScale,
  DEFAULT_METRES_PER_PIXEL,
} from "../layoutScale";

describe("px ⇄ metre conversion", () => {
  it("converts pixels to metres at the document scale", () => {
    // Default 0.01 m/px → 100 px = 1 m.
    expect(pxToMeters(100, DEFAULT_METRES_PER_PIXEL)).toBeCloseTo(1, 6);
    expect(pxToMeters(250, 0.02)).toBeCloseTo(5, 6);
  });

  it("converts metres to pixels at the document scale", () => {
    expect(metersToPx(1, DEFAULT_METRES_PER_PIXEL)).toBeCloseTo(100, 6);
    expect(metersToPx(5, 0.02)).toBeCloseTo(250, 6);
  });

  it("is round-trip stable", () => {
    expect(metersToPx(pxToMeters(737, 0.013), 0.013)).toBeCloseTo(737, 6);
  });

  it("exposes pixels-per-metre as the inverse scale", () => {
    expect(pxPerMeter(0.01)).toBeCloseTo(100, 6);
    expect(pxPerMeter(0.02)).toBeCloseTo(50, 6);
  });

  it("guards against a non-positive scale", () => {
    expect(metersToPx(5, 0)).toBe(0);
    expect(pxPerMeter(0)).toBe(0);
    expect(pxPerMeter(-1)).toBe(0);
  });
});

describe("mostCommonRoomScale", () => {
  it("returns the scale shared by the most rooms", () => {
    // Two rooms at 0.02 m/px (400px=8m, 250px=5m), one at 0.05 (200px=10m).
    const samples = [
      { widthM: 8, pxWidth: 400 },
      { widthM: 5, pxWidth: 250 },
      { widthM: 10, pxWidth: 200 },
    ];
    expect(mostCommonRoomScale(samples)).toBeCloseTo(0.02, 6);
  });

  it("ignores rooms missing a real width or a pixel width", () => {
    const samples = [
      { widthM: 0, pxWidth: 400 },
      { widthM: 8, pxWidth: 0 },
      { widthM: 6, pxWidth: 300 }, // 0.02
    ];
    expect(mostCommonRoomScale(samples)).toBeCloseTo(0.02, 6);
  });

  it("buckets floating-point-noisy but equal scales together", () => {
    // 1/3 computed two slightly different ways should count as one bucket.
    const samples = [
      { widthM: 1, pxWidth: 3 },
      { widthM: 2, pxWidth: 6 },
      { widthM: 10, pxWidth: 100 }, // 0.1, the minority
    ];
    expect(mostCommonRoomScale(samples)).toBeCloseTo(1 / 3, 6);
  });

  it("breaks ties toward the first-seen scale", () => {
    const samples = [
      { widthM: 8, pxWidth: 400 }, // 0.02 first
      { widthM: 10, pxWidth: 200 }, // 0.05 second
    ];
    expect(mostCommonRoomScale(samples)).toBeCloseTo(0.02, 6);
  });

  it("returns null when no room has usable dimensions", () => {
    expect(mostCommonRoomScale([])).toBeNull();
    expect(mostCommonRoomScale([{ widthM: 0, pxWidth: 0 }])).toBeNull();
  });
});

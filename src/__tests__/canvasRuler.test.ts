import { describe, it, expect } from "vitest";
import {
  rulerStep,
  realRulerStep,
  formatRulerLabel,
  buildRealRulerTicks,
  metresPerWorldUnit,
} from "../rulerScale";

describe("rulerStep", () => {
  // Ladder is multiples of 80 (16px grid × 5) so minor ticks (step ÷ 5) land on exact
  // 16px grid dots — this keeps ruler ticks coincident with the canvas grid.
  it("returns a step that keeps major ticks near the target spacing on screen", () => {
    // At zoom 1, a 90px target → first nice step >= 90 is 160.
    expect(rulerStep(1)).toBe(160);
  });

  it("grows the step as you zoom out (so labels stay ~target px apart)", () => {
    // zoom 0.1 → raw 900 → first nice step >= 900 is 1600.
    expect(rulerStep(0.1)).toBe(1600);
    // zoom 0.01 → raw 9000 → 16000.
    expect(rulerStep(0.01)).toBe(16000);
  });

  it("shrinks the step as you zoom in", () => {
    // zoom 4 → raw 22.5 → first nice step >= 22.5 is 80.
    expect(rulerStep(4)).toBe(80);
    // zoom 10 → raw 9 → 80.
    expect(rulerStep(10)).toBe(80);
  });

  it("always returns a positive 'nice' number from the ladder", () => {
    const ladder = new Set([80, 160, 400, 800, 1600, 4000, 8000, 16000, 40000, 80000, 160000]);
    for (const z of [0.001, 0.05, 0.3, 1, 2, 7, 50]) {
      const s = rulerStep(z);
      expect(s).toBeGreaterThan(0);
      expect(ladder.has(s)).toBe(true);
    }
  });

  it("honours a custom target spacing", () => {
    // Larger target → larger step. target 200 at zoom 1 → raw 200 → 400.
    expect(rulerStep(1, 200)).toBe(400);
  });
});

describe("realRulerStep", () => {
  it("picks a nice metre step at the default scale and zoom", () => {
    // Default scale 0.01 m/px → 1 m = 100 px. At zoom 1, target 90px → raw ~0.9 m → 1 m.
    expect(realRulerStep(1, 0.01, "m")).toBe(1);
  });

  it("grows the metre step when zoomed out", () => {
    // zoom 0.1 → 1 m = 10 px on screen, raw 9 m → ladder gives 10 m.
    expect(realRulerStep(0.1, 0.01, "m")).toBe(10);
  });

  it("shrinks the metre step when zoomed in", () => {
    // zoom 5 → 1 m = 500 px, raw 0.18 m → 0.25 m.
    expect(realRulerStep(5, 0.01, "m")).toBe(0.25);
  });

  it("uses a feet ladder for the ft unit", () => {
    // 1 ft = 0.3048 m = 30.48 px at scale 0.01. zoom 1 → screenPxPerFt 30.48,
    // raw 90/30.48 ≈ 2.95 ft → ladder gives 5 ft.
    expect(realRulerStep(1, 0.01, "ft")).toBe(5);
  });
});

describe("metresPerWorldUnit", () => {
  it("is 1 for metres and 0.3048 for feet", () => {
    expect(metresPerWorldUnit("m")).toBe(1);
    expect(metresPerWorldUnit("ft")).toBeCloseTo(0.3048, 6);
  });
});

describe("formatRulerLabel", () => {
  it("scales decimals to the step granularity", () => {
    expect(formatRulerLabel(5, 1)).toBe("5");
    expect(formatRulerLabel(2.5, 0.5)).toBe("2.5");
    expect(formatRulerLabel(0.25, 0.05)).toBe("0.25");
  });

  it("renders a clean zero", () => {
    expect(formatRulerLabel(0, 1)).toBe("0");
    expect(formatRulerLabel(-0, 0.5)).toBe("0.0");
  });
});

describe("buildRealRulerTicks", () => {
  it("labels majors in metres at the document scale", () => {
    // scale 0.01 (1 m = 100 px), zoom 1, offset 50 so the origin tick clears the corner.
    const ticks = buildRealRulerTicks(50, 1, 600, 0.01, "m", 1);
    const majors = ticks.filter((t) => t.major);
    // Majors should sit 100 px apart (1 m), starting at "0" (pos 50).
    expect(majors[0].label).toBe("0");
    expect(majors[0].pos).toBeCloseTo(50, 4);
    expect(majors[1].label).toBe("1");
    expect(majors[1].pos - majors[0].pos).toBeCloseTo(100, 4);
  });

  it("returns nothing for a non-positive scale or zoom", () => {
    expect(buildRealRulerTicks(0, 0, 500, 0.01, "m", 1)).toEqual([]);
    expect(buildRealRulerTicks(0, 1, 500, 0, "m", 1)).toEqual([]);
  });
});

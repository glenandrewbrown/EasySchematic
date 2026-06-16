import { describe, it, expect } from "vitest";
import { rulerStep } from "../rulerScale";

describe("rulerStep", () => {
  it("returns a step that keeps major ticks near the target spacing on screen", () => {
    // At zoom 1, a 90px target → first nice step >= 90 is 100.
    expect(rulerStep(1)).toBe(100);
  });

  it("grows the step as you zoom out (so labels stay ~target px apart)", () => {
    // zoom 0.1 → raw 900 → first nice step >= 900 is 1000.
    expect(rulerStep(0.1)).toBe(1000);
    // zoom 0.01 → raw 9000 → 10000.
    expect(rulerStep(0.01)).toBe(10000);
  });

  it("shrinks the step as you zoom in", () => {
    // zoom 4 → raw 22.5 → first nice step >= 22.5 is 50.
    expect(rulerStep(4)).toBe(50);
    // zoom 10 → raw 9 → 10.
    expect(rulerStep(10)).toBe(10);
  });

  it("always returns a positive 'nice' number from the ladder", () => {
    const ladder = new Set([5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000]);
    for (const z of [0.001, 0.05, 0.3, 1, 2, 7, 50]) {
      const s = rulerStep(z);
      expect(s).toBeGreaterThan(0);
      expect(ladder.has(s)).toBe(true);
    }
  });

  it("honours a custom target spacing", () => {
    // Larger target → larger step. target 200 at zoom 1 → raw 200 → 200.
    expect(rulerStep(1, 200)).toBe(200);
  });
});

import { describe, expect, test } from "vitest";
import { resolvePatchPoint, type PlugState } from "../patchbayNormalling";

const NEITHER: PlugState = { frontAPatched: false, frontBPatched: false };
const A_ONLY: PlugState = { frontAPatched: true, frontBPatched: false };
const B_ONLY: PlugState = { frontAPatched: false, frontBPatched: true };
const BOTH: PlugState = { frontAPatched: true, frontBPatched: true };

describe("resolvePatchPoint — half-normalled", () => {
  test("neither jack patched: normal is live, single net, nothing broken", () => {
    const result = resolvePatchPoint("half-normalled", NEITHER);
    expect(result.nets).toEqual([{ terminals: ["rearA", "rearB"], passiveSplit: false }]);
    expect(result.normalBroken).toBe(false);
    expect(result.passiveSplit).toBe(false);
  });

  test("frontA only: tap draws off a still-live normal (passive split)", () => {
    const result = resolvePatchPoint("half-normalled", A_ONLY);
    expect(result.nets).toEqual([
      { terminals: ["rearA", "rearB", "frontA"], passiveSplit: true },
    ]);
    expect(result.normalBroken).toBe(false);
    expect(result.passiveSplit).toBe(true);
  });

  test("frontB only: insert breaks the normal, rearA left dangling", () => {
    const result = resolvePatchPoint("half-normalled", B_ONLY);
    expect(result.nets).toEqual([
      { terminals: ["rearA"], passiveSplit: false },
      { terminals: ["frontB", "rearB"], passiveSplit: false },
    ]);
    expect(result.normalBroken).toBe(true);
    expect(result.passiveSplit).toBe(false);
  });

  test("both patched: frontA taps rearA, frontB breaks the normal into rearB", () => {
    const result = resolvePatchPoint("half-normalled", BOTH);
    expect(result.nets).toEqual([
      { terminals: ["rearA", "frontA"], passiveSplit: false },
      { terminals: ["frontB", "rearB"], passiveSplit: false },
    ]);
    expect(result.normalBroken).toBe(true);
    expect(result.passiveSplit).toBe(false);
  });
});

describe("resolvePatchPoint — split", () => {
  test.each([
    ["neither patched", NEITHER],
    ["frontA only", A_ONLY],
    ["frontB only", B_ONLY],
    ["both patched", BOTH],
  ])("%s: all four terminals commoned into a single passive mult", (_label, plug) => {
    const result = resolvePatchPoint("split", plug);
    expect(result.nets).toEqual([
      { terminals: ["rearA", "rearB", "frontA", "frontB"], passiveSplit: true },
    ]);
    expect(result.normalBroken).toBe(false);
    expect(result.passiveSplit).toBe(true);
  });
});

describe("resolvePatchPoint — isolated", () => {
  test.each([
    ["neither patched", NEITHER],
    ["frontA only", A_ONLY],
    ["frontB only", B_ONLY],
    ["both patched", BOTH],
  ])("%s: A and B stay two independent circuits", (_label, plug) => {
    const result = resolvePatchPoint("isolated", plug);
    expect(result.nets).toEqual([
      { terminals: ["rearA", "frontA"], passiveSplit: false },
      { terminals: ["rearB", "frontB"], passiveSplit: false },
    ]);
    expect(result.normalBroken).toBe(false);
    expect(result.passiveSplit).toBe(false);
  });
});

describe("resolvePatchPoint — purity", () => {
  test("does not mutate the plug state argument", () => {
    const plug: PlugState = { frontAPatched: true, frontBPatched: false };
    const snapshot = { ...plug };
    resolvePatchPoint("half-normalled", plug);
    expect(plug).toEqual(snapshot);
  });

  test("is idempotent: repeated calls with the same input return equal (but distinct) results", () => {
    const plug: PlugState = { frontAPatched: true, frontBPatched: true };
    const first = resolvePatchPoint("half-normalled", plug);
    const second = resolvePatchPoint("half-normalled", plug);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.nets).not.toBe(second.nets);
  });

  test("does not share net array/object references across independent calls", () => {
    const first = resolvePatchPoint("split", NEITHER);
    const second = resolvePatchPoint("split", NEITHER);
    expect(first.nets[0]).not.toBe(second.nets[0]);
    expect(first.nets[0].terminals).not.toBe(second.nets[0].terminals);
  });
});

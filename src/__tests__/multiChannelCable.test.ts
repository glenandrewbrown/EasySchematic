import { describe, it, expect } from "vitest";
import { bundleChannelCount, channelFit, channelCountSuffix } from "../cableFit";

describe("bundleChannelCount", () => {
  it("is undefined when neither end is known", () => {
    expect(bundleChannelCount(undefined, undefined)).toBeUndefined();
  });

  it("uses the known end when only one is known", () => {
    expect(bundleChannelCount(8, undefined)).toBe(8);
    expect(bundleChannelCount(undefined, 2)).toBe(2);
  });

  it("takes the minimum when the ends differ (8-ch DB25 into a 2-ch breakout)", () => {
    expect(bundleChannelCount(8, 2)).toBe(2);
    expect(bundleChannelCount(2, 8)).toBe(2);
  });

  it("returns the shared count when the ends match", () => {
    expect(bundleChannelCount(64, 64)).toBe(64);
  });
});

describe("channelFit", () => {
  it("is unknown when either end is unknown", () => {
    expect(channelFit(undefined, 8)).toBe("unknown");
    expect(channelFit(8, undefined)).toBe("unknown");
  });

  it("matches when both ends carry the same channel count", () => {
    expect(channelFit(2, 2)).toBe("match");
  });

  it("mismatches when the ends carry different counts", () => {
    expect(channelFit(8, 2)).toBe("mismatch");
  });
});

describe("channelCountSuffix", () => {
  it("shows no suffix for single-channel or unknown runs", () => {
    expect(channelCountSuffix(undefined)).toBe("");
    expect(channelCountSuffix(1)).toBe("");
    expect(channelCountSuffix(0)).toBe("");
  });

  it("shows a · Nch suffix for a bundle", () => {
    expect(channelCountSuffix(2)).toBe(" · 2ch");
    expect(channelCountSuffix(8)).toBe(" · 8ch");
    expect(channelCountSuffix(64)).toBe(" · 64ch");
  });
});

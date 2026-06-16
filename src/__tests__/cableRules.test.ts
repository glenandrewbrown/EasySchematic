import { describe, it, expect } from "vitest";
import {
  CABLE_TYPES,
  maxRunWarning,
  estimateRunLengthM,
  cableTypesForSignal,
} from "../cableRules";

// ---------------------------------------------------------------------------
// CABLE_TYPES catalog
// ---------------------------------------------------------------------------

describe("CABLE_TYPES catalog", () => {
  const EXPECTED_IDS = [
    "xlr-mic-line",
    "speaker",
    "aes-ebu",
    "cat6",
    "cat6a",
    "hdmi-passive",
    "sdi-12g",
    "usb2",
    "dmx512",
    "dante-cat",
    "fiber-om4",
  ];

  it("contains all required cable-type ids", () => {
    for (const id of EXPECTED_IDS) {
      expect(CABLE_TYPES).toHaveProperty(id);
    }
  });

  it("every entry has a positive maxRunM", () => {
    for (const [id, rule] of Object.entries(CABLE_TYPES)) {
      expect(rule.maxRunM, `maxRunM for ${id}`).toBeGreaterThan(0);
    }
  });

  it("every entry has a positive minBendRadiusMm", () => {
    for (const [id, rule] of Object.entries(CABLE_TYPES)) {
      expect(rule.minBendRadiusMm, `minBendRadiusMm for ${id}`).toBeGreaterThan(0);
    }
  });

  it("every entry has a non-empty color string", () => {
    for (const [id, rule] of Object.entries(CABLE_TYPES)) {
      expect(rule.color, `color for ${id}`).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("every entry has id matching its record key", () => {
    for (const [key, rule] of Object.entries(CABLE_TYPES)) {
      expect(rule.id).toBe(key);
    }
  });

  it("XLR analog-audio type has ~100 m max run", () => {
    expect(CABLE_TYPES["xlr-mic-line"].signalType).toBe("analog-audio");
    expect(CABLE_TYPES["xlr-mic-line"].maxRunM).toBe(100);
  });

  it("speaker cable has ~50 m max run", () => {
    expect(CABLE_TYPES["speaker"].signalType).toBe("speaker-level");
    expect(CABLE_TYPES["speaker"].maxRunM).toBe(50);
  });

  it("AES/EBU has ~100 m max run", () => {
    expect(CABLE_TYPES["aes-ebu"].signalType).toBe("aes");
    expect(CABLE_TYPES["aes-ebu"].maxRunM).toBe(100);
  });

  it("Cat6 ethernet has 100 m max run", () => {
    expect(CABLE_TYPES["cat6"].signalType).toBe("ethernet");
    expect(CABLE_TYPES["cat6"].maxRunM).toBe(100);
  });

  it("Cat6A ethernet has 100 m max run", () => {
    expect(CABLE_TYPES["cat6a"].signalType).toBe("ethernet");
    expect(CABLE_TYPES["cat6a"].maxRunM).toBe(100);
  });

  it("HDMI passive has 15 m max run", () => {
    expect(CABLE_TYPES["hdmi-passive"].signalType).toBe("hdmi");
    expect(CABLE_TYPES["hdmi-passive"].maxRunM).toBe(15);
  });

  it("12G-SDI coax has 70 m max run", () => {
    expect(CABLE_TYPES["sdi-12g"].signalType).toBe("sdi");
    expect(CABLE_TYPES["sdi-12g"].maxRunM).toBe(70);
  });

  it("USB 2.0 has 5 m max run", () => {
    expect(CABLE_TYPES["usb2"].signalType).toBe("usb");
    expect(CABLE_TYPES["usb2"].maxRunM).toBe(5);
  });

  it("DMX512 has 300 m max run", () => {
    expect(CABLE_TYPES["dmx512"].signalType).toBe("dmx");
    expect(CABLE_TYPES["dmx512"].maxRunM).toBe(300);
  });

  it("Dante/AVB over Cat has 100 m max run", () => {
    expect(CABLE_TYPES["dante-cat"].signalType).toBe("dante");
    expect(CABLE_TYPES["dante-cat"].maxRunM).toBe(100);
  });

  it("Fiber OM4 has a max run >= 300 m", () => {
    expect(CABLE_TYPES["fiber-om4"].signalType).toBe("fiber");
    expect(CABLE_TYPES["fiber-om4"].maxRunM).toBeGreaterThanOrEqual(300);
  });
});

// ---------------------------------------------------------------------------
// maxRunWarning
// ---------------------------------------------------------------------------

describe("maxRunWarning", () => {
  it("returns null for unknown cable-type id", () => {
    expect(maxRunWarning("nonexistent-type", 50)).toBeNull();
  });

  it("returns null when runLengthM is zero", () => {
    expect(maxRunWarning("xlr-mic-line", 0)).toBeNull();
  });

  it("returns null when runLengthM is negative", () => {
    expect(maxRunWarning("xlr-mic-line", -5)).toBeNull();
  });

  it("reports not exceeded when run is well within limit", () => {
    const result = maxRunWarning("xlr-mic-line", 50); // limit 100 m
    expect(result).not.toBeNull();
    expect(result!.exceeded).toBe(false);
    expect(result!.maxRunM).toBe(100);
    expect(result!.ratio).toBeCloseTo(0.5);
  });

  it("reports not exceeded at exactly the limit (ratio === 1)", () => {
    const result = maxRunWarning("xlr-mic-line", 100); // exactly 100 m
    expect(result).not.toBeNull();
    expect(result!.exceeded).toBe(false);
    expect(result!.ratio).toBeCloseTo(1.0);
  });

  it("reports exceeded when run is just over the limit", () => {
    const result = maxRunWarning("xlr-mic-line", 101); // 1 m over 100 m limit
    expect(result).not.toBeNull();
    expect(result!.exceeded).toBe(true);
    expect(result!.ratio).toBeGreaterThan(1);
  });

  it("reports exceeded for short cable well over its short limit (USB 2.0, 10 m)", () => {
    const result = maxRunWarning("usb2", 10); // limit is 5 m
    expect(result).not.toBeNull();
    expect(result!.exceeded).toBe(true);
    expect(result!.maxRunM).toBe(5);
    expect(result!.ratio).toBeCloseTo(2.0);
  });

  it("reports exceeded for HDMI passive beyond 15 m", () => {
    const result = maxRunWarning("hdmi-passive", 20);
    expect(result).not.toBeNull();
    expect(result!.exceeded).toBe(true);
    expect(result!.maxRunM).toBe(15);
  });

  it("ratio is calculated as runLengthM / maxRunM", () => {
    const result = maxRunWarning("speaker", 25); // limit 50 m
    expect(result).not.toBeNull();
    expect(result!.ratio).toBeCloseTo(0.5);
  });
});

// ---------------------------------------------------------------------------
// estimateRunLengthM
// ---------------------------------------------------------------------------

describe("estimateRunLengthM", () => {
  it("applies percent slack then fixed slack: 10 m + 15% + 2 m = 13.5 m", () => {
    expect(estimateRunLengthM(10, 15, 2)).toBeCloseTo(13.5);
  });

  it("works with zero slack: returns straight-line distance", () => {
    expect(estimateRunLengthM(20, 0, 0)).toBeCloseTo(20);
  });

  it("applies only percent slack when fixed is zero: 20 m + 10% = 22 m", () => {
    expect(estimateRunLengthM(20, 10, 0)).toBeCloseTo(22);
  });

  it("applies only fixed slack when percent is zero: 20 m + 5 m = 25 m", () => {
    expect(estimateRunLengthM(20, 0, 5)).toBeCloseTo(25);
  });

  it("treats negative straightLineM as 0 before applying slack", () => {
    // base = max(0, -5) = 0; result = 0 * 1.15 + 2 = 2
    expect(estimateRunLengthM(-5, 15, 2)).toBeCloseTo(2);
  });

  it("clamps to 0 when straightLineM is zero", () => {
    expect(estimateRunLengthM(0, 15, 2)).toBeCloseTo(2); // 0 * 1.15 + 2 = 2
  });

  it("handles large slack: 100 m + 50% + 10 m = 160 m", () => {
    expect(estimateRunLengthM(100, 50, 10)).toBeCloseTo(160);
  });

  it("clamps overall result to 0 even with negative fixed slack and tiny run", () => {
    // 1 m + 0% - 5 m = -4 m → clamped to 0
    expect(estimateRunLengthM(1, 0, -5)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// cableTypesForSignal
// ---------------------------------------------------------------------------

describe("cableTypesForSignal", () => {
  it("returns only ethernet cables for 'ethernet' signal type", () => {
    const results = cableTypesForSignal("ethernet");
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const rule of results) {
      expect(rule.signalType).toBe("ethernet");
    }
  });

  it("includes cat6 and cat6a for ethernet", () => {
    const results = cableTypesForSignal("ethernet");
    const ids = results.map((r) => r.id);
    expect(ids).toContain("cat6");
    expect(ids).toContain("cat6a");
  });

  it("returns only sdi cables for 'sdi' signal type", () => {
    const results = cableTypesForSignal("sdi");
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const rule of results) {
      expect(rule.signalType).toBe("sdi");
    }
  });

  it("returns empty array for a signal type with no matching cables", () => {
    // "bluetooth" is not in the catalog
    const results = cableTypesForSignal("bluetooth");
    expect(results).toEqual([]);
  });

  it("returns all analog-audio cables", () => {
    const results = cableTypesForSignal("analog-audio");
    const ids = results.map((r) => r.id);
    expect(ids).toContain("xlr-mic-line");
  });
});

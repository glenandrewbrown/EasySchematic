import { describe, it, expect } from "vitest";
import { DEVICE_SYMBOLS, symbolForDeviceType } from "../symbols/index";

// ---------------------------------------------------------------------------
// Registry completeness
// ---------------------------------------------------------------------------

const EXPECTED_IDS = [
  "speaker",
  "subwoofer",
  "wired-mic",
  "wireless-mic",
  "amplifier",
  "mixer",
  "audio-io",
  "rack",
  "display",
  "projector",
  "camera",
  "computer",
] as const;

describe("DEVICE_SYMBOLS", () => {
  it("contains all 12 expected symbol ids", () => {
    expect(Object.keys(DEVICE_SYMBOLS)).toHaveLength(12);
    for (const id of EXPECTED_IDS) {
      expect(DEVICE_SYMBOLS).toHaveProperty(id);
    }
  });

  it("each symbol has a non-empty svg string", () => {
    for (const id of EXPECTED_IDS) {
      const symbol = DEVICE_SYMBOLS[id];
      expect(symbol.svg.trim().length, `svg for "${id}" must not be empty`).toBeGreaterThan(0);
    }
  });

  it("each symbol id matches its key in the record", () => {
    for (const [key, symbol] of Object.entries(DEVICE_SYMBOLS)) {
      expect(symbol.id).toBe(key);
    }
  });

  it("each symbol has a non-empty label", () => {
    for (const id of EXPECTED_IDS) {
      expect(DEVICE_SYMBOLS[id].label.trim().length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// symbolForDeviceType — representative real deviceType strings
// ---------------------------------------------------------------------------

describe("symbolForDeviceType", () => {
  // Null / unknown inputs
  it("returns null for undefined", () => {
    expect(symbolForDeviceType(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(symbolForDeviceType("")).toBeNull();
  });

  it("returns null for an unrecognised deviceType", () => {
    expect(symbolForDeviceType("frobnicator")).toBeNull();
    expect(symbolForDeviceType("patch panel")).toBeNull();
  });

  // Speaker
  it('maps "Loud Speaker" to speaker', () => {
    expect(symbolForDeviceType("Loud Speaker")?.id).toBe("speaker");
  });

  it('maps "speaker" to speaker', () => {
    expect(symbolForDeviceType("speaker")?.id).toBe("speaker");
  });

  // Subwoofer — must NOT accidentally match "speaker"
  it('maps "subwoofer" to subwoofer', () => {
    expect(symbolForDeviceType("subwoofer")?.id).toBe("subwoofer");
  });

  it('maps "Subwoofer" (case-insensitive) to subwoofer', () => {
    expect(symbolForDeviceType("Subwoofer")?.id).toBe("subwoofer");
  });

  it('maps "QSC KW181 Sub" to subwoofer, not speaker', () => {
    expect(symbolForDeviceType("QSC KW181 Sub")?.id).toBe("subwoofer");
  });

  // Wired microphone
  it('maps "wired-mic" to wired-mic', () => {
    expect(symbolForDeviceType("wired-mic")?.id).toBe("wired-mic");
  });

  it('maps "Microphone" to wired-mic', () => {
    expect(symbolForDeviceType("Microphone")?.id).toBe("wired-mic");
  });

  it('maps "Handheld Mic" to wired-mic', () => {
    expect(symbolForDeviceType("Handheld Mic")?.id).toBe("wired-mic");
  });

  // Wireless microphone — must NOT accidentally match "wired"
  it('maps "wireless mic" to wireless-mic', () => {
    expect(symbolForDeviceType("wireless mic")?.id).toBe("wireless-mic");
  });

  it('maps "Wireless Mic" (mixed case) to wireless-mic', () => {
    expect(symbolForDeviceType("Wireless Mic")?.id).toBe("wireless-mic");
  });

  it('maps "wireless-mic" to wireless-mic, not wired-mic', () => {
    expect(symbolForDeviceType("wireless-mic")?.id).toBe("wireless-mic");
  });

  // Subwoofer vs speaker disambiguation
  it("subwoofer does not resolve to speaker", () => {
    expect(symbolForDeviceType("Subwoofer")?.id).not.toBe("speaker");
  });

  // Wireless vs wired disambiguation
  it("wireless mic does not resolve to wired-mic", () => {
    expect(symbolForDeviceType("Wireless Microphone")?.id).not.toBe("wired-mic");
  });

  // Amplifier
  it('maps "amplifier" to amplifier', () => {
    expect(symbolForDeviceType("amplifier")?.id).toBe("amplifier");
  });

  it('maps "Power Amp" to amplifier', () => {
    expect(symbolForDeviceType("Power Amp")?.id).toBe("amplifier");
  });

  // Mixer
  it('maps "mixer" to mixer', () => {
    expect(symbolForDeviceType("mixer")?.id).toBe("mixer");
  });

  it('maps "Digital Console" to mixer', () => {
    expect(symbolForDeviceType("Digital Console")?.id).toBe("mixer");
  });

  // Audio I/O
  it('maps "Audio I/O" to audio-io', () => {
    expect(symbolForDeviceType("Audio I/O")?.id).toBe("audio-io");
  });

  it('maps "audio io" to audio-io', () => {
    expect(symbolForDeviceType("audio io")?.id).toBe("audio-io");
  });

  it('maps "interface" to audio-io', () => {
    expect(symbolForDeviceType("interface")?.id).toBe("audio-io");
  });

  it('maps "Audio Interface" to audio-io', () => {
    expect(symbolForDeviceType("Audio Interface")?.id).toBe("audio-io");
  });

  // Rack
  it('maps "rack" to rack', () => {
    expect(symbolForDeviceType("rack")?.id).toBe("rack");
  });

  it('maps "Equipment Rack" to rack', () => {
    expect(symbolForDeviceType("Equipment Rack")?.id).toBe("rack");
  });

  // Display
  it('maps "display" to display', () => {
    expect(symbolForDeviceType("display")?.id).toBe("display");
  });

  it('maps "screen" to display', () => {
    expect(symbolForDeviceType("screen")?.id).toBe("display");
  });

  it('maps "monitor" to display', () => {
    expect(symbolForDeviceType("monitor")?.id).toBe("display");
  });

  it('maps "LED TV" to display', () => {
    expect(symbolForDeviceType("LED TV")?.id).toBe("display");
  });

  // Projector
  it('maps "projector" to projector', () => {
    expect(symbolForDeviceType("projector")?.id).toBe("projector");
  });

  it('maps "Laser Projector" to projector', () => {
    expect(symbolForDeviceType("Laser Projector")?.id).toBe("projector");
  });

  // Camera
  it('maps "camera" to camera', () => {
    expect(symbolForDeviceType("camera")?.id).toBe("camera");
  });

  it('maps "PTZ Cam" to camera', () => {
    expect(symbolForDeviceType("PTZ Cam")?.id).toBe("camera");
  });

  // Computer / laptop
  it('maps "Laptop" to computer', () => {
    expect(symbolForDeviceType("Laptop")?.id).toBe("computer");
  });

  it('maps "computer" to computer', () => {
    expect(symbolForDeviceType("computer")?.id).toBe("computer");
  });
});

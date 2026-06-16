import { describe, it, expect } from "vitest";
import {
  SIGNAL_FAMILY,
  SIGNAL_FAMILY_COLORS,
  familyFor,
  buildDefaultSignalColors,
} from "../signalFamilies";
import type { SignalType } from "../types";

describe("signal families", () => {
  it("assigns every signal type to a family", () => {
    const colors = buildDefaultSignalColors();
    for (const type of Object.keys(SIGNAL_FAMILY) as SignalType[]) {
      expect(colors[type], `${type} should have a colour`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("groups the obvious AV signals correctly", () => {
    expect(familyFor("sdi")).toBe("video");
    expect(familyFor("hdmi")).toBe("video");
    expect(familyFor("dante")).toBe("audio");
    expect(familyFor("aes")).toBe("audio");
    expect(familyFor("speaker-level")).toBe("speaker");
    expect(familyFor("ethernet")).toBe("network");
    expect(familyFor("dmx")).toBe("control");
    expect(familyFor("rf")).toBe("rf");
    expect(familyFor("custom")).toBe("other");
  });

  it("keeps the conventional power phase colours (not the family hue)", () => {
    const colors = buildDefaultSignalColors();
    expect(familyFor("power-l1")).toBe("power");
    expect(colors["power-l1"]).toBe("#1a1a1a"); // black, electrical convention
    expect(colors["power-l2"]).toBe("#cc0000"); // red
    expect(colors["power-l3"]).toBe("#0066cc"); // blue
    expect(colors["power-ground"]).toBe("#00aa00"); // green
  });

  it("paints SDI/video in the blue family and Dante/audio in the teal family", () => {
    const colors = buildDefaultSignalColors();
    // sdi is the first video type → the family's base blue.
    expect(colors.sdi).toBe("#2563eb");
    // dante is the first audio type → the family's base teal.
    expect(colors.dante).toBe("#0d9488");
  });

  it("exposes one representative hue per family", () => {
    expect(SIGNAL_FAMILY_COLORS.video).toBe("#2563eb");
    expect(SIGNAL_FAMILY_COLORS.audio).toBe("#0d9488");
    expect(SIGNAL_FAMILY_COLORS.power).toBe("#dc2626");
  });
});

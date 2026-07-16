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

  it("applies the fixed brand-spec colours for the 11 named signal types (Slate × Carbon)", () => {
    const colors = buildDefaultSignalColors();
    // These 11 are data, not family-ramp output — they override the taxonomy.
    expect(colors.aes).toBe("#a98bf0");
    expect(colors["analog-audio"]).toBe("#cfa920"); // gold
    expect(colors.dante).toBe("#ec8a3e");
    expect(colors.usb).toBe("#e06aa6");
    expect(colors.sdi).toBe("#6db0f0");
    expect(colors.hdmi).toBe("#ef7a72");
    expect(colors.ethernet).toBe("#19b6a6"); // teal
    expect(colors["speaker-level"]).toBe("#9f1239"); // crimson
    // power overrides POWER_COLORS for the base type…
    expect(colors.power).toBe("#7a8290"); // slate grey
    // …but the phase/neutral/ground electrical colours are untouched.
    expect(colors["power-l1"]).toBe("#1a1a1a");
    expect(colors["power-ground"]).toBe("#00aa00");
  });

  it("honours fixed colours that sit off their family's gradient", () => {
    const colors = buildDefaultSignalColors();
    // thunderbolt is a network type, but Slate × Carbon pins it to a slate grey that is
    // nowhere on the ethernet-teal → USB-pink ramp. Fixed colours are applied last, so it
    // must survive rather than being interpolated back onto the gradient.
    expect(familyFor("thunderbolt")).toBe("network");
    expect(colors.thunderbolt).toBe("#6b7689");
    // custom (other) is likewise pinned off its family's slate shade ramp.
    expect(familyFor("custom")).toBe("other");
    expect(colors.custom).toBe("#9c8cc4");
  });

  it("interpolates non-overridden types across their family's brand anchors", () => {
    const colors = buildDefaultSignalColors();
    const hex = /^#[0-9a-f]{6}$/i;
    // madi (audio, no fixed override) is an interior blend of the audio anchors
    // (AES violet → analog gold → Dante orange), not the old teal family-ramp base.
    expect(colors.madi).toMatch(hex);
    expect(colors.madi).not.toBe("#0d9488"); // no longer the teal family-ramp base
    expect(colors.madi).not.toBe("#a98bf0"); // a blend, not snapped onto an anchor
    expect(colors.madi).not.toBe("#cfa920");
    expect(colors.madi).not.toBe("#ec8a3e");
    // ndi (video, no override) blends across SDI blue → HDMI coral, not the old blue base.
    expect(colors.ndi).toMatch(hex);
    expect(colors.ndi).not.toBe("#2563eb"); // no longer the old blue family-ramp base
    expect(colors.ndi).not.toBe("#6db0f0"); // a blend, not snapped onto an anchor
    expect(colors.ndi).not.toBe("#ef7a72");
    // deterministic across calls
    expect(buildDefaultSignalColors().madi).toBe(colors.madi);
  });

  it("exposes one representative hue per family", () => {
    expect(SIGNAL_FAMILY_COLORS.video).toBe("#2563eb");
    expect(SIGNAL_FAMILY_COLORS.audio).toBe("#cfa920"); // the analog-audio anchor
    expect(SIGNAL_FAMILY_COLORS.power).toBe("#dc2626");
  });

  it("keeps a family's representative hue consistent with its sole member", () => {
    // speaker has exactly one member, so the legend hue and the rendered cable must agree.
    const colors = buildDefaultSignalColors();
    expect(SIGNAL_FAMILY_COLORS.speaker).toBe(colors["speaker-level"]);
  });
});

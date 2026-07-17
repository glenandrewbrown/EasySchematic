import { describe, it, expect } from "vitest";
import {
  defaultArtworkForDevice,
  emojiToArtworkId,
  getSymbolByQualifiedId,
  isSymbolArtworkId,
  resolveArtworkSvg,
  EMOJI_ARTWORK_MAP,
} from "../deviceArtwork";
import type { Port } from "../types";

const audioPort = { id: "p1", label: "Out", signalType: "analog-audio", direction: "output" } as unknown as Port;

describe("deviceArtwork", () => {
  it("distinguishes symbol ids from upload ids", () => {
    expect(isSymbolArtworkId("audio/loudspeaker")).toBe(true);
    expect(isSymbolArtworkId("svg-12345")).toBe(false);
  });

  it("class-default rules match board 3c for present symbols", () => {
    expect(defaultArtworkForDevice({ deviceType: "speaker" })).toBe("audio/loudspeaker");
    expect(defaultArtworkForDevice({ deviceType: "subwoofer" })).toBe("audio/subwoofer");
    expect(defaultArtworkForDevice({ deviceType: "mixer" })).toBe("audio/mixing-console");
    expect(defaultArtworkForDevice({ deviceType: "network-switch" })).toBe("network/network-switch");
    expect(defaultArtworkForDevice({ deviceType: "server" })).toBe("network/server");
  });

  it("degrades a new-category target to the generic fallback only while the symbol is absent", () => {
    const cam = defaultArtworkForDevice({ deviceType: "ptz-camera" });
    // Either the expanded library shipped (exact id) or the safe generic fallback — never empty.
    expect(["video/camera-ptz", "generic/rounded-rectangle"]).toContain(cam);
    expect(getSymbolByQualifiedId(cam)).toBeTruthy();
  });

  it("falls back to the dominant signal, then the generic rounded rectangle", () => {
    expect(defaultArtworkForDevice({ deviceType: "widget", ports: [audioPort] })).toBe("audio/loudspeaker");
    expect(defaultArtworkForDevice({ deviceType: "widget" })).toBe("generic/rounded-rectangle");
  });

  it("every emoji-map target that claims to exist resolves to real markup", () => {
    for (const emoji of Object.keys(EMOJI_ARTWORK_MAP)) {
      const id = emojiToArtworkId(emoji);
      if (id) {
        expect(getSymbolByQualifiedId(id)?.svg).toMatch(/^<svg/);
      }
    }
  });

  it("resolveArtworkSvg: explicit symbol > upload > class default, always some markup", () => {
    const dev = { deviceType: "speaker", ports: [audioPort] };
    expect(resolveArtworkSvg("audio/loudspeaker", {}, dev)).toMatch(/^<svg/);
    expect(resolveArtworkSvg("up1", { up1: "<svg data-up/>" }, dev)).toBe("<svg data-up/>");
    // Unknown ids fall through to the class default rather than rendering nothing.
    expect(resolveArtworkSvg("nope/nothing", {}, dev)).toMatch(/^<svg/);
    expect(resolveArtworkSvg(undefined, undefined, dev)).toMatch(/^<svg/);
  });
});

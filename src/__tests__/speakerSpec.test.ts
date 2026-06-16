import { describe, expect, it } from "vitest";
import { isSpeaker, resolveSpeakerSpec, DEFAULT_COVERAGE_ANGLE_DEG } from "../speakerSpec";

describe("isSpeaker", () => {
  it("matches devices whose type names a speaker", () => {
    expect(isSpeaker({ deviceType: "Loud Speaker", ports: [] })).toBe(true);
    expect(isSpeaker({ deviceType: "loudspeaker", ports: [] })).toBe(true);
    expect(isSpeaker({ deviceType: "7360A Subwoofer", ports: [] })).toBe(true);
  });

  it("matches devices with a speaker-level port", () => {
    expect(
      isSpeaker({ deviceType: "Passive Cabinet", ports: [{ signalType: "speaker-level" }] }),
    ).toBe(true);
  });

  it("does not match non-speakers", () => {
    expect(isSpeaker({ deviceType: "Laptop", ports: [] })).toBe(false);
    expect(isSpeaker({ deviceType: "wired-mic", ports: [{ signalType: "analog-audio" }] })).toBe(false);
    expect(isSpeaker({ deviceType: "Audio I/0", ports: [] })).toBe(false);
    expect(isSpeaker({ deviceType: "", ports: [] })).toBe(false);
  });
});

describe("resolveSpeakerSpec", () => {
  it("uses explicit speaker fields when present", () => {
    const spec = resolveSpeakerSpec({
      speakerCoverageAngleDeg: 110,
      speakerSensitivityDb: 91,
      speakerMaxPowerW: 200,
    });
    expect(spec.coverageAngleDeg).toBe(110);
    expect(spec.sensitivityDb).toBe(91);
    expect(spec.maxPowerW).toBe(200);
  });

  it("defaults the coverage angle when unset or non-positive", () => {
    expect(resolveSpeakerSpec({}).coverageAngleDeg).toBe(DEFAULT_COVERAGE_ANGLE_DEG);
    expect(resolveSpeakerSpec({ speakerCoverageAngleDeg: 0 }).coverageAngleDeg).toBe(
      DEFAULT_COVERAGE_ANGLE_DEG,
    );
  });

  it("falls back to powerDrawW for max power when speakerMaxPowerW is unset", () => {
    expect(resolveSpeakerSpec({ powerDrawW: 110 }).maxPowerW).toBe(110);
    expect(resolveSpeakerSpec({ speakerMaxPowerW: 250, powerDrawW: 110 }).maxPowerW).toBe(250);
  });

  it("returns null sensitivity/power when nothing is available", () => {
    const spec = resolveSpeakerSpec({});
    expect(spec.sensitivityDb).toBeNull();
    expect(spec.maxPowerW).toBeNull();
  });
});

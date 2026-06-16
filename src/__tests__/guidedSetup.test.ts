import { describe, expect, it } from "vitest";
import {
  GUIDED_STEPS,
  isRoomCalibrated,
  hasSpeaker,
  evaluateGuidedSteps,
  activeStepIndex,
  isGuidedSetupComplete,
  type GuidedSetupState,
} from "../guidedSetup";

describe("GUIDED_STEPS", () => {
  it("defines the four venue-setup steps in order", () => {
    expect(GUIDED_STEPS.map((s) => s.id)).toEqual([
      "room",
      "speakers",
      "coverage",
      "cables",
    ]);
  });

  it("gives every step a title, where, and how", () => {
    for (const step of GUIDED_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.where.length).toBeGreaterThan(0);
      expect(step.how.length).toBeGreaterThan(0);
    }
  });
});

describe("isRoomCalibrated", () => {
  it("returns false when there are no rooms", () => {
    expect(isRoomCalibrated([])).toBe(false);
  });

  it("returns false when no room has a real width", () => {
    expect(isRoomCalibrated([{}, { widthM: undefined }])).toBe(false);
  });

  it("treats a zero or negative width as uncalibrated", () => {
    expect(isRoomCalibrated([{ widthM: 0 }])).toBe(false);
    expect(isRoomCalibrated([{ widthM: -3 }])).toBe(false);
  });

  it("returns true when at least one room has a positive width", () => {
    expect(isRoomCalibrated([{}, { widthM: 6.5 }])).toBe(true);
  });
});

describe("hasSpeaker", () => {
  it("returns false with no devices", () => {
    expect(hasSpeaker([])).toBe(false);
  });

  it("returns false when no device is a loudspeaker", () => {
    expect(
      hasSpeaker([{ deviceType: "camera" }, { deviceType: "mixer" }]),
    ).toBe(false);
  });

  it("detects a speaker by device type", () => {
    expect(hasSpeaker([{ deviceType: "loudspeaker" }])).toBe(true);
  });

  it("detects a speaker by a speaker-level port", () => {
    expect(
      hasSpeaker([
        { deviceType: "amplifier", ports: [{ signalType: "speaker-level" }] },
      ]),
    ).toBe(true);
  });
});

describe("evaluateGuidedSteps", () => {
  const base: GuidedSetupState = {
    rooms: [],
    devices: [],
    canvasViewMode: "schematic",
    coverageVisible: false,
    cableBomOpened: false,
  };

  it("returns all-incomplete for an empty project", () => {
    expect(evaluateGuidedSteps(base)).toEqual([false, false, false, false]);
  });

  it("marks the coverage step done only in plan view with coverage on", () => {
    expect(
      evaluateGuidedSteps({ ...base, canvasViewMode: "plan", coverageVisible: true })[2],
    ).toBe(true);
    expect(
      evaluateGuidedSteps({ ...base, canvasViewMode: "plan", coverageVisible: false })[2],
    ).toBe(false);
    expect(
      evaluateGuidedSteps({ ...base, canvasViewMode: "schematic", coverageVisible: true })[2],
    ).toBe(false);
  });

  it("reflects a calibrated room, a speaker, and an opened BOM", () => {
    const state: GuidedSetupState = {
      rooms: [{ widthM: 8 }],
      devices: [{ deviceType: "speaker" }],
      canvasViewMode: "plan",
      coverageVisible: true,
      cableBomOpened: true,
    };
    expect(evaluateGuidedSteps(state)).toEqual([true, true, true, true]);
  });
});

describe("activeStepIndex", () => {
  it("points at the first step when nothing is done", () => {
    expect(activeStepIndex([false, false, false, false])).toBe(0);
  });

  it("points at the first incomplete step", () => {
    expect(activeStepIndex([true, false, false, false])).toBe(1);
    expect(activeStepIndex([true, true, false, false])).toBe(2);
  });

  it("skips already-completed steps even when out of order", () => {
    expect(activeStepIndex([true, false, true, false])).toBe(1);
  });

  it("equals the step count when every step is done", () => {
    expect(activeStepIndex([true, true, true, true])).toBe(4);
  });
});

describe("isGuidedSetupComplete", () => {
  it("is false when any step is incomplete", () => {
    expect(isGuidedSetupComplete([true, true, true, false])).toBe(false);
  });

  it("is false for an empty list", () => {
    expect(isGuidedSetupComplete([])).toBe(false);
  });

  it("is true when all steps are complete", () => {
    expect(isGuidedSetupComplete([true, true, true, true])).toBe(true);
  });
});

import { isSpeaker } from "./speakerSpec";
import type { CanvasViewMode } from "./types";

/**
 * Guided "venue setup" flow — pure step model + completion evaluation.
 *
 * Walks a new user through the to-scale venue workflow end to end:
 *   1. calibrate a room's real size, 2. place loudspeakers,
 *   3. view their coverage in plan view, 4. review the cable BOM.
 *
 * GuidedSetupPanel renders these steps and drives the matching toggles; keeping
 * the model + completion logic here keeps it unit-testable and decoupled from
 * the store and React Flow.
 */

export type GuidedStepId = "room" | "speakers" | "coverage" | "cables";

export interface GuidedStepDef {
  id: GuidedStepId;
  /** Short imperative step title. */
  title: string;
  /** Where the relevant control lives (mirrors WhatsNewDialog's "where"). */
  where: string;
  /** What the user does to complete the step. */
  how: string;
}

/** The four venue-setup steps, in order. */
export const GUIDED_STEPS: readonly GuidedStepDef[] = [
  {
    id: "room",
    title: "Calibrate a room",
    where: "Double-click a room → Real Dimensions, or its ＋ set width label",
    how: "Give at least one room a real width (and depth) in metres so the plan view and cable runs are drawn to scale.",
  },
  {
    id: "speakers",
    title: "Place your speakers",
    where: "Left palette → drag devices into a room",
    how: "Drop your loudspeakers (Genelec 8040b, 8340a, 7360A sub…) inside the room. Anything named a speaker, or with a speaker-level port, counts.",
  },
  {
    id: "coverage",
    title: "See the coverage",
    where: "Top-center: Plan, then Coverage",
    how: "Switch to the to-scale Plan view and turn on Coverage to see each speaker's nominal coverage wedge. Right-click a speaker to aim it.",
  },
  {
    id: "cables",
    title: "Review the cable BOM",
    where: "Reports → Cable BOM",
    how: "Open the Cable BOM — a bill of materials grouped by cable type, with run-length warnings. Export to CSV or PDF.",
  },
];

/** Minimal room shape the evaluator needs (a calibrated room has a real width). */
export interface GuidedRoomInput {
  widthM?: number;
}

/** Minimal device shape the evaluator needs (reuses the speaker detector's input). */
export type GuidedDeviceInput = Parameters<typeof isSpeaker>[0];

/** Live inputs the guided flow inspects to decide which steps are done. */
export interface GuidedSetupState {
  rooms: readonly GuidedRoomInput[];
  devices: readonly GuidedDeviceInput[];
  canvasViewMode: CanvasViewMode;
  coverageVisible: boolean;
  /** Whether the user has opened the Cable BOM at least once this session. */
  cableBomOpened: boolean;
}

/** True when at least one room has a real positive width (scale calibrated). */
export function isRoomCalibrated(rooms: readonly GuidedRoomInput[]): boolean {
  return rooms.some((r) => typeof r.widthM === "number" && r.widthM > 0);
}

/** True when at least one loudspeaker is present on the canvas. */
export function hasSpeaker(devices: readonly GuidedDeviceInput[]): boolean {
  return devices.some((d) => isSpeaker(d));
}

/** Completion flag for each GUIDED_STEPS entry, in the same order. */
export function evaluateGuidedSteps(state: GuidedSetupState): boolean[] {
  return [
    isRoomCalibrated(state.rooms),
    hasSpeaker(state.devices),
    state.canvasViewMode === "plan" && state.coverageVisible,
    state.cableBomOpened,
  ];
}

/** Index of the first incomplete step, or GUIDED_STEPS.length when all are done. */
export function activeStepIndex(completed: readonly boolean[]): number {
  const idx = completed.findIndex((done) => !done);
  return idx === -1 ? completed.length : idx;
}

/** True when every step is complete (and there is at least one step). */
export function isGuidedSetupComplete(completed: readonly boolean[]): boolean {
  return completed.length > 0 && completed.every(Boolean);
}

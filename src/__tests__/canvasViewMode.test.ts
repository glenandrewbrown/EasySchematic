import { describe, it, expect } from "vitest";
import {
  parseCanvasViewMode,
  DEFAULT_CANVAS_VIEW_MODE,
  type CanvasViewMode,
} from "../types";

describe("parseCanvasViewMode", () => {
  it("accepts every known canvas view mode verbatim", () => {
    const modes: CanvasViewMode[] = ["schematic", "plan", "schedule"];
    for (const mode of modes) {
      expect(parseCanvasViewMode(mode)).toBe(mode);
    }
  });

  it("falls back to the default for null/undefined (no persisted value)", () => {
    expect(parseCanvasViewMode(null)).toBe(DEFAULT_CANVAS_VIEW_MODE);
    expect(parseCanvasViewMode(undefined)).toBe(DEFAULT_CANVAS_VIEW_MODE);
  });

  it("falls back to the default for unknown or empty strings", () => {
    expect(parseCanvasViewMode("")).toBe(DEFAULT_CANVAS_VIEW_MODE);
    expect(parseCanvasViewMode("coverage")).toBe(DEFAULT_CANVAS_VIEW_MODE);
    expect(parseCanvasViewMode("garbage")).toBe(DEFAULT_CANVAS_VIEW_MODE);
  });

  it("is case-sensitive — a wrong-case value is not a known mode", () => {
    expect(parseCanvasViewMode("Plan")).toBe(DEFAULT_CANVAS_VIEW_MODE);
    expect(parseCanvasViewMode("SCHEDULE")).toBe(DEFAULT_CANVAS_VIEW_MODE);
  });
});

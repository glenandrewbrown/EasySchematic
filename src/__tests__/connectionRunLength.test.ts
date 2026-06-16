import { describe, it, expect } from "vitest";
import { connectionRun } from "../connectionRunLength";
import type { CableScheduleRow } from "../cableSchedule";

/** Minimal row factory — connectionRun only reads edgeId / computedLength / computedLengthM. */
function row(edgeId: string, text?: string, meters?: number): CableScheduleRow {
  return { edgeId, computedLength: text, computedLengthM: meters } as unknown as CableScheduleRow;
}

describe("connectionRun", () => {
  const rows = [
    row("e1", "30 m", 30),
    row("e2", "120 m", 120),
    row("e3"), // known connection but no estimate (no room distances set)
  ];

  it("returns the estimated run text + metres for a known edge within max", () => {
    const r = connectionRun(rows, "e1", 100);
    expect(r.text).toBe("30 m");
    expect(r.meters).toBe(30);
    expect(r.overMax).toBe(false);
  });

  it("flags overMax when the estimate exceeds the cable's max run", () => {
    const r = connectionRun(rows, "e2", 100);
    expect(r.meters).toBe(120);
    expect(r.overMax).toBe(true);
  });

  it("never flags overMax when no max is provided", () => {
    expect(connectionRun(rows, "e2").overMax).toBe(false);
    expect(connectionRun(rows, "e2", undefined).overMax).toBe(false);
  });

  it("returns no text/metres (and overMax false) when the edge has no estimate", () => {
    const r = connectionRun(rows, "e3", 50);
    expect(r.text).toBeUndefined();
    expect(r.meters).toBeUndefined();
    expect(r.overMax).toBe(false);
  });

  it("returns an empty result for an unknown edge", () => {
    const r = connectionRun(rows, "missing", 50);
    expect(r.text).toBeUndefined();
    expect(r.meters).toBeUndefined();
    expect(r.overMax).toBe(false);
  });

  it("treats a run exactly at the max as within limit (not over)", () => {
    expect(connectionRun(rows, "e1", 30).overMax).toBe(false);
  });
});

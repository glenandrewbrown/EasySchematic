import { describe, expect, it } from "vitest";
import { scheduleToBomInputs, runLengthWarnings } from "../cableBomBuild";
import { buildCableBom } from "../cableBom";
import type { CableScheduleRow } from "../cableSchedule";

/** Build a CableScheduleRow with sane defaults; override only what a test cares about. */
function mkRow(partial: Partial<CableScheduleRow>): CableScheduleRow {
  return {
    edgeId: "e1",
    cableId: "C001",
    sourceDevice: "Source",
    sourcePort: "Out",
    sourceConnector: "—",
    targetDevice: "Target",
    targetPort: "In",
    targetConnector: "—",
    cableType: "",
    signalType: "Custom",
    cableLength: "",
    sourceRoom: "Room A",
    targetRoom: "Room B",
    multicableLabel: "",
    bundle: "", // blank = not bundled
    gaugeAwg: "",
    cableAlias: "",
    tested: "",
    cableUse: "",
    ...partial,
  };
}

describe("scheduleToBomInputs", () => {
  it("resolves the catalog cable type and carries the metre length", () => {
    const inputs = scheduleToBomInputs([
      mkRow({ signalType: "Ethernet", signalTypeId: "ethernet", computedLengthM: 30 }),
    ]);
    expect(inputs).toEqual([{ signalType: "Ethernet", cableType: "Cat6 Ethernet", lengthM: 30 }]);
  });

  it("omits lengthM when the row has no computed length", () => {
    const inputs = scheduleToBomInputs([
      mkRow({ signalType: "HDMI", signalTypeId: "hdmi" }),
    ]);
    expect(inputs[0].lengthM).toBeUndefined();
    expect(inputs[0].cableType).toBe("HDMI Passive");
  });

  it("falls back to the row's cable type when the signal has no catalog rule", () => {
    const inputs = scheduleToBomInputs([
      mkRow({ signalType: "Power", signalTypeId: "power", cableType: "IEC C13" }),
    ]);
    expect(inputs[0].cableType).toBe("IEC C13");
  });

  it("produces inputs that buildCableBom aggregates by signal + cable + length", () => {
    const rows = [
      mkRow({ signalType: "Ethernet", signalTypeId: "ethernet", computedLengthM: 30 }),
      mkRow({ signalType: "Ethernet", signalTypeId: "ethernet", computedLengthM: 30 }),
    ];
    const bom = buildCableBom(scheduleToBomInputs(rows));
    expect(bom).toHaveLength(1);
    expect(bom[0].quantity).toBe(2);
    expect(bom[0].totalLengthM).toBe(60);
  });
});

describe("runLengthWarnings", () => {
  it("flags a run that exceeds the cable's practical max", () => {
    const warns = runLengthWarnings([
      mkRow({
        edgeId: "e9",
        sourceDevice: "Camera",
        targetDevice: "Switch",
        signalType: "HDMI",
        signalTypeId: "hdmi",
        computedLengthM: 22,
      }),
    ]);
    expect(warns).toHaveLength(1);
    expect(warns[0]).toMatchObject({
      edgeId: "e9",
      from: "Camera",
      to: "Switch",
      cableType: "HDMI Passive",
      maxRunM: 15,
    });
    expect(warns[0].ratio).toBeGreaterThan(1);
  });

  it("does not flag a run within the cable's max", () => {
    expect(
      runLengthWarnings([
        mkRow({ signalType: "Ethernet", signalTypeId: "ethernet", computedLengthM: 50 }),
      ]),
    ).toEqual([]);
  });

  it("skips rows with no computed length and rows whose signal has no catalog rule", () => {
    expect(runLengthWarnings([mkRow({ signalTypeId: "hdmi" })])).toEqual([]);
    expect(
      runLengthWarnings([mkRow({ signalTypeId: "power", computedLengthM: 999 })]),
    ).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { buildCableBom, bomToCsv } from "../cableBom";

describe("buildCableBom", () => {
  it("groups identical runs and counts quantity + total length", () => {
    const rows = buildCableBom([
      { signalType: "analog-audio", cableType: "xlr-mic-line", lengthM: 10 },
      { signalType: "analog-audio", cableType: "xlr-mic-line", lengthM: 10 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(2);
    expect(rows[0].totalLengthM).toBeCloseTo(20, 6);
  });

  it("keeps distinct signal/type/length as separate rows", () => {
    const rows = buildCableBom([
      { signalType: "analog-audio", cableType: "xlr-mic-line", lengthM: 10 },
      { signalType: "ethernet", cableType: "cat6", lengthM: 10 },
      { signalType: "analog-audio", cableType: "xlr-mic-line", lengthM: 20 },
    ]);
    expect(rows).toHaveLength(3);
  });

  it("groups unknown-length runs together with no total", () => {
    const rows = buildCableBom([
      { signalType: "usb" },
      { signalType: "usb" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(2);
    expect(rows[0].lengthM).toBeUndefined();
    expect(rows[0].totalLengthM).toBeUndefined();
  });

  it("sorts deterministically by signal, then cable type, then length", () => {
    const rows = buildCableBom([
      { signalType: "ethernet", cableType: "cat6", lengthM: 5 },
      { signalType: "analog-audio", cableType: "xlr-mic-line", lengthM: 20 },
      { signalType: "analog-audio", cableType: "xlr-mic-line", lengthM: 5 },
    ]);
    expect(rows.map((r) => `${r.signalType}:${r.lengthM}`)).toEqual([
      "analog-audio:5",
      "analog-audio:20",
      "ethernet:5",
    ]);
  });

  it("returns an empty array for empty input and does not mutate input", () => {
    const input: { signalType: string }[] = [];
    expect(buildCableBom(input)).toEqual([]);
    const src = [{ signalType: "usb" }];
    buildCableBom(src);
    expect(src).toEqual([{ signalType: "usb" }]);
  });
});

describe("bomToCsv", () => {
  it("emits a header and one line per row", () => {
    const csv = bomToCsv([
      { signalType: "analog-audio", cableType: "xlr-mic-line", lengthM: 10, quantity: 2, totalLengthM: 20 },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("Signal,Cable Type,Length (m),Qty,Total (m)");
    expect(lines[1]).toBe("analog-audio,xlr-mic-line,10,2,20");
  });

  it("leaves unknown cable type / length / total cells empty", () => {
    const csv = bomToCsv([{ signalType: "usb", quantity: 3 }]);
    const line = csv.trim().split("\n")[1];
    expect(line).toBe("usb,,,3,");
  });

  it("escapes fields containing commas or quotes (RFC4180)", () => {
    const csv = bomToCsv([
      { signalType: "custom", cableType: 'Belden, 1694A "low-loss"', lengthM: 5, quantity: 1, totalLengthM: 5 },
    ]);
    const line = csv.trim().split("\n")[1];
    expect(line).toContain('"Belden, 1694A ""low-loss"""');
  });

  it("emits header only for no rows", () => {
    expect(bomToCsv([]).trim()).toBe("Signal,Cable Type,Length (m),Qty,Total (m)");
  });
});

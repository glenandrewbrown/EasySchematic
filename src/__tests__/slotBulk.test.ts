import { describe, it, expect } from "vitest";
import { buildBulkSlots, buildBulkPorts } from "../slotBulk";

describe("buildBulkSlots (#194)", () => {
  it("builds count slots numbered from start, sharing one family", () => {
    const slots = buildBulkSlots("Slot", 1, 4, "yamaha-my");
    expect(slots).toEqual([
      { label: "Slot 1", slotFamily: "yamaha-my" },
      { label: "Slot 2", slotFamily: "yamaha-my" },
      { label: "Slot 3", slotFamily: "yamaha-my" },
      { label: "Slot 4", slotFamily: "yamaha-my" },
    ]);
  });

  it("honors a non-1 start (appending to an existing frame)", () => {
    const slots = buildBulkSlots("Slot", 9, 2, "");
    expect(slots.map((s) => s.label)).toEqual(["Slot 9", "Slot 10"]);
    expect(slots.every((s) => s.slotFamily === "")).toBe(true);
  });

  it("respects a custom prefix", () => {
    expect(buildBulkSlots("VFC", 1, 2, "disguise-vfc").map((s) => s.label)).toEqual([
      "VFC 1",
      "VFC 2",
    ]);
  });

  it("returns an empty array for a non-positive count", () => {
    expect(buildBulkSlots("Slot", 1, 0, "")).toEqual([]);
    expect(buildBulkSlots("Slot", 1, -3, "")).toEqual([]);
  });
});

describe("buildBulkPorts (R2-2)", () => {
  it("builds count ports numbered from start, sharing signal + connector + section", () => {
    const ports = buildBulkPorts("Input", 1, 3, "analog-audio", "xlr-3", "Cameras");
    expect(ports).toEqual([
      { label: "Input 1", signalType: "analog-audio", connectorType: "xlr-3", section: "Cameras" },
      { label: "Input 2", signalType: "analog-audio", connectorType: "xlr-3", section: "Cameras" },
      { label: "Input 3", signalType: "analog-audio", connectorType: "xlr-3", section: "Cameras" },
    ]);
  });

  it("omits section entirely when blank or whitespace (keeps it optional)", () => {
    expect(buildBulkPorts("Out", 1, 1, "sdi", "bnc")[0]).toEqual({
      label: "Out 1",
      signalType: "sdi",
      connectorType: "bnc",
    });
    expect(buildBulkPorts("Out", 1, 1, "sdi", "bnc", "   ")[0]).not.toHaveProperty("section");
  });

  it("trims a provided section and honors a non-1 start", () => {
    const ports = buildBulkPorts("Ch", 9, 2, "dante", "rj45", "  Stage  ");
    expect(ports.map((p) => p.label)).toEqual(["Ch 9", "Ch 10"]);
    expect(ports.every((p) => p.section === "Stage")).toBe(true);
  });

  it("returns an empty array for a non-positive count", () => {
    expect(buildBulkPorts("Input", 1, 0, "sdi", "bnc")).toEqual([]);
    expect(buildBulkPorts("Input", 1, -2, "sdi", "bnc")).toEqual([]);
  });
});

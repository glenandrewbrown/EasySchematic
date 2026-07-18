import { describe, it, expect } from "vitest";
import {
  channelOccupancy,
  connectorChannelCount,
  isConnectorLockedByShare,
  listDeviceBuses,
  wiredConnectorIds,
} from "../deviceChannels";
import type { ConnectionEdge, DeviceConnector, DeviceData } from "../types";

/** A Trinnov-style analog input exposed on BOTH an 8-ch DB25 and eight XLRs.
 *  Wiring the DB25 must occupy all eight XLR alternates, and vice-versa. */
function analogInDevice(): DeviceData {
  const channels = Array.from({ length: 8 }, (_, i) => ({
    id: `ain${i + 1}`,
    label: `Analog In ${i + 1}`,
    signalType: "analog-audio" as const,
    direction: "in" as const,
  }));
  const connectors: DeviceConnector[] = [
    { id: "db25-in", label: "Analog In DB25", type: "db25", role: "physical", carries: channels.map((c) => c.id) },
    ...channels.map((c, i) => ({
      id: `xlr-in-${i + 1}`,
      label: `Analog In XLR ${i + 1}`,
      type: "xlr-3" as const,
      role: "physical" as const,
      carries: [c.id],
    })),
    // A virtual stereo mix bus (2 channels).
    { id: "mix-bus", label: "Mix Bus", type: "none", role: "bus", carries: ["ain1", "ain2"] },
  ];
  return { label: "Trinnov", deviceType: "audio-processor", ports: [], channels, connectors };
}

/** One wired-into edge on a connector of `deviceId`. */
function edgeInto(deviceId: string, connectorId: string): ConnectionEdge {
  return {
    id: `e-${connectorId}`,
    source: "upstream",
    target: deviceId,
    data: { signalType: "analog-audio", targetConnectorId: connectorId },
  };
}

describe("connectorChannelCount", () => {
  it("returns carries.length", () => {
    const device = analogInDevice();
    const db25 = device.connectors!.find((c) => c.id === "db25-in")!;
    const xlr = device.connectors!.find((c) => c.id === "xlr-in-1")!;
    expect(connectorChannelCount(db25)).toBe(8);
    expect(connectorChannelCount(xlr)).toBe(1);
  });
});

describe("wiredConnectorIds", () => {
  it("collects this device's connectorIds from either end and ignores foreign ids", () => {
    const device = analogInDevice();
    const edges: ConnectionEdge[] = [
      edgeInto("dev1", "xlr-in-3"),
      // Source-end connector on this device.
      { id: "e-out", source: "dev1", target: "other", data: { signalType: "analog-audio", sourceConnectorId: "db25-in" } },
      // Foreign connectorId — not on this device, must be ignored.
      { id: "e-x", source: "x", target: "dev1", data: { signalType: "analog-audio", targetConnectorId: "not-mine" } },
    ];
    const wired = wiredConnectorIds(device, edges);
    expect([...wired].sort()).toEqual(["db25-in", "xlr-in-3"]);
  });

  it("returns empty when the device has no connectors", () => {
    const device: DeviceData = { label: "x", deviceType: "y", ports: [] };
    expect(wiredConnectorIds(device, [edgeInto("d", "anything")]).size).toBe(0);
  });
});

describe("channelOccupancy — mutex derivation", () => {
  it("is empty with no connections", () => {
    expect(channelOccupancy(analogInDevice(), []).size).toBe(0);
  });

  it("wiring the DB25 occupies all eight channels (its XLR alternates)", () => {
    const device = analogInDevice();
    const occ = channelOccupancy(device, [edgeInto("dev1", "db25-in")]);
    expect(occ.size).toBe(8);
    for (let i = 1; i <= 8; i++) expect(occ.has(`ain${i}`)).toBe(true);
  });

  it("wiring one XLR occupies only that channel (which also marks its DB25 pin)", () => {
    const device = analogInDevice();
    const occ = channelOccupancy(device, [edgeInto("dev1", "xlr-in-3")]);
    expect([...occ]).toEqual(["ain3"]);
  });

  it("wiring a bus occupies the channels it carries", () => {
    const device = analogInDevice();
    const occ = channelOccupancy(device, [edgeInto("dev1", "mix-bus")]);
    expect([...occ].sort()).toEqual(["ain1", "ain2"]);
  });
});

describe("isConnectorLockedByShare — the mutex from the connector's view", () => {
  it("is false for every connector when nothing is wired", () => {
    const device = analogInDevice();
    expect(isConnectorLockedByShare(device, "db25-in", [])).toBe(false);
    expect(isConnectorLockedByShare(device, "xlr-in-1", [])).toBe(false);
  });

  it("locks the DB25 once any sibling XLR is patched (shared channel)", () => {
    const device = analogInDevice();
    const edges = [edgeInto("dev1", "xlr-in-5")];
    expect(isConnectorLockedByShare(device, "db25-in", edges)).toBe(true);
  });

  it("locks an XLR once the DB25 (which carries its channel) is patched", () => {
    const device = analogInDevice();
    const edges = [edgeInto("dev1", "db25-in")];
    expect(isConnectorLockedByShare(device, "xlr-in-2", edges)).toBe(true);
  });

  it("does NOT lock an XLR whose channel is not shared with the wired connector", () => {
    const device = analogInDevice();
    // xlr-in-4 carries ain4; wiring xlr-in-1 (ain1) shares nothing with it.
    const edges = [edgeInto("dev1", "xlr-in-1")];
    expect(isConnectorLockedByShare(device, "xlr-in-4", edges)).toBe(false);
  });

  it("a connector is never locked by its own connection", () => {
    const device = analogInDevice();
    const edges = [edgeInto("dev1", "xlr-in-1")];
    expect(isConnectorLockedByShare(device, "xlr-in-1", edges)).toBe(false);
  });

  it("returns false for an unknown connectorId", () => {
    expect(isConnectorLockedByShare(analogInDevice(), "nope", [])).toBe(false);
  });
});

describe("listDeviceBuses", () => {
  it("returns only role:'bus' connectors", () => {
    const buses = listDeviceBuses(analogInDevice());
    expect(buses.map((b) => b.id)).toEqual(["mix-bus"]);
  });

  it("returns empty for a device with no connectors", () => {
    expect(listDeviceBuses({ label: "x", deviceType: "y", ports: [] })).toEqual([]);
  });
});

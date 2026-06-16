import { describe, it, expect } from "vitest";
import { describeDevicePorts } from "../portConnections";
import type { DeviceNode, ConnectionEdge, Port, PortDirection, SignalType, DeviceData } from "../types";

const port = (id: string, signalType: SignalType, direction: PortDirection): Port => ({
  id,
  label: id.toUpperCase(),
  signalType,
  direction,
});

const dev = (id: string, ports: Port[], data: Partial<DeviceData> = {}): DeviceNode => ({
  id,
  type: "device",
  position: { x: 0, y: 0 },
  data: { label: id, deviceType: "generic", ...data, ports },
});

const edge = (id: string, source: string, target: string, sourceHandle: string, targetHandle: string): ConnectionEdge => ({
  id,
  source,
  target,
  sourceHandle,
  targetHandle,
  data: { signalType: "hdmi" },
});

describe("describeDevicePorts", () => {
  it("returns one entry per port, marking connected vs not", () => {
    const a = dev("A", [port("o", "hdmi", "output"), port("spare", "hdmi", "output")], { label: "Player" });
    const b = dev("B", [port("i", "hdmi", "input")], { label: "Display" });
    const infos = describeDevicePorts("A", [a, b], [edge("e1", "A", "B", "o", "i")]);
    expect(infos).toHaveLength(2);
    const o = infos.find((p) => p.port.id === "o")!;
    expect(o.connected).toBe(true);
    expect(o.edgeId).toBe("e1");
    expect(o.otherDeviceLabel).toBe("Display");
    expect(o.otherPortLabel).toBe("I");
    expect(infos.find((p) => p.port.id === "spare")!.connected).toBe(false);
  });

  it("resolves the other end when this device is the connection target", () => {
    const a = dev("A", [port("o", "hdmi", "output")], { label: "Player" });
    const b = dev("B", [port("i", "hdmi", "input")], { label: "Display" });
    const infos = describeDevicePorts("B", [a, b], [edge("e1", "A", "B", "o", "i")]);
    expect(infos[0].connected).toBe(true);
    expect(infos[0].otherDeviceLabel).toBe("Player");
    expect(infos[0].otherPortLabel).toBe("O");
  });

  it("matches handles that carry an -in/-out suffix", () => {
    const a = dev("A", [port("o", "hdmi", "output")], { label: "Player" });
    const b = dev("B", [port("i", "hdmi", "input")], { label: "Display" });
    const infos = describeDevicePorts("A", [a, b], [edge("e1", "A", "B", "o-out", "i-in")]);
    expect(infos[0].connected).toBe(true);
    expect(infos[0].otherPortLabel).toBe("I");
  });

  it("returns [] when the device is not found", () => {
    expect(describeDevicePorts("ghost", [dev("A", [port("o", "hdmi", "output")])], [])).toEqual([]);
  });
});

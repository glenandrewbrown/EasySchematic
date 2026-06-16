import { describe, it, expect } from "vitest";
import {
  validateSchematic,
  findIncompatibleConnections,
  findMissingPower,
  findUnassignedSpeakers,
  findDuplicateIps,
  countIssues,
} from "../validation";
import type {
  DeviceNode,
  RoomNode,
  ConnectionEdge,
  Port,
  PortDirection,
  SignalType,
  DeviceData,
  ConnectionData,
} from "../types";

// ── builders ────────────────────────────────────────────────────────
const port = (
  id: string,
  signalType: SignalType,
  direction: PortDirection,
  extra: Partial<Port> = {},
): Port => ({ id, label: id, signalType, direction, ...extra });

const dev = (
  id: string,
  ports: Port[],
  data: Partial<DeviceData> = {},
  parentId?: string,
): DeviceNode => ({
  id,
  type: "device",
  position: { x: 0, y: 0 },
  parentId,
  data: { label: id, deviceType: "generic", ...data, ports },
});

const room = (id: string): RoomNode => ({
  id,
  type: "room",
  position: { x: 0, y: 0 },
  data: { label: "Room" },
});

const edge = (
  id: string,
  source: string,
  target: string,
  sourceHandle: string,
  targetHandle: string,
  data: Partial<ConnectionData> = {},
): ConnectionEdge => ({
  id,
  source,
  target,
  sourceHandle,
  targetHandle,
  data: { signalType: "custom", ...data },
});

// ── port compatibility ──────────────────────────────────────────────
describe("findIncompatibleConnections", () => {
  it("flags a signal-type mismatch across a connection", () => {
    const a = dev("A", [port("pa", "hdmi", "output")]);
    const b = dev("B", [port("pb", "sdi", "input")]);
    const issues = findIncompatibleConnections([a, b], [edge("e1", "A", "B", "pa", "pb")]);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("port-incompatible");
    expect(issues[0].severity).toBe("error");
    expect(issues[0].edgeId).toBe("e1");
    expect(issues[0].nodeIds).toEqual(expect.arrayContaining(["A", "B"]));
  });

  it("passes when both ports carry the same signal", () => {
    const a = dev("A", [port("pa", "hdmi", "output")]);
    const b = dev("B", [port("pb", "hdmi", "input")]);
    expect(findIncompatibleConnections([a, b], [edge("e1", "A", "B", "pa", "pb")])).toHaveLength(0);
  });

  it("respects the allowIncompatible override on the connection", () => {
    const a = dev("A", [port("pa", "hdmi", "output")]);
    const b = dev("B", [port("pb", "sdi", "input")]);
    const e = edge("e1", "A", "B", "pa", "pb", { allowIncompatible: true });
    expect(findIncompatibleConnections([a, b], [e])).toHaveLength(0);
  });

  it("ignores passthrough ports that inherit their signal", () => {
    const a = dev("A", [port("pa", "hdmi", "output")]);
    const b = dev("B", [port("pb", "custom", "input", { inheritsSignal: true })]);
    expect(findIncompatibleConnections([a, b], [edge("e1", "A", "B", "pa", "pb")])).toHaveLength(0);
  });

  it("treats power phases/neutral as one compatible family", () => {
    const a = dev("A", [port("pa", "power-l1", "output")]);
    const b = dev("B", [port("pb", "power", "input")]);
    expect(findIncompatibleConnections([a, b], [edge("e1", "A", "B", "pa", "pb")])).toHaveLength(0);
  });

  it("resolves ports when handles carry an -in/-out suffix", () => {
    const a = dev("A", [port("pa", "hdmi", "output")]);
    const b = dev("B", [port("pb", "sdi", "input")]);
    const issues = findIncompatibleConnections([a, b], [edge("e1", "A", "B", "pa-out", "pb-in")]);
    expect(issues).toHaveLength(1);
  });
});

// ── missing power ───────────────────────────────────────────────────
describe("findMissingPower", () => {
  it("flags a device whose power inlet is unconnected", () => {
    const d = dev("AMP", [port("pwr", "power", "input", { connectorType: "iec" })]);
    const issues = findMissingPower([d], []);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("missing-power");
    expect(issues[0].nodeIds).toEqual(["AMP"]);
  });

  it("passes when the power inlet has an incoming connection", () => {
    const distro = dev("DISTRO", [port("out", "power", "output")]);
    const amp = dev("AMP", [port("pwr", "power", "input")]);
    const e = edge("e1", "DISTRO", "AMP", "out", "pwr", { signalType: "power" });
    expect(findMissingPower([distro, amp], [e])).toHaveLength(0);
  });

  it("ignores devices that expose no power inlet", () => {
    const d = dev("SW", [port("p1", "hdmi", "input")]);
    expect(findMissingPower([d], [])).toHaveLength(0);
  });
});

// ── unassigned room (loudspeakers) ──────────────────────────────────
describe("findUnassignedSpeakers", () => {
  it("flags a loudspeaker not placed in a room", () => {
    const spk = dev("SPK", [port("in", "speaker-level", "input")], { deviceType: "Speaker" });
    const issues = findUnassignedSpeakers([spk]);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("unassigned-room");
  });

  it("passes a loudspeaker placed inside a room", () => {
    const r = room("R1");
    const spk = dev("SPK", [port("in", "speaker-level", "input")], { deviceType: "Speaker" }, "R1");
    expect(findUnassignedSpeakers([r, spk])).toHaveLength(0);
  });

  it("ignores non-speaker devices without a room", () => {
    const d = dev("MIX", [port("p1", "analog-audio", "input")], { deviceType: "mixer" });
    expect(findUnassignedSpeakers([d])).toHaveLength(0);
  });
});

// ── duplicate IP ────────────────────────────────────────────────────
describe("findDuplicateIps", () => {
  it("flags the same IP assigned to two devices", () => {
    const a = dev("A", [port("p1", "ethernet", "bidirectional", { networkConfig: { ip: "192.168.1.10" } })]);
    const b = dev("B", [port("p1", "ethernet", "bidirectional", { networkConfig: { ip: "192.168.1.10" } })]);
    const issues = findDuplicateIps([a, b]);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("duplicate-ip");
    expect(issues[0].nodeIds).toEqual(expect.arrayContaining(["A", "B"]));
  });

  it("passes when IPs are distinct", () => {
    const a = dev("A", [port("p1", "ethernet", "bidirectional", { networkConfig: { ip: "192.168.1.10" } })]);
    const b = dev("B", [port("p1", "ethernet", "bidirectional", { networkConfig: { ip: "192.168.1.11" } })]);
    expect(findDuplicateIps([a, b])).toHaveLength(0);
  });

  it("ignores ports with no IP set", () => {
    const a = dev("A", [port("p1", "ethernet", "bidirectional")]);
    const b = dev("B", [port("p1", "ethernet", "bidirectional")]);
    expect(findDuplicateIps([a, b])).toHaveLength(0);
  });
});

// ── aggregate + counts ──────────────────────────────────────────────
describe("validateSchematic", () => {
  it("returns an empty list for an empty scene", () => {
    expect(validateSchematic([], [])).toEqual([]);
  });

  it("aggregates every issue kind present in a scene", () => {
    const src = dev("SRC", [port("o", "hdmi", "output")]);
    const sink = dev("SINK", [port("i", "sdi", "input")]); // mismatch
    const amp = dev("AMP", [port("pwr", "power", "input")]); // unconnected power
    const spk = dev("SPK", [port("s", "speaker-level", "input")], { deviceType: "Speaker" }); // no room
    const n1 = dev("N1", [port("e", "ethernet", "bidirectional", { networkConfig: { ip: "10.0.0.1" } })]);
    const n2 = dev("N2", [port("e", "ethernet", "bidirectional", { networkConfig: { ip: "10.0.0.1" } })]); // dup ip
    const issues = validateSchematic([src, sink, amp, spk, n1, n2], [edge("e1", "SRC", "SINK", "o", "i")]);
    const kinds = new Set(issues.map((i) => i.kind));
    expect(kinds).toEqual(new Set(["port-incompatible", "missing-power", "unassigned-room", "duplicate-ip"]));
  });

  it("counts issues by severity", () => {
    const src = dev("SRC", [port("o", "hdmi", "output")]);
    const sink = dev("SINK", [port("i", "sdi", "input")]);
    const amp = dev("AMP", [port("pwr", "power", "input")]);
    const issues = validateSchematic([src, sink, amp], [edge("e1", "SRC", "SINK", "o", "i")]);
    const counts = countIssues(issues);
    expect(counts.errors).toBe(1); // port mismatch
    expect(counts.warnings).toBe(1); // missing power
    expect(counts.total).toBe(2);
  });
});

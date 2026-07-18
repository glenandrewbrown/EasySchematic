/**
 * Pure signal-flow / path-explain trace builder (R2-5, brief §C9).
 *
 * Answers "where does my signal actually go?" by walking the Connection graph
 * from a trigger cable (or patch point) forward to every sink, resolving
 * patchbay normalling on the way so the trace shows breaks and passive splits.
 *
 * Self-contained + pure: no store, no React, no side effects. The overlay
 * component (SignalFlowOverlay.tsx) turns a SignalFlowTrace into pills/forks.
 *
 * Normalling awareness rides entirely on resolvePatchPoint(mode, plugState)
 * from patchbayNormalling.ts — plugState is DERIVED from whether a point's
 * front-A / front-B jack connectors carry any Connection. Internal routes
 * (Connection data.internal === true) and legacy passthrough Port.normalledTo
 * are followed too, so a signal routed inside a device continues the path.
 */

import type {
  ConnectionEdge,
  DeviceConnector,
  DeviceData,
  Port,
  SchematicNode,
  SignalType,
} from "./types";
import {
  resolvePatchPoint,
  type NormallingMode,
  type PatchResolution,
  type PlugState,
  type Terminal,
} from "./patchbayNormalling";

/** Coral break where a normal is severed; amber passive-split where one source drives many loads. */
export type TraceMarker = "break" | "passive-split";

/** The advisory surfaced beside a passive-split marker (spec §11). */
export const PASSIVE_SPLIT_ADVISORY =
  "passive mult — level/impedance interaction (worst-case ~-6 dB)";

/** One resolved terminal on the path: a Device + the Port/Channel the signal sits on. */
export interface TraceRef {
  deviceId: string;
  deviceLabel: string;
  /** Connector id or Port id (device-local). Rendered mono. */
  terminalId: string;
  terminalLabel: string;
  signalType: SignalType;
}

/** One hop in the trace tree. children.length > 1 renders as a fork (tap / fan-out). */
export interface TraceHop {
  id: string;
  ref: TraceRef;
  kind: "source" | "through" | "patch" | "sink";
  marker?: TraceMarker;
  advisory?: string;
  /** Present when kind === "patch": the normalling context for this point. */
  patch?: { mode: NormallingMode; normalBroken: boolean };
  children: TraceHop[];
}

export interface SignalFlowTrace {
  root: TraceHop;
  hopCount: number;
  sinkCount: number;
  hasBreak: boolean;
  hasPassiveSplit: boolean;
  signalType: SignalType;
}

export type SignalFlowTrigger =
  | { kind: "connection"; edgeId: string }
  | { kind: "patchPoint"; deviceId: string; patchPointId: string };

const MAX_DEPTH = 64;

// ── device / terminal lookup ────────────────────────────────────────────────

interface DeviceEntry {
  id: string;
  data: DeviceData;
}

function indexDevices(nodes: readonly SchematicNode[]): Map<string, DeviceEntry> {
  const map = new Map<string, DeviceEntry>();
  for (const node of nodes) {
    if (node.type === "device") map.set(node.id, { id: node.id, data: node.data });
  }
  return map;
}

function connectorOf(device: DeviceData, id: string): DeviceConnector | undefined {
  return (device.connectors ?? []).find((c) => c.id === id);
}

function portOf(device: DeviceData, id: string): Port | undefined {
  return (device.ports ?? []).find((p) => p.id === id);
}

function channelSignal(device: DeviceData, connector: DeviceConnector): SignalType | undefined {
  const chId = connector.carries[0];
  if (!chId) return undefined;
  return (device.channels ?? []).find((c) => c.id === chId)?.signalType;
}

function terminalRef(device: DeviceEntry, terminalId: string, fallback: SignalType): TraceRef {
  const connector = connectorOf(device.data, terminalId);
  if (connector) {
    return {
      deviceId: device.id,
      deviceLabel: device.data.label,
      terminalId,
      terminalLabel: connector.label,
      signalType: channelSignal(device.data, connector) ?? fallback,
    };
  }
  const port = portOf(device.data, terminalId);
  return {
    deviceId: device.id,
    deviceLabel: device.data.label,
    terminalId,
    terminalLabel: port?.label ?? terminalId,
    signalType: port?.signalType ?? fallback,
  };
}

// ── external adjacency (canvas cables, undirected for continuation) ──────────

interface ExternalLink {
  edgeId: string;
  otherDeviceId: string;
  otherTerminalId: string;
  signalType: SignalType;
}

/** The connector id an endpoint plugs into (R2-3 model) or its handle (port id) as a fallback. */
function endpointTerminal(edge: ConnectionEdge, end: "source" | "target"): string | undefined {
  const data = edge.data;
  const connectorId = end === "source" ? data?.sourceConnectorId : data?.targetConnectorId;
  if (connectorId) return connectorId;
  const handle = end === "source" ? edge.sourceHandle : edge.targetHandle;
  return handle ?? undefined;
}

function terminalKey(deviceId: string, terminalId: string): string {
  return `${deviceId}::${terminalId}`;
}

interface Graph {
  devices: Map<string, DeviceEntry>;
  /** terminalKey → external cables touching it (both directions). */
  external: Map<string, ExternalLink[]>;
  /** deviceId → set of connector ids that carry at least one external cable. */
  wiredConnectors: Map<string, Set<string>>;
  /** deviceId → internal-route Connections (data.internal === true) on that device. */
  internalByDevice: Map<string, ConnectionEdge[]>;
}

function buildGraph(nodes: readonly SchematicNode[], edges: readonly ConnectionEdge[]): Graph {
  const devices = indexDevices(nodes);
  const external = new Map<string, ExternalLink[]>();
  const wiredConnectors = new Map<string, Set<string>>();
  const internalByDevice = new Map<string, ConnectionEdge[]>();

  const markWired = (deviceId: string, terminalId: string | undefined) => {
    if (!terminalId) return;
    const set = wiredConnectors.get(deviceId) ?? new Set<string>();
    set.add(terminalId);
    wiredConnectors.set(deviceId, set);
  };

  for (const edge of edges) {
    const srcTerm = endpointTerminal(edge, "source");
    const tgtTerm = endpointTerminal(edge, "target");
    markWired(edge.source, srcTerm);
    markWired(edge.target, tgtTerm);

    if (edge.data?.internal === true && edge.source === edge.target) {
      const list = internalByDevice.get(edge.source) ?? [];
      list.push(edge);
      internalByDevice.set(edge.source, list);
      continue;
    }
    if (!srcTerm || !tgtTerm || edge.source === edge.target) continue;
    const signalType = edge.data?.signalType ?? "custom";
    const a: ExternalLink = { edgeId: edge.id, otherDeviceId: edge.target, otherTerminalId: tgtTerm, signalType };
    const b: ExternalLink = { edgeId: edge.id, otherDeviceId: edge.source, otherTerminalId: srcTerm, signalType };
    const srcKey = terminalKey(edge.source, srcTerm);
    const tgtKey = terminalKey(edge.target, tgtTerm);
    external.set(srcKey, [...(external.get(srcKey) ?? []), a]);
    external.set(tgtKey, [...(external.get(tgtKey) ?? []), b]);
  }

  return { devices, external, wiredConnectors, internalByDevice };
}

// ── patchbay net resolution (the normalling core) ───────────────────────────

interface PointNets {
  mode: NormallingMode;
  resolution: PatchResolution;
  /** jackRole → connector id, for this point. */
  terminalByRole: Partial<Record<Terminal, string>>;
}

function resolvePoint(device: DeviceData, pointId: string, wired: Set<string>): PointNets | undefined {
  const point = device.patchbay?.points.find((p) => p.id === pointId);
  if (!point) return undefined;
  const terminalByRole: Partial<Record<Terminal, string>> = {};
  for (const connector of device.connectors ?? []) {
    if (connector.patchPointId === pointId && connector.jackRole) {
      terminalByRole[connector.jackRole] = connector.id;
    }
  }
  const frontA = terminalByRole.frontA;
  const frontB = terminalByRole.frontB;
  const plug: PlugState = {
    frontAPatched: frontA ? wired.has(frontA) : false,
    frontBPatched: frontB ? wired.has(frontB) : false,
  };
  return { mode: point.mode, resolution: resolvePatchPoint(point.mode, plug), terminalByRole };
}

interface PatchbayExits {
  exits: string[];
  marker?: TraceMarker;
  advisory?: string;
  normalBroken: boolean;
  mode: NormallingMode;
}

/** The other connector ids electrically commoned with `terminalId` inside a patchbay device. */
function patchbayExits(
  device: DeviceData,
  terminalId: string,
  wired: Set<string>,
): PatchbayExits | undefined {
  const connector = connectorOf(device, terminalId);
  if (!connector?.patchPointId || !connector.jackRole) return undefined;
  const nets = resolvePoint(device, connector.patchPointId, wired);
  if (!nets) return undefined;
  const role = connector.jackRole;
  const myNet = nets.resolution.nets.find((n) => n.terminals.includes(role));
  const exits: string[] = [];
  if (myNet) {
    for (const t of myNet.terminals) {
      if (t === role) continue;
      const id = nets.terminalByRole[t];
      if (id) exits.push(id);
    }
  }
  const result: PatchbayExits = { exits, normalBroken: nets.resolution.normalBroken, mode: nets.mode };
  if (exits.length === 0 && nets.resolution.normalBroken) {
    result.marker = "break";
  } else if (myNet?.passiveSplit ?? false) {
    result.marker = "passive-split";
    result.advisory = PASSIVE_SPLIT_ADVISORY;
  }
  return result;
}

// ── internal exits (patchbay ∪ internal-route Connections ∪ normalledTo) ─────

interface InternalExit {
  terminalId: string;
}

function internalExits(
  graph: Graph,
  device: DeviceEntry,
  terminalId: string,
): { exits: InternalExit[]; isPatch: boolean; marker?: TraceMarker; advisory?: string; mode?: NormallingMode; normalBroken?: boolean } {
  const wired = graph.wiredConnectors.get(device.id) ?? new Set<string>();

  // 1. Patchbay normalling.
  const pb = patchbayExits(device.data, terminalId, wired);
  if (pb) {
    return {
      exits: pb.exits.map((id) => ({ terminalId: id })),
      isPatch: true,
      marker: pb.marker,
      advisory: pb.advisory,
      mode: pb.mode,
      normalBroken: pb.normalBroken,
    };
  }

  // 2. Internal-route Connections (Trinnov-style matrix).
  const internals = graph.internalByDevice.get(device.id) ?? [];
  const routeExits: InternalExit[] = [];
  for (const edge of internals) {
    const src = endpointTerminal(edge, "source");
    const tgt = endpointTerminal(edge, "target");
    if (src === terminalId && tgt) routeExits.push({ terminalId: tgt });
    else if (tgt === terminalId && src) routeExits.push({ terminalId: src });
  }
  if (routeExits.length > 0) return { exits: routeExits, isPatch: false };

  // 3. Legacy passthrough Port.normalledTo.
  const port = portOf(device.data, terminalId);
  if (port?.normalledTo) return { exits: [{ terminalId: port.normalledTo }], isPatch: false };

  return { exits: [], isPatch: false };
}

// ── forward walk ─────────────────────────────────────────────────────────────

let hopSeq = 0;
function nextId(): string {
  hopSeq += 1;
  return `hop-${hopSeq}`;
}

function walk(
  graph: Graph,
  deviceId: string,
  terminalId: string,
  fallbackSignal: SignalType,
  visited: Set<string>,
  depth: number,
): TraceHop {
  const device = graph.devices.get(deviceId);
  const ref = device
    ? terminalRef(device, terminalId, fallbackSignal)
    : { deviceId, deviceLabel: deviceId, terminalId, terminalLabel: terminalId, signalType: fallbackSignal };

  const key = terminalKey(deviceId, terminalId);
  visited.add(key);

  if (!device || depth >= MAX_DEPTH) {
    return { id: nextId(), ref, kind: "sink", children: [] };
  }

  const internal = internalExits(graph, device, terminalId);
  const children: TraceHop[] = [];

  for (const exit of internal.exits) {
    const exitKey = terminalKey(deviceId, exit.terminalId);
    const links = graph.external.get(exitKey) ?? [];
    let advanced = false;
    for (const link of links) {
      const nextKey = terminalKey(link.otherDeviceId, link.otherTerminalId);
      if (visited.has(nextKey)) continue;
      children.push(walk(graph, link.otherDeviceId, link.otherTerminalId, link.signalType, visited, depth + 1));
      advanced = true;
    }
    // Exit terminal that leaves the device but is not wired onward: an open tie-line.
    // `device` is non-null here (guarded above) and unchanged, so reuse it directly.
    if (!advanced) {
      const exitRef = terminalRef(device, exit.terminalId, ref.signalType);
      children.push({ id: nextId(), ref: exitRef, kind: "sink", children: [] });
    }
  }

  const kind: TraceHop["kind"] = internal.isPatch ? "patch" : children.length > 0 ? "through" : "sink";
  const hop: TraceHop = { id: nextId(), ref, kind, children };
  if (internal.marker) hop.marker = internal.marker;
  if (internal.advisory) hop.advisory = internal.advisory;
  if (internal.isPatch && internal.mode) {
    hop.patch = { mode: internal.mode, normalBroken: internal.normalBroken ?? false };
  }
  return hop;
}

// ── summary + public builder ─────────────────────────────────────────────────

function summarize(root: TraceHop): { hopCount: number; sinkCount: number; hasBreak: boolean; hasPassiveSplit: boolean } {
  let hopCount = 0;
  let sinkCount = 0;
  let hasBreak = false;
  let hasPassiveSplit = false;
  const stack: TraceHop[] = [root];
  while (stack.length > 0) {
    const hop = stack.pop() as TraceHop;
    hopCount += 1;
    if (hop.children.length === 0) sinkCount += 1;
    if (hop.marker === "break") hasBreak = true;
    if (hop.marker === "passive-split") hasPassiveSplit = true;
    for (const child of hop.children) stack.push(child);
  }
  return { hopCount, sinkCount, hasBreak, hasPassiveSplit };
}

/**
 * Build the signal-flow trace for a trigger. Returns null when the trigger
 * cannot be resolved (e.g. a stale edge id).
 */
export function buildSignalFlowTrace(
  trigger: SignalFlowTrigger,
  nodes: readonly SchematicNode[],
  edges: readonly ConnectionEdge[],
): SignalFlowTrace | null {
  hopSeq = 0;
  const graph = buildGraph(nodes, edges);

  if (trigger.kind === "connection") {
    const edge = edges.find((e) => e.id === trigger.edgeId);
    if (!edge) return null;
    const srcTerm = endpointTerminal(edge, "source");
    const tgtTerm = endpointTerminal(edge, "target");
    if (!srcTerm || !tgtTerm) return null;
    const signalType = edge.data?.signalType ?? "custom";
    const srcDevice = graph.devices.get(edge.source);

    const visited = new Set<string>([terminalKey(edge.source, srcTerm), terminalKey(edge.target, tgtTerm)]);
    const downstream = walk(graph, edge.target, tgtTerm, signalType, visited, 1);

    const sourceRef = srcDevice
      ? terminalRef(srcDevice, srcTerm, signalType)
      : { deviceId: edge.source, deviceLabel: edge.source, terminalId: srcTerm, terminalLabel: srcTerm, signalType };
    const root: TraceHop = { id: nextId(), ref: sourceRef, kind: "source", children: [downstream] };
    const s = summarize(root);
    return { root, ...s, signalType };
  }

  // Patch-point trigger: root at the point's rear-A tie-line feed and walk forward.
  const device = graph.devices.get(trigger.deviceId);
  if (!device) return null;
  const wired = graph.wiredConnectors.get(device.id) ?? new Set<string>();
  const nets = resolvePoint(device.data, trigger.patchPointId, wired);
  const rearA = nets?.terminalByRole.rearA;
  if (!rearA) return null;
  const signalType = terminalRef(device, rearA, "custom").signalType;
  const visited = new Set<string>();
  const root = walk(graph, device.id, rearA, signalType, visited, 0);
  const s = summarize(root);
  return { root, ...s, signalType };
}

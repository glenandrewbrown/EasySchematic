import type {
  SchematicNode,
  DeviceNode,
  ConnectionEdge,
  DeviceData,
  Port,
  SignalType,
} from "./types";
import { SIGNAL_LABELS, CONNECTOR_LABELS } from "./types";
import { isSpeaker } from "./speakerSpec";

/**
 * Pure AV design-rule validation. Turns a (nodes, edges) scene into a flat list of
 * actionable issues that the editor surfaces in the Validate rail tab + a top-bar badge.
 * No React, no store — fully testable. Each rule is also exported individually.
 */

export type IssueSeverity = "error" | "warning";

export type IssueKind =
  | "port-incompatible"
  | "connector-mismatch"
  | "missing-power"
  | "unassigned-room"
  | "duplicate-ip";

export interface ValidationIssue {
  /** Stable id (kind + participants) for dedup + React keys. */
  id: string;
  kind: IssueKind;
  severity: IssueSeverity;
  /** Human-readable, AV-terminology message (Device / Connection / Port). */
  message: string;
  /** Device/room node ids to select / locate on canvas. */
  nodeIds: string[];
  /** Connection (edge) id to highlight, when the issue is about a connection. */
  edgeId?: string;
}

export interface IssueCounts {
  errors: number;
  warnings: number;
  total: number;
}

// ── internal helpers ────────────────────────────────────────────────

function deviceNodes(nodes: readonly SchematicNode[]): DeviceNode[] {
  return nodes.filter((n): n is DeviceNode => n.type === "device");
}

function roomNodeIds(nodes: readonly SchematicNode[]): Set<string> {
  return new Set(nodes.filter((n) => n.type === "room").map((n) => n.id));
}

function deviceMap(nodes: readonly SchematicNode[]): Map<string, DeviceNode> {
  return new Map(deviceNodes(nodes).map((n) => [n.id, n]));
}

function deviceLabel(d: DeviceData): string {
  return d.label || d.shortName || d.model || d.deviceType || "Device";
}

/** React Flow handle ids are usually the bare port id, occasionally with an -in/-out suffix. */
function basePortId(handle: string): string {
  return handle.replace(/-(in|out|source|target)$/i, "");
}

function resolvePort(d: DeviceData, handle: string | null | undefined): Port | undefined {
  if (!handle) return undefined;
  const exact = d.ports.find((p) => p.id === handle);
  if (exact) return exact;
  const base = basePortId(handle);
  return d.ports.find((p) => p.id === base);
}

/** Power phases / neutral / ground all belong to one mains family for compatibility. */
function signalFamily(s: SignalType): string {
  return s.startsWith("power") ? "power" : s;
}

function signalsCompatible(a: SignalType, b: SignalType): boolean {
  return a === b || signalFamily(a) === signalFamily(b);
}

function isPowerInlet(p: Port): boolean {
  return (
    (p.direction === "input" || p.direction === "bidirectional") &&
    p.signalType.startsWith("power")
  );
}

/** Set of "<nodeId>::<portId>" for every port that appears on either end of any edge. */
function connectedPortKeys(edges: readonly ConnectionEdge[]): Set<string> {
  const set = new Set<string>();
  for (const e of edges) {
    if (e.source && e.sourceHandle) set.add(`${e.source}::${basePortId(e.sourceHandle)}`);
    if (e.target && e.targetHandle) set.add(`${e.target}::${basePortId(e.targetHandle)}`);
  }
  return set;
}

// ── individual rules ────────────────────────────────────────────────

/** A connection joins two ports whose signal types are incompatible (and not overridden). */
export function findIncompatibleConnections(
  nodes: readonly SchematicNode[],
  edges: readonly ConnectionEdge[],
): ValidationIssue[] {
  const byId = deviceMap(nodes);
  const issues: ValidationIssue[] = [];
  for (const e of edges) {
    const src = byId.get(e.source);
    const tgt = byId.get(e.target);
    if (!src || !tgt) continue;
    const sp = resolvePort(src.data, e.sourceHandle);
    const tp = resolvePort(tgt.data, e.targetHandle);
    if (!sp || !tp) continue;
    if (sp.inheritsSignal || tp.inheritsSignal) continue;
    if (signalsCompatible(sp.signalType, tp.signalType)) continue;
    // An override acknowledges the mismatch; it does not make it go away. Overridden runs stay
    // listed as warnings marked "override active" so the document still tells the truth about
    // itself — a silently dropped issue is indistinguishable from a correct connection.
    const overridden = e.data?.allowIncompatible === true;
    issues.push({
      id: `port-incompatible:${e.id}`,
      kind: "port-incompatible",
      severity: overridden ? "warning" : "error",
      message: `Connection joins mismatched signals: ${deviceLabel(src.data)} (${SIGNAL_LABELS[sp.signalType]}) → ${deviceLabel(tgt.data)} (${SIGNAL_LABELS[tp.signalType]})${overridden ? " (override active)" : ""}.`,
      nodeIds: [src.id, tgt.id],
      edgeId: e.id,
    });
  }
  return issues;
}

/**
 * Connections the user forced together across incompatible CONNECTORS ("Connect anyway"),
 * i.e. `connectorMismatch` was recorded on the edge. Only explicitly-flagged runs are
 * reported — the connector tables are not re-derived here, so an existing document never
 * sprouts warnings it did not already carry.
 *
 * Signal-level mismatches are reported by {@link findIncompatibleConnections} instead, so a
 * run whose signals also disagree is skipped here rather than reported twice.
 */
export function findConnectorMismatches(
  nodes: readonly SchematicNode[],
  edges: readonly ConnectionEdge[],
): ValidationIssue[] {
  const byId = deviceMap(nodes);
  const issues: ValidationIssue[] = [];
  for (const e of edges) {
    if (!e.data?.connectorMismatch) continue;
    const src = byId.get(e.source);
    const tgt = byId.get(e.target);
    if (!src || !tgt) continue;
    const sp = resolvePort(src.data, e.sourceHandle);
    const tp = resolvePort(tgt.data, e.targetHandle);
    if (!sp || !tp) continue;
    // Already covered as a signal mismatch — don't double-report the same run.
    if (!sp.inheritsSignal && !tp.inheritsSignal && !signalsCompatible(sp.signalType, tp.signalType)) continue;
    const a = sp.connectorType ? CONNECTOR_LABELS[sp.connectorType] : "—";
    const b = tp.connectorType ? CONNECTOR_LABELS[tp.connectorType] : "—";
    issues.push({
      id: `connector-mismatch:${e.id}`,
      kind: "connector-mismatch",
      severity: "warning",
      message: `Connector mismatch — ${a} ↔ ${b}: ${deviceLabel(src.data)} → ${deviceLabel(tgt.data)} (override active).`,
      nodeIds: [src.id, tgt.id],
      edgeId: e.id,
    });
  }
  return issues;
}

/** A device exposes a mains power inlet but none of its inlets are connected. */
export function findMissingPower(
  nodes: readonly SchematicNode[],
  edges: readonly ConnectionEdge[],
): ValidationIssue[] {
  const connected = connectedPortKeys(edges);
  const issues: ValidationIssue[] = [];
  for (const n of deviceNodes(nodes)) {
    const inlets = n.data.ports.filter(isPowerInlet);
    if (inlets.length === 0) continue;
    const powered = inlets.some((p) => connected.has(`${n.id}::${p.id}`));
    if (powered) continue;
    issues.push({
      id: `missing-power:${n.id}`,
      kind: "missing-power",
      severity: "warning",
      message: `${deviceLabel(n.data)} has an unconnected power inlet — no power source.`,
      nodeIds: [n.id],
    });
  }
  return issues;
}

/** A loudspeaker is not placed inside a room, so no coverage can be computed. */
export function findUnassignedSpeakers(nodes: readonly SchematicNode[]): ValidationIssue[] {
  const rooms = roomNodeIds(nodes);
  const issues: ValidationIssue[] = [];
  for (const n of deviceNodes(nodes)) {
    if (!isSpeaker(n.data)) continue;
    if (n.parentId && rooms.has(n.parentId)) continue;
    issues.push({
      id: `unassigned-room:${n.id}`,
      kind: "unassigned-room",
      severity: "warning",
      message: `${deviceLabel(n.data)} is a loudspeaker not placed in a room — no coverage will be computed.`,
      nodeIds: [n.id],
    });
  }
  return issues;
}

/** The same IP address is assigned to ports on two or more distinct devices. */
export function findDuplicateIps(nodes: readonly SchematicNode[]): ValidationIssue[] {
  const byIp = new Map<string, Set<string>>();
  for (const n of deviceNodes(nodes)) {
    for (const p of n.data.ports) {
      const ip = p.networkConfig?.ip?.trim();
      if (!ip) continue;
      const owners = byIp.get(ip) ?? new Set<string>();
      owners.add(n.id);
      byIp.set(ip, owners);
    }
  }
  const issues: ValidationIssue[] = [];
  for (const [ip, owners] of byIp) {
    if (owners.size < 2) continue;
    issues.push({
      id: `duplicate-ip:${ip}`,
      kind: "duplicate-ip",
      severity: "error",
      message: `IP ${ip} is assigned to ${owners.size} devices.`,
      nodeIds: [...owners],
    });
  }
  return issues;
}

// ── aggregate ───────────────────────────────────────────────────────

/** Run every rule over the scene and return a flat, ordered issue list. */
export function validateSchematic(
  nodes: readonly SchematicNode[],
  edges: readonly ConnectionEdge[],
): ValidationIssue[] {
  return [
    ...findIncompatibleConnections(nodes, edges),
    ...findConnectorMismatches(nodes, edges),
    ...findMissingPower(nodes, edges),
    ...findUnassignedSpeakers(nodes),
    ...findDuplicateIps(nodes),
  ];
}

export function countIssues(issues: readonly ValidationIssue[]): IssueCounts {
  let errors = 0;
  let warnings = 0;
  for (const i of issues) {
    if (i.severity === "error") errors += 1;
    else warnings += 1;
  }
  return { errors, warnings, total: issues.length };
}

/** Drop issues the user has dismissed (matched by stable id). Returns a new array. */
export function activeIssues(
  issues: readonly ValidationIssue[],
  dismissedIds: ReadonlySet<string>,
): ValidationIssue[] {
  return issues.filter((i) => !dismissedIds.has(i.id));
}

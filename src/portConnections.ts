import type { SchematicNode, DeviceNode, ConnectionEdge, Port } from "./types";

/**
 * Pure resolver: for one device, describe each of its ports and what (if anything)
 * it connects to. Backs the inspector's real port list ("Port | Signal | Connected to")
 * so the user no longer has to open the full modal just to see wiring.
 */

export interface PortConnectionInfo {
  port: Port;
  connected: boolean;
  /** The connection (edge) id — first one found for a multi-connect port. */
  edgeId?: string;
  /** The device on the other end of the connection. */
  otherDeviceId?: string;
  otherDeviceLabel?: string;
  otherPortLabel?: string;
}

/** React Flow handle ids are usually the bare port id, occasionally with an -in/-out suffix. */
function basePortId(handle: string): string {
  return handle.replace(/-(in|out|source|target)$/i, "");
}

function handleMatchesPort(handle: string | null | undefined, portId: string): boolean {
  if (!handle) return false;
  return handle === portId || basePortId(handle) === portId;
}

function deviceMap(nodes: readonly SchematicNode[]): Map<string, DeviceNode> {
  const m = new Map<string, DeviceNode>();
  for (const n of nodes) if (n.type === "device") m.set(n.id, n as DeviceNode);
  return m;
}

function portLabelFor(dev: DeviceNode | undefined, handle: string | null | undefined): string | undefined {
  if (!dev || !handle) return undefined;
  const base = basePortId(handle);
  return dev.data.ports.find((p) => p.id === handle || p.id === base)?.label;
}

export function describeDevicePorts(
  deviceId: string,
  nodes: readonly SchematicNode[],
  edges: readonly ConnectionEdge[],
): PortConnectionInfo[] {
  const byId = deviceMap(nodes);
  const dev = byId.get(deviceId);
  if (!dev) return [];
  return dev.data.ports.map((port) => {
    for (const e of edges) {
      const onSource = e.source === deviceId && handleMatchesPort(e.sourceHandle, port.id);
      const onTarget = e.target === deviceId && handleMatchesPort(e.targetHandle, port.id);
      if (!onSource && !onTarget) continue;
      const otherId = onSource ? e.target : e.source;
      const otherHandle = onSource ? e.targetHandle : e.sourceHandle;
      const other = byId.get(otherId);
      return {
        port,
        connected: true,
        edgeId: e.id,
        otherDeviceId: otherId,
        otherDeviceLabel: other ? other.data.label || other.data.deviceType : otherId,
        otherPortLabel: portLabelFor(other, otherHandle),
      };
    }
    return { port, connected: false };
  });
}

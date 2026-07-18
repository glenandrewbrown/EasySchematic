/**
 * Pure helpers for the channel ⇄ connector model (R2-3).
 *
 * A device owns logical `channels` and physical `connectors`; each connector
 * `carries` a set of channel ids (many-to-many). Mutex is DERIVED, never stored:
 * a channel is occupied when ANY connector that carries it is wired.
 *
 * Self-contained + pure: no store, no React, no side effects. Consumers are the
 * DeviceEditor channel/connector editor, connect-validation, and Cable BOM.
 *
 * connectorIds are assumed device-local-unique (they are minted per device), so a
 * connection endpoint's connectorId matches at most one connector on the device.
 */

import type { ConnectionEdge, DeviceConnector, DeviceData } from "./types";

/** Number of channels a single connector exposes. */
export function connectorChannelCount(connector: DeviceConnector): number {
  return connector.carries.length;
}

/**
 * The set of this device's connectorIds that a connection plugs into (either end).
 * Only ids present in `device.connectors` are returned, so foreign endpoints are
 * ignored even if `connections` is unfiltered.
 */
export function wiredConnectorIds(
  device: DeviceData,
  connections: readonly ConnectionEdge[],
): Set<string> {
  const own = new Set((device.connectors ?? []).map((c) => c.id));
  const wired = new Set<string>();
  for (const conn of connections) {
    const source = conn.data?.sourceConnectorId;
    const target = conn.data?.targetConnectorId;
    if (source && own.has(source)) wired.add(source);
    if (target && own.has(target)) wired.add(target);
  }
  return wired;
}

/**
 * Which channelIds are occupied. A channel is occupied when any connector that
 * carries it is wired (the mutex derivation): plugging an 8-channel DB25 marks
 * all 8 channels' XLR alternates occupied, and vice-versa.
 */
export function channelOccupancy(
  device: DeviceData,
  connections: readonly ConnectionEdge[],
): Set<string> {
  const connectors = device.connectors ?? [];
  const wired = wiredConnectorIds(device, connections);
  const occupied = new Set<string>();
  for (const connector of connectors) {
    if (!wired.has(connector.id)) continue;
    for (const channelId of connector.carries) occupied.add(channelId);
  }
  return occupied;
}

/**
 * Whether `connectorId` is locked because a SIBLING connector that shares at least
 * one channel with it is already wired — i.e. wiring this connector would double-
 * book an electrical channel. This is the mutex from the connector's point of view
 * (the DB25 is locked once any of its XLR alternates is patched, and vice-versa).
 * A connector is never locked by its own connection.
 */
export function isConnectorLockedByShare(
  device: DeviceData,
  connectorId: string,
  connections: readonly ConnectionEdge[],
): boolean {
  const connectors = device.connectors ?? [];
  const self = connectors.find((c) => c.id === connectorId);
  if (!self) return false;
  const selfChannels = new Set(self.carries);
  if (selfChannels.size === 0) return false;

  const wired = wiredConnectorIds(device, connections);
  for (const sibling of connectors) {
    if (sibling.id === connectorId) continue;
    if (!wired.has(sibling.id)) continue;
    if (sibling.carries.some((ch) => selfChannels.has(ch))) return true;
  }
  return false;
}

/** The device's virtual buses (connectors with role "bus"). */
export function listDeviceBuses(device: DeviceData): DeviceConnector[] {
  return (device.connectors ?? []).filter((c) => c.role === "bus");
}

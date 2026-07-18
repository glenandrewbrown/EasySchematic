import type { SignalType, ConnectorType } from "./types";

/**
 * Build the slot blueprints for a bulk add — `${prefix} ${start}` … `${prefix} ${start + count - 1}`,
 * all sharing one slot family. Pure: the store assigns slot IDs when it inserts them.
 */
export function buildBulkSlots(
  prefix: string,
  start: number,
  count: number,
  slotFamily: string,
): { label: string; slotFamily: string }[] {
  const slots: { label: string; slotFamily: string }[] = [];
  for (let i = 0; i < count; i++) {
    slots.push({ label: `${prefix} ${start + i}`, slotFamily });
  }
  return slots;
}

/** One fully-configured port produced by a bulk add — the shared spec each numbered port carries. */
export interface BulkPortBlueprint {
  label: string;
  signalType: SignalType;
  connectorType: ConnectorType;
  section?: string;
}

/**
 * Build the port blueprints for a bulk add — `${prefix} ${start}` … `${prefix} ${start + count - 1}`,
 * every port sharing one signal type, connector type, and (optional) section group. Pure: the caller
 * stamps draft IDs, direction, and any signal-derived defaults (e.g. multi-connect) when it inserts them.
 */
export function buildBulkPorts(
  prefix: string,
  start: number,
  count: number,
  signalType: SignalType,
  connectorType: ConnectorType,
  section?: string,
): BulkPortBlueprint[] {
  const ports: BulkPortBlueprint[] = [];
  const trimmedSection = section?.trim();
  for (let i = 0; i < count; i++) {
    ports.push({
      label: `${prefix} ${start + i}`,
      signalType,
      connectorType,
      ...(trimmedSection ? { section: trimmedSection } : {}),
    });
  }
  return ports;
}

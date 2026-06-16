/** Pure helpers for the Transport / Logistics feature.
 *
 *  A {@link TransportContainer} stores its packed items as {@link TransportItem}s that
 *  reference live schematic data by id/key (not a snapshot). These helpers re-derive
 *  display data from the current nodes + pack list so orphaned references (a device or
 *  cable run that no longer exists) surface as grayed-out rows rather than stale labels.
 */
import type {
  SchematicNode,
  DeviceData,
  TransportItem,
  TransportContainer,
  TransportPhase,
} from "./types";
import { TRANSPORT_PHASES } from "./types";
import { cableCostKey } from "./packList";
import type { PackListData } from "./packList";
import { downloadCsv } from "./downloadCsv";

/** A {@link TransportItem} joined against live schematic / pack-list data. */
export interface ResolvedContainerItem {
  item: TransportItem;
  /** Primary display label, re-derived from live data (never the stored label). */
  label: string;
  /** Secondary line — device type, or signal/length for a cable. */
  subLabel?: string;
  /** Quantity to show. Re-derived from live data where available. */
  qty: number;
  /** False when the referenced device node / cable row no longer exists (orphan). */
  found: boolean;
}

/** Stable checklist key for an item: `"${kind}:${refId}"`. */
export function itemKey(item: TransportItem): string {
  return `${item.kind}:${item.refId}`;
}

/** Join each packed item against live data, re-deriving label/sub-label/qty.
 *
 *  - `kind: "device"` → match the node whose `id === refId`; use its `data.label`
 *    and `data.deviceType`.
 *  - `kind: "cable"` → match the pack-list summary row whose key
 *    (`cableType|signalType|cableLength`) equals `refId`.
 *
 *  Missing references yield `found: false` (and fall back to the stored qty/label
 *  so the orphan is still identifiable in the UI).
 */
export function resolveContainerItems(
  container: TransportContainer,
  packData: PackListData,
  nodes: SchematicNode[],
): ResolvedContainerItem[] {
  return container.items.map((item) => {
    if (item.kind === "device") {
      const node = nodes.find((n) => n.id === item.refId);
      if (!node || node.type !== "device") {
        return {
          item,
          label: "Missing device",
          subLabel: item.refId,
          qty: item.qty,
          found: false,
        };
      }
      const data = node.data as DeviceData;
      return {
        item,
        label: data.label,
        subLabel: data.deviceType,
        qty: item.qty,
        found: true,
      };
    }

    // kind === "cable" — match a pack-list summary row by the shared key strategy.
    const row = packData.summary.find(
      (r) => cableCostKey(r.cableType, r.signalType, r.cableLength) === item.refId,
    );
    if (!row) {
      return {
        item,
        label: "Missing cable",
        subLabel: item.refId,
        qty: item.qty,
        found: false,
      };
    }
    const lengthSuffix = row.cableLength ? ` · ${row.cableLength}` : "";
    return {
      item,
      label: row.cableType,
      subLabel: `${row.signalType}${lengthSuffix}`,
      qty: row.count,
      found: true,
    };
  });
}

/** Checked / total item count for a single phase. */
export function phaseProgress(
  container: TransportContainer,
  phase: TransportPhase,
): { checked: number; total: number } {
  const phaseState = container.checklist[phase];
  const total = container.items.length;
  if (!phaseState) return { checked: 0, total };
  const checked = container.items.reduce(
    (sum, item) => (phaseState[itemKey(item)] === true ? sum + 1 : sum),
    0,
  );
  return { checked, total };
}

/** Checked / total counts across all five phases. */
export function containerProgress(
  container: TransportContainer,
): Record<TransportPhase, { checked: number; total: number }> {
  const result = {} as Record<TransportPhase, { checked: number; total: number }>;
  for (const phase of TRANSPORT_PHASES) {
    result[phase] = phaseProgress(container, phase);
  }
  return result;
}

/** Immutably set the checked state for one item in one phase, returning a new container. */
export function setItemChecked(
  container: TransportContainer,
  phase: TransportPhase,
  key: string,
  checked: boolean,
): TransportContainer {
  return {
    ...container,
    checklist: {
      ...container.checklist,
      [phase]: {
        ...container.checklist[phase],
        [key]: checked,
      },
    },
  };
}

function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Build a CSV string for one container: Qty, Item, Type/Signal, then one column per
 *  phase (✓ when checked, blank otherwise). Pure — returns the string, no side effects. */
export function buildContainerCsv(
  container: TransportContainer,
  resolved: ResolvedContainerItem[],
): string {
  const header = [
    "Qty",
    "Item",
    "Type/Signal",
    ...TRANSPORT_PHASES.map((p) => p),
  ];
  const rows = resolved.map((r) => {
    const key = itemKey(r.item);
    const phaseCells = TRANSPORT_PHASES.map((phase) =>
      container.checklist[phase]?.[key] === true ? "✓" : "",
    );
    return [`${r.qty}`, r.label, r.subLabel ?? "", ...phaseCells];
  });
  return [header, ...rows]
    .map((cells) => cells.map(escapeCsvCell).join(","))
    .join("\n");
}

/** Browser-only: download the container CSV. No-op outside a DOM (e.g. tests/SSR). */
export function exportContainerCsv(
  container: TransportContainer,
  resolved: ResolvedContainerItem[],
  schematicName: string,
): void {
  if (typeof document === "undefined") return;
  const csv = buildContainerCsv(container, resolved);
  downloadCsv(csv, `${schematicName} - ${container.name}.csv`);
}

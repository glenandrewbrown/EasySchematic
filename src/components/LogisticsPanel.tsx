import { memo, useMemo, useState } from "react";
import { useSchematicStore } from "../store";
import {
  computePackList,
  mergeCablesByType,
  cableCostKey,
  getRoomLabel,
  type PackListData,
} from "../packList";
import {
  resolveContainerItems,
  containerProgress,
  itemKey,
  exportContainerCsv,
  type ResolvedContainerItem,
} from "../logistics";
import {
  TRANSPORT_PHASES,
  TRANSPORT_PHASE_LABELS,
  type TransportPhase,
  type TransportContainer,
  type DeviceData,
  type SchematicNode,
} from "../types";

// ─── Constants ───

/** Preset swatch colours for containers (≈12). */
const CONTAINER_COLORS: readonly string[] = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
];

/** Letters used to auto-name new containers ("Case A", "Case B", …). */
const CASE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// ─── Helpers (pure) ───

/** Next free single-letter case name, falling back to a number once Z is used. */
function nextContainerName(existing: TransportContainer[]): string {
  const used = new Set(existing.map((c) => c.name.trim()));
  for (const letter of CASE_LETTERS) {
    const candidate = `Case ${letter}`;
    if (!used.has(candidate)) return candidate;
  }
  return `Case ${existing.length + 1}`;
}

interface DevicePickEntry {
  id: string;
  label: string;
  deviceType: string;
  room: string;
}

/** Real device nodes that can be packed (mirrors pack-list semantics: drops
 *  venue-provided gear and cable accessories). */
function pickableDevices(nodes: SchematicNode[]): DevicePickEntry[] {
  return nodes
    .filter((n): n is SchematicNode => n.type === "device")
    .filter((n) => {
      const data = n.data as DeviceData;
      return !data.isVenueProvided && !data.isCableAccessory;
    })
    .map((n) => {
      const data = n.data as DeviceData;
      return {
        id: n.id,
        label: data.label,
        deviceType: data.deviceType,
        room: getRoomLabel(nodes, n.parentId),
      };
    })
    .sort(
      (a, b) =>
        a.room.localeCompare(b.room) || a.label.localeCompare(b.label),
    );
}

interface CablePickEntry {
  /** The pack-list cable key — exactly what {@link resolveContainerItems} matches on. */
  refKey: string;
  cableType: string;
  signalType: string;
  cableLength: string;
  count: number;
}

/** Merged cable rows (one per cableType|signal|length) suitable for the picker.
 *  Merging guarantees each `refKey` is unique so it maps to a single checklist item. */
function pickableCables(packData: PackListData): CablePickEntry[] {
  return mergeCablesByType(packData.summary).map((row) => ({
    refKey: cableCostKey(row.cableType, row.signalType, row.cableLength),
    cableType: row.cableType,
    signalType: row.signalType,
    cableLength: row.cableLength,
    count: row.count,
  }));
}

// ─── Shared styling tokens (mirrors PackListDialog) ───

const thClass =
  "text-left text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide py-1.5 px-2 border-b border-[var(--ui-border)]";
const tdClass = "py-1 px-2 text-xs text-[var(--color-text)]";

// ─── Main Panel ───

/**
 * Transport / logistics workspace, hosted as the "Logistics" sub-tab of the Schedule
 * view (de-modalled from the old LogisticsDialog). Group gear into cases and track
 * load-in / load-out progress across the five transport phases. Saved with the schematic.
 */
function LogisticsPanel() {
  const containers = useSchematicStore((s) => s.containers);
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const schematicName = useSchematicStore((s) => s.schematicName);
  const addContainer = useSchematicStore((s) => s.addContainer);

  const packData = useMemo(() => computePackList(nodes, edges), [nodes, edges]);

  const [activeId, setActiveId] = useState<string | null>(null);

  // Resolve the active container, falling back to the first one.
  const activeContainer =
    containers.find((c) => c.id === activeId) ?? containers[0] ?? null;

  const handleNew = () => {
    addContainer(nextContainerName(containers));
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Container tab strip */}
      <div className="px-4 pt-2 flex items-center gap-1 border-b border-[var(--ui-border)] overflow-x-auto shrink-0">
        {containers.map((container) => (
          <ContainerTab
            key={container.id}
            container={container}
            active={activeContainer?.id === container.id}
            onSelect={() => setActiveId(container.id)}
          />
        ))}
        <button
          onClick={handleNew}
          className="px-2.5 py-1.5 text-xs rounded-t cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text)] whitespace-nowrap"
        >
          + New
        </button>
      </div>

      {/* Body */}
      <div className="overflow-auto flex-1 min-h-0">
        {activeContainer ? (
          <ContainerView
            key={activeContainer.id}
            container={activeContainer}
            packData={packData}
            nodes={nodes}
            schematicName={schematicName}
          />
        ) : (
          <EmptyState onCreate={handleNew} />
        )}
      </div>
    </div>
  );
}

export default memo(LogisticsPanel);

// ─── Container Tab ───

interface ContainerTabProps {
  container: TransportContainer;
  active: boolean;
  onSelect: () => void;
}

function ContainerTab({ container, active, onSelect }: ContainerTabProps) {
  return (
    <button
      onClick={onSelect}
      className={`px-3 py-1.5 text-xs rounded-t cursor-pointer border border-b-0 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
        active
          ? "bg-[var(--color-surface-raised)] text-[var(--color-text-heading)] font-semibold border-[var(--ui-border)]"
          : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text)]"
      }`}
    >
      <span
        className="inline-block w-2.5 h-2.5 rounded-full border border-[var(--ui-border)] shrink-0"
        style={{ backgroundColor: container.color ?? "transparent" }}
      />
      {container.name || "Untitled"}
    </button>
  );
}

// ─── Empty State ───

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="text-sm text-[var(--color-text-muted)]">
        No containers yet. Group your gear into cases to track load-in and
        load-out.
      </p>
      <button onClick={onCreate} className="ui-btn ui-btn-primary">
        Create first container
      </button>
    </div>
  );
}

// ─── Container View (two columns) ───

interface ContainerViewProps {
  container: TransportContainer;
  packData: PackListData;
  nodes: SchematicNode[];
  schematicName: string;
}

function ContainerView({
  container,
  packData,
  nodes,
  schematicName,
}: ContainerViewProps) {
  const resolved = useMemo(
    () => resolveContainerItems(container, packData, nodes),
    [container, packData, nodes],
  );

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-2 gap-4 p-4">
        <ItemsColumn
          container={container}
          resolved={resolved}
          packData={packData}
          nodes={nodes}
        />
        <PhasesColumn container={container} resolved={resolved} />
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[var(--ui-border)] flex items-center gap-2 shrink-0">
        <div className="flex-1" />
        <button
          onClick={() => exportContainerCsv(container, resolved, schematicName)}
          className="ui-btn ui-btn-secondary"
        >
          CSV
        </button>
      </div>
    </div>
  );
}

// ─── Left Column: name, colour, delete, item list, add picker ───

interface ItemsColumnProps {
  container: TransportContainer;
  resolved: ResolvedContainerItem[];
  packData: PackListData;
  nodes: SchematicNode[];
}

function ItemsColumn({
  container,
  resolved,
  packData,
  nodes,
}: ItemsColumnProps) {
  const renameContainer = useSchematicStore((s) => s.renameContainer);
  const removeContainer = useSchematicStore((s) => s.removeContainer);
  const setContainerColor = useSchematicStore((s) => s.setContainerColor);
  const removeItemFromContainer = useSchematicStore(
    (s) => s.removeItemFromContainer,
  );

  const [showPicker, setShowPicker] = useState(false);

  const handleDelete = () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete container "${container.name}"? This can't be undone.`)
    ) {
      return;
    }
    removeContainer(container.id);
  };

  return (
    <div className="flex flex-col gap-3 min-w-0">
      {/* Name + colour + delete */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={container.name}
          onChange={(e) => renameContainer(container.id, e.target.value)}
          placeholder="Container name"
          className="ui-input flex-1 px-2 py-1 text-xs min-w-0"
        />
        <button
          onClick={handleDelete}
          className="ui-btn ui-btn-danger px-2 py-1"
          title="Delete container"
        >
          Delete
        </button>
      </div>

      {/* Colour swatches */}
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={() => setContainerColor(container.id, undefined)}
          className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] text-[var(--color-text-muted)] cursor-pointer ${
            container.color
              ? "border-[var(--ui-border)]"
              : "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
          }`}
          title="No colour"
        >
          &times;
        </button>
        {CONTAINER_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => setContainerColor(container.id, color)}
            className={`w-5 h-5 rounded-full border cursor-pointer ${
              container.color === color
                ? "border-[var(--color-text-heading)] ring-1 ring-[var(--color-text-heading)]"
                : "border-[var(--ui-border)]"
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>

      {/* Item list */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
            Items ({resolved.length})
          </span>
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="text-xs text-[var(--color-accent)] hover:underline cursor-pointer"
          >
            {showPicker ? "Done" : "Add items…"}
          </button>
        </div>

        {resolved.length === 0 && !showPicker ? (
          <p className="text-xs text-[var(--color-text-muted)] py-3">
            No items assigned. Use &ldquo;Add items&hellip;&rdquo; to pack
            devices and cables into this container.
          </p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={thClass}>Qty</th>
                <th className={thClass}>Item</th>
                <th className={thClass}>Type</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {resolved.map((r, i) => (
                <tr
                  key={itemKey(r.item)}
                  className={`${i % 2 === 1 ? "bg-[var(--color-surface)]" : ""} ${
                    r.found ? "" : "opacity-50"
                  }`}
                >
                  <td className={tdClass}>{r.qty}&times;</td>
                  <td className={tdClass}>
                    {r.label}
                    {!r.found && (
                      <span className="block text-[10px] text-[var(--color-text-muted)] italic">
                        removed from schematic
                      </span>
                    )}
                  </td>
                  <td className={tdClass}>{r.subLabel ?? ""}</td>
                  <td className={`${tdClass} text-right`}>
                    <button
                      onClick={() =>
                        removeItemFromContainer(container.id, itemKey(r.item))
                      }
                      className="text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] leading-none cursor-pointer"
                      title="Remove item"
                      aria-label="Remove item"
                    >
                      &times;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {showPicker && (
          <AddItemsPicker
            container={container}
            packData={packData}
            nodes={nodes}
          />
        )}
      </div>
    </div>
  );
}

// ─── Add Items Picker ───

interface AddItemsPickerProps {
  container: TransportContainer;
  packData: PackListData;
  nodes: SchematicNode[];
}

function AddItemsPicker({ container, packData, nodes }: AddItemsPickerProps) {
  const addItemToContainer = useSchematicStore((s) => s.addItemToContainer);

  const devices = useMemo(() => pickableDevices(nodes), [nodes]);
  const cables = useMemo(() => pickableCables(packData), [packData]);

  // An item is "already in" the container when its checklist key matches.
  const assignedKeys = useMemo(
    () => new Set(container.items.map((it) => itemKey(it))),
    [container.items],
  );

  return (
    <div className="mt-2 border border-[var(--ui-border)] rounded p-2 bg-[var(--color-surface)] flex flex-col gap-3 max-h-64 overflow-auto">
      {/* Devices */}
      <div>
        <div className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
          Devices
        </div>
        {devices.length === 0 ? (
          <p className="text-[11px] text-[var(--color-text-muted)]">
            No packable devices.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {devices.map((d) => {
              const key = `device:${d.id}`;
              const checked = assignedKeys.has(key);
              return (
                <PickerRow
                  key={key}
                  checked={checked}
                  primary={d.label}
                  secondary={`${d.deviceType}${d.room ? ` · ${d.room}` : ""}`}
                  onToggle={(next) => {
                    if (next) {
                      addItemToContainer(container.id, {
                        kind: "device",
                        refId: d.id,
                        qty: 1,
                      });
                    } else {
                      useSchematicStore
                        .getState()
                        .removeItemFromContainer(container.id, key);
                    }
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Cables */}
      <div>
        <div className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
          Cables
        </div>
        {cables.length === 0 ? (
          <p className="text-[11px] text-[var(--color-text-muted)]">
            No cables in this schematic.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {cables.map((c) => {
              const key = `cable:${c.refKey}`;
              const checked = assignedKeys.has(key);
              const lengthSuffix = c.cableLength
                ? ` · ${c.cableLength}`
                : "";
              return (
                <PickerRow
                  key={key}
                  checked={checked}
                  primary={c.cableType}
                  secondary={`${c.signalType}${lengthSuffix} · ${c.count}×`}
                  onToggle={(next) => {
                    if (next) {
                      addItemToContainer(container.id, {
                        kind: "cable",
                        refId: c.refKey,
                        qty: c.count,
                      });
                    } else {
                      useSchematicStore
                        .getState()
                        .removeItemFromContainer(container.id, key);
                    }
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface PickerRowProps {
  checked: boolean;
  primary: string;
  secondary: string;
  onToggle: (next: boolean) => void;
}

function PickerRow({ checked, primary, secondary, onToggle }: PickerRowProps) {
  return (
    <label className="flex items-center gap-2 text-xs cursor-pointer select-none py-0.5 px-1 rounded hover:bg-[var(--color-surface-hover)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
        className="accent-blue-600 shrink-0"
      />
      <span className="text-[var(--color-text)] truncate">{primary}</span>
      <span className="text-[10px] text-[var(--color-text-muted)] truncate ml-auto">
        {secondary}
      </span>
    </label>
  );
}

// ─── Right Column: five-phase collapsible checklists ───

interface PhasesColumnProps {
  container: TransportContainer;
  resolved: ResolvedContainerItem[];
}

function PhasesColumn({ container, resolved }: PhasesColumnProps) {
  const progress = useMemo(() => containerProgress(container), [container]);

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-0.5">
        Checklist
      </div>
      {TRANSPORT_PHASES.map((phase) => (
        <PhaseSection
          key={phase}
          container={container}
          phase={phase}
          resolved={resolved}
          checked={progress[phase].checked}
          total={progress[phase].total}
        />
      ))}
    </div>
  );
}

interface PhaseSectionProps {
  container: TransportContainer;
  phase: TransportPhase;
  resolved: ResolvedContainerItem[];
  checked: number;
  total: number;
}

function PhaseSection({
  container,
  phase,
  resolved,
  checked,
  total,
}: PhaseSectionProps) {
  const setContainerItemChecked = useSchematicStore(
    (s) => s.setContainerItemChecked,
  );
  const clearContainerPhase = useSchematicStore((s) => s.clearContainerPhase);

  const [expanded, setExpanded] = useState(false);

  const phaseState = container.checklist[phase] ?? {};
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

  return (
    <div className="border border-[var(--ui-border)] rounded overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left cursor-pointer hover:bg-[var(--color-surface-hover)]"
      >
        <span className="text-[10px] text-[var(--color-text-muted)] w-2.5 shrink-0">
          {expanded ? "▾" : "▸"}
        </span>
        <span className="text-xs font-medium text-[var(--color-text-heading)] flex-1 truncate">
          {TRANSPORT_PHASE_LABELS[phase]}
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums shrink-0">
          {checked}/{total}
        </span>
      </button>

      {/* Progress bar */}
      <div className="h-1 bg-[var(--color-surface)]">
        <div
          className="h-full bg-[var(--color-accent)] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Expanded checklist */}
      {expanded && (
        <div className="px-2 py-1.5 flex flex-col gap-0.5">
          {resolved.length === 0 ? (
            <p className="text-[11px] text-[var(--color-text-muted)] py-1">
              No items to check.
            </p>
          ) : (
            <>
              {resolved.map((r) => {
                const key = itemKey(r.item);
                return (
                  <label
                    key={key}
                    className="flex items-center gap-2 text-xs cursor-pointer select-none py-0.5"
                  >
                    <input
                      type="checkbox"
                      checked={phaseState[key] === true}
                      onChange={(e) =>
                        setContainerItemChecked(
                          container.id,
                          phase,
                          key,
                          e.target.checked,
                        )
                      }
                      className="accent-blue-600 shrink-0"
                    />
                    <span
                      className={`truncate ${
                        r.found
                          ? "text-[var(--color-text)]"
                          : "text-[var(--color-text-muted)] italic"
                      }`}
                    >
                      {r.label}
                    </span>
                  </label>
                );
              })}
              {checked > 0 && (
                <button
                  onClick={() => clearContainerPhase(container.id, phase)}
                  className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:underline cursor-pointer self-start mt-1"
                >
                  Clear phase
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

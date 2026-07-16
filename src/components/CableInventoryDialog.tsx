import { useState } from "react";
import { useSchematicStore } from "../store";
import { remainingQuantities } from "../cableFit";
import { DEFAULT_DISTANCE_SETTINGS, SIGNAL_LABELS } from "../types";
import type { DistanceSettings, OwnedCableItem, SignalType } from "../types";
import { DEFAULT_SIGNAL_COLORS } from "../signalColors";
import { FEET_PER_METER, formatLengthMode, type LengthUnitMode } from "../lengthFormat";
import { signalLabel, type DetailLevel } from "../plainLanguage";

/** Signal types for the row swatch picker, alpha by technical name (matches DeviceEditor.tsx's
 *  ALL_SIGNAL_TYPES derivation — the picker's own plain/technical labelling is applied per-row). */
const ALL_SIGNAL_TYPES = (Object.keys(SIGNAL_LABELS) as SignalType[]).sort((a, b) =>
  SIGNAL_LABELS[a].localeCompare(SIGNAL_LABELS[b]),
);

/** Shared ghost-input style for the inline-editable table cells (matches InventoryListPanel/GearInventoryPanel). */
const GHOST =
  "w-full text-xs bg-transparent outline-none rounded px-1 py-0.5 border border-transparent " +
  "hover:border-[var(--ui-border)] focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] text-[var(--color-text)]";

/** CRUD manager for the user's physical cable stock (saved in the schematic). */
export default function CableInventoryDialog() {
  const show = useSchematicStore((s) => s.showCableInventory);
  const setShow = useSchematicStore((s) => s.setShowCableInventory);
  const ownedCables = useSchematicStore((s) => s.ownedCables);
  const edges = useSchematicStore((s) => s.edges);
  const addOwnedCable = useSchematicStore((s) => s.addOwnedCable);
  const updateOwnedCable = useSchematicStore((s) => s.updateOwnedCable);
  const removeOwnedCable = useSchematicStore((s) => s.removeOwnedCable);
  const distanceSettings = useSchematicStore((s) => s.distanceSettings) ?? DEFAULT_DISTANCE_SETTINGS;
  const lengthUnitMode = useSchematicStore((s) => s.lengthUnitMode);
  const detailLevel = useSchematicStore((s) => s.detailLevel);

  const [query, setQuery] = useState("");

  if (!show) return null;

  const unit = distanceSettings.unit;
  const remaining = remainingQuantities(ownedCables, edges);

  const q = query.trim().toLowerCase();
  const shown = q
    ? ownedCables.filter((c) =>
        [c.label, c.cableType, c.partNumber, c.assetTag].some(
          (field) => field && field.toLowerCase().includes(q),
        ),
      )
    : ownedCables;

  const totalUnits = ownedCables.reduce((sum, c) => sum + c.quantity, 0);

  const handleNewCable = () => {
    addOwnedCable({ label: "New cable", length: 1, quantity: 1 });
  };

  return (
    <div className="ui-dialog-backdrop" data-print-hide onClick={() => setShow(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cable-inventory-dialog-title"
        className="ui-dialog w-[680px] max-w-[92vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-[var(--ui-border)] flex items-center gap-3">
          <h2
            id="cable-inventory-dialog-title"
            className="text-sm font-semibold text-[var(--color-text-heading)] whitespace-nowrap"
          >
            Cable Inventory
          </h2>
          <span
            className="text-[10px] text-[var(--color-text-muted)] whitespace-nowrap"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {q ? `${shown.length} of ${ownedCables.length}` : ownedCables.length} line
            {ownedCables.length === 1 ? "" : "s"} · {totalUnits} cable{totalUnits === 1 ? "" : "s"}
          </span>
          <span className="flex-1" />
          <div className="relative w-40">
            <svg
              className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)] pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" strokeLinecap="round" />
            </svg>
            <input
              className="ui-input w-full text-xs pl-7"
              placeholder="Search stock…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search cable stock"
            />
          </div>
          <button className="ui-btn ui-btn-primary px-2.5 py-1 text-xs whitespace-nowrap" onClick={handleNewCable}>
            + New cable
          </button>
          <button className="ui-btn ui-btn-ghost px-2 py-1" onClick={() => setShow(false)} title="Close">
            ✕
          </button>
        </div>

        <div className="px-4 py-3 overflow-y-auto flex-1 min-h-0">
          <p className="text-[11px] text-[var(--color-text-muted)] mb-3">
            The exact cables you own. Assign them to connections via right-click → Assign Cables. Saved with
            this schematic.
          </p>

          {ownedCables.length === 0 && (
            <p className="text-xs text-[var(--color-text-muted)] italic">
              No cables yet. Click "New cable" to add your stock.
            </p>
          )}

          {ownedCables.length > 0 && shown.length === 0 && (
            <p className="text-xs text-[var(--color-text-muted)] italic text-center py-6">
              No stock lines match your search.
            </p>
          )}

          {shown.length > 0 && (
            <div className="border border-[var(--ui-border)] rounded-lg overflow-hidden">
              <div className="grid grid-cols-[1.7fr_1fr_92px_52px_70px_28px] gap-1.5 items-center h-8 border-b border-[var(--ui-border)] bg-[var(--color-surface-raised)] px-1">
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] px-2">
                  Label · part #
                </span>
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] px-2">
                  Type
                </span>
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] px-2 text-right">
                  Length
                </span>
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] px-2 text-right">
                  Qty
                </span>
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] px-2 text-right">
                  Free
                </span>
                <span />
              </div>
              <div>
                {shown.map((c) => (
                  <CableRow
                    key={c.id}
                    cable={c}
                    free={remaining.get(c.id) ?? c.quantity}
                    unit={unit}
                    lengthUnitMode={lengthUnitMode}
                    detailLevel={detailLevel}
                    onUpdate={updateOwnedCable}
                    onRemove={removeOwnedCable}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[var(--ui-border)] flex justify-end gap-2">
          <button className="ui-btn ui-btn-primary" onClick={() => setShow(false)}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

interface CableRowProps {
  cable: OwnedCableItem;
  free: number;
  unit: DistanceSettings["unit"];
  lengthUnitMode: LengthUnitMode;
  detailLevel: DetailLevel;
  onUpdate: (id: string, patch: Partial<Omit<OwnedCableItem, "id">>) => void;
  onRemove: (id: string) => void;
}

function CableRow({ cable, free, unit, lengthUnitMode, detailLevel, onUpdate, onRemove }: CableRowProps) {
  // Owned-cable lengths are stored in the document's own unit (DistanceSettings.unit); the shared
  // formatter takes metres, so normalize here — the display unit (lengthUnitMode) is a separate
  // view preference and must not leak into that conversion. Mirrors Inspector.tsx's ConnectionBody.
  const meters = unit === "ft" ? cable.length / FEET_PER_METER : cable.length;
  const swatchColor = cable.signalType
    ? `var(--color-${cable.signalType}, ${DEFAULT_SIGNAL_COLORS[cable.signalType]})`
    : "var(--color-text-muted)";

  // 3-tier free-stock colour: 0 = error, ≤1 = warning, else success — always paired with the
  // "N free" text, never colour alone.
  const freeColor =
    free === 0 ? "var(--color-error)" : free <= 1 ? "var(--color-warning)" : "var(--color-success)";

  return (
    <div
      className="grid grid-cols-[1.7fr_1fr_92px_52px_70px_28px] gap-1.5 items-start px-1 py-1.5 border-b border-[var(--ui-border)] last:border-b-0 hover:bg-[var(--color-surface-hover)] group"
    >
      {/* Label · part # · asset tag, with a signal-colour swatch */}
      <div className="flex items-start gap-2 px-1 min-w-0">
        <span className="relative w-3 h-3 mt-1 rounded-sm shrink-0" style={{ background: swatchColor }}>
          <select
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            value={cable.signalType ?? ""}
            onChange={(e) =>
              onUpdate(cable.id, { signalType: (e.target.value || undefined) as SignalType | undefined })
            }
            title={
              cable.signalType
                ? signalLabel(cable.signalType, detailLevel)
                : "Set a signal type (for the swatch colour)"
            }
            aria-label="Signal type"
          >
            <option value="">—</option>
            {ALL_SIGNAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {signalLabel(t, detailLevel)}
              </option>
            ))}
          </select>
        </span>
        <div className="flex flex-col min-w-0 flex-1">
          <input
            className={`${GHOST} font-medium text-[var(--color-text-heading)]`}
            defaultValue={cable.label}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== cable.label) onUpdate(cable.id, { label: v });
              else e.target.value = cable.label;
            }}
            aria-label="Cable label"
          />
          <div className="flex gap-1">
            <input
              className={`${GHOST} text-[10px]`}
              style={{ fontFamily: "var(--font-mono)" }}
              defaultValue={cable.partNumber ?? ""}
              placeholder="Part #"
              onBlur={(e) => onUpdate(cable.id, { partNumber: e.target.value.trim() || undefined })}
              aria-label="Part number"
            />
            <input
              className={`${GHOST} text-[10px]`}
              style={{ fontFamily: "var(--font-mono)" }}
              defaultValue={cable.assetTag ?? ""}
              placeholder="Asset tag"
              onBlur={(e) => onUpdate(cable.id, { assetTag: e.target.value.trim() || undefined })}
              aria-label="Asset tag"
            />
          </div>
        </div>
      </div>

      {/* Type */}
      <input
        className={`${GHOST} px-2 mt-1`}
        defaultValue={cable.cableType ?? ""}
        placeholder="e.g. XLR balanced"
        onBlur={(e) => onUpdate(cable.id, { cableType: e.target.value.trim() || undefined })}
        aria-label="Cable type"
      />

      {/* Length: exact-unit input (document storage unit) + the shared dual-unit formatter below */}
      <div className="flex flex-col items-end px-1">
        <div className="flex items-center gap-1">
          <input
            className={`${GHOST} text-right w-10`}
            type="number"
            min="0"
            step="0.5"
            value={cable.length}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v) && v >= 0) onUpdate(cable.id, { length: v });
            }}
            aria-label={`Length in ${unit === "m" ? "meters" : "feet"}`}
          />
          <span className="text-[10px] text-[var(--color-text-muted)]">{unit}</span>
        </div>
        <span className="text-[9px] text-[var(--color-text-muted)]" style={{ fontFamily: "var(--font-mono)" }}>
          {formatLengthMode(meters, lengthUnitMode)}
        </span>
      </div>

      {/* Qty */}
      <input
        className={`${GHOST} text-right mt-1`}
        type="number"
        min="0"
        step="1"
        value={cable.quantity}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (Number.isFinite(v) && v >= 0) onUpdate(cable.id, { quantity: v });
        }}
        aria-label="Quantity"
      />

      {/* Free */}
      <span
        className="text-xs text-right tabular-nums font-semibold px-1 mt-1.5"
        style={{ color: freeColor }}
        title="Quantity not yet assigned to a connection"
      >
        {free} free
      </span>

      {/* Remove */}
      <button
        className="text-red-500/70 hover:text-red-600 text-sm cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity mt-1"
        onClick={() => onRemove(cable.id)}
        title="Remove from inventory (also unassigns it everywhere)"
      >
        ✕
      </button>
    </div>
  );
}

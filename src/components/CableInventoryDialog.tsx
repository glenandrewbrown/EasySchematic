import { useState } from "react";
import { useSchematicStore } from "../store";
import { remainingQuantities } from "../cableFit";
import { DEFAULT_DISTANCE_SETTINGS } from "../types";

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

  const [newLabel, setNewLabel] = useState("");
  const [newLength, setNewLength] = useState("");
  const [newQuantity, setNewQuantity] = useState("1");

  if (!show) return null;

  const unit = distanceSettings.unit;
  const remaining = remainingQuantities(ownedCables, edges);

  const handleAdd = () => {
    const length = parseFloat(newLength);
    const quantity = Math.max(1, parseInt(newQuantity, 10) || 1);
    if (!Number.isFinite(length) || length <= 0) return;
    addOwnedCable({
      label: newLabel.trim() || `Cable ${length} ${unit}`,
      length,
      quantity,
    });
    setNewLabel("");
    setNewLength("");
    setNewQuantity("1");
  };

  return (
    <div className="ui-dialog-backdrop" data-print-hide onClick={() => setShow(false)}>
      <div className="ui-dialog w-[480px] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-[var(--ui-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text-heading)]">
            Cable Inventory
          </h2>
          <button
            className="ui-btn ui-btn-ghost px-2 py-1"
            onClick={() => setShow(false)}
            title="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-3 overflow-y-auto flex-1 min-h-0">
          <p className="text-[11px] text-[var(--color-text-muted)] mb-3">
            The exact cables you own, in {unit === "m" ? "meters" : "feet"}. Assign them to
            connections via right-click → Assign Cables. Saved with this schematic.
          </p>

          {ownedCables.length === 0 && (
            <p className="text-xs text-[var(--color-text-muted)] italic mb-3">
              No cables yet. Add your stock below.
            </p>
          )}

          {ownedCables.length > 0 && (
            <div className="mb-3">
              <div className="grid grid-cols-[1fr_72px_56px_56px_28px] gap-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] px-1 mb-1">
                <span>Label</span>
                <span>Length ({unit})</span>
                <span>Qty</span>
                <span>Free</span>
                <span />
              </div>
              <div className="space-y-1">
                {ownedCables.map((c) => (
                  <div key={c.id} className="grid grid-cols-[1fr_72px_56px_56px_28px] gap-1.5 items-center">
                    <input
                      className="ui-input w-full"
                      value={c.label}
                      onChange={(e) => updateOwnedCable(c.id, { label: e.target.value })}
                    />
                    <input
                      className="ui-input w-full text-right"
                      type="number"
                      min="0"
                      step="0.5"
                      value={c.length}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v) && v >= 0) updateOwnedCable(c.id, { length: v });
                      }}
                    />
                    <input
                      className="ui-input w-full text-right"
                      type="number"
                      min="0"
                      step="1"
                      value={c.quantity}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (Number.isFinite(v) && v >= 0) updateOwnedCable(c.id, { quantity: v });
                      }}
                    />
                    <span
                      className={`text-xs text-center tabular-nums ${
                        (remaining.get(c.id) ?? 0) === 0
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-[var(--color-text-muted)]"
                      }`}
                      title="Quantity not yet assigned to a connection"
                    >
                      {remaining.get(c.id) ?? c.quantity}
                    </span>
                    <button
                      className="text-red-500/70 hover:text-red-600 text-sm cursor-pointer"
                      onClick={() => removeOwnedCable(c.id)}
                      title="Remove from inventory (also unassigns it everywhere)"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-[var(--ui-border)] pt-3">
            <div className="grid grid-cols-[1fr_72px_56px_auto] gap-1.5 items-center">
              <input
                className="ui-input w-full"
                placeholder={`e.g. SDI 12G 10 ${unit}`}
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              />
              <input
                className="ui-input w-full text-right"
                type="number"
                min="0"
                step="0.5"
                placeholder={unit}
                value={newLength}
                onChange={(e) => setNewLength(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              />
              <input
                className="ui-input w-full text-right"
                type="number"
                min="1"
                step="1"
                value={newQuantity}
                onChange={(e) => setNewQuantity(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              />
              <button className="ui-btn ui-btn-secondary" onClick={handleAdd}>
                Add
              </button>
            </div>
          </div>
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

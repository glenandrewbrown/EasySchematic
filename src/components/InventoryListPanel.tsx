import { useState } from "react";
import { useSchematicStore } from "../store";
import type { OwnedInventoryItem } from "../types";

/**
 * Quick list-view inventory of owned items that are NOT drawn on the diagram — cables,
 * adapters, peripherals, spares and accessories. Complements the per-unit Gear Inventory
 * (serials/condition) and the cable-stock BOM: this is the fast "type a line, set a qty"
 * stock list for packing and ordering. Backed by store.ownedInventory.
 */

const CATEGORY_SUGGESTIONS = ["Cable", "Adapter", "Connector", "Peripheral", "Power", "Spare", "Accessory"];

/** Shared ghost-input style for the inline-editable table cells. */
const GHOST =
  "w-full text-xs bg-transparent outline-none rounded px-1 py-0.5 border border-transparent " +
  "hover:border-[var(--ui-border)] focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] text-[var(--color-text)]";

/** Source chip: where an Items row comes from — the owned-gear list or a manual entry. */
function SourceChip({ owned }: { owned: boolean }) {
  return owned ? (
    <span className="inline-block px-1.5 py-[1px] rounded text-[9px] font-semibold tracking-wide uppercase bg-[var(--color-success,#1aa179)]/15 text-[var(--color-success,#1aa179)]">
      Owned
    </span>
  ) : (
    <span className="inline-block px-1.5 py-[1px] rounded text-[9px] font-semibold tracking-wide uppercase bg-[var(--color-surface)] text-[var(--color-text-muted)] border border-[var(--ui-border)]">
      Manual
    </span>
  );
}

export default function InventoryListPanel() {
  const items = useSchematicStore((s) => s.ownedInventory);
  const ownedGear = useSchematicStore((s) => s.ownedGear);
  const addItem = useSchematicStore((s) => s.addOwnedInventoryItem);
  const updateItem = useSchematicStore((s) => s.updateOwnedInventoryItem);
  const removeItem = useSchematicStore((s) => s.removeOwnedInventoryItem);

  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");

  const canAdd = label.trim().length > 0;
  const submit = () => {
    if (!canAdd) return;
    addItem({
      label: label.trim(),
      category: category.trim() || undefined,
      quantity: Math.max(1, Math.round(Number(quantity) || 1)),
      notes: notes.trim() || undefined,
    });
    setLabel("");
    setCategory("");
    setQuantity("1");
    setNotes("");
  };

  const totalUnits = items.reduce((sum, it) => sum + (it.quantity || 0), 0);

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--ui-border)] shrink-0">
        <h2 className="text-sm font-semibold text-[var(--color-text-heading)]">Items</h2>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
          Cables, adapters, peripherals &amp; spares you own but don't draw on the diagram — a quick
          stock list for packing and ordering. {items.length} line{items.length === 1 ? "" : "s"} ·{" "}
          {totalUnits} unit{totalUnits === 1 ? "" : "s"}.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-[var(--color-surface-raised)] z-10">
            <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
              <th className="px-3 py-2 font-semibold">Item</th>
              <th className="px-2 py-2 font-semibold w-32">Category</th>
              <th className="px-2 py-2 font-semibold w-20">Source</th>
              <th className="px-2 py-2 font-semibold w-16 text-right">Qty</th>
              <th className="px-2 py-2 font-semibold">Notes</th>
              <th className="px-2 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && ownedGear.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-[var(--color-text-muted)]">
                  No items yet — add cables, adapters or peripherals below.
                </td>
              </tr>
            )}
            {/* Owned devices surface here read-only so everything owned is visible in ONE
                list; quantities are managed from Insert ▸ My Devices. */}
            {ownedGear.map((g, i) => (
              <tr key={`owned-${i}`} className="border-b border-[var(--ui-border)]">
                <td className="px-4 py-1.5 text-[var(--color-text)]">{g.template.label}</td>
                <td className="px-3 py-1.5 text-[var(--color-text-muted)]">{g.template.category ?? "Device"}</td>
                <td className="px-2 py-1.5"><SourceChip owned /></td>
                <td className="px-3 py-1.5 text-right tabular-nums text-[var(--color-text)]">{g.quantity}</td>
                <td className="px-3 py-1.5 text-[var(--color-text-muted)] text-[10px]">Managed in Insert ▸ My Devices</td>
                <td className="px-2 py-1.5" />
              </tr>
            ))}
            {items.map((it) => (
              <InventoryRow key={it.id} item={it} onUpdate={updateItem} onRemove={removeItem} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Quick-add row */}
      <div className="shrink-0 border-t border-[var(--ui-border)] bg-[var(--color-surface-raised)] p-3">
        <div className="flex items-end gap-2">
          <label className="flex-1 min-w-0">
            <span className="block text-[10px] uppercase text-[var(--color-text-muted)] mb-0.5">Item</span>
            <input
              className="ui-input w-full text-xs"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. USB-C → HDMI adapter"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </label>
          <label className="w-32">
            <span className="block text-[10px] uppercase text-[var(--color-text-muted)] mb-0.5">Category</span>
            <input
              list="inv-cats"
              className="ui-input w-full text-xs"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Cable"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </label>
          <label className="w-16">
            <span className="block text-[10px] uppercase text-[var(--color-text-muted)] mb-0.5">Qty</span>
            <input
              type="number"
              min={1}
              className="ui-input w-full text-xs text-right"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </label>
          <label className="flex-1 min-w-0">
            <span className="block text-[10px] uppercase text-[var(--color-text-muted)] mb-0.5">Notes</span>
            <input
              className="ui-input w-full text-xs"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="optional"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </label>
          <button className="ui-btn ui-btn-primary text-xs whitespace-nowrap" disabled={!canAdd} onClick={submit}>
            Add item
          </button>
        </div>
        <datalist id="inv-cats">
          {CATEGORY_SUGGESTIONS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
    </div>
  );
}

interface InventoryRowProps {
  item: OwnedInventoryItem;
  onUpdate: (id: string, patch: Partial<Omit<OwnedInventoryItem, "id">>) => void;
  onRemove: (id: string) => void;
}

function InventoryRow({ item, onUpdate, onRemove }: InventoryRowProps) {
  return (
    <tr className="border-b border-[var(--ui-border)] hover:bg-[var(--color-surface-hover)] group">
      <td className="px-3 py-1.5">
        <input
          className={GHOST}
          defaultValue={item.label}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== item.label) onUpdate(item.id, { label: v });
            else e.target.value = item.label;
          }}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          list="inv-cats"
          className={GHOST}
          defaultValue={item.category ?? ""}
          onBlur={(e) => onUpdate(item.id, { category: e.target.value.trim() || undefined })}
        />
      </td>
      <td className="px-2 py-1.5">
        <SourceChip owned={false} />
      </td>
      <td className="px-2 py-1.5 text-right">
        <input
          type="number"
          min={1}
          className={`${GHOST} text-right`}
          defaultValue={item.quantity}
          onBlur={(e) => onUpdate(item.id, { quantity: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          className={GHOST}
          defaultValue={item.notes ?? ""}
          placeholder="—"
          onBlur={(e) => onUpdate(item.id, { notes: e.target.value.trim() || undefined })}
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <button
          className="text-[var(--color-text-muted)] hover:text-[var(--color-danger,#dc2626)] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-base leading-none"
          title="Remove item"
          onClick={() => onRemove(item.id)}
        >
          ×
        </button>
      </td>
    </tr>
  );
}

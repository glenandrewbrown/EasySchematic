import { useState, useRef, useMemo } from "react";
import { useSchematicStore } from "../store";
import { compressGearPhoto } from "../gearInventory";
import type { GearUnit, GearUnitCondition } from "../types";

/** Conditions surfaced in the per-unit dropdown (matches GearUnitCondition). */
const CONDITION_OPTIONS: { value: GearUnitCondition; label: string }[] = [
  { value: "excellent", label: "Excellent" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
];

/** Max image upload size (bytes) before we reject the file. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
/** Beyond this many photographed units, large saves get sluggish — warn the user. */
const PHOTO_WARN_THRESHOLD = 20;

const UNASSIGNED_VALUE = "";

/**
 * Per-unit owned-gear inventory manager, hosted as the "Inventory" sub-tab of the
 * Schedule view (de-modalled from the old GearInventoryDialog). Each unit is one
 * specific piece of hardware with its own identity, condition, optional photo, and
 * optional link to a placed device. Saved with the schematic.
 */
export default function GearInventoryPanel() {
  const gearUnits = useSchematicStore((s) => s.gearUnits);
  const nodes = useSchematicStore((s) => s.nodes);
  const addGearUnit = useSchematicStore((s) => s.addGearUnit);
  const updateGearUnit = useSchematicStore((s) => s.updateGearUnit);
  const removeGearUnit = useSchematicStore((s) => s.removeGearUnit);
  const assignGearUnit = useSchematicStore((s) => s.assignGearUnit);
  const unassignGearUnit = useSchematicStore((s) => s.unassignGearUnit);

  const [newManufacturer, setNewManufacturer] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newSerial, setNewSerial] = useState("");
  const [newAssetTag, setNewAssetTag] = useState("");

  // The hidden file input is shared; we track which unit a pending upload targets.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetId = useRef<string | null>(null);

  // Devices available for assignment (React Flow nodes typed as "device").
  const deviceNodes = useMemo(
    () =>
      nodes
        .filter((n) => n.type === "device")
        .map((n) => ({
          id: n.id,
          label:
            (n.data as { label?: string } | undefined)?.label?.trim() ||
            "Untitled device",
        })),
    [nodes],
  );

  const photoCount = gearUnits.filter((u) => Boolean(u.photo)).length;

  const handleAdd = () => {
    const model = newModel.trim();
    if (!model) return;
    const unit: Omit<GearUnit, "id"> = { model };
    const manufacturer = newManufacturer.trim();
    if (manufacturer) unit.manufacturer = manufacturer;
    const serialNumber = newSerial.trim();
    if (serialNumber) unit.serialNumber = serialNumber;
    const assetTag = newAssetTag.trim();
    if (assetTag) unit.assetTag = assetTag;
    addGearUnit(unit);
    setNewManufacturer("");
    setNewModel("");
    setNewSerial("");
    setNewAssetTag("");
  };

  const handlePickPhoto = (unitId: string) => {
    uploadTargetId.current = unitId;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetId = uploadTargetId.current;
    e.target.value = "";
    uploadTargetId.current = null;
    if (!file || !targetId) return;
    if (file.size > MAX_PHOTO_BYTES) {
      alert("Photo is too large (max 5 MB). Please use a smaller image.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const compressed = await compressGearPhoto(dataUrl);
        updateGearUnit(targetId, { photo: compressed });
      } catch {
        alert("Could not process that image. Please try a different photo.");
      }
    };
    reader.onerror = () => {
      alert("Could not read that file. Please try again.");
    };
    reader.readAsDataURL(file);
  };

  const handleAssignChange = (unitId: string, nodeId: string) => {
    if (nodeId === UNASSIGNED_VALUE) unassignGearUnit(unitId);
    else assignGearUnit(unitId, nodeId);
  };

  const labelForNode = (nodeId: string | undefined): string | null => {
    if (!nodeId) return null;
    return deviceNodes.find((n) => n.id === nodeId)?.label ?? "(deleted device)";
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="px-4 py-3 overflow-y-auto flex-1 min-h-0">
        <p className="text-[11px] text-[var(--color-text-muted)] mb-3 max-w-3xl">
          Each individual piece of hardware you own — serial, asset tag, condition and a
          photo. Assign a unit to a placed device to track exactly which box is where.
          Saved with this schematic.
        </p>

        {photoCount > PHOTO_WARN_THRESHOLD && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-3">
            Large inventory with photos may slow file saves.
          </p>
        )}

        {gearUnits.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)] italic mb-3">
            No gear yet. Add your first unit below.
          </p>
        ) : (
          <div className="mb-3 max-w-4xl">
            <div className="grid grid-cols-[48px_1fr_100px_92px_88px_1fr_28px] gap-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] px-1 mb-1">
              <span>Photo</span>
              <span>Manufacturer / Model</span>
              <span>Serial</span>
              <span>Asset Tag</span>
              <span>Condition</span>
              <span>Assigned To</span>
              <span />
            </div>
            <div className="space-y-1.5">
              {gearUnits.map((u) => (
                <GearUnitRow
                  key={u.id}
                  unit={u}
                  deviceNodes={deviceNodes}
                  assignedLabel={labelForNode(u.assignedNodeId)}
                  onUpdate={updateGearUnit}
                  onRemove={removeGearUnit}
                  onPickPhoto={handlePickPhoto}
                  onAssignChange={handleAssignChange}
                />
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-[var(--ui-border)] pt-3 max-w-4xl">
          <div className="grid grid-cols-[1fr_1fr_100px_92px_auto] gap-1.5 items-center">
            <input
              className="ui-input w-full"
              placeholder="Manufacturer"
              value={newManufacturer}
              onChange={(e) => setNewManufacturer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
            />
            <input
              className="ui-input w-full"
              placeholder="Model (required)"
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
            />
            <input
              className="ui-input w-full"
              placeholder="Serial"
              value={newSerial}
              onChange={(e) => setNewSerial(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
            />
            <input
              className="ui-input w-full"
              placeholder="Asset tag"
              value={newAssetTag}
              onChange={(e) => setNewAssetTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
            />
            <button
              className="ui-btn ui-btn-secondary"
              onClick={handleAdd}
              disabled={!newModel.trim()}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

interface GearUnitRowProps {
  unit: GearUnit;
  deviceNodes: { id: string; label: string }[];
  assignedLabel: string | null;
  onUpdate: (id: string, patch: Partial<GearUnit>) => void;
  onRemove: (id: string) => void;
  onPickPhoto: (id: string) => void;
  onAssignChange: (id: string, nodeId: string) => void;
}

function GearUnitRow({
  unit,
  deviceNodes,
  assignedLabel,
  onUpdate,
  onRemove,
  onPickPhoto,
  onAssignChange,
}: GearUnitRowProps) {
  return (
    <div className="grid grid-cols-[48px_1fr_100px_92px_88px_1fr_28px] gap-1.5 items-center">
      {/* Photo */}
      <div className="flex flex-col items-center gap-0.5">
        <div className="w-10 h-10 rounded border border-[var(--ui-border-strong)] bg-[var(--color-surface)] overflow-hidden flex items-center justify-center">
          {unit.photo ? (
            <img
              src={unit.photo}
              alt={`${unit.model} photo`}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-[8px] text-[var(--color-text-muted)] uppercase">
              None
            </span>
          )}
        </div>
        <button
          className="text-[9px] text-[var(--color-accent)] hover:underline cursor-pointer"
          onClick={() => onPickPhoto(unit.id)}
          title={unit.photo ? "Replace photo" : "Upload photo"}
        >
          {unit.photo ? "Replace" : "Upload"}
        </button>
      </div>

      {/* Manufacturer / Model */}
      <div className="space-y-1">
        <input
          className="ui-input w-full"
          value={unit.manufacturer ?? ""}
          placeholder="Manufacturer"
          onChange={(e) => onUpdate(unit.id, { manufacturer: e.target.value })}
        />
        <input
          className="ui-input w-full"
          value={unit.model}
          placeholder="Model"
          onChange={(e) => onUpdate(unit.id, { model: e.target.value })}
        />
      </div>

      {/* Serial */}
      <input
        className="ui-input w-full"
        value={unit.serialNumber ?? ""}
        placeholder="—"
        onChange={(e) => onUpdate(unit.id, { serialNumber: e.target.value })}
      />

      {/* Asset tag */}
      <input
        className="ui-input w-full"
        value={unit.assetTag ?? ""}
        placeholder="—"
        onChange={(e) => onUpdate(unit.id, { assetTag: e.target.value })}
      />

      {/* Condition */}
      <select
        className="ui-input w-full"
        value={unit.condition ?? ""}
        onChange={(e) =>
          onUpdate(unit.id, {
            condition: e.target.value
              ? (e.target.value as GearUnitCondition)
              : undefined,
          })
        }
      >
        <option value="">—</option>
        {CONDITION_OPTIONS.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>

      {/* Assignment */}
      <div className="min-w-0">
        <select
          className="ui-input w-full"
          value={unit.assignedNodeId ?? UNASSIGNED_VALUE}
          onChange={(e) => onAssignChange(unit.id, e.target.value)}
          title={assignedLabel ? `Assigned to ${assignedLabel}` : "Unassigned"}
        >
          <option value={UNASSIGNED_VALUE}>— unassigned —</option>
          {/* Keep a stale assignment selectable so it doesn't silently reset. */}
          {unit.assignedNodeId &&
            !deviceNodes.some((n) => n.id === unit.assignedNodeId) && (
              <option value={unit.assignedNodeId}>(deleted device)</option>
            )}
          {deviceNodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
            </option>
          ))}
        </select>
      </div>

      {/* Remove */}
      <button
        className="text-red-500/70 hover:text-red-600 text-sm cursor-pointer"
        onClick={() => onRemove(unit.id)}
        title="Remove from inventory"
      >
        ✕
      </button>
    </div>
  );
}

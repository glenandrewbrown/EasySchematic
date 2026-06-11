import { useState, useCallback, useEffect, useMemo } from "react";
import { useSchematicStore } from "../store";
import { DEFAULT_DISTANCE_SETTINGS } from "../types";
import type { DistanceSettings, RackElevationPage, RoomData, RoomNode, SchematicNode } from "../types";
import { getTopLevelRoomId, isTopLevelRoom, listTopLevelRooms, pairKey } from "../roomDistance";

const BORDER_STYLES: { value: RoomData["borderStyle"]; label: string }[] = [
  { value: "dashed", label: "Dashed" },
  { value: "solid", label: "Solid" },
  { value: "dotted", label: "Dotted" },
];

const LABEL_SIZES = [9, 10, 11, 12, 14, 16, 18, 20, 24];

const PRESET_COLORS = [
  "", "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280",
];

export default function RoomEditor() {
  const editingNodeId = useSchematicStore((s) => s.editingNodeId);
  const nodes = useSchematicStore((s) => s.nodes);
  const allPages = useSchematicStore((s) => s.pages);
  const pages = useMemo(() => allPages.filter((p): p is RackElevationPage => p.type === "rack-elevation"), [allPages]);
  const updateRoom = useSchematicStore((s) => s.updateRoom);
  const toggleRoomLock = useSchematicStore((s) => s.toggleRoomLock);
  const setEditingNodeId = useSchematicStore((s) => s.setEditingNodeId);
  const roomDistances = useSchematicStore((s) => s.roomDistances);
  const distanceSettings = useSchematicStore((s) => s.distanceSettings);
  const setRoomDistance = useSchematicStore((s) => s.setRoomDistance);

  const node = nodes.find((n) => n.id === editingNodeId && n.type === "room") as RoomNode | undefined;

  const [label, setLabel] = useState("");
  const [color, setColor] = useState("");
  const [borderColor, setBorderColor] = useState("");
  const [borderStyle, setBorderStyle] = useState<RoomData["borderStyle"]>("dashed");
  const [labelSize, setLabelSize] = useState(12);
  const [locked, setLocked] = useState(false);
  const [isEquipmentRack, setIsEquipmentRack] = useState(false);
  const [linkedRackPageId, setLinkedRackPageId] = useState<string>("");
  const [linkedRackId, setLinkedRackId] = useState<string>("");
  const [widthMStr, setWidthMStr] = useState<string>("");
  const [depthMStr, setDepthMStr] = useState<string>("");
  const [heightMStr, setHeightMStr] = useState<string>("");

  /* eslint-disable react-hooks/set-state-in-effect -- syncing props to local editor state */
  useEffect(() => {
    if (!node) return;
    setLabel(node.data.label);
    setColor(node.data.color ?? "");
    setBorderColor(node.data.borderColor ?? "");
    setBorderStyle(node.data.borderStyle ?? "dashed");
    setLabelSize(node.data.labelSize ?? 12);
    setLocked(node.data.locked ?? false);
    setIsEquipmentRack(node.data.isEquipmentRack ?? false);
    setLinkedRackPageId(node.data.linkedRackPageId ?? "");
    setLinkedRackId(node.data.linkedRackId ?? "");
    setWidthMStr(node.data.widthM != null ? String(node.data.widthM) : "");
    setDepthMStr(node.data.depthM != null ? String(node.data.depthM) : "");
    setHeightMStr(node.data.heightM != null ? String(node.data.heightM) : "");
  }, [node]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const selectedPage = pages.find((p) => p.id === linkedRackPageId);

  const close = useCallback(() => setEditingNodeId(null), [setEditingNodeId]);

  const handleSave = useCallback(() => {
    if (!editingNodeId) return;
    const data: RoomData = {
      label: label.trim() || "Room",
      ...(color ? { color } : {}),
      ...(borderColor ? { borderColor } : {}),
      ...(borderStyle && borderStyle !== "dashed" ? { borderStyle } : {}),
      ...(labelSize !== 12 ? { labelSize } : {}),
      ...(isEquipmentRack ? { isEquipmentRack: true } : {}),
      ...(isEquipmentRack && linkedRackPageId && linkedRackId ? { linkedRackPageId, linkedRackId } : {}),
      ...(parseFloat(widthMStr) > 0 ? { widthM: parseFloat(widthMStr) } : {}),
      ...(parseFloat(depthMStr) > 0 ? { depthM: parseFloat(depthMStr) } : {}),
      ...(parseFloat(heightMStr) > 0 ? { heightM: parseFloat(heightMStr) } : {}),
      ...(node?.data.shape ? { shape: node.data.shape } : {}),
    };
    updateRoom(editingNodeId, data);
    close();
  }, [editingNodeId, node, label, color, borderColor, borderStyle, labelSize, isEquipmentRack, linkedRackPageId, linkedRackId, widthMStr, depthMStr, heightMStr, updateRoom, close]);

  if (!editingNodeId || !node) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="ui-dialog w-[360px]">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text-heading)]">Room Properties</h2>
          <button
            onClick={close}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] text-lg leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Label */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Label
            </label>
            <input
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Room name"
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") handleSave(); }}
              autoFocus
            />
          </div>

          {/* Real-world dimensions */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Real Dimensions (meters)
            </label>
            <div className="flex items-center gap-2">
              <input
                className="ui-input w-24"
                type="number"
                min="0"
                step="0.1"
                placeholder="Width"
                value={widthMStr}
                onChange={(e) => setWidthMStr(e.target.value)}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") handleSave(); }}
              />
              <span className="text-xs text-[var(--color-text-muted)]">×</span>
              <input
                className="ui-input w-24"
                type="number"
                min="0"
                step="0.1"
                placeholder="Depth"
                value={depthMStr}
                onChange={(e) => setDepthMStr(e.target.value)}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") handleSave(); }}
              />
              <span className="text-xs text-[var(--color-text-muted)]">×</span>
              <input
                className="ui-input w-20"
                type="number"
                min="0"
                step="0.1"
                placeholder="Height"
                value={heightMStr}
                onChange={(e) => setHeightMStr(e.target.value)}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") handleSave(); }}
              />
              <span className="text-xs text-[var(--color-text-muted)]">m</span>
            </div>
            <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
              Width × depth × ceiling height. Shown on the room and used to estimate cable runs
              between devices inside it. Right-click the room → Edit Shape for non-rectangular layouts.
            </p>
          </div>

          {/* Lock */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Position Lock
            </label>
            <button
              onClick={() => {
                if (!editingNodeId) return;
                toggleRoomLock(editingNodeId);
                setLocked(!locked);
              }}
              className={`ui-btn ${locked ? "ui-btn-primary" : "ui-btn-secondary"}`}
            >
              {locked ? "Locked" : "Unlocked"}
            </button>
          </div>

          {/* Equipment Rack */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Equipment Rack
            </label>
            <button
              onClick={() => { setIsEquipmentRack(!isEquipmentRack); if (isEquipmentRack) { setLinkedRackPageId(""); setLinkedRackId(""); } }}
              className={`ui-btn ${isEquipmentRack ? "ui-btn-primary" : "ui-btn-secondary"}`}
            >
              {isEquipmentRack ? "Yes" : "No"}
            </button>
          </div>

          {/* Rack link picker — visible when isEquipmentRack */}
          {isEquipmentRack && pages.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                Linked Rack
              </label>
              <select
                className="ui-input text-xs"
                value={linkedRackPageId}
                onChange={(e) => { setLinkedRackPageId(e.target.value); setLinkedRackId(""); }}
              >
                <option value="">— Page —</option>
                {pages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              {selectedPage && (
                <select
                  className="ui-input text-xs"
                  value={linkedRackId}
                  onChange={(e) => setLinkedRackId(e.target.value)}
                >
                  <option value="">— Rack —</option>
                  {selectedPage.racks.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Distances to other rooms (#146) */}
          <RoomDistancesSection
            roomId={node.id}
            nodes={nodes}
            roomDistances={roomDistances}
            unit={(distanceSettings ?? DEFAULT_DISTANCE_SETTINGS).unit}
            setRoomDistance={setRoomDistance}
          />

          {/* Label Size */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Label Size
            </label>
            <select
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500 cursor-pointer"
              value={labelSize}
              onChange={(e) => setLabelSize(Number(e.target.value))}
            >
              {LABEL_SIZES.map((s) => (
                <option key={s} value={s}>{s}px</option>
              ))}
            </select>
          </div>

          {/* Background Color */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Background Color
            </label>
            <div className="flex items-center gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c || "none"}
                  onClick={() => setColor(c)}
                  className={`w-5 h-5 rounded border cursor-pointer transition-all ${
                    color === c ? "ring-2 ring-blue-500 ring-offset-1" : "hover:scale-110"
                  }`}
                  style={{ background: c || "white", borderColor: c ? "transparent" : "var(--color-border)" }}
                  title={c || "None"}
                />
              ))}
              <input
                type="color"
                value={color || "#ffffff"}
                onChange={(e) => setColor(e.target.value)}
                className="w-5 h-5 cursor-pointer border-0 p-0"
                title="Custom color"
              />
            </div>
          </div>

          {/* Border Style */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Border Style
            </label>
            <div className="flex items-center gap-2">
              {BORDER_STYLES.map((bs) => (
                <button
                  key={bs.value}
                  onClick={() => setBorderStyle(bs.value)}
                  className={`ui-btn ${borderStyle === bs.value ? "ui-btn-primary" : "ui-btn-secondary"}`}
                >
                  {bs.label}
                </button>
              ))}
            </div>
          </div>

          {/* Border Color */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Border Color
            </label>
            <div className="flex items-center gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c || "none"}
                  onClick={() => setBorderColor(c)}
                  className={`w-5 h-5 rounded border cursor-pointer transition-all ${
                    borderColor === c ? "ring-2 ring-blue-500 ring-offset-1" : "hover:scale-110"
                  }`}
                  style={{ background: c || "#d4d4d4", borderColor: c ? "transparent" : "var(--color-border)" }}
                  title={c || "Default"}
                />
              ))}
              <input
                type="color"
                value={borderColor || "#d4d4d4"}
                onChange={(e) => setBorderColor(e.target.value)}
                className="w-5 h-5 cursor-pointer border-0 p-0"
                title="Custom color"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
          <button onClick={close} className="ui-btn ui-btn-secondary">Cancel</button>
          <button onClick={handleSave} className="ui-btn ui-btn-primary">Apply</button>
        </div>
      </div>
    </div>
  );
}

function RoomDistancesSection({
  roomId,
  nodes,
  roomDistances,
  unit,
  setRoomDistance,
}: {
  roomId: string;
  nodes: SchematicNode[];
  roomDistances: Record<string, number> | undefined;
  unit: DistanceSettings["unit"];
  setRoomDistance: (a: string, b: string, distance: number | undefined) => void;
}) {
  const topLevel = isTopLevelRoom(roomId, nodes);
  const ancestorId = useMemo(() => getTopLevelRoomId(roomId, nodes), [roomId, nodes]);
  const others = useMemo(
    () => listTopLevelRooms(nodes).filter((r) => r.id !== (topLevel ? roomId : ancestorId)),
    [nodes, roomId, topLevel, ancestorId],
  );

  if (!topLevel) {
    const ancestorLabel =
      ancestorId
        ? (nodes.find((n) => n.id === ancestorId)?.data as RoomData | undefined)?.label ?? "parent room"
        : "parent room";
    return (
      <div>
        <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
          Distances
        </label>
        <p className="text-[11px] text-[var(--color-text-muted)]">
          Inherited from the top-level room ({ancestorLabel}). Edit distances on that room or in Reports &rsaquo; Room Distances.
        </p>
      </div>
    );
  }

  if (others.length === 0) {
    return (
      <div>
        <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
          Distances
        </label>
        <p className="text-[11px] text-[var(--color-text-muted)]">
          Add another top-level room to set a distance.
        </p>
      </div>
    );
  }

  const inputClass =
    "bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500 w-20 text-right";

  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
        Distances ({unit})
      </label>
      <div className="space-y-1 max-h-[160px] overflow-y-auto pr-1">
        {others.map((r) => {
          const key = pairKey(roomId, r.id);
          const current = roomDistances?.[key];
          return (
            <div key={r.id} className="flex items-center justify-between gap-2 py-0.5">
              <span className="text-xs text-[var(--color-text)] flex-1 truncate" title={r.label}>
                {r.label}
              </span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={current ?? ""}
                placeholder="—"
                onChange={(e) => {
                  const raw = e.target.value;
                  const value = raw === "" ? undefined : Number(raw);
                  setRoomDistance(roomId, r.id, value);
                }}
                className={inputClass}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

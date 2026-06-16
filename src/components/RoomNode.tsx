import { memo, useState, useCallback, useRef, useEffect } from "react";
import { NodeResizer, useStore, type NodeProps } from "@xyflow/react";
import type { RoomNode as RoomNodeType, SchematicNode } from "../types";
import { useSchematicStore } from "../store";
import { computeResizeSnap } from "../snapUtils";
import {
  shapeToPx,
  polygonPointsAttr,
  edgeLengthsM,
  edgeMidpointsPx,
  insertVertex,
  removeVertex,
  clampPoint,
  calibrateRoomScale,
  type ShapePoint,
} from "../roomShape";

function RackIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="5" rx="1" />
      <rect x="2" y="9" width="20" height="5" rx="1" />
      <rect x="2" y="16" width="20" height="5" rx="1" />
      <line x1="6" y1="4.5" x2="6" y2="4.5" strokeWidth="3" />
      <line x1="6" y1="11.5" x2="6" y2="11.5" strokeWidth="3" />
      <line x1="6" y1="18.5" x2="6" y2="18.5" strokeWidth="3" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

const DASH_BY_STYLE: Record<string, string | undefined> = {
  dashed: "8 6",
  dotted: "2 4",
  solid: undefined,
};

/** One editable room-edge measurement: position, label text, the edge's pixel length
 *  (for scale calibration), the current value in metres, and whether it is a "set length"
 *  placeholder shown before the room has a real-world scale. */
interface DimLabel {
  x: number;
  y: number;
  text: string;
  edgePx: number;
  meters: number;
  placeholder?: boolean;
}

/** Small measurement tag on a room edge, e.g. "6.5 m". Clickable (when `onEdit` is set)
 *  to calibrate that wall to an exact length. */
function DimTag({
  x,
  y,
  text,
  onEdit,
  placeholder,
}: {
  x: number;
  y: number;
  text: string;
  onEdit?: () => void;
  placeholder?: boolean;
}) {
  const interactive = !!onEdit;
  return (
    <div
      className={`absolute text-[9px] leading-none px-1 py-0.5 rounded border tabular-nums whitespace-nowrap ${
        interactive ? "nodrag cursor-pointer" : ""
      } ${placeholder ? "border-dashed" : ""}`}
      style={{
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        pointerEvents: interactive ? "auto" : "none",
        background: "var(--color-bg)",
        borderColor: placeholder
          ? "var(--color-accent)"
          : "color-mix(in srgb, var(--color-border) 40%, transparent)",
        color: placeholder ? "var(--color-accent)" : "var(--color-text-muted)",
      }}
      title={interactive ? "Click to set this wall's length (metres)" : undefined}
      onPointerDown={interactive ? (e) => e.stopPropagation() : undefined}
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              onEdit!();
            }
          : undefined
      }
    >
      {placeholder ? `＋ ${text}` : text}
    </div>
  );
}

/** Inline input shown in place of a DimTag while the user types a wall's exact length. */
function DimInput({
  x,
  y,
  initial,
  onCommit,
  onCancel,
}: {
  x: number;
  y: number;
  initial: string;
  onCommit: (raw: string) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState(initial);
  const done = useRef(false);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    onCommit(val);
  };
  const cancel = () => {
    if (done.current) return;
    done.current = true;
    onCancel();
  };
  return (
    <input
      className="absolute nodrag text-[9px] leading-none px-1 py-0.5 rounded border tabular-nums w-14 outline-none"
      style={{
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        pointerEvents: "auto",
        background: "var(--color-surface-raised)",
        borderColor: "var(--color-accent)",
        color: "var(--color-text)",
      }}
      value={val}
      autoFocus
      inputMode="decimal"
      placeholder="m"
      onChange={(e) => setVal(e.target.value)}
      onFocus={(e) => e.target.select()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") cancel();
      }}
    />
  );
}

function RoomNodeComponent({ id, data, selected, width, height }: NodeProps<RoomNodeType>) {
  const updateRoomLabel = useSchematicStore((s) => s.updateRoomLabel);
  const toggleRoomLock = useSchematicStore((s) => s.toggleRoomLock);
  const setResizeGuides = useSchematicStore((s) => s.setResizeGuides);
  const onRoomResizeEnd = useSchematicStore((s) => s.onRoomResizeEnd);
  const isSubroom = useSchematicStore((s) => !!s.nodes.find((n) => n.id === id)?.parentId);
  const isEditingShape = useSchematicStore((s) => s.editingRoomShapeId === id);
  const updateRoomShape = useSchematicStore((s) => s.updateRoomShape);
  const setEditingRoomShape = useSchematicStore((s) => s.setEditingRoomShape);
  const updateRoom = useSchematicStore((s) => s.updateRoom);
  const zoom = useStore((s) => s.transform[2]);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(data.label);
  const [editingDim, setEditingDim] = useState<number | null>(null);

  const locked = data.locked ?? false;
  const w = width ?? 200;
  const h = height ?? 150;

  // Exit shape editing with Escape
  useEffect(() => {
    if (!isEditingShape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditingRoomShape(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isEditingShape, setEditingRoomShape]);

  const handleResize = useCallback(
    (_event: unknown, params: { x: number; y: number; width: number; height: number; direction: number[] }) => {
      const state = useSchematicStore.getState();
      const snap = computeResizeSnap(id, params, params.direction, state.nodes as SchematicNode[]);
      setResizeGuides(snap.guides);

      // If snap adjusted the position/size, override what React Flow set
      if (snap.x !== params.x || snap.y !== params.y || snap.width !== params.width || snap.height !== params.height) {
        const updated = state.nodes.map((n) =>
          n.id === id
            ? { ...n, position: { x: snap.x, y: snap.y }, style: { ...n.style, width: snap.width, height: snap.height } }
            : n,
        );
        useSchematicStore.setState({ nodes: updated as SchematicNode[] });
      }
    },
    [id, setResizeGuides],
  );

  const handleResizeEnd = useCallback(() => {
    setResizeGuides([]);
    onRoomResizeEnd(id);
  }, [id, setResizeGuides, onRoomResizeEnd]);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== data.label) updateRoomLabel(id, trimmed);
    else setValue(data.label);
    setEditing(false);
  };

  // ── Vertex dragging (shape edit mode) ──────────────────────────
  const dragRef = useRef<{ index: number; startX: number; startY: number; startShape: ShapePoint[]; moved: boolean } | null>(null);

  const onVertexPointerDown = useCallback(
    (e: React.PointerEvent, index: number) => {
      e.stopPropagation();
      e.preventDefault();
      const shape = (data.shape ?? []) as ShapePoint[];
      dragRef.current = { index, startX: e.clientX, startY: e.clientY, startShape: shape.map((p) => ({ ...p })), moved: false };
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [data.shape],
  );

  const onVertexPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dxPx = (e.clientX - drag.startX) / zoom;
      const dyPx = (e.clientY - drag.startY) / zoom;
      const start = drag.startShape[drag.index];
      const next = drag.startShape.map((p, i) =>
        i === drag.index ? clampPoint({ x: start.x + dxPx / w, y: start.y + dyPx / h }) : p,
      );
      updateRoomShape(id, next, !drag.moved); // record undo once, on first movement
      drag.moved = true;
    },
    [id, zoom, w, h, updateRoomShape],
  );

  const onVertexPointerUp = useCallback(() => {
    if (dragRef.current?.moved) useSchematicStore.getState().saveToLocalStorage();
    dragRef.current = null;
  }, []);

  // Calibrate the room's real-world scale by setting one wall to an exact metre length.
  const commitDim = useCallback(
    (edgePx: number, raw: string) => {
      setEditingDim(null);
      const targetM = parseFloat(raw);
      if (!(targetM > 0)) return;
      const cal = calibrateRoomScale(w, h, edgePx, targetM);
      if (!cal) return;
      updateRoom(id, {
        ...data,
        widthM: Math.round(cal.widthM * 100) / 100,
        depthM: Math.round(cal.depthM * 100) / 100,
      });
    },
    [w, h, id, data, updateRoom],
  );

  const isRack = data.isEquipmentRack ?? false;
  const borderStyleVal = isRack ? "solid" : (data.borderStyle ?? (isSubroom ? "solid" : "dashed"));
  const borderColorVal = selected ? undefined : data.borderColor;
  const bgColor = data.color;
  // Subrooms use a slightly more opaque background so they read as distinct zones
  const bgAlpha = isSubroom ? "33" : "1a"; // 20% vs 10% opacity
  const fontSize = data.labelSize ?? 12;

  const shape = (data.shape && data.shape.length >= 3 ? data.shape : null) as ShapePoint[] | null;
  const shapePx = shape ? shapeToPx(shape, w, h) : null;
  const strokeColor = selected
    ? "#60a5fa"
    : borderColorVal || (isRack ? "#6b7280" : "var(--color-border)");
  const fillColor = bgColor
    ? `${bgColor}${bgAlpha}`
    : isRack
      ? "rgba(55,65,81,0.12)"
      : "rgba(var(--color-surface-rgb, 245,245,245),0.3)";

  // Edge measurement labels (need a real-world scale → widthM). Each is click-to-edit:
  // setting a wall's length recalibrates the room's uniform scale. When no scale is set
  // yet, a selected room shows two "＋ set" placeholders to establish the scale in-canvas.
  const showDims = !!data.widthM && data.widthM > 0;
  const dimLabels: DimLabel[] = [];
  if (showDims) {
    if (shape && shapePx) {
      const lengths = edgeLengthsM(shape, w, h, data.widthM!);
      for (let i = 0; i < shapePx.length; i++) {
        const p = shapePx[i];
        const q = shapePx[(i + 1) % shapePx.length];
        dimLabels.push({
          x: (p.x + q.x) / 2,
          y: (p.y + q.y) / 2,
          text: `${lengths[i].toFixed(1)} m`,
          edgePx: Math.hypot(q.x - p.x, q.y - p.y),
          meters: lengths[i],
        });
      }
    } else {
      const depth = data.depthM ?? (data.widthM! * h) / w;
      dimLabels.push({ x: w / 2, y: h, text: `${data.widthM!.toFixed(1)} m`, edgePx: w, meters: data.widthM! });
      dimLabels.push({ x: w, y: h / 2, text: `${depth.toFixed(1)} m`, edgePx: h, meters: depth });
    }
  } else if (selected && !locked && !isEditingShape) {
    dimLabels.push({ x: w / 2, y: h, text: "set width", edgePx: w, meters: 0, placeholder: true });
    dimLabels.push({ x: w, y: h / 2, text: "set depth", edgePx: h, meters: 0, placeholder: true });
  }

  return (
    <>
      <NodeResizer
        isVisible={selected && !locked && !isEditingShape}
        minWidth={200}
        minHeight={150}
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
        lineStyle={{ borderColor: "var(--color-border)" }}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, backgroundColor: "var(--color-border)" }}
      />
      <div
        className={`w-full h-full ${shape ? "" : "rounded-lg border-2"} ${
          !shape && selected ? "border-blue-400" : ""
        }`}
        style={{
          pointerEvents: "none",
          ...(shape
            ? {}
            : {
                borderStyle: borderStyleVal,
                ...(!selected ? { borderColor: borderColorVal || (isRack ? "#6b7280" : "var(--color-border)") } : {}),
                backgroundColor: fillColor === "rgba(var(--color-surface-rgb, 245,245,245),0.3)" && selected
                  ? "rgba(239,246,255,0.3)"
                  : fillColor,
              }),
        }}
      >
        {/* Custom floor-plan outline */}
        {shape && shapePx && (
          <svg className="absolute inset-0 w-full h-full" style={{ overflow: "visible", pointerEvents: "none" }}>
            <polygon
              points={polygonPointsAttr(shapePx)}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={2}
              strokeDasharray={DASH_BY_STYLE[borderStyleVal]}
              strokeLinejoin="round"
            />
            {isEditingShape && (
              <>
                {/* Add-vertex handles at edge midpoints */}
                {edgeMidpointsPx(shapePx).map((mid, i) => (
                  <rect
                    key={`mid-${i}`}
                    className="nodrag"
                    x={mid.x - 4}
                    y={mid.y - 4}
                    width={8}
                    height={8}
                    rx={2}
                    fill="var(--color-surface-raised)"
                    stroke="var(--color-accent)"
                    strokeWidth={1.5}
                    style={{ pointerEvents: "auto", cursor: "copy" }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      updateRoomShape(id, insertVertex(shape, i), true);
                    }}
                  >
                    <title>Click to add a corner</title>
                  </rect>
                ))}
                {/* Draggable vertices */}
                {shapePx.map((p, i) => (
                  <circle
                    key={`v-${i}`}
                    className="nodrag"
                    cx={p.x}
                    cy={p.y}
                    r={6}
                    fill="var(--color-accent)"
                    stroke="var(--color-surface-raised)"
                    strokeWidth={2}
                    style={{ pointerEvents: "auto", cursor: "grab", touchAction: "none" }}
                    onPointerDown={(e) => onVertexPointerDown(e, i)}
                    onPointerMove={onVertexPointerMove}
                    onPointerUp={onVertexPointerUp}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      updateRoomShape(id, removeVertex(shape, i), true);
                    }}
                  >
                    <title>Drag to move · double-click to remove</title>
                  </circle>
                ))}
              </>
            )}
          </svg>
        )}

        {/* Edge measurements — click to calibrate the wall to an exact length */}
        {dimLabels.map((d, i) =>
          editingDim === i && !locked && !isEditingShape ? (
            <DimInput
              key={i}
              x={d.x}
              y={d.y}
              initial={d.placeholder ? "" : String(Math.round(d.meters * 100) / 100)}
              onCommit={(raw) => commitDim(d.edgePx, raw)}
              onCancel={() => setEditingDim(null)}
            />
          ) : (
            <DimTag
              key={i}
              x={d.x}
              y={d.y}
              text={d.text}
              placeholder={d.placeholder}
              onEdit={!locked && !isEditingShape ? () => setEditingDim(i) : undefined}
            />
          ),
        )}

        {/* Shape-editing toolbar */}
        {isEditingShape && (
          <div
            className="absolute left-1/2 -top-9 -translate-x-1/2 flex items-center gap-1 chrome-menu !p-1"
            style={{ pointerEvents: "auto" }}
          >
            <span className="text-[10px] text-[var(--color-text-muted)] px-1.5 whitespace-nowrap">
              Drag corners · click □ to add · 2×click to remove
            </span>
            <button
              className="nodrag text-[10px] font-semibold px-2 py-1 rounded-md bg-[var(--color-accent)] text-white cursor-pointer"
              onClick={(e) => { e.stopPropagation(); setEditingRoomShape(null); }}
            >
              Done
            </button>
          </div>
        )}

        <div
          className="absolute top-0 left-0 px-2 py-1"
          style={{ pointerEvents: "auto" }}
          onContextMenu={(e) => {
            if (!locked) return; // unlocked rooms use React Flow's onNodeContextMenu
            e.preventDefault();
            e.stopPropagation();
            useSchematicStore.setState({
              roomContextMenu: { nodeId: id, screenX: e.clientX, screenY: e.clientY },
            });
          }}
        >
          {editing ? (
            <input
              className="font-semibold text-[var(--color-text-muted)] bg-[var(--color-surface-raised)] border border-[var(--ui-border-strong)] rounded px-1 outline-none"
              style={{ fontSize }}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") commit();
                if (e.key === "Escape") { setValue(data.label); setEditing(false); }
              }}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="font-semibold uppercase tracking-wide cursor-text select-none flex items-center gap-1"
              style={{ fontSize, color: borderColorVal || (isRack ? "#374151" : "var(--color-text-muted)") }}
              onDoubleClick={() => { setValue(data.label); setEditing(true); }}
            >
              {isRack && <RackIcon />}
              {data.label}
              {(data.widthM || data.depthM || data.heightM) && (
                <span className="normal-case tracking-normal font-normal opacity-70" style={{ fontSize: Math.max(9, fontSize - 3) }}>
                  {data.widthM ?? "?"} × {data.depthM ?? "?"}
                  {data.heightM ? ` × h${data.heightM}` : ""} m
                </span>
              )}
            </span>
          )}
        </div>
        {/* Lock toggle — top-right corner */}
        <div
          className="absolute top-0 right-0 px-1.5 py-1 transition-opacity"
          style={{
            pointerEvents: "auto",
            opacity: locked ? 1 : selected ? 0.6 : 0,
          }}
          onContextMenu={(e) => {
            if (!locked) return;
            e.preventDefault();
            e.stopPropagation();
            useSchematicStore.setState({
              roomContextMenu: { nodeId: id, screenX: e.clientX, screenY: e.clientY },
            });
          }}
        >
          <button
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              toggleRoomLock(id);
            }}
            title={locked ? "Unlock room" : "Lock room"}
          >
            {locked ? <LockIcon /> : <UnlockIcon />}
          </button>
        </div>
      </div>
    </>
  );
}

export default memo(RoomNodeComponent);

import { memo, useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useStore, type NodeProps } from "@xyflow/react";
import type { DimensionNode as DimensionNodeType } from "../types";
import { useSchematicStore } from "../store";
import { pxToMeters } from "../layoutScale";

const METRES_PER_FOOT = 0.3048;
/** Half-length (px) of the architectural end ticks. */
const TICK = 5;
/** Transparent hit-line width (px) so the thin ruler is easy to grab/select. */
const HIT_W = 14;
/** Endpoint drag-handle radius (px). */
const HANDLE_R = 6;

/** Format a pixel length as a real-world distance at the document scale. */
function formatDistance(lengthPx: number, metresPerPixel: number, unit: "m" | "ft"): string {
  const metres = pxToMeters(lengthPx, metresPerPixel);
  if (unit === "ft") {
    const feet = metres / METRES_PER_FOOT;
    return `${feet.toFixed(feet < 10 ? 2 : 1)} ft`;
  }
  if (metres < 1) return `${Math.round(metres * 1000)} mm`;
  return `${metres.toFixed(2)} m`;
}

/**
 * A free measured ruler / dimension line drawn anywhere on the canvas — Schematic OR
 * Layout view. Endpoint A is the node origin (0,0); endpoint B is `data.(dx,dy)` in flow
 * pixels. The on-line label reports the real-world distance at the document scale
 * (`gridSettings.metresPerPixel` + `layoutGridUnit`), so it stays accurate as the diagram
 * is scaled. Drag the line to move the whole ruler; drag an endpoint to re-measure.
 *
 * Carries no ports/connections — excluded from the pack list, validation and reports like
 * notes/annotations.
 */
function DimensionNodeComponent({ id, data, selected }: NodeProps<DimensionNodeType>) {
  const metresPerPixel = useSchematicStore((s) => s.gridSettings.metresPerPixel);
  const unit = useSchematicStore((s) => s.gridSettings.layoutGridUnit);
  const updateDimension = useSchematicStore((s) => s.updateDimension);
  const saveToLocalStorage = useSchematicStore((s) => s.saveToLocalStorage);
  const zoom = useStore((s) => s.transform[2]);

  const dx = data.dx;
  const dy = data.dy;
  const len = Math.hypot(dx, dy) || 1;
  // Perpendicular unit vector for the end ticks.
  const perpX = -dy / len;
  const perpY = dx / len;
  const label = formatDistance(len, metresPerPixel, unit);
  const stroke = selected ? "var(--color-accent)" : (data.color ?? "var(--color-accent)");

  // SVG sized to the line's bounding box so the hit-line is reliably hit-tested (a 0×0 SVG
  // with overflow:visible does not always receive pointer events on overflowing geometry).
  const minX = Math.min(0, dx);
  const minY = Math.min(0, dy);
  const boxW = Math.max(Math.abs(dx), 1);
  const boxH = Math.max(Math.abs(dy), 1);
  const ax = -minX;
  const ay = -minY;
  const bx = dx - minX;
  const by = dy - minY;

  const dragRef = useRef<{
    end: "a" | "b";
    startX: number;
    startY: number;
    startPos: { x: number; y: number };
    startDx: number;
    startDy: number;
    moved: boolean;
  } | null>(null);

  const onHandleDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, end: "a" | "b") => {
      e.stopPropagation();
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const node = useSchematicStore.getState().nodes.find((n) => n.id === id);
      const pos = node?.position ?? { x: 0, y: 0 };
      dragRef.current = {
        end,
        startX: e.clientX,
        startY: e.clientY,
        startPos: { ...pos },
        startDx: dx,
        startDy: dy,
        moved: false,
      };
    },
    [id, dx, dy],
  );

  const onHandleMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const fdx = (e.clientX - drag.startX) / zoom;
      const fdy = (e.clientY - drag.startY) / zoom;
      if (drag.end === "b") {
        updateDimension(id, { dx: drag.startDx + fdx, dy: drag.startDy + fdy }, !drag.moved);
      } else {
        // Move endpoint A: shift the node origin, keep B fixed by compensating dx/dy.
        updateDimension(
          id,
          {
            position: { x: drag.startPos.x + fdx, y: drag.startPos.y + fdy },
            dx: drag.startDx - fdx,
            dy: drag.startDy - fdy,
          },
          !drag.moved,
        );
      }
      drag.moved = true;
    },
    [id, zoom, updateDimension],
  );

  const onHandleUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      const moved = dragRef.current.moved;
      dragRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      if (moved) saveToLocalStorage();
    },
    [saveToLocalStorage],
  );

  return (
    <div style={{ position: "relative", width: 0, height: 0 }}>
      <svg width={boxW} height={boxH} style={{ position: "absolute", left: minX, top: minY, overflow: "visible" }}>
        {/* Wide transparent hit line — drag to move the whole ruler, click to select. */}
        <line x1={ax} y1={ay} x2={bx} y2={by} stroke="transparent" strokeWidth={HIT_W} strokeLinecap="round" style={{ cursor: "move" }} />
        {/* The measure line. */}
        <line x1={ax} y1={ay} x2={bx} y2={by} stroke={stroke} strokeWidth={1.5} pointerEvents="none" />
        {/* Perpendicular end ticks. */}
        <line x1={ax - perpX * TICK} y1={ay - perpY * TICK} x2={ax + perpX * TICK} y2={ay + perpY * TICK} stroke={stroke} strokeWidth={1.5} pointerEvents="none" />
        <line x1={bx - perpX * TICK} y1={by - perpY * TICK} x2={bx + perpX * TICK} y2={by + perpY * TICK} stroke={stroke} strokeWidth={1.5} pointerEvents="none" />
      </svg>
      {/* Distance label chip — centred on the line midpoint, upright. */}
      <div
        style={{
          position: "absolute",
          left: dx / 2,
          top: dy / 2,
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
          padding: "1px 5px",
          borderRadius: 4,
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          lineHeight: 1.2,
          whiteSpace: "nowrap",
          background: "var(--color-bg)",
          color: selected ? "var(--color-accent)" : "var(--color-text)",
          border: `1px solid ${selected ? "var(--color-accent)" : "color-mix(in srgb, var(--color-border) 50%, transparent)"}`,
        }}
      >
        {label}
      </div>
      {/* Endpoint handles (selected) — drag to re-measure. */}
      {selected &&
        ([
          ["a", 0, 0],
          ["b", dx, dy],
        ] as const).map(([end, hx, hy]) => (
          <div
            key={end}
            className="nodrag nopan"
            title="Drag to move this end"
            onPointerDown={(e) => onHandleDown(e, end)}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            style={{
              position: "absolute",
              left: hx - HANDLE_R,
              top: hy - HANDLE_R,
              width: HANDLE_R * 2,
              height: HANDLE_R * 2,
              borderRadius: "50%",
              background: "var(--color-surface)",
              border: "2px solid var(--color-accent)",
              cursor: "crosshair",
              touchAction: "none",
              zIndex: 2,
            }}
          />
        ))}
    </div>
  );
}

export default memo(DimensionNodeComponent);

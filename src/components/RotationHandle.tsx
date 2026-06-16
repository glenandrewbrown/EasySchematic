import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";

/**
 * Shared rotation overlay for a to-scale Layout node (device footprint, furniture
 * object). Draws a thin 360° accent ring around the node plus a draggable handle
 * dot at the top; dragging the dot aims the node toward the pointer.
 *
 * Pure presentational — it owns no store state. The host wires `onRotate` (called
 * live during the drag) and optional `onCommit` (called once on pointer-up, e.g.
 * to push one undo entry / autosave). Angle convention matches the Layout view:
 * 0° = +x (right), 90° = down, clockwise, screen-space y growing down. The handle
 * sits at the top (−90° / straight up) when `rotationDeg` is 0.
 *
 * Hold Shift while dragging to snap the angle to 15° increments.
 */

/** Padding (px) between the node's bounding box and the rotation ring. */
const RING_GAP_PX = 8;
/** Radius (px) of the draggable handle dot. */
const HANDLE_R_PX = 6;
/** Snap increment (deg) applied while Shift is held. */
const SNAP_DEG = 15;

interface RotationHandleProps {
  /** Rendered node width in px (the box the ring encircles). */
  boxW: number;
  /** Rendered node height in px. */
  boxH: number;
  /** Current rotation in degrees (Layout-view convention; see file docs). */
  rotationDeg: number;
  /** Called live with the new angle (deg, [0, 360)) as the handle is dragged. */
  onRotate: (deg: number) => void;
  /** Called once on pointer-up with the final angle (deg). */
  onCommit?: (deg: number) => void;
}

/** Wrap an angle (deg) into [0, 360), avoiding -0. */
function wrap360(deg: number): number {
  return (((deg % 360) + 360) % 360);
}

export default function RotationHandle({ boxW, boxH, rotationDeg, onRotate, onCommit }: RotationHandleProps) {
  // Ring radius from the node centre. Use the larger half-extent so the ring clears
  // a non-square footprint on every side.
  const radius = Math.max(boxW, boxH) / 2 + RING_GAP_PX;
  const cx = boxW / 2;
  const cy = boxH / 2;

  // The overlay SVG is sized 0×0 with overflow visible (like DevicePlanNode's aim
  // overlay) so it never affects layout; geometry is drawn relative to the centre.
  const angleRad = (rotationDeg * Math.PI) / 180;
  const handleX = cx + radius * Math.cos(angleRad);
  const handleY = cy + radius * Math.sin(angleRad);

  const rootRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const lastAngleRef = useRef(rotationDeg);

  const angleFromPointer = useCallback(
    (clientX: number, clientY: number, snap: boolean): number => {
      const el = rootRef.current;
      if (!el) return rotationDeg;
      const r = el.getBoundingClientRect();
      const dx = clientX - (r.left + r.width / 2);
      const dy = clientY - (r.top + r.height / 2);
      const raw = wrap360((Math.atan2(dy, dx) * 180) / Math.PI);
      return snap ? wrap360(Math.round(raw / SNAP_DEG) * SNAP_DEG) : raw;
    },
    [rotationDeg],
  );

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const next = angleFromPointer(e.clientX, e.clientY, e.shiftKey);
      lastAngleRef.current = next;
      onRotate(next);
    },
    [angleFromPointer, onRotate],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      onCommit?.(lastAngleRef.current);
    },
    [onCommit],
  );

  return (
    <div ref={rootRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <svg
        width={0}
        height={0}
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
      >
        {/* Rotation ring */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="var(--color-accent)"
          strokeOpacity={0.4}
          strokeWidth={1}
        />
        {/* Spoke from centre to the handle, showing the current aim */}
        <line
          x1={cx}
          y1={cy}
          x2={handleX}
          y2={handleY}
          stroke="var(--color-accent)"
          strokeOpacity={0.5}
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      </svg>
      {/* Draggable handle dot */}
      <div
        className="nodrag nopan"
        title="Drag to rotate (hold Shift to snap to 15°)"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          position: "absolute",
          left: handleX - HANDLE_R_PX,
          top: handleY - HANDLE_R_PX,
          width: HANDLE_R_PX * 2,
          height: HANDLE_R_PX * 2,
          borderRadius: "50%",
          background: "var(--color-surface-raised)",
          border: "2px solid var(--color-accent)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
          cursor: "grab",
          pointerEvents: "auto",
          touchAction: "none",
        }}
      />
    </div>
  );
}

import { memo, useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useStore, type NodeProps } from "@xyflow/react";
import type { DeviceNode as DeviceNodeType, RoomData } from "../types";
import { useSchematicStore } from "../store";
import { resolveDeviceLabel } from "../displayName";
import { useDisplayLabel } from "../labelCaseUtils";
import { deviceFootprintPx, planScalePxPerMeter, normalizeRotationDeg, aimAngleDeg } from "../planView";
import { coverageRadiusM, wedgeGeometry } from "../speakerCoverage";
import { isSpeaker, resolveSpeakerSpec } from "../speakerSpec";
import { symbolForDeviceType } from "../symbols";

/** Smallest rendered footprint side (px) so tiny to-scale devices stay clickable. */
const MIN_FOOTPRINT_PX = 8;
/** Footprint must be at least this wide/tall (px) before the device label is drawn. */
const LABEL_VISIBLE_PX = 22;
/** Assumed ceiling height (m) when a room has none set, for the coverage radius. */
const DEFAULT_CEILING_M = 3;
/** Listener ear-plane height (m) used for the coverage radius. */
const LISTENER_PLANE_M = 1.2;

/**
 * To-scale plan (top-down) representation of a device. Rendered by DeviceNodeDispatch
 * when the canvas is in "plan" view. The footprint is the device's physical width × depth
 * scaled by the parent room's real-world scale (px per metre). When the room has no real
 * width or the device has no dimensions, a dashed fallback icon box is shown instead.
 *
 * DeviceNode.tsx (the schematic representation, with its load-bearing 20px port grid) is
 * intentionally left untouched — this is a separate component, mirroring RackRenderer's
 * view-mode split.
 */
function DevicePlanNodeComponent({ id, data, selected }: NodeProps<DeviceNodeType>) {
  // Parent room's rendered pixel width + real-world width, read from React Flow's measured
  // geometry so the footprint tracks live room resizing. Primitive selectors keep re-renders tight.
  const roomWidthPx = useStore((s) => {
    const me = s.nodeLookup.get(id);
    const parent = me?.parentId ? s.nodeLookup.get(me.parentId) : undefined;
    return parent?.measured?.width ?? 0;
  });
  const roomWidthM = useStore((s) => {
    const me = s.nodeLookup.get(id);
    const parent = me?.parentId ? s.nodeLookup.get(me.parentId) : undefined;
    const wm = (parent?.data as RoomData | undefined)?.widthM;
    return typeof wm === "number" && wm > 0 ? wm : 0;
  });
  const roomHeightM = useStore((s) => {
    const me = s.nodeLookup.get(id);
    const parent = me?.parentId ? s.nodeLookup.get(me.parentId) : undefined;
    const hm = (parent?.data as RoomData | undefined)?.heightM;
    return typeof hm === "number" && hm > 0 ? hm : 0;
  });

  const setEditingNodeId = useSchematicStore((s) => s.setEditingNodeId);
  const useShortNames = useSchematicStore((s) => s.useShortNames);
  const wrapDeviceLabels = useSchematicStore((s) => s.wrapDeviceLabels);
  const displayLabel = useDisplayLabel();
  const coverageVisible = useSchematicStore((s) => s.coverageVisible);
  const setDeviceRotation = useSchematicStore((s) => s.setDeviceRotation);
  const pushSnapshot = useSchematicStore((s) => s.pushSnapshot);
  const saveToLocalStorage = useSchematicStore((s) => s.saveToLocalStorage);

  // Drag-to-aim handle (plan view, selected). Updates rotationDeg transiently while
  // dragging; one undo entry at drag start, one autosave at drag end.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const aimDraggingRef = useRef(false);
  const onAimPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    aimDraggingRef.current = true;
    pushSnapshot();
  }, [pushSnapshot]);
  const onAimPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!aimDraggingRef.current || !wrapperRef.current) return;
    const r = wrapperRef.current.getBoundingClientRect();
    const ang = aimAngleDeg(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    setDeviceRotation(id, ang, false);
  }, [id, setDeviceRotation]);
  const onAimPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!aimDraggingRef.current) return;
    aimDraggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    saveToLocalStorage();
  }, [saveToLocalStorage]);

  const pxPerMeter = planScalePxPerMeter(roomWidthPx, roomWidthM);
  const footprint = deviceFootprintPx({ widthMm: data.widthMm, depthMm: data.depthMm }, pxPerMeter);
  // rotationDeg is placement state added in P3; read via the DeviceData index signature so it
  // slots in without a type change here. Defaults to 0.
  const rotationDeg = normalizeRotationDeg(data.rotationDeg);

  const boxW = Math.max(MIN_FOOTPRINT_PX, footprint.widthPx);
  const boxH = Math.max(MIN_FOOTPRINT_PX, footprint.depthPx);

  const resolved = resolveDeviceLabel(data, { useShortNames, wrapDeviceLabels });
  const label = displayLabel(resolved.text);
  const bg = data.headerColor ?? data.color ?? "#4a90d9";
  const symbol = symbolForDeviceType(data.deviceType);
  const showLabel = Math.min(boxW, boxH) >= LABEL_VISIBLE_PX;
  const fontSize = Math.max(6, Math.min(11, Math.min(boxW, boxH) / 4));

  // Loudspeaker coverage wedge (plan view, "Coverage" toggle on). Nominal direct-field,
  // on-axis (−6 dB) footprint — not a measured SPL guarantee. Aimed along rotationDeg.
  let coverageWedge: string | null = null;
  if (coverageVisible && pxPerMeter != null && isSpeaker(data)) {
    const spec = resolveSpeakerSpec(data);
    const ceilingM = roomHeightM > 0 ? roomHeightM : DEFAULT_CEILING_M;
    const radiusM = coverageRadiusM(ceilingM, LISTENER_PLANE_M, spec.coverageAngleDeg);
    if (radiusM != null && radiusM > 0) {
      const radiusPx = radiusM * pxPerMeter;
      const geom = wedgeGeometry(boxW / 2, boxH / 2, rotationDeg, spec.coverageAngleDeg, radiusPx);
      if (geom) {
        const largeArc = spec.coverageAngleDeg > 180 ? 1 : 0;
        coverageWedge = `M ${geom.apex.x} ${geom.apex.y} L ${geom.left.x} ${geom.left.y} A ${radiusPx} ${radiusPx} 0 ${largeArc} 1 ${geom.right.x} ${geom.right.y} Z`;
      }
    }
  }

  // Aim handle position: a dot offset from the footprint centre along the current aim.
  const aimHandleR = Math.max(boxW, boxH) / 2 + 12;
  const aimRad = (rotationDeg * Math.PI) / 180;
  const aimHx = boxW / 2 + aimHandleR * Math.cos(aimRad);
  const aimHy = boxH / 2 + aimHandleR * Math.sin(aimRad);

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: boxW, height: boxH }}>
      {coverageWedge && (
        <svg
          width={0}
          height={0}
          style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none", zIndex: 0 }}
        >
          <path d={coverageWedge} fill="rgba(56,189,248,0.16)" stroke="rgba(2,132,199,0.5)" strokeWidth={1} />
        </svg>
      )}
      <div
        title={label}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setEditingNodeId(id);
        }}
        style={{
          position: "absolute",
          inset: 0,
          transform: rotationDeg ? `rotate(${rotationDeg}deg)` : undefined,
          background: bg,
        border: footprint.toScale
          ? `1.5px solid ${selected ? "#2563eb" : "rgba(0,0,0,0.55)"}`
          : `1.5px dashed ${selected ? "#2563eb" : "rgba(0,0,0,0.4)"}`,
        boxShadow: selected ? "0 0 0 2px rgba(37,99,235,0.35)" : undefined,
        borderRadius: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        boxSizing: "border-box",
        color: "#fff",
        fontSize,
        fontWeight: 600,
        lineHeight: 1.1,
        textAlign: "center",
        cursor: "grab",
        userSelect: "none",
      }}
    >
      {symbol && Math.min(boxW, boxH) >= 16 ? (
        <svg
          viewBox="0 0 24 24"
          width={Math.min(boxW, boxH) * 0.66}
          height={Math.min(boxW, boxH) * 0.66}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.35))" }}
          // Symbols are hardcoded, app-authored inner-SVG markup (no user input).
          dangerouslySetInnerHTML={{ __html: symbol.svg }}
        />
      ) : showLabel ? (
        <span
          style={{
            padding: "0 2px",
            textShadow: "0 1px 1px rgba(0,0,0,0.4)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "100%",
          }}
        >
          {data.icon ? `${data.icon} ` : ""}
          {label}
        </span>
      ) : data.icon ? (
        <span style={{ fontSize: Math.max(8, Math.min(boxW, boxH) * 0.6) }}>{data.icon}</span>
      ) : null}
      </div>
      {selected && (
        <>
          <svg
            width={0}
            height={0}
            style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none", zIndex: 1 }}
          >
            <line
              x1={boxW / 2}
              y1={boxH / 2}
              x2={aimHx}
              y2={aimHy}
              stroke="#2563eb"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
          </svg>
          <div
            className="nodrag nopan"
            title="Drag to aim / rotate"
            onPointerDown={onAimPointerDown}
            onPointerMove={onAimPointerMove}
            onPointerUp={onAimPointerUp}
            style={{
              position: "absolute",
              left: aimHx - 6,
              top: aimHy - 6,
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: "#fff",
              border: "2px solid #2563eb",
              boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
              cursor: "crosshair",
              zIndex: 2,
              touchAction: "none",
            }}
          />
        </>
      )}
    </div>
  );
}

export default memo(DevicePlanNodeComponent);

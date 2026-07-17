import { memo, useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useStore, type NodeProps } from "@xyflow/react";
import type { DeviceNode as DeviceNodeType, RoomData } from "../types";
import { useSchematicStore } from "../store";
import { resolveDeviceLabel } from "../displayName";
import { useDisplayLabel } from "../labelCaseUtils";
import { deviceFootprintPx, normalizeRotationDeg, aimAngleDeg } from "../planView";
import { pxPerMeter } from "../layoutScale";
import { coverageRadiusM, wedgeGeometry } from "../speakerCoverage";
import { isSpeaker, resolveSpeakerSpec } from "../speakerSpec";
import { deviceClassColor } from "../deviceClassColor";
import { resolveArtworkSvg } from "../deviceArtwork";

/** Smallest rendered footprint side (px) so tiny to-scale devices stay clickable. */
const MIN_FOOTPRINT_PX = 8;
/** Box must be at least this wide/tall (px) before the in-box CAD symbol is drawn. */
const SYMBOL_VISIBLE_PX = 16;
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
  // Document-level Layout scale (metres per pixel) — the single source of truth for the
  // to-scale footprint, replacing the old per-room scale. Coverage ceiling still comes from
  // the parent room's real height below.
  const metresPerPixel = useSchematicStore((s) => s.gridSettings.metresPerPixel);
  const roomHeightM = useStore((s) => {
    const me = s.nodeLookup.get(id);
    const parent = me?.parentId ? s.nodeLookup.get(me.parentId) : undefined;
    const hm = (parent?.data as RoomData | undefined)?.heightM;
    return typeof hm === "number" && hm > 0 ? hm : 0;
  });

  const setEditingNodeId = useSchematicStore((s) => s.setEditingNodeId);
  const useShortNames = useSchematicStore((s) => s.useShortNames);
  const wrapDeviceLabels = useSchematicStore((s) => s.wrapDeviceLabels);
  const svgAssets = useSchematicStore((s) => s.svgAssets);
  const customSvg = data.layoutSvgAssetId ? svgAssets[data.layoutSvgAssetId] : undefined;
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

  const ppm = pxPerMeter(metresPerPixel);
  const footprint = deviceFootprintPx({ widthMm: data.widthMm, depthMm: data.depthMm }, ppm);
  // rotationDeg is placement state added in P3; read via the DeviceData index signature so it
  // slots in without a type change here. Defaults to 0.
  const rotationDeg = normalizeRotationDeg(data.rotationDeg);

  const boxW = Math.max(MIN_FOOTPRINT_PX, footprint.widthPx);
  const boxH = Math.max(MIN_FOOTPRINT_PX, footprint.depthPx);

  const resolved = resolveDeviceLabel(data, { useShortNames, wrapDeviceLabels });
  const label = displayLabel(resolved.text);
  // Class colour: the CAD footprint's hairline border + glyph stroke. Shared deviceClassColor()
  // so the Plan footprint matches the device's schematic node / Insert chip / Inspector hero.
  const cat = deviceClassColor(data.ports);
  // The in-box CAD artwork only renders once the box is large enough to read.
  const showSymbol = Math.min(boxW, boxH) >= SYMBOL_VISIBLE_PX;

  // Loudspeaker coverage wedge (plan view, "Coverage" toggle on). Nominal direct-field,
  // on-axis (−6 dB) footprint — not a measured SPL guarantee. Aimed along rotationDeg.
  let coverageWedge: string | null = null;
  if (coverageVisible && ppm > 0 && isSpeaker(data)) {
    const spec = resolveSpeakerSpec(data);
    const ceilingM = roomHeightM > 0 ? roomHeightM : DEFAULT_CEILING_M;
    const radiusM = coverageRadiusM(ceilingM, LISTENER_PLANE_M, spec.coverageAngleDeg);
    if (radiusM != null && radiusM > 0) {
      const radiusPx = radiusM * ppm;
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
          <defs>
            {/* Teal coverage cone: brightest at the speaker (apex, top of the wedge box),
                fading to transparent at the coverage radius. */}
            <radialGradient id={`cov-${id}`} cx="50%" cy="0%" r="80%">
              <stop offset="0%" stopColor="#2bb8a3" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#2bb8a3" stopOpacity={0} />
            </radialGradient>
          </defs>
          <path d={coverageWedge} fill={`url(#cov-${id})`} stroke="rgba(43,184,163,0.35)" strokeWidth={1} />
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
          background: "var(--color-surface)",
          // CAD footprint: hairline category-coloured outline (dashed when not to-scale).
          border: footprint.toScale ? `1.5px solid ${cat}` : `1.5px dashed ${cat}`,
          boxShadow: selected
            ? "0 0 0 2px color-mix(in srgb, var(--color-accent) 35%, transparent)"
            : undefined,
          borderColor: selected ? "var(--color-accent)" : cat,
          borderRadius: 3,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          boxSizing: "border-box",
          cursor: "grab",
          userSelect: "none",
        }}
      >
        {customSvg ? (
          <div
            style={{ width: "82%", height: "82%", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}
            // Sanitized at import by svgSanitizer (scripts/handlers/external refs stripped) — safe to inject.
            dangerouslySetInnerHTML={{ __html: customSvg }}
          />
        ) : showSymbol ? (
          // Fallback identity: the device's resolved artwork (uploaded SVG or a bundled symbol —
          // both trusted), tinted the class colour at reduced opacity, centred at 60% of the box.
          <div
            className="[&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-full [&>svg]:max-h-full"
            style={{
              width: Math.min(boxW, boxH) * 0.6,
              height: Math.min(boxW, boxH) * 0.6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: cat,
              opacity: 0.6,
              pointerEvents: "none",
            }}
            dangerouslySetInnerHTML={{ __html: resolveArtworkSvg(data.artworkAssetId, svgAssets, data) }}
          />
        ) : null}
      </div>
      {/* Device label, CAD-style below the footprint box (upright — not rotated with the box). */}
      {label && (
        <span
          style={{
            position: "absolute",
            top: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginTop: 2,
            fontFamily: "var(--font-mono)",
            fontSize: 8.5,
            lineHeight: 1.1,
            color: "var(--color-text-muted)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          {label}
        </span>
      )}
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
              stroke="var(--color-accent)"
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
              background: "var(--color-surface)",
              border: "2px solid var(--color-accent)",
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

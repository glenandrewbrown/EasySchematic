import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import type { ObjectNode as ObjectNodeType } from "../types";
import { useSchematicStore } from "../store";
import { normalizeRotationDeg } from "../planView";
import { pxPerMeter } from "../layoutScale";
import { furnitureById } from "../furnitureCatalog";
import RotationHandle from "./RotationHandle";

/**
 * To-scale plan (top-down) representation of a furniture / room object in the
 * Layout view. Mirrors DevicePlanNode's scale approach: the parent room's rendered
 * pixel width and real-world width give pixels-per-metre, and the object's real
 * width × depth (metres) are scaled into a px footprint. When the room has no real
 * scale, a fixed fallback box keeps the object visible and clickable.
 *
 * The graphic is drawn from one of two sources, in priority order:
 *   1. `data.svgAssetId` → the sanitized markup in `svgAssets[id]` (custom upload).
 *   2. `data.catalogId`  → the app-authored inner SVG from FURNITURE_CATALOG.
 * Colour falls back to the catalog default. No port handles. When selected, a
 * RotationHandle is wired to `updateObjectData(id, { rotationDeg })`.
 */

/** Fallback footprint side (px) when the parent room has no real-world scale. */
const FALLBACK_BOX_PX = 44;
/** Smallest rendered side (px) so tiny to-scale objects stay clickable. */
const MIN_BOX_PX = 10;
/** Footprint must be at least this wide/tall (px) before the label is drawn. */
const LABEL_VISIBLE_PX = 28;

function ObjectPlanNodeComponent({ id, data, selected }: NodeProps<ObjectNodeType>) {
  // Document-level Layout scale (metres per pixel) — single source of truth for the
  // to-scale footprint, replacing the old per-room scale.
  const metresPerPixel = useSchematicStore((s) => s.gridSettings.metresPerPixel);

  const updateObjectData = useSchematicStore((s) => s.updateObjectData);
  const setEditingNodeId = useSchematicStore((s) => s.setEditingNodeId);
  const svgMarkup = useSchematicStore((s) =>
    data.svgAssetId ? s.svgAssets[data.svgAssetId] : undefined,
  );

  const catalog = data.catalogId ? furnitureById(data.catalogId) : undefined;
  const widthM = data.widthM ?? catalog?.defaultWidthM;
  const depthM = data.depthM ?? catalog?.defaultDepthM;

  const ppm = pxPerMeter(metresPerPixel);
  const toScale = ppm > 0 && typeof widthM === "number" && widthM > 0;

  // To-scale footprint when we have a document scale and a real width; otherwise a
  // fixed fallback square. Depth falls back to width for a square footprint.
  const boxW = toScale
    ? Math.max(MIN_BOX_PX, widthM! * ppm)
    : FALLBACK_BOX_PX;
  const boxH = toScale
    ? Math.max(MIN_BOX_PX, (depthM ?? widthM!) * ppm)
    : FALLBACK_BOX_PX;

  const rotationDeg = normalizeRotationDeg(data.rotationDeg);
  const fill = data.color ?? catalog?.defaultColor ?? "var(--color-surface-hover)";
  const borderColor = data.borderColor ?? "rgba(0,0,0,0.45)";
  const label = data.label;
  const showLabel = Math.min(boxW, boxH) >= LABEL_VISIBLE_PX;
  const glyphSize = Math.min(boxW, boxH) * 0.72;

  // Resolve the inner-SVG markup once. svgAssetId wins; otherwise the catalog glyph.
  const inlineSvg = svgMarkup ?? catalog?.svg ?? null;

  return (
    <div style={{ position: "relative", width: boxW, height: boxH }}>
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
          background: fill,
          border: toScale
            ? `1.5px solid ${selected ? "var(--color-accent)" : borderColor}`
            : `1.5px dashed ${selected ? "var(--color-accent)" : borderColor}`,
          boxShadow: selected ? "0 0 0 2px var(--color-accent-soft)" : undefined,
          borderRadius: 3,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          boxSizing: "border-box",
          color: "rgba(0,0,0,0.7)",
          cursor: "grab",
          userSelect: "none",
        }}
      >
        {inlineSvg && glyphSize >= 14 ? (
          <svg
            viewBox="0 0 24 24"
            width={glyphSize}
            height={glyphSize}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.2))" }}
            // Safe: svgAssetId markup is sanitized at the store boundary (svgAssets),
            // and catalog svg is hardcoded app-authored markup — neither is user-typed
            // free text. Same pattern as DevicePlanNode's symbol injection.
            dangerouslySetInnerHTML={{ __html: inlineSvg }}
          />
        ) : showLabel ? (
          <span
            style={{
              padding: "0 2px",
              fontSize: Math.max(7, Math.min(11, Math.min(boxW, boxH) / 4)),
              fontWeight: 600,
              lineHeight: 1.1,
              textAlign: "center",
              textShadow: "0 1px 1px rgba(255,255,255,0.35)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "100%",
            }}
          >
            {label}
          </span>
        ) : null}
      </div>
      {selected && (
        <RotationHandle
          boxW={boxW}
          boxH={boxH}
          rotationDeg={rotationDeg}
          onRotate={(deg) => updateObjectData(id, { rotationDeg: deg })}
          onCommit={(deg) => updateObjectData(id, { rotationDeg: deg })}
        />
      )}
    </div>
  );
}

export default memo(ObjectPlanNodeComponent);

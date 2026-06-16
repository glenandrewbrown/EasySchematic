import { memo } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { ZoneNode as ZoneNodeType } from "../types";
import { shapeToPx, polygonPointsAttr, type ShapePoint } from "../roomShape";

/**
 * Colour-coded zone region for the to-scale Layout view (acoustic areas, seating
 * sections, purpose zones). Rendered as a translucent tinted fill that sits BENEATH
 * rooms and devices (low zIndex), carrying no physical-scale meaning.
 *
 * When `data.shape` (a normalized 0..1 polygon, same schema as RoomData.shape) is
 * present it draws an absolutely-positioned <svg><polygon> like RoomNode; otherwise
 * a plain filled rectangle. A NodeResizer (visible when selected) lets the zone be
 * sized. The label is shown small in the top-left corner. No port handles.
 *
 * Editing of zone colour/label lives in the Inspector, not here — double-clicking a
 * zone simply selects it (keeping the label visible) so it can be edited there.
 */

/** Below rooms/devices but above the canvas background. Rooms/devices use the default (0+). */
const ZONE_Z_INDEX = -1;
/** Fallback border tint mixed from the fill when no explicit borderColor is set. */
const BORDER_MIX = "color-mix(in srgb, var(--zone-fill) 70%, #000)";

function ZoneNodeComponent({ data, selected, width, height }: NodeProps<ZoneNodeType>) {
  const w = width ?? 240;
  const h = height ?? 160;

  const fill = data.color;
  const stroke = selected ? "var(--color-accent)" : data.borderColor ?? BORDER_MIX;

  // Custom polygon outline (normalized 0..1), mirroring RoomNode. Needs >= 3 points.
  const shape = (data.shape && data.shape.length >= 3 ? data.shape : null) as ShapePoint[] | null;
  const shapePx = shape ? shapeToPx(shape, w, h) : null;

  return (
    <div
      // The zone is a presentation-only region; it must not intercept pointer events
      // meant for the rooms/devices stacked above it. The label gets pointer events
      // back so it stays hoverable/selectable.
      style={{ position: "relative", width: w, height: h, zIndex: ZONE_Z_INDEX, pointerEvents: "none" }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={80}
        minHeight={60}
        lineStyle={{ borderColor: "var(--color-accent)" }}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, backgroundColor: "var(--color-accent)" }}
      />

      {shape && shapePx ? (
        <svg
          className="absolute inset-0 w-full h-full"
          style={{ overflow: "visible", pointerEvents: "none", ["--zone-fill" as string]: fill }}
        >
          <polygon
            points={polygonPointsAttr(shapePx)}
            fill={fill}
            stroke={stroke}
            strokeWidth={selected ? 2 : 1.5}
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <div
          className="absolute inset-0 rounded-md"
          style={{
            background: fill,
            border: `${selected ? 2 : 1.5}px solid ${stroke}`,
            ["--zone-fill" as string]: fill,
          }}
        />
      )}

      <span
        className="absolute top-1 left-1.5 text-[10px] font-medium uppercase tracking-wide select-none truncate max-w-[calc(100%-12px)]"
        style={{
          pointerEvents: "auto",
          color: data.borderColor ?? "var(--color-text-muted)",
        }}
        title={data.label}
      >
        {data.label}
      </span>
    </div>
  );
}

export default memo(ZoneNodeComponent);

import { useStore } from "@xyflow/react";
import { useSchematicStore } from "../store";
import { pxPerMeter } from "../layoutScale";

/**
 * CAD scale bar for the Layout (plan) view (design — Plan canvas). Renders a graphic
 * scale: three alternating segments inside a hairline frame, plus a mono label of the
 * real-world length the bar spans at the current zoom and a representative drawing-scale
 * ratio. Reads the document scale (`gridSettings.metresPerPixel`) and the live React Flow
 * zoom, so it stays accurate as the user zooms. Pointer-events-none, hidden in print.
 *
 * Mounted in App.tsx only in the Layout view, alongside the other floating canvas chrome,
 * so it lives inside the React Flow provider (required for the zoom subscription).
 */

/** Number of alternating segments drawn in the scale bar. */
const SEGMENTS = 3;
/** Each segment renders this wide (px) — total bar ≈ SEGMENTS × this. */
const SEGMENT_PX = 30;
/** Approx. CSS px per millimetre at 96 dpi — used to derive the 1:X drawing scale. */
const PX_PER_MM = 96 / 25.4;

/** Round a positive metre value to a tidy 1 / 2 / 5 × 10ⁿ step (for the bar's labelled length). */
function niceMeters(value: number): number {
  if (!(value > 0) || !Number.isFinite(value)) return 1;
  const exp = Math.floor(Math.log10(value));
  const pow = Math.pow(10, exp);
  const frac = value / pow;
  const niceFrac = frac < 1.5 ? 1 : frac < 3.5 ? 2 : frac < 7.5 ? 5 : 10;
  return niceFrac * pow;
}

/** Format a metre length without trailing ".0" (e.g. 3, 2.5, 0.5). */
function formatMeters(m: number): string {
  return Number.isInteger(m) ? String(m) : String(Math.round(m * 100) / 100);
}

export default function PlanScaleBar() {
  const metresPerPixel = useSchematicStore((s) => s.gridSettings.metresPerPixel);
  const zoom = useStore((s) => s.transform[2]);

  // On-screen pixels per real-world metre at the current zoom.
  const screenPxPerMeter = pxPerMeter(metresPerPixel) * (zoom || 1);
  if (!(screenPxPerMeter > 0)) return null;

  // Whole bar should be ≈ SEGMENTS × SEGMENT_PX on screen; pick the nearest tidy length.
  const targetMeters = (SEGMENTS * SEGMENT_PX) / screenPxPerMeter;
  const totalMeters = niceMeters(targetMeters);
  const segPx = (totalMeters / SEGMENTS) * screenPxPerMeter;

  // Drawing-scale ratio 1:X — X real-world mm map to 1 screen mm at this zoom.
  const realMmPerScreenPx = (metresPerPixel * 1000) / (zoom || 1);
  const ratioRaw = realMmPerScreenPx * PX_PER_MM;
  const ratio = ratioRaw > 0 && Number.isFinite(ratioRaw) ? Math.max(1, Math.round(ratioRaw)) : null;

  return (
    <div
      data-print-hide
      className="absolute pointer-events-none select-none"
      style={{ left: 16, bottom: 16, zIndex: 10 }}
    >
      <div
        className="flex flex-col gap-1 rounded-md px-2 py-1.5"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--ui-border)",
          boxShadow: "var(--ui-shadow-toolbar)",
        }}
      >
        {/* Alternating graphic scale segments inside a hairline frame */}
        <div
          className="flex"
          style={{ border: "1px solid var(--color-border)", height: 8, width: segPx * SEGMENTS }}
        >
          {Array.from({ length: SEGMENTS }).map((_, i) => (
            <div
              key={i}
              style={{
                width: segPx,
                background: i % 2 === 0 ? "var(--color-text-muted)" : "var(--color-surface-hover)",
                borderRight: i < SEGMENTS - 1 ? "1px solid var(--color-border)" : undefined,
              }}
            />
          ))}
        </div>
        <span
          className="text-[10px] leading-none whitespace-nowrap"
          style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}
        >
          {`0 — ${formatMeters(totalMeters)} m`}
          {ratio != null ? ` · scale 1:${ratio}` : ""}
        </span>
      </div>
    </div>
  );
}

import { useStore, useViewport } from "@xyflow/react";
import { useSchematicStore } from "../store";
import { RULER_T as T, rulerStep, buildRulerTicks } from "../rulerScale";

/**
 * Top + left canvas rulers (Figma / CAD style) showing canvas coordinates that pan and
 * zoom with the viewport. Purely presentational (`pointer-events: none`); shown together
 * with the dot grid (the "Show grid" view option). Major ticks are labelled with the
 * canvas x / y value; minor ticks subdivide each major interval into fifths.
 */
export default function CanvasRuler() {
  const { x, y, zoom } = useViewport();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const show = useSchematicStore((s) => s.gridSettings.gridVisible);

  if (!show || !width || !height) return null;

  const step = rulerStep(zoom);
  const hTicks = buildRulerTicks(x, zoom, width, step);
  const vTicks = buildRulerTicks(y, zoom, height, step);

  const bg = "var(--color-surface)";
  const border = "var(--ui-border-strong)";
  const line = "var(--ui-border-strong)";
  const txt = "var(--color-text)";

  return (
    <svg
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 6 }}
      data-print-hide
    >
      {/* Bar backgrounds + edges */}
      <rect x={0} y={0} width={width} height={T} fill={bg} />
      <rect x={0} y={0} width={T} height={height} fill={bg} />
      <rect x={0} y={0} width={T} height={T} fill={bg} stroke={border} strokeWidth={0.5} />
      <line x1={0} y1={T + 0.5} x2={width} y2={T + 0.5} stroke={border} strokeWidth={1} />
      <line x1={T + 0.5} y1={0} x2={T + 0.5} y2={height} stroke={border} strokeWidth={1} />

      {/* Horizontal (top) ticks + labels */}
      {hTicks.map((t, i) => (
        <g key={`h${i}`}>
          <line x1={t.pos} y1={t.major ? T - 7 : T - 3} x2={t.pos} y2={T} stroke={line} strokeWidth={1} />
          {t.label !== undefined && (
            <text x={t.pos + 2} y={8.5} fontSize={8} fill={txt}>{t.label}</text>
          )}
        </g>
      ))}

      {/* Vertical (left) ticks + labels */}
      {vTicks.map((t, i) => (
        <g key={`v${i}`}>
          <line x1={t.major ? T - 7 : T - 3} y1={t.pos} x2={T} y2={t.pos} stroke={line} strokeWidth={1} />
          {t.label !== undefined && (
            <text x={2} y={t.pos - 2} fontSize={8} fill={txt} transform={`rotate(-90 2 ${t.pos - 2})`}>
              {t.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

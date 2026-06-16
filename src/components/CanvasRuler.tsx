import { useEffect, useRef, useState } from "react";
import { useStore, useViewport } from "@xyflow/react";
import { useSchematicStore } from "../store";
import {
  RULER_T as T,
  rulerStep,
  buildRulerTicks,
  realRulerStep,
  buildRealRulerTicks,
  formatRulerLabel,
  metresPerWorldUnit,
  type RulerTick,
} from "../rulerScale";

/**
 * Top + left canvas rulers (Figma / CAD style) that pan and zoom with the viewport.
 * In the Layout view they read out REAL-WORLD units (metres or feet) at the document
 * scale (gridSettings.metresPerPixel); elsewhere they show raw canvas coordinates.
 * Purely presentational (`pointer-events: none`); shown together with the grid (the
 * "Show grid" view option). Major ticks are labelled; minor ticks subdivide into fifths.
 * A monospace readout chip tracks the cursor's real-world position in Layout view.
 */
export default function CanvasRuler() {
  const { x, y, zoom } = useViewport();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const show = useSchematicStore((s) => s.gridSettings.gridVisible);
  const metresPerPixel = useSchematicStore((s) => s.gridSettings.metresPerPixel);
  const unit = useSchematicStore((s) => s.gridSettings.layoutGridUnit);
  const isLayout = useSchematicStore((s) => s.canvasViewMode === "layout");

  const svgRef = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!show) return;
    const onMove = (e: PointerEvent) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const rx = e.clientX - rect.left;
      const ry = e.clientY - rect.top;
      if (rx < 0 || ry < 0 || rx > rect.width || ry > rect.height) {
        setCursor(null);
      } else {
        setCursor({ x: rx, y: ry });
      }
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [show]);

  if (!show || !width || !height) return null;

  let hTicks: RulerTick[];
  let vTicks: RulerTick[];
  if (isLayout) {
    const step = realRulerStep(zoom, metresPerPixel, unit);
    hTicks = buildRealRulerTicks(x, zoom, width, metresPerPixel, unit, step);
    vTicks = buildRealRulerTicks(y, zoom, height, metresPerPixel, unit, step);
  } else {
    const step = rulerStep(zoom);
    hTicks = buildRulerTicks(x, zoom, width, step);
    vTicks = buildRulerTicks(y, zoom, height, step);
  }

  const bg = "var(--color-surface)";
  const border = "var(--ui-border-strong)";
  const line = "var(--ui-border-strong)";
  const txt = "var(--color-text)";
  const accent = "var(--color-accent)";
  const mono = "var(--font-mono, ui-monospace, 'SF Mono', monospace)";

  // Cursor → real-world readout (Layout view only).
  let readout: string | null = null;
  if (isLayout && cursor && metresPerPixel > 0) {
    const mpwu = metresPerWorldUnit(unit);
    const worldX = (((cursor.x - x) / zoom) * metresPerPixel) / mpwu;
    const worldY = (((cursor.y - y) / zoom) * metresPerPixel) / mpwu;
    readout = `x ${formatRulerLabel(worldX, 0.05)}  y ${formatRulerLabel(worldY, 0.05)} ${unit}`;
  }

  return (
    <svg
      ref={svgRef}
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
            <text x={t.pos + 2} y={8.5} fontSize={8} fontFamily={mono} fill={txt}>{t.label}</text>
          )}
        </g>
      ))}

      {/* Vertical (left) ticks + labels */}
      {vTicks.map((t, i) => (
        <g key={`v${i}`}>
          <line x1={t.major ? T - 7 : T - 3} y1={t.pos} x2={T} y2={t.pos} stroke={line} strokeWidth={1} />
          {t.label !== undefined && (
            <text x={2} y={t.pos - 2} fontSize={8} fontFamily={mono} fill={txt} transform={`rotate(-90 2 ${t.pos - 2})`}>
              {t.label}
            </text>
          )}
        </g>
      ))}

      {/* Cursor crosshair on the ruler bands + readout chip (Layout view) */}
      {isLayout && cursor && (
        <>
          <line x1={cursor.x} y1={0} x2={cursor.x} y2={T} stroke={accent} strokeWidth={1} />
          <line x1={0} y1={cursor.y} x2={T} y2={cursor.y} stroke={accent} strokeWidth={1} />
        </>
      )}
      {readout && (
        <g>
          <rect x={T + 4} y={height - 20} width={readout.length * 6.2 + 10} height={15} rx={2} fill={bg} stroke={border} strokeWidth={0.5} />
          <text x={T + 9} y={height - 9} fontSize={9} fontFamily={mono} fill={txt}>{readout}</text>
        </g>
      )}
    </svg>
  );
}

import { useViewport } from "@xyflow/react";
import { GRID_SIZE } from "../store";

/**
 * Schematic dot grid, self-drawn instead of React-Flow's <Background variant="dots">.
 *
 * RF's dot pattern centres each dot in its cell (a built-in ~gap/2 phase shift), so its dots
 * land half a cell off the flow-integer lattice and never coincide with the ruler ticks. This
 * draws the dots with a CSS radial-gradient whose origin is pinned to flow (0,0) via
 * background-position = the viewport translate — so a dot sits at every flow multiple of
 * GRID_SIZE, exactly where CanvasRuler places its ticks (rulerStep is a multiple of GRID_SIZE).
 * Cheap: one GPU-composited layer, no per-dot DOM, repaints only on pan/zoom.
 */
export default function CanvasDotGrid({ isDark }: { isDark: boolean }) {
  const { x, y, zoom } = useViewport();
  const pitch = GRID_SIZE * zoom;
  const dot = Math.max(0.6, 1.4 * Math.min(1, zoom));
  const color = isDark ? "#3b4a66" : "#c6cad2";
  return (
    <div
      aria-hidden
      data-print-hide
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        backgroundImage: `radial-gradient(circle at center, ${color} ${dot}px, transparent ${dot}px)`,
        backgroundSize: `${pitch}px ${pitch}px`,
        // Pin the pattern origin (a dot) to flow (0,0): that screen point is the viewport
        // translate, so every dot lands on a flow multiple of GRID_SIZE.
        backgroundPosition: `${x}px ${y}px`,
      }}
    />
  );
}

/**
 * Pure geometry for the canvas ruler — kept out of the component file so the maths is
 * unit-testable and the component file only exports a component (React Fast Refresh).
 */

/** Ruler bar thickness in px. */
export const RULER_T = 18;

/**
 * Pick a "nice" canvas-unit step so labelled (major) ticks land roughly `target` px
 * apart on screen at the current zoom. The schematic grid is a GRID_SIZE (16px) dot
 * lattice, so every step here is a multiple of 80 = 16×5 — that makes the MINOR ticks
 * (step ÷ 5) land on exact 16-px grid multiples, so ruler ticks coincide with grid dots
 * instead of drifting past them. (Keep in sync with GRID_SIZE if the grid pitch changes.)
 */
export function rulerStep(zoom: number, target = 90): number {
  const raw = target / zoom;
  const steps = [80, 160, 400, 800, 1600, 4000, 8000, 16000, 40000, 80000];
  return steps.find((s) => s >= raw) ?? 160000;
}

export interface RulerTick {
  pos: number;
  major: boolean;
  label?: string;
}

/** Build the visible tick list along one axis (screen px = flow * zoom + offset). */
export function buildRulerTicks(offset: number, zoom: number, sizePx: number, step: number): RulerTick[] {
  const minor = step / 5;
  const ticks: RulerTick[] = [];
  const firstFlow = Math.floor((-offset / zoom) / minor) * minor;
  const lastFlow = (sizePx - offset) / zoom;
  for (let f = firstFlow; f <= lastFlow; f += minor) {
    const pos = f * zoom + offset;
    if (pos < RULER_T || pos > sizePx) continue;
    const major = Math.abs(f / step - Math.round(f / step)) < 1e-6;
    ticks.push({ pos, major, label: major ? String(Math.round(f)) : undefined });
  }
  return ticks;
}

// ---------- Real-world (to-scale Layout) ruler ----------

/** Layout-view real-world unit. */
export type RulerUnit = "m" | "ft";

const METRES_PER_FOOT = 0.3048;
const METRE_LADDER = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const FEET_LADDER = [0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

/** Metres represented by one "world unit" of the given ruler unit. */
export function metresPerWorldUnit(unit: RulerUnit): number {
  return unit === "ft" ? METRES_PER_FOOT : 1;
}

/**
 * Pick a "nice" major-tick step in real-world units (metres or feet) so labelled
 * ticks land roughly `target` px apart on screen at the current zoom + document scale.
 */
export function realRulerStep(
  zoom: number,
  metresPerPixel: number,
  unit: RulerUnit,
  target = 90,
): number {
  if (!(zoom > 0) || !(metresPerPixel > 0)) return unit === "ft" ? 1 : 1;
  const ladder = unit === "ft" ? FEET_LADDER : METRE_LADDER;
  // Screen px per world unit = (canvas px per world unit) * zoom.
  const screenPxPerWorldUnit = (metresPerWorldUnit(unit) / metresPerPixel) * zoom;
  const raw = target / screenPxPerWorldUnit;
  return ladder.find((s) => s >= raw) ?? ladder[ladder.length - 1];
}

/** Format a real-world tick value, with decimals scaled to the step granularity. */
export function formatRulerLabel(valueWorldUnits: number, stepWorldUnits: number): string {
  const decimals = stepWorldUnits < 0.1 ? 2 : stepWorldUnits < 1 ? 1 : 0;
  const v = Math.abs(valueWorldUnits) < 1e-9 ? 0 : valueWorldUnits;
  return v.toFixed(decimals);
}

/**
 * Build the visible real-world tick list along one axis. Screen px = canvasFlow *
 * zoom + offset, and canvasFlow = worldUnits * (metresPerWorldUnit / metresPerPixel).
 * Labels are in `unit`; minor ticks subdivide each major into fifths.
 */
export function buildRealRulerTicks(
  offset: number,
  zoom: number,
  sizePx: number,
  metresPerPixel: number,
  unit: RulerUnit,
  stepWorldUnits: number,
): RulerTick[] {
  const ticks: RulerTick[] = [];
  if (!(zoom > 0) || !(metresPerPixel > 0) || !(stepWorldUnits > 0)) return ticks;

  const canvasPxPerWorldUnit = metresPerWorldUnit(unit) / metresPerPixel;
  const minorWorldUnits = stepWorldUnits / 5;
  const worldToScreen = (w: number) => w * canvasPxPerWorldUnit * zoom + offset;
  const screenToWorld = (px: number) => (px - offset) / (zoom * canvasPxPerWorldUnit);

  const firstWorld = Math.floor(screenToWorld(0) / minorWorldUnits) * minorWorldUnits;
  const lastWorld = screenToWorld(sizePx);
  for (let w = firstWorld; w <= lastWorld + minorWorldUnits / 2; w += minorWorldUnits) {
    const pos = worldToScreen(w);
    if (pos < RULER_T || pos > sizePx) continue;
    const ratio = w / stepWorldUnits;
    const major = Math.abs(ratio - Math.round(ratio)) < 1e-6;
    ticks.push({
      pos,
      major,
      label: major ? formatRulerLabel(Math.round(ratio) * stepWorldUnits, stepWorldUnits) : undefined,
    });
  }
  return ticks;
}

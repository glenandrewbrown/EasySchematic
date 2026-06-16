/**
 * Pure geometry for the canvas ruler — kept out of the component file so the maths is
 * unit-testable and the component file only exports a component (React Fast Refresh).
 */

/** Ruler bar thickness in px. */
export const RULER_T = 18;

/**
 * Pick a "nice" canvas-unit step so labelled (major) ticks land roughly `target` px
 * apart on screen at the current zoom.
 */
export function rulerStep(zoom: number, target = 90): number {
  const raw = target / zoom;
  const steps = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  return steps.find((s) => s >= raw) ?? 100000;
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

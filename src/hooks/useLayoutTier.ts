import { useEffect, useState } from "react";

/**
 * The single source of truth for responsive re-composition (round-3 §R2 / board 1f).
 *
 * Three container-width tiers, driven off `window.innerWidth` via matchMedia so the
 * value updates on resize AND on device-rotation without a scroll/paint dependency:
 *   - desktop ≥ 1140px  — the full docked-rail layout (unchanged).
 *   - tablet  768–1139  — rails become overlays, dialogs cap at 92vw.
 *   - phone   < 768     — bottom tab bar, FAB cluster, bottom-sheet inspector.
 *
 * Nothing is feature-gated on the tier — every action stays reachable at every size;
 * the tier only re-composes chrome. All tier branching in the app flows from this one
 * hook (grep-able), so there are no scattered `window.innerWidth` reads.
 */
export type LayoutTier = "desktop" | "tablet" | "phone";

/** Breakpoints, in px. A width exactly on a boundary belongs to the wider tier. */
export const TABLET_MIN = 768;
export const DESKTOP_MIN = 1140;

/** SSR-safe read of the current tier from the viewport width. */
function tierForWidth(width: number): LayoutTier {
  if (width >= DESKTOP_MIN) return "desktop";
  if (width >= TABLET_MIN) return "tablet";
  return "phone";
}

/** Compute the tier now, tolerating non-browser (SSR / test) environments. */
export function currentLayoutTier(): LayoutTier {
  if (typeof window === "undefined") return "desktop";
  return tierForWidth(window.innerWidth);
}

/**
 * Subscribe to the active layout tier. Re-renders only when the tier actually
 * changes (not on every resize pixel), because both media queries are matched
 * and the derived tier is compared before setState.
 */
export function useLayoutTier(): LayoutTier {
  const [tier, setTier] = useState<LayoutTier>(currentLayoutTier);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const tabletMq = window.matchMedia(`(min-width: ${TABLET_MIN}px)`);
    const desktopMq = window.matchMedia(`(min-width: ${DESKTOP_MIN}px)`);
    const update = () => setTier(currentLayoutTier());
    update();
    tabletMq.addEventListener("change", update);
    desktopMq.addEventListener("change", update);
    return () => {
      tabletMq.removeEventListener("change", update);
      desktopMq.removeEventListener("change", update);
    };
  }, []);

  return tier;
}

/**
 * True when the device reports a coarse (touch) pointer. Used to widen hit
 * targets and enable tap-tap / long-press affordances independently of tier
 * (a touchscreen laptop at desktop width still wants big targets).
 */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

import type { SignalType } from "./types";
import { buildDefaultSignalColors } from "./signalFamilies";

/**
 * Default per-type signal colours, derived from the 8-family taxonomy in
 * `signalFamilies.ts` (family hue + subtype shade; power keeps its conventional
 * electrical colours). These are applied to `--color-{type}` CSS vars at runtime by
 * {@link applySignalColors}, which is the authoritative source — the static
 * `--color-{type}` values in theme.css are a first-paint fallback only.
 */
export const DEFAULT_SIGNAL_COLORS: Record<SignalType, string> = buildDefaultSignalColors();

const STORAGE_KEY = "easyschematic-signal-colors";

/** Apply signal colors to CSS custom properties. */
export function applySignalColors(colors: Partial<Record<SignalType, string>>) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // Start from defaults, overlay with provided colors
  const merged = { ...DEFAULT_SIGNAL_COLORS, ...colors };
  for (const [type, color] of Object.entries(merged)) {
    root.style.setProperty(`--color-${type}`, color);
  }
}

/** Load saved signal colors from localStorage. */
export function loadSignalColors(): Record<SignalType, string> {
  if (typeof localStorage === "undefined") return { ...DEFAULT_SIGNAL_COLORS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SIGNAL_COLORS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SIGNAL_COLORS };
}

/** Save signal colors to localStorage (only non-default values). */
export function saveSignalColors(colors: Record<SignalType, string>) {
  const diff: Partial<Record<SignalType, string>> = {};
  for (const [type, color] of Object.entries(colors)) {
    if (color !== DEFAULT_SIGNAL_COLORS[type as SignalType]) {
      diff[type as SignalType] = color;
    }
  }
  if (Object.keys(diff).length > 0) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(diff));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * Get non-default signal colors for saving to a schematic file.
 * Returns undefined if all colors are defaults (keeps file clean).
 */
export function getSignalColorOverrides(colors: Record<SignalType, string>): Partial<Record<SignalType, string>> | undefined {
  const diff: Partial<Record<SignalType, string>> = {};
  for (const [type, color] of Object.entries(colors)) {
    if (color !== DEFAULT_SIGNAL_COLORS[type as SignalType]) {
      diff[type as SignalType] = color;
    }
  }
  return Object.keys(diff).length > 0 ? diff : undefined;
}

// Apply saved colors on module load
applySignalColors(loadSignalColors());

import { SIGNAL_COLORS, type Port, type SignalType } from "./types";

/**
 * The device's representative signal type: the most common signal across its ports (ties
 * broken by first occurrence), falling back to the first port's type. `undefined` only when
 * the device has no ports / no typed ports.
 */
export function dominantSignalType(ports: readonly Port[] | undefined): SignalType | undefined {
  if (!ports?.length) return undefined;
  const counts = new Map<SignalType, number>();
  for (const p of ports) {
    if (p.signalType) counts.set(p.signalType, (counts.get(p.signalType) ?? 0) + 1);
  }
  let best: SignalType | undefined;
  let bestN = 0;
  for (const [sig, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = sig;
    }
  }
  return best ?? ports[0]?.signalType;
}

/**
 * Device class colour = the SIGNAL colour of the device's representative (dominant) signal type,
 * as a theme-reactive `var(--color-<signal>)` reference — so a device's class hue matches its
 * own port swatches and the cables that leave it. Falls back to the neutral "custom" signal
 * colour. Single source of truth for the per-device class hue shown on the node border + class
 * icon, the Plan footprint, the Inspector hero, the Insert chip, and the Command-palette swatch.
 */
export function deviceClassColor(ports: readonly Port[] | undefined): string {
  const sig = dominantSignalType(ports);
  return (sig && SIGNAL_COLORS[sig]) || SIGNAL_COLORS.custom;
}

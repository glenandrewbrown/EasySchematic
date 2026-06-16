/**
 * AV device plan-view symbols for EasySchematic.
 *
 * Each symbol is stored as an SVG inner-markup string designed for a
 * `0 0 24 24` viewBox with `stroke="currentColor"` and `fill="none"`.
 * String constants are framework-agnostic and work in the vitest node
 * environment without Vite `?raw` import magic.
 *
 * Consumer: src/components/DevicePlanNode.tsx (P3 integration)
 */

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/** A single AV device plan-view glyph. */
export interface DeviceSymbol {
  /** Stable kebab-case identifier (e.g. "speaker"). */
  id: string;
  /** Human-readable label shown in UI pickers. */
  label: string;
  /** Inner SVG markup for a `0 0 24 24` viewBox (no outer `<svg>` tag). */
  svg: string;
}

// ---------------------------------------------------------------------------
// SVG inner markup constants
// 24×24 viewBox, stroke="currentColor", fill="none", stroke-width ~1.8
// ---------------------------------------------------------------------------

/** Generic loudspeaker — truncated cone radiating sound. */
const SVG_SPEAKER =
  '<rect x="2" y="8" width="5" height="8" rx="1" stroke-width="1.8"/>' +
  '<polygon points="7,8 16,3 16,21 7,16" stroke-width="1.8"/>' +
  '<path d="M18 9 Q21 12 18 15" stroke-width="1.8" stroke-linecap="round"/>';

/** Subwoofer — low-frequency driver with bass-reflex port. */
const SVG_SUBWOOFER =
  '<rect x="3" y="4" width="18" height="16" rx="2" stroke-width="1.8"/>' +
  '<circle cx="12" cy="12" r="5" stroke-width="1.8"/>' +
  '<circle cx="12" cy="12" r="2" stroke-width="1.8"/>' +
  '<rect x="9" y="18" width="6" height="2" rx="1" stroke-width="1.8"/>';

/** Wired microphone — capsule on a straight body with XLR stub. */
const SVG_WIRED_MIC =
  '<rect x="9" y="2" width="6" height="10" rx="3" stroke-width="1.8"/>' +
  '<path d="M6 10 Q6 16 12 16 Q18 16 18 10" stroke-width="1.8" stroke-linecap="round" fill="none"/>' +
  '<line x1="12" y1="16" x2="12" y2="21" stroke-width="1.8" stroke-linecap="round"/>' +
  '<line x1="10" y1="21" x2="14" y2="21" stroke-width="1.8" stroke-linecap="round"/>';

/** Wireless microphone — capsule with antenna arc to distinguish from wired. */
const SVG_WIRELESS_MIC =
  '<rect x="9" y="4" width="6" height="10" rx="3" stroke-width="1.8"/>' +
  '<path d="M6 12 Q6 18 12 18 Q18 18 18 12" stroke-width="1.8" stroke-linecap="round" fill="none"/>' +
  '<line x1="12" y1="18" x2="12" y2="22" stroke-width="1.8" stroke-linecap="round"/>' +
  '<path d="M17 5 Q20 2 20 0" stroke-width="1.5" stroke-linecap="round"/>' +
  '<path d="M19 7 Q23 3 23 0" stroke-width="1.5" stroke-linecap="round"/>';

/** Amplifier — triangle gain stage inside a chassis rectangle. */
const SVG_AMPLIFIER =
  '<rect x="2" y="5" width="20" height="14" rx="2" stroke-width="1.8"/>' +
  '<polygon points="8,9 8,15 16,12" stroke-width="1.6"/>' +
  '<line x1="2" y1="12" x2="6" y2="12" stroke-width="1.6" stroke-linecap="round"/>' +
  '<line x1="18" y1="12" x2="22" y2="12" stroke-width="1.6" stroke-linecap="round"/>';

/** Mixing console — wide chassis with fader strips and a master section. */
const SVG_MIXER =
  '<rect x="1" y="6" width="22" height="13" rx="2" stroke-width="1.8"/>' +
  '<line x1="5" y1="10" x2="5" y2="16" stroke-width="1.4" stroke-linecap="round"/>' +
  '<line x1="9" y1="9" x2="9" y2="16" stroke-width="1.4" stroke-linecap="round"/>' +
  '<line x1="13" y1="11" x2="13" y2="16" stroke-width="1.4" stroke-linecap="round"/>' +
  '<rect x="3" y="13" width="4" height="1.5" rx="0.5" stroke-width="1.2"/>' +
  '<rect x="7" y="10" width="4" height="1.5" rx="0.5" stroke-width="1.2"/>' +
  '<rect x="11" y="12" width="4" height="1.5" rx="0.5" stroke-width="1.2"/>' +
  '<rect x="17" y="8" width="4" height="7" rx="1" stroke-width="1.4"/>';

/** Audio interface / I/O box — compact chassis with XLR and USB symbols. */
const SVG_AUDIO_IO =
  '<rect x="3" y="6" width="18" height="12" rx="2" stroke-width="1.8"/>' +
  '<circle cx="8" cy="12" r="2.5" stroke-width="1.6"/>' +
  '<line x1="8" y1="9.5" x2="8" y2="7" stroke-width="1.4" stroke-linecap="round"/>' +
  '<line x1="5.8" y1="10.8" x2="4.5" y2="9" stroke-width="1.4" stroke-linecap="round"/>' +
  '<line x1="10.2" y1="10.8" x2="11.5" y2="9" stroke-width="1.4" stroke-linecap="round"/>' +
  '<rect x="14" y="10" width="5" height="4" rx="1" stroke-width="1.4"/>' +
  '<line x1="15" y1="12" x2="18" y2="12" stroke-width="1.2" stroke-linecap="round"/>';

/** Equipment rack — tall cabinet with U-space rails and blank panels. */
const SVG_RACK =
  '<rect x="4" y="2" width="16" height="20" rx="1" stroke-width="1.8"/>' +
  '<line x1="6" y1="2" x2="6" y2="22" stroke-width="1.2"/>' +
  '<line x1="18" y1="2" x2="18" y2="22" stroke-width="1.2"/>' +
  '<line x1="6" y1="7" x2="18" y2="7" stroke-width="1.2"/>' +
  '<line x1="6" y1="12" x2="18" y2="12" stroke-width="1.2"/>' +
  '<line x1="6" y1="17" x2="18" y2="17" stroke-width="1.2"/>' +
  '<circle cx="7" cy="4.5" r="0.7" stroke-width="1"/>' +
  '<circle cx="17" cy="4.5" r="0.7" stroke-width="1"/>';

/** Display / monitor — landscape screen with stand base. */
const SVG_DISPLAY =
  '<rect x="2" y="4" width="20" height="13" rx="2" stroke-width="1.8"/>' +
  '<line x1="12" y1="17" x2="12" y2="21" stroke-width="1.8" stroke-linecap="round"/>' +
  '<line x1="8" y1="21" x2="16" y2="21" stroke-width="1.8" stroke-linecap="round"/>' +
  '<rect x="5" y="7" width="14" height="7" rx="1" stroke-width="1.2"/>';

/** Projector — body with lens protrusion and keystone trapezoid. */
const SVG_PROJECTOR =
  '<rect x="4" y="7" width="13" height="10" rx="2" stroke-width="1.8"/>' +
  '<ellipse cx="19.5" cy="12" rx="2.5" ry="2" stroke-width="1.6"/>' +
  '<path d="M4 10 L1 8 M4 14 L1 16" stroke-width="1.4" stroke-linecap="round"/>';

/** Camera — body with lens circle and viewfinder bump. */
const SVG_CAMERA =
  '<rect x="2" y="7" width="16" height="11" rx="2" stroke-width="1.8"/>' +
  '<rect x="7" y="4" width="5" height="3" rx="1" stroke-width="1.6"/>' +
  '<circle cx="19" cy="12" rx="3" ry="3" r="3" stroke-width="1.8"/>' +
  '<circle cx="19" cy="12" r="1.4" stroke-width="1.4"/>';

/** Computer / laptop — screen hinge folded open, keyboard deck. */
const SVG_COMPUTER =
  '<rect x="3" y="4" width="18" height="12" rx="2" stroke-width="1.8"/>' +
  '<rect x="6" y="7" width="12" height="6" rx="1" stroke-width="1.2"/>' +
  '<line x1="1" y1="20" x2="23" y2="20" stroke-width="1.8" stroke-linecap="round"/>' +
  '<path d="M3 16 L1 20 M21 16 L23 20" stroke-width="1.4" stroke-linecap="round"/>';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** All built-in AV plan-view symbols, keyed by stable id. */
export const DEVICE_SYMBOLS: Record<string, DeviceSymbol> = {
  speaker: {
    id: "speaker",
    label: "Loudspeaker",
    svg: SVG_SPEAKER,
  },
  subwoofer: {
    id: "subwoofer",
    label: "Subwoofer",
    svg: SVG_SUBWOOFER,
  },
  "wired-mic": {
    id: "wired-mic",
    label: "Wired Microphone",
    svg: SVG_WIRED_MIC,
  },
  "wireless-mic": {
    id: "wireless-mic",
    label: "Wireless Microphone",
    svg: SVG_WIRELESS_MIC,
  },
  amplifier: {
    id: "amplifier",
    label: "Amplifier",
    svg: SVG_AMPLIFIER,
  },
  mixer: {
    id: "mixer",
    label: "Mixer / Console",
    svg: SVG_MIXER,
  },
  "audio-io": {
    id: "audio-io",
    label: "Audio Interface / I/O",
    svg: SVG_AUDIO_IO,
  },
  rack: {
    id: "rack",
    label: "Equipment Rack",
    svg: SVG_RACK,
  },
  display: {
    id: "display",
    label: "Display / Monitor",
    svg: SVG_DISPLAY,
  },
  projector: {
    id: "projector",
    label: "Projector",
    svg: SVG_PROJECTOR,
  },
  camera: {
    id: "camera",
    label: "Camera",
    svg: SVG_CAMERA,
  },
  computer: {
    id: "computer",
    label: "Computer / Laptop",
    svg: SVG_COMPUTER,
  },
};

// ---------------------------------------------------------------------------
// Keyword matcher
// ---------------------------------------------------------------------------

/**
 * Maps a device's `deviceType` string to a {@link DeviceSymbol}, or `null`
 * when no symbol fits.
 *
 * Matching is case-insensitive and uses ordered keyword checks to avoid
 * substring collisions:
 *  - "subwoofer" / "sub" is checked BEFORE "speaker" to avoid false-positives.
 *  - "wireless" mic is checked BEFORE "wired" mic for the same reason.
 */
export function symbolForDeviceType(
  deviceType: string | undefined,
): DeviceSymbol | null {
  if (!deviceType) return null;

  const lower = deviceType.toLowerCase();

  // --- Subwoofer must come before speaker ---
  if (lower.includes("subwoofer") || lower.includes(" sub")) {
    return DEVICE_SYMBOLS["subwoofer"];
  }

  // --- Wireless mic must come before wired mic ---
  if (lower.includes("wireless")) {
    return DEVICE_SYMBOLS["wireless-mic"];
  }

  if (
    lower.includes("wired") ||
    lower.includes("microphone") ||
    lower.includes(" mic")
  ) {
    return DEVICE_SYMBOLS["wired-mic"];
  }

  if (lower.includes("speaker") || lower.includes("loud")) {
    return DEVICE_SYMBOLS["speaker"];
  }

  if (lower.includes("amplifier") || lower.includes(" amp")) {
    return DEVICE_SYMBOLS["amplifier"];
  }

  if (lower.includes("mixer") || lower.includes("console")) {
    return DEVICE_SYMBOLS["mixer"];
  }

  if (
    lower.includes("audio i") ||
    lower.includes("audio io") ||
    lower.includes("interface")
  ) {
    return DEVICE_SYMBOLS["audio-io"];
  }

  if (lower.includes("rack")) {
    return DEVICE_SYMBOLS["rack"];
  }

  if (
    lower.includes("display") ||
    lower.includes("screen") ||
    lower.includes("monitor") ||
    lower.includes(" tv")
  ) {
    return DEVICE_SYMBOLS["display"];
  }

  if (lower.includes("projector")) {
    return DEVICE_SYMBOLS["projector"];
  }

  if (lower.includes("camera") || lower.includes("cam")) {
    return DEVICE_SYMBOLS["camera"];
  }

  if (lower.includes("laptop") || lower.includes("computer")) {
    return DEVICE_SYMBOLS["computer"];
  }

  return null;
}

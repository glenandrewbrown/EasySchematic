import { SYMBOL_LIBRARY } from "./symbolLibrary";
import type { SymbolLibraryEntry } from "./symbolLibrary";
import { dominantSignalType } from "./deviceClassColor";
import type { Port } from "./types";

/**
 * Device artwork resolution — the vector identity a device shows in its node header chip,
 * library/quick-add rows, the Inspector hero, and the Plan footprint fallback.
 *
 * `artworkAssetId` (on DeviceData / DeviceTemplate) holds ONE of:
 *   - a qualified symbol id `"{category}/{id}"` from the bundled symbol library, or
 *   - a document `svgAssets` key (an uploaded, sanitized SVG).
 * The two spaces are disjoint: symbol ids always contain "/", upload ids never do.
 *
 * No artwork set → the class-default symbol (board 3c: no device is ever blank, and never
 * an emoji). This map lives beside deviceClassColor.ts so class → colour and class →
 * artwork stay in one place.
 */

export function isSymbolArtworkId(artworkAssetId: string): boolean {
  return artworkAssetId.includes("/");
}

const symbolByQualifiedId = new Map<string, SymbolLibraryEntry>(
  SYMBOL_LIBRARY.map((s) => [`${s.category}/${s.id}`, s]),
);

/** Library symbol for a qualified `"category/id"`, or undefined. */
export function getSymbolByQualifiedId(qualifiedId: string): SymbolLibraryEntry | undefined {
  return symbolByQualifiedId.get(qualifiedId);
}

/** Class-default artwork rules (board 3c), first match on `deviceType` + `category` text.
 *  Targets that ship with the category expansion degrade to generic until present. */
const CLASS_DEFAULT_RULES: readonly [RegExp, string][] = [
  [/sub(woofer)?\b/, "audio/subwoofer"],
  [/speaker|loudspeaker|monitor-wedge|line-array/, "audio/loudspeaker"],
  [/mixer|mixing|console(?!.*light)/, "audio/mixing-console"],
  [/\bmic\b|microphone/, "audio/microphone-fa"],
  [/\bamp\b|amplifier/, "audio/power-amplifier"],
  [/\bdsp\b|processor(?!.*control)/, "audio/dsp-processor"],
  [/switch(?!er)|network-switch/, "network/network-switch"],
  [/router|\bwap\b|wireless|access-point/, "network/router"],
  [/server|\bnas\b/, "network/server"],
  [/camera|ptz|camcorder/, "video/camera-ptz"],
  [/display|projector|\btv\b|monitor|led-wall|screen/, "video/display"],
  [/light|dimmer|hazer|fixture/, "lighting/moving-head"],
  [/computer|desktop|laptop|workstation|\bpc\b|\bmac\b/, "compute/desktop"],
  [/control|remote|touch-?panel|tablet/, "compute/touch-panel"],
  [/\bpdu\b|\bups\b|power|distro|electrical/, "power/pdu"],
];

/** Dominant-signal fallback when the type/category text says nothing. */
function signalFallback(sig: string): string | null {
  if (/audio|dante|aes|analog|speaker|madi|avb/i.test(sig)) return "audio/loudspeaker";
  if (/video|sdi|hdmi|ndi|vga|dvi|displayport|fiber-video/i.test(sig)) return "video/display";
  if (/ethernet|network|fiber/i.test(sig)) return "network/network-switch";
  if (/power|ac|dc/i.test(sig)) return "power/pdu";
  if (/control|serial|rs|midi|gpio|dmx/i.test(sig)) return "compute/touch-panel";
  return null;
}

const GENERIC_FALLBACK = "generic/rounded-rectangle";

/** Nearest present library symbol for a wanted qualified id — degrades new-category targets
 *  to the generic fallback while the expanded categories are still being built. */
function present(qualifiedId: string): string {
  return symbolByQualifiedId.has(qualifiedId) ? qualifiedId : GENERIC_FALLBACK;
}

/** Class-default qualified symbol id for a device — never empty, never an emoji. */
export function defaultArtworkForDevice(device: {
  deviceType?: string;
  category?: string;
  ports?: readonly Port[];
}): string {
  const hay = `${device.deviceType ?? ""} ${device.category ?? ""}`.toLowerCase();
  for (const [re, target] of CLASS_DEFAULT_RULES) {
    if (re.test(hay)) return present(target);
  }
  const sig = dominantSignalType(device.ports);
  if (sig) {
    const bySignal = signalFallback(sig);
    if (bySignal) return present(bySignal);
  }
  return GENERIC_FALLBACK;
}

/** Legacy `data.icon` emoji → nearest library symbol (RED-LINES R3 migration table).
 *  Unknown emoji → "" (render falls through to the class default). */
export const EMOJI_ARTWORK_MAP: Record<string, string> = {
  "🎥": "video/camcorder",
  "📹": "video/camera-ptz",
  "📷": "video/camera-ptz",
  "🎤": "audio/microphone-handheld",
  "🎙": "audio/microphone-studio",
  "🎙️": "audio/microphone-studio",
  "🔊": "audio/loudspeaker",
  "🎛": "audio/mixing-console",
  "🎛️": "audio/mixing-console",
  "🎚": "audio/mixer-faders",
  "🎚️": "audio/mixer-faders",
  "🖥": "compute/desktop",
  "🖥️": "compute/desktop",
  "💻": "compute/laptop",
  "📺": "video/display",
  "📡": "network/wireless-access-point",
  "🌐": "network/router",
  "🔀": "video/video-switcher",
  "💡": "lighting/par-can",
  "🔌": "power/pdu",
  "⚡": "power/distro",
  "🗄": "network/server",
  "🗄️": "network/server",
  "☁️": "network/cloud",
  "☁": "network/cloud",
  "⚙️": "generic/rounded-rectangle",
  "⚙": "generic/rounded-rectangle",
};

/** Migrate a legacy emoji icon to a PRESENT qualified symbol id, or "" when unmapped
 *  (callers then leave artworkAssetId unset and the class default renders). */
export function emojiToArtworkId(icon: string): string {
  const mapped = EMOJI_ARTWORK_MAP[icon.trim()];
  if (!mapped) return "";
  return symbolByQualifiedId.has(mapped) ? mapped : "";
}

/**
 * Resolve the SVG markup a device's artwork chip should render.
 * Order: explicit artworkAssetId (symbol, then upload) → class default symbol.
 * Always returns SOME markup for a well-formed library (class default bottoms out at
 * the generic rounded rectangle).
 */
export function resolveArtworkSvg(
  artworkAssetId: string | undefined,
  svgAssets: Record<string, string> | undefined,
  device: { deviceType?: string; category?: string; ports?: readonly Port[] },
): string {
  if (artworkAssetId) {
    if (isSymbolArtworkId(artworkAssetId)) {
      const sym = symbolByQualifiedId.get(artworkAssetId);
      if (sym) return sym.svg;
    } else {
      const uploaded = svgAssets?.[artworkAssetId];
      if (uploaded) return uploaded;
    }
  }
  return symbolByQualifiedId.get(defaultArtworkForDevice(device))?.svg
    ?? symbolByQualifiedId.get(GENERIC_FALLBACK)?.svg
    ?? "";
}

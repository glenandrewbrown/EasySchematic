import type { SignalType } from "./types";

/**
 * Signal-colour taxonomy. Round-2 review collapsed the old 69 flat "confetti" colours
 * into 8 families, each a single hue with shades for its subtypes — so a glance reads
 * the *family* (audio / video / power …) and the label disambiguates the subtype.
 *
 * Power is the deliberate exception: its phase/neutral/ground colours are real electrical
 * conventions (L1 black, L2 red, L3 blue, neutral grey, ground green) and are preserved.
 */
export type SignalFamily =
  | "audio"
  | "speaker"
  | "video"
  | "network"
  | "control"
  | "power"
  | "rf"
  | "other";

export const SIGNAL_FAMILY_ORDER: readonly SignalFamily[] = [
  "audio",
  "speaker",
  "video",
  "network",
  "control",
  "power",
  "rf",
  "other",
];

export const SIGNAL_FAMILY_LABELS: Record<SignalFamily, string> = {
  audio: "Audio",
  speaker: "Speaker",
  video: "Video",
  network: "Network",
  control: "Control",
  power: "Power",
  rf: "RF",
  other: "Other",
};

/** One representative hue per family (legends, "colour by family"). */
export const SIGNAL_FAMILY_COLORS: Record<SignalFamily, string> = {
  audio: "#cfa920", // gold (the analog-audio anchor — the family's dominant type)
  speaker: "#9f1239", // crimson (matches its only member, speaker-level)
  video: "#2563eb", // blue
  network: "#16a34a", // green
  control: "#d97706", // amber
  power: "#dc2626", // red
  rf: "#c026d3", // magenta
  other: "#64748b", // slate
};

/** Family membership for every signal type (exhaustive — TS enforces completeness). */
export const SIGNAL_FAMILY: Record<SignalType, SignalFamily> = {
  // Video (incl. AV-over-IP video and video extenders)
  sdi: "video",
  hdmi: "video",
  ndi: "video",
  displayport: "video",
  hdbaset: "video",
  srt: "video",
  genlock: "video",
  composite: "video",
  "s-video": "video",
  vga: "video",
  dvi: "video",
  st2110: "video",
  dxlink: "video",
  rtmp: "video",
  rtsp: "video",
  "mpeg-ts": "video",
  "component-video": "video",
  "extron-exp": "video",
  // Audio (digital + analog audio transport)
  dante: "audio",
  avb: "audio",
  "analog-audio": "audio",
  aes: "audio",
  madi: "audio",
  spdif: "audio",
  adat: "audio",
  ultranet: "audio",
  aes50: "audio",
  stageconnect: "audio",
  wordclock: "audio",
  aes67: "audio",
  ydif: "audio",
  gigaace: "audio",
  dx5: "audio",
  slink: "audio",
  soundgrid: "audio",
  fibreace: "audio",
  dsnake: "audio",
  dars: "audio",
  digilink: "audio",
  "blu-link": "audio",
  // Speaker level
  "speaker-level": "speaker",
  // Network / data transport
  usb: "network",
  ethernet: "network",
  fiber: "network",
  thunderbolt: "network",
  // Control / data + lighting control + sync
  dmx: "control",
  gpio: "control",
  "contact-closure": "control",
  rs422: "control",
  rs485: "control",
  serial: "control",
  midi: "control",
  tally: "control",
  artnet: "control",
  sacn: "control",
  ir: "control",
  timecode: "control",
  ebus: "control",
  "control-voltage": "control",
  pots: "control",
  cresnet: "control",
  nlight: "control",
  sensor: "control",
  // Power (conventional colours preserved below)
  power: "power",
  "power-l1": "power",
  "power-l2": "power",
  "power-l3": "power",
  "power-neutral": "power",
  "power-ground": "power",
  // RF / wireless
  rf: "rf",
  bluetooth: "rf",
  // Other
  gps: "other",
  custom: "other",
};

/** Conventional electrical colours for power — NOT collapsed into the family hue. */
const POWER_COLORS: Record<string, string> = {
  power: "#a16207",
  "power-l1": "#1a1a1a",
  "power-l2": "#cc0000",
  "power-l3": "#0066cc",
  "power-neutral": "#888888",
  "power-ground": "#00aa00",
};

/**
 * Fixed brand-spec signal colours (Slate × Carbon design system): these 11 named types are
 * *data* — they render their exact hex everywhere and identically in both themes, overriding
 * the family-ramp / POWER_COLORS result. The remaining ~58 types keep the family taxonomy.
 * Power-l1/l2/l3/neutral/ground are NOT overridden — they keep their electrical colours.
 *
 * Slate × Carbon retunes five of these away from the older palette: analog-audio to gold,
 * ethernet to teal, thunderbolt and power to slate greys, and custom to a muted violet.
 * thunderbolt and power are deliberately desaturated so the loud hues stay meaningful —
 * a canvas is mostly analog-audio, and its greys read as infrastructure.
 */
export const HANDOFF_SIGNAL_COLORS: Partial<Record<SignalType, string>> = {
  aes: "#a98bf0",
  "analog-audio": "#cfa920",
  dante: "#ec8a3e",
  usb: "#e06aa6",
  sdi: "#6db0f0",
  hdmi: "#ef7a72",
  ethernet: "#19b6a6",
  power: "#7a8290",
  thunderbolt: "#6b7689",
  custom: "#9c8cc4",
  "speaker-level": "#9f1239",
};

/**
 * Brand-anchor sequences per family. Every family that owns one or more of the fixed signal
 * colours gets its remaining subtypes *interpolated between those anchors*, so the whole
 * family reads as one coherent gradient pinned to the brief's hues: the named anchors keep
 * their exact hex (applied last in {@link buildDefaultSignalColors}) and the other members
 * fill the gradient's interior. Families with no fixed anchor (control / rf) fall back to
 * their {@link FAMILY_SHADES} ramp; power keeps its conventional electrical colours.
 *
 * Only gradient-defining anchors belong here. thunderbolt (#6b7689) and custom (#9c8cc4) are
 * fixed but deliberately sit OFF their family's gradient, so they are not stops — they are
 * applied last and simply override.
 */
const FAMILY_ANCHORS: Partial<Record<SignalFamily, readonly string[]>> = {
  audio: ["#a98bf0", "#cfa920", "#ec8a3e"], // AES violet → analog gold → Dante orange
  network: ["#19b6a6", "#e06aa6"], // Ethernet teal → USB pink
  video: ["#6db0f0", "#ef7a72"], // SDI blue → HDMI coral
};

/** Parse `#rrggbb` → [r, g, b]. */
function parseHex(hex: string): [number, number, number] {
  const s = hex.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

/** Linear RGB blend of two `#rrggbb` colours at t ∈ [0,1]. */
function lerpHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`;
}

/** Shade ramps for families WITHOUT a HANDOFF anchor (speaker / control / rf / other).
 *  Anchored families (audio / video / network) interpolate {@link FAMILY_ANCHORS} instead. */
const FAMILY_SHADES: Record<SignalFamily, readonly string[]> = {
  audio: ["#0d9488", "#0f766e", "#14b8a6", "#0e7490", "#06b6d4", "#155e63", "#2dd4bf", "#0891b2"],
  speaker: ["#9f1239"],
  video: ["#2563eb", "#1d4ed8", "#3b82f6", "#1e40af", "#0ea5e9", "#0369a1", "#60a5fa", "#1e3a8a"],
  network: ["#16a34a", "#15803d", "#22c55e", "#166534"],
  control: ["#d97706", "#b45309", "#f59e0b", "#ca8a04", "#ea580c", "#92400e", "#fbbf24"],
  power: ["#dc2626"],
  rf: ["#c026d3", "#a21caf"],
  other: ["#64748b", "#475569"],
};

export function familyFor(type: SignalType): SignalFamily {
  return SIGNAL_FAMILY[type] ?? "other";
}

/**
 * Build the default per-type colour map from the Slate × Carbon palette:
 *  - Power phase/neutral/ground keep their conventional electrical colours.
 *  - Families with anchors (audio / video / network) interpolate: the named anchor types
 *    render their exact hex, and every other member fills the *interior* of that family's
 *    anchor gradient — so the whole family reads as one coherent gradient pinned to the
 *    brief's hues (e.g. audio spans AES violet → analog gold → Dante orange).
 *  - Families without anchors (speaker / control / rf / other) take their FAMILY_SHADES ramp.
 *  - The 11 fixed colours are applied LAST and win outright, including the few that sit off
 *    their family's gradient by design (thunderbolt, custom).
 * Subtypes within a family stay visually related; the label disambiguates the exact subtype.
 */
export function buildDefaultSignalColors(): Record<SignalType, string> {
  const out = {} as Record<SignalType, string>;
  // Group non-power-special signals by family, preserving declaration order for stable colours.
  const membersByFamily = {} as Record<SignalFamily, SignalType[]>;
  for (const type of Object.keys(SIGNAL_FAMILY) as SignalType[]) {
    if (type in POWER_COLORS) {
      out[type] = POWER_COLORS[type]; // conventional electrical colour (base power overridden below)
      continue;
    }
    (membersByFamily[familyFor(type)] ??= []).push(type);
  }
  for (const fam of Object.keys(membersByFamily) as SignalFamily[]) {
    const members = membersByFamily[fam];
    // Gradient stops: brand anchors where the family owns HANDOFF colours, else its shade ramp.
    const stops = FAMILY_ANCHORS[fam] ?? FAMILY_SHADES[fam];
    // The named HANDOFF anchors render their exact hex (applied below); every other member
    // fills the interior of a gradient *segment* between two consecutive stops, members split
    // evenly across segments — so none lands on a stop node (no colour dup) and the whole
    // family reads as one even gradient (pinned to the brief's hues where it has anchors).
    const fill = members.filter((t) => !(t in HANDOFF_SIGNAL_COLORS));
    if (stops.length <= 1) {
      fill.forEach((type) => { out[type] = stops[0]; });
      continue;
    }
    const segs = stops.length - 1;
    const buckets: SignalType[][] = Array.from({ length: segs }, () => []);
    fill.forEach((type, j) => {
      const seg = Math.min(segs - 1, Math.floor((j * segs) / Math.max(1, fill.length)));
      buckets[seg].push(type);
    });
    buckets.forEach((bucket, si) => {
      bucket.forEach((type, i) => {
        out[type] = lerpHex(stops[si], stops[si + 1], (i + 1) / (bucket.length + 1));
      });
    });
  }
  // Apply the fixed brand-spec colours LAST so the 11 named types (and the base power
  // colour) render their exact hex — these are data, not styling.
  for (const [type, color] of Object.entries(HANDOFF_SIGNAL_COLORS)) {
    out[type as SignalType] = color;
  }
  return out;
}

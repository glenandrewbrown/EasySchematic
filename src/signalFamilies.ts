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
  audio: "#0d9488", // teal
  speaker: "#7c3aed", // violet
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

/** Shade ramps per family (one hue, varied lightness/saturation) for subtype distinction. */
const FAMILY_SHADES: Record<SignalFamily, readonly string[]> = {
  audio: ["#0d9488", "#0f766e", "#14b8a6", "#0e7490", "#06b6d4", "#155e63", "#2dd4bf", "#0891b2"],
  speaker: ["#7c3aed"],
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
 * Build the default per-type colour map from the family taxonomy: power types take their
 * conventional electrical colour; every other type takes the next shade (cycling) from
 * its family's ramp, so subtypes within a family stay visually related.
 */
export function buildDefaultSignalColors(): Record<SignalType, string> {
  const out = {} as Record<SignalType, string>;
  const counters: Partial<Record<SignalFamily, number>> = {};
  for (const type of Object.keys(SIGNAL_FAMILY) as SignalType[]) {
    if (type in POWER_COLORS) {
      out[type] = POWER_COLORS[type];
      continue;
    }
    const fam = familyFor(type);
    const ramp = FAMILY_SHADES[fam];
    const i = counters[fam] ?? 0;
    out[type] = ramp[i % ramp.length];
    counters[fam] = i + 1;
  }
  return out;
}

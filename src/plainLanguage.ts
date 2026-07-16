import type { SignalType } from "./types";
import { SIGNAL_LABELS } from "./types";
import type { IssueSeverity } from "./validation";

/**
 * Plain-language layer. The design's rule is "plain words first, detail on demand": everyday
 * names by default, with the technical detail one toggle away — "never lost, just not shouting".
 *
 * Two deliberate boundaries:
 *
 * 1. **Plain hides jargon, it does not rename everything.** HDMI, USB, Ethernet, Bluetooth and
 *    Power are already everyday words; rewriting them would add noise, not plainness. Only
 *    genuinely opaque protocol names get a plain equivalent. A type with no entry below simply
 *    keeps its technical label in both modes — that is the correct outcome, not a gap.
 *
 * 2. **Plain never hides data.** This layer only ever changes wording. Signal COLOUR, port
 *    counts, lengths, IDs and validation results are identical in both modes.
 */

export type DetailLevel = "plain" | "technical";

export const DEFAULT_DETAIL_LEVEL: DetailLevel = "plain";

/**
 * Everyday names for the signal types whose technical label is jargon. Keyed by what the
 * signal actually carries, disambiguated where two protocols would otherwise collide
 * (e.g. Dante and AES67 are both network audio, so the transport stays in parentheses).
 *
 * Types absent from this map are already plain — see boundary 1 above.
 */
export const PLAIN_SIGNAL_LABELS: Partial<Record<SignalType, string>> = {
  // ── Audio transports ──
  aes: "Digital audio",
  dante: "Network audio",
  aes67: "Network audio (AES67)",
  avb: "Network audio (AVB)",
  madi: "Multi-channel digital audio",
  adat: "Multi-channel digital audio (ADAT)",
  spdif: "Digital audio (consumer)",
  "analog-audio": "Analog audio",
  "speaker-level": "Speaker audio",
  aes50: "Digital audio (stage link)",
  ultranet: "Digital audio (personal mix)",
  stageconnect: "Digital audio (stage link)",
  ydif: "Digital audio (mixer link)",
  gigaace: "Digital audio (mixer link)",
  dx5: "Digital audio (mixer link)",
  slink: "Digital audio (mixer link)",
  soundgrid: "Network audio (SoundGrid)",
  fibreace: "Digital audio over fibre",
  dsnake: "Digital audio (stage link)",
  digilink: "Digital audio (Pro Tools)",
  "blu-link": "Digital audio (BLU link)",
  dars: "Digital audio reference",
  wordclock: "Clock reference",
  // ── Video transports ──
  sdi: "Video (broadcast)",
  ndi: "Video over network",
  st2110: "Video over network (ST 2110)",
  srt: "Video over internet",
  rtmp: "Video stream (RTMP)",
  rtsp: "Video stream (RTSP)",
  "mpeg-ts": "Video stream (MPEG-TS)",
  hdbaset: "Video over network cable",
  dxlink: "Video over network cable (DXLink)",
  "extron-exp": "Video over network cable (Extron)",
  genlock: "Video sync",
  composite: "Analog video",
  "component-video": "Analog video (component)",
  "s-video": "Analog video (S-Video)",
  // ── Control / data ──
  dmx: "Lighting control",
  artnet: "Lighting control over network",
  sacn: "Lighting control over network (sACN)",
  gpio: "Contact input/output",
  "contact-closure": "Contact closure",
  rs422: "Serial control",
  serial: "Serial control",
  cresnet: "Control (Cresnet)",
  ebus: "Control (eBUS)",
  "control-voltage": "Voltage control",
  midi: "Musical instrument control",
  tally: "On-air indicator",
  timecode: "Timecode",
  ir: "Infrared remote",
  pots: "Telephone line",
  sensor: "Sensor",
  // ── Power ──
  "power-l1": "Live (phase A)",
  "power-l2": "Live (phase B)",
  "power-l3": "Live (phase C)",
  "power-neutral": "Neutral",
  "power-ground": "Earth",
  // ── Other ──
  rf: "Wireless (radio)",
  gps: "Satellite clock",
  fiber: "Fibre-optic link",
};

/** The signal's name at the requested detail level. */
export function signalLabel(type: SignalType, level: DetailLevel): string {
  if (level === "technical") return SIGNAL_LABELS[type];
  return PLAIN_SIGNAL_LABELS[type] ?? SIGNAL_LABELS[type];
}

/**
 * Validation severity in words. Plain says what to do about it; technical names the level.
 * Either way the word is present — severity is never colour-only.
 */
export function severityWord(severity: IssueSeverity, level: DetailLevel): string {
  if (level === "technical") return severity === "error" ? "Error" : "Warn";
  return severity === "error" ? "Problem" : "Check needed";
}

/** The "everything is fine" counterpart to {@link severityWord}. */
export function healthyWord(level: DetailLevel): string {
  return level === "technical" ? "Valid" : "All good";
}

/**
 * A port's display label. Technical appends the jargon suffix the design shows
 * ("Mic 1 · XLR"); plain shows the port's own name alone ("Mic 1").
 *
 * `detail` is the technical suffix — the connector or signal name the caller resolved.
 */
export function portLabel(label: string, detail: string | undefined, level: DetailLevel): string {
  if (level !== "technical" || !detail) return label;
  return `${label} · ${detail}`;
}

/** Short hint describing what the current mode is showing (mirrors the design's toggle hint). */
export function detailLevelHint(level: DetailLevel): string {
  return level === "technical" ? "Showing signal types, codes & I/O" : "Showing everyday names";
}

export function detailLevelLabel(level: DetailLevel): string {
  return level === "technical" ? "Technical detail" : "Plain language";
}

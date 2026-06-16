import type { SignalType } from "./types";

/**
 * Describes a physical cable type: its signal family, practical maximum run
 * length, minimum bend radius, and display colour for UI rendering.
 *
 * Distances are always in metres; bend radius in millimetres.
 */
export interface CableTypeRule {
  /** Unique identifier matching its key in CABLE_TYPES. */
  id: string;
  /** Human-readable label shown in UI and reports. */
  label: string;
  /** AV signal type carried by this cable. */
  signalType: SignalType;
  /** Practical maximum single-run length in metres (industry guidance). */
  maxRunM: number;
  /** Minimum bend radius in millimetres (installation spec). */
  minBendRadiusMm: number;
  /** Hex display colour for UI elements (e.g. "#4a90e2"). */
  color: string;
}

/**
 * Catalog of common AV cable types with industry-standard max-run figures.
 *
 * Sources:
 * - Analog audio XLR: EIA-RS-297, practical limit ~100 m before noise floor.
 * - Speaker: depends on gauge; 50 m at 14 AWG is conservative.
 * - AES/EBU: AES3 spec ~100 m (balanced, 110 Ω).
 * - Cat6/Cat6A: TIA-568 100 m channel limit.
 * - HDMI passive: HDMI Forum passive limit ~15 m (4K signals).
 * - 12G-SDI coax: SMPTE 2082 ~70 m on Belden 1694A.
 * - USB 2.0: USB IF spec 5 m.
 * - DMX512: ANSI E1.11 total daisy-chain guidance ≤300 m.
 * - Dante/Cat: Audinate recommends standard 100 m Ethernet run.
 * - Fiber OM4: OM4 multimode, 400 m at 10GbE; 550 m at 1GbE — 400 m used.
 */
export const CABLE_TYPES: Record<string, CableTypeRule> = {
  "xlr-mic-line": {
    id: "xlr-mic-line",
    label: "XLR Analog Mic/Line",
    signalType: "analog-audio",
    maxRunM: 100,
    minBendRadiusMm: 38,
    color: "#e8a838",
  },
  speaker: {
    id: "speaker",
    label: "Speaker Cable",
    signalType: "speaker-level",
    maxRunM: 50,
    minBendRadiusMm: 50,
    color: "#e88238",
  },
  "aes-ebu": {
    id: "aes-ebu",
    label: "AES/EBU (AES3)",
    signalType: "aes",
    maxRunM: 100,
    minBendRadiusMm: 38,
    color: "#c75edc",
  },
  cat6: {
    id: "cat6",
    label: "Cat6 Ethernet",
    signalType: "ethernet",
    maxRunM: 100,
    minBendRadiusMm: 25,
    color: "#4a90e2",
  },
  cat6a: {
    id: "cat6a",
    label: "Cat6A Ethernet",
    signalType: "ethernet",
    maxRunM: 100,
    minBendRadiusMm: 35,
    color: "#3a78c9",
  },
  "hdmi-passive": {
    id: "hdmi-passive",
    label: "HDMI Passive",
    signalType: "hdmi",
    maxRunM: 15,
    minBendRadiusMm: 35,
    color: "#2ddc5e",
  },
  "sdi-12g": {
    id: "sdi-12g",
    label: "12G-SDI Coax",
    signalType: "sdi",
    maxRunM: 70,
    minBendRadiusMm: 50,
    color: "#e23a3a",
  },
  usb2: {
    id: "usb2",
    label: "USB 2.0",
    signalType: "usb",
    maxRunM: 5,
    minBendRadiusMm: 20,
    color: "#8bc4f5",
  },
  dmx512: {
    id: "dmx512",
    label: "DMX512",
    signalType: "dmx",
    maxRunM: 300,
    minBendRadiusMm: 38,
    color: "#f5c842",
  },
  "dante-cat": {
    id: "dante-cat",
    label: "Dante / AVB over Cat",
    signalType: "dante",
    maxRunM: 100,
    minBendRadiusMm: 25,
    color: "#5bc4a0",
  },
  "fiber-om4": {
    id: "fiber-om4",
    label: "Fiber OM4 Multimode",
    signalType: "fiber",
    maxRunM: 400,
    minBendRadiusMm: 30,
    color: "#ff8c42",
  },
} as const;

/**
 * Check whether a run length exceeds a cable type's practical maximum.
 *
 * Returns `null` when the cable-type id is not in the catalog or when
 * `runLengthM` is not a positive number (nothing meaningful to warn about).
 *
 * @param cableTypeId - Key into CABLE_TYPES.
 * @param runLengthM  - Actual or estimated run length in metres.
 * @returns Warning object or null.
 */
export function maxRunWarning(
  cableTypeId: string,
  runLengthM: number,
): { exceeded: boolean; maxRunM: number; ratio: number } | null {
  if (runLengthM <= 0) return null;

  const rule = CABLE_TYPES[cableTypeId];
  if (rule === undefined) return null;

  const ratio = runLengthM / rule.maxRunM;
  return {
    exceeded: ratio > 1,
    maxRunM: rule.maxRunM,
    ratio,
  };
}

/**
 * Estimate total physical cable run from a straight-line distance plus slack.
 *
 * Mirrors the semantics of `DistanceSettings` in types.ts:
 *   estimate = straightLineM × (1 + slackPercent / 100) + slackFixedM
 *
 * Negative `straightLineM` is treated as 0 before slack is applied.
 * The final result is clamped to a minimum of 0.
 *
 * @param straightLineM  - Straight-line distance between endpoints in metres.
 * @param slackPercent   - Percentage added on top of the straight-line (e.g. 15 = +15 %).
 * @param slackFixedM    - Fixed additional length added after percent slack (metres).
 * @returns Estimated cable run length in metres (≥ 0).
 */
export function estimateRunLengthM(
  straightLineM: number,
  slackPercent: number,
  slackFixedM: number,
): number {
  const base = Math.max(0, straightLineM);
  const result = base * (1 + slackPercent / 100) + slackFixedM;
  return Math.max(0, result);
}

/**
 * Return all cable types that carry a given signal type.
 *
 * @param signalType - AV signal type to filter by.
 * @returns Array of matching CableTypeRule entries (may be empty).
 */
export function cableTypesForSignal(signalType: SignalType): CableTypeRule[] {
  return Object.values(CABLE_TYPES).filter(
    (rule) => rule.signalType === signalType,
  );
}

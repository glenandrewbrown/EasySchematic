import type { DeviceData } from "./types";

/**
 * Loudspeaker classification + spec resolution for the plan-view coverage overlay.
 * Detection follows the approved rule: a device is a speaker if its `deviceType`
 * names one, or it exposes a speaker-level port (no separate "aspect" type).
 */

const SPEAKER_TYPE_RE = /speaker|loudspeaker|subwoofer|\bsub\b/i;

/** Default nominal coverage angle (degrees) when a speaker has none set. */
export const DEFAULT_COVERAGE_ANGLE_DEG = 90;

/** True when the device should be treated as a loudspeaker for coverage purposes. */
export function isSpeaker(
  data: Pick<DeviceData, "deviceType"> & { ports?: ReadonlyArray<{ signalType?: string }> },
): boolean {
  if (SPEAKER_TYPE_RE.test(data.deviceType ?? "")) return true;
  return (data.ports ?? []).some((p) => p.signalType === "speaker-level");
}

/** Resolved acoustic spec used to draw coverage; missing values fall back sensibly. */
export interface ResolvedSpeakerSpec {
  /** Nominal coverage angle in degrees (defaults to DEFAULT_COVERAGE_ANGLE_DEG). */
  coverageAngleDeg: number;
  /** Sensitivity in dB SPL @ 1 W / 1 m, or null when unknown (no SPL readout). */
  sensitivityDb: number | null;
  /** Rated/max power in watts — falls back to the device's powerDrawW, else null. */
  maxPowerW: number | null;
}

/** Resolve a speaker's coverage spec from its stored fields, applying fallbacks. */
export function resolveSpeakerSpec(
  data: Pick<
    DeviceData,
    "speakerCoverageAngleDeg" | "speakerSensitivityDb" | "speakerMaxPowerW" | "powerDrawW"
  >,
): ResolvedSpeakerSpec {
  const angle = data.speakerCoverageAngleDeg;
  const sensitivity = data.speakerSensitivityDb;
  const maxPower = data.speakerMaxPowerW;
  const draw = data.powerDrawW;
  return {
    coverageAngleDeg: typeof angle === "number" && angle > 0 ? angle : DEFAULT_COVERAGE_ANGLE_DEG,
    sensitivityDb: typeof sensitivity === "number" ? sensitivity : null,
    maxPowerW:
      typeof maxPower === "number" ? maxPower : typeof draw === "number" ? draw : null,
  };
}

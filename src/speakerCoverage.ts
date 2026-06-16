/**
 * speakerCoverage.ts — Pure loudspeaker coverage math for EasySchematic.
 *
 * IMPORTANT CAVEAT: All functions compute on-axis, direct-field NOMINAL
 * estimates based on manufacturer sensitivity specs and idealized acoustic
 * models. These are NOT measured SPL values, do NOT account for room
 * reflections, absorption, boundary effects, or off-axis roll-off, and
 * should NOT be treated as engineering guarantees. Use them as quick
 * planning references, not as substitutes for proper acoustic simulation.
 *
 * All functions are pure (no side effects, no mutations).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Watts reference level for power-to-dB conversion */
const LOG10_BASE = 10;

/** Degrees-to-radians conversion factor */
const DEG_TO_RAD = Math.PI / 180;

// ---------------------------------------------------------------------------
// 1. splAtDistanceDb
// ---------------------------------------------------------------------------

/**
 * Estimates on-axis SPL (dB) at a given distance using the inverse-square law.
 *
 * Formula: SPL = sensitivityDb + 10·log₁₀(powerW) − 20·log₁₀(distanceM)
 *
 * @param sensitivityDb - Loudspeaker 1W/1m on-axis sensitivity in dB SPL
 * @param powerW        - Amplifier power delivered to the speaker in watts
 * @param distanceM     - Distance from speaker to listener in metres
 * @returns Estimated SPL in dB, or null if powerW ≤ 0 or distanceM ≤ 0
 */
export function splAtDistanceDb(
  sensitivityDb: number,
  powerW: number,
  distanceM: number
): number | null {
  if (powerW <= 0 || distanceM <= 0) {
    return null;
  }

  const powerGainDb = LOG10_BASE * Math.log10(powerW);
  const distanceLossDb = 20 * Math.log10(distanceM);

  return sensitivityDb + powerGainDb - distanceLossDb;
}

// ---------------------------------------------------------------------------
// 2. coverageRadiusM
// ---------------------------------------------------------------------------

/**
 * Effective coverage radius at the listener plane for a ceiling-mounted
 * downward-firing speaker.
 *
 * Models the speaker as a cone centred on the vertical axis. The radius
 * at the listener plane is the horizontal distance from the point directly
 * below the speaker to the edge of the −6 dB coverage cone.
 *
 * Formula: radius = (ceilingHeightM − listenerHeightM) · tan(coverageAngleDeg / 2)
 *
 * @param ceilingHeightM    - Height of the speaker above floor in metres
 * @param listenerHeightM   - Listener ear height above floor in metres
 * @param coverageAngleDeg  - Full included coverage angle in degrees (must be > 0 and < 180)
 * @returns Coverage radius in metres, or null if inputs are out of valid range
 */
export function coverageRadiusM(
  ceilingHeightM: number,
  listenerHeightM: number,
  coverageAngleDeg: number
): number | null {
  const heightDiffM = ceilingHeightM - listenerHeightM;

  if (heightDiffM <= 0) {
    return null;
  }

  if (coverageAngleDeg <= 0 || coverageAngleDeg >= 180) {
    return null;
  }

  const halfAngleRad = (coverageAngleDeg / 2) * DEG_TO_RAD;

  return heightDiffM * Math.tan(halfAngleRad);
}

// ---------------------------------------------------------------------------
// 3. sumSplDb
// ---------------------------------------------------------------------------

/**
 * Incoherent power summation of multiple SPL contributions.
 *
 * Treats each source as acoustically incoherent (random phase) and sums
 * the intensity contributions:
 *   result = 10·log₁₀( Σ 10^(Lᵢ / 10) )
 *
 * This is appropriate for estimating combined SPL from multiple speakers
 * at a single point. Coherent interference (e.g. from time-aligned arrays)
 * requires a different model.
 *
 * @param levelsDb - Array of SPL contributions in dB (read-only)
 * @returns Combined SPL in dB, or null for an empty array
 */
export function sumSplDb(levelsDb: readonly number[]): number | null {
  if (levelsDb.length === 0) {
    return null;
  }

  const totalPower = levelsDb.reduce(
    (acc, level) => acc + Math.pow(LOG10_BASE, level / LOG10_BASE),
    0
  );

  return LOG10_BASE * Math.log10(totalPower);
}

// ---------------------------------------------------------------------------
// 3b. combinedOnAxisSplDb
// ---------------------------------------------------------------------------

/** One loudspeaker's contribution to a combined on-axis SPL estimate. */
export interface SplSource {
  /** 1 W / 1 m on-axis sensitivity in dB SPL. */
  sensitivityDb: number;
  /** Power delivered to the speaker in watts. */
  powerW: number;
  /** Distance from speaker to the listener point in metres. */
  distanceM: number;
}

/**
 * Combined on-axis SPL (dB) at a point from several loudspeakers, via incoherent
 * power summation. Each source's contribution is splAtDistanceDb(...); sources
 * with non-positive power or distance are skipped. Returns null when no source
 * yields a valid level. NOMINAL on-axis estimate — see the file caveat.
 */
export function combinedOnAxisSplDb(sources: readonly SplSource[]): number | null {
  const levels: number[] = [];
  for (const s of sources) {
    const level = splAtDistanceDb(s.sensitivityDb, s.powerW, s.distanceM);
    if (level != null) levels.push(level);
  }
  return sumSplDb(levels);
}

// ---------------------------------------------------------------------------
// 4. wedgeGeometry
// ---------------------------------------------------------------------------

/**
 * Result type for a speaker coverage wedge in screen/SVG space.
 * y grows downward (standard SVG / React Flow coordinate system).
 */
export interface WedgeGeometryResult {
  /** The speaker position — tip of the wedge */
  apex: { x: number; y: number };
  /**
   * Left arc endpoint (aimDeg − coverageAngleDeg/2).
   * "Left" is relative to the aim direction in standard math orientation;
   * in screen space (y-down) this is the counter-clockwise edge.
   */
  left: { x: number; y: number };
  /**
   * Right arc endpoint (aimDeg + coverageAngleDeg/2).
   * "Right" is the clockwise edge in screen space.
   */
  right: { x: number; y: number };
  /** Centre aim direction in degrees (equals aimDeg, normalised 0–360) */
  midAngleDeg: number;
}

/**
 * Computes the three vertices of a coverage-wedge polygon for SVG rendering.
 *
 * Angle convention (screen space, y grows DOWN):
 *   - 0°   = pointing right  (+x direction)
 *   - 90°  = pointing down   (+y direction)
 *   - 180° = pointing left   (−x direction)
 *   - 270° = pointing up     (−y direction)
 *   Angles increase clockwise, matching standard CSS/SVG rotation.
 *
 * Endpoints are computed as:
 *   rightEndpoint = origin + radiusPx · (cos θ_right, sin θ_right)
 *   leftEndpoint  = origin + radiusPx · (cos θ_left,  sin θ_left)
 * where θ_right = (aimDeg + coverageAngleDeg/2) · π/180
 *       θ_left  = (aimDeg − coverageAngleDeg/2) · π/180
 *
 * @param originX          - Speaker x position in screen pixels
 * @param originY          - Speaker y position in screen pixels
 * @param aimDeg           - Direction the speaker points, clockwise from +x (degrees)
 * @param coverageAngleDeg - Full included coverage angle (must be > 0 and < 360)
 * @param radiusPx         - Coverage radius in screen pixels (must be > 0)
 * @returns Wedge geometry or null if any parameter is out of valid range
 */
export function wedgeGeometry(
  originX: number,
  originY: number,
  aimDeg: number,
  coverageAngleDeg: number,
  radiusPx: number
): WedgeGeometryResult | null {
  if (radiusPx <= 0 || coverageAngleDeg <= 0 || coverageAngleDeg >= 360) {
    return null;
  }

  const halfAngleDeg = coverageAngleDeg / 2;

  const rightAngleRad = (aimDeg + halfAngleDeg) * DEG_TO_RAD;
  const leftAngleRad = (aimDeg - halfAngleDeg) * DEG_TO_RAD;

  return {
    apex: { x: originX, y: originY },
    left: {
      x: originX + radiusPx * Math.cos(leftAngleRad),
      y: originY + radiusPx * Math.sin(leftAngleRad),
    },
    right: {
      x: originX + radiusPx * Math.cos(rightAngleRad),
      y: originY + radiusPx * Math.sin(rightAngleRad),
    },
    midAngleDeg: aimDeg,
  };
}

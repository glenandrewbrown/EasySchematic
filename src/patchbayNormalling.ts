/**
 * Pure patchbay normalling resolver.
 *
 * A patch point has four terminals (rearA/rearB feed the permanent wiring,
 * frontA/frontB are the front-panel jacks) and a normalling mode that
 * decides how those terminals are electrically joined into nets depending
 * on which front jacks are patched. See
 * docs/superpowers/specs/2026-07-18-r2-trinnov-channel-model-design.md §11
 * for the authoritative truth table this implements.
 *
 * Self-contained: no imports, no store, no React. Callers own their own
 * copies of these types until the wider type system is ready to adopt them.
 */

export type NormallingMode = "half-normalled" | "split" | "isolated";

export interface PlugState {
  frontAPatched: boolean;
  frontBPatched: boolean;
}

/** A net is the set of terminals that are electrically common. */
export type Terminal = "rearA" | "rearB" | "frontA" | "frontB";

export interface PatchNet {
  terminals: Terminal[];
  passiveSplit: boolean;
}

export interface PatchResolution {
  nets: PatchNet[];
  /** True when a front-B insert breaks the half-normal. */
  normalBroken: boolean;
  /** True when any net in the resolution drives more than one sink passively. */
  passiveSplit: boolean;
}

/**
 * On a standard Neutrik half-normal, front-A is the non-breaking tap and
 * front-B is the breaking insert. Named here so the orientation is a single
 * flip if it's ever confirmed reversed for a given hardware archetype.
 */
const BREAKING_FRONT_JACK: Terminal = "frontB";
const TAPPING_FRONT_JACK: Terminal = "frontA";

function net(terminals: Terminal[], passiveSplit: boolean): PatchNet {
  return { terminals, passiveSplit };
}

/**
 * A net is a passive split (mult) when it commons 3+ terminals, or when it
 * commons exactly rearA+rearB+frontA — the half-normal case where the tap
 * draws off a still-live normal. Two-terminal nets (a plain through-connection
 * or an isolated pair) are not splits.
 */
function isPassiveSplitNet(terminals: Terminal[]): boolean {
  return terminals.length >= 3;
}

function resolveHalfNormalled(plug: PlugState): PatchResolution {
  const { frontAPatched, frontBPatched } = plug;

  if (!frontAPatched && !frontBPatched) {
    const nets = [net(["rearA", "rearB"], false)];
    return { nets, normalBroken: false, passiveSplit: false };
  }

  if (frontAPatched && !frontBPatched) {
    // Tap only: normal stays live, frontA taps off it — a passive split.
    const nets = [net(["rearA", "rearB", TAPPING_FRONT_JACK], true)];
    return { nets, normalBroken: false, passiveSplit: true };
  }

  if (!frontAPatched && frontBPatched) {
    // Insert only: frontB breaks the normal and feeds rearB; rearA is left
    // dangling on its own net.
    const nets = [net(["rearA"], false), net([BREAKING_FRONT_JACK, "rearB"], false)];
    return { nets, normalBroken: true, passiveSplit: false };
  }

  // Both patched: frontA taps rearA, frontB breaks the normal into rearB.
  const nets = [
    net(["rearA", TAPPING_FRONT_JACK], false),
    net([BREAKING_FRONT_JACK, "rearB"], false),
  ];
  return { nets, normalBroken: true, passiveSplit: false };
}

function resolveSplit(): PatchResolution {
  // Split mode commons all four terminals regardless of plug state — a
  // passive mult across rear and front on both sides.
  const nets = [net(["rearA", "rearB", "frontA", "frontB"], true)];
  return { nets, normalBroken: false, passiveSplit: true };
}

function resolveIsolated(): PatchResolution {
  // Isolated mode never normals: A and B are two independent circuits
  // regardless of plug state.
  const nets = [net(["rearA", "frontA"], false), net(["rearB", "frontB"], false)];
  return { nets, normalBroken: false, passiveSplit: false };
}

export function resolvePatchPoint(mode: NormallingMode, plug: PlugState): PatchResolution {
  const result =
    mode === "half-normalled"
      ? resolveHalfNormalled(plug)
      : mode === "split"
        ? resolveSplit()
        : resolveIsolated();

  const passiveSplit = result.nets.some(
    (n) => n.passiveSplit || isPassiveSplitNet(n.terminals),
  );

  return { nets: result.nets, normalBroken: result.normalBroken, passiveSplit };
}

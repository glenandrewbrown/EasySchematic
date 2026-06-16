import { Panel } from "@xyflow/react";
import { useSchematicStore } from "../store";
import type { DeviceData, RoomData } from "../types";
import { isSpeaker, resolveSpeakerSpec } from "../speakerSpec";
import { combinedOnAxisSplDb, type SplSource } from "../speakerCoverage";

/** Assumed ceiling height (m) when a room has none set. */
const DEFAULT_CEILING_M = 3;
/** Listener ear-plane height (m). */
const LISTENER_PLANE_M = 1.2;

/**
 * Plan-view readout of the combined nominal on-axis SPL for the currently selected
 * loudspeakers, via speakerCoverage.combinedOnAxisSplDb (incoherent power sum of each
 * speaker's splAtDistanceDb at the listener plane below it). Only speakers with both a
 * sensitivity and a power spec contribute. Shown bottom-center while in plan view with
 * Coverage on and ≥1 speaker selected. Labelled nominal/on-axis — not a measured SPL.
 */
export default function CoverageSplReadout() {
  const canvasViewMode = useSchematicStore((s) => s.canvasViewMode);
  const coverageVisible = useSchematicStore((s) => s.coverageVisible);
  const nodes = useSchematicStore((s) => s.nodes);

  if (canvasViewMode !== "layout" || !coverageVisible) return null;

  const speakers = nodes.filter(
    (n) => n.type === "device" && n.selected && isSpeaker(n.data as DeviceData),
  );
  if (speakers.length === 0) return null;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const sources: SplSource[] = [];
  for (const sp of speakers) {
    const spec = resolveSpeakerSpec(sp.data as DeviceData);
    if (spec.sensitivityDb == null || spec.maxPowerW == null) continue;
    const parent = sp.parentId ? byId.get(sp.parentId) : undefined;
    const hM = (parent?.data as RoomData | undefined)?.heightM;
    const ceilingM = typeof hM === "number" && hM > 0 ? hM : DEFAULT_CEILING_M;
    const distanceM = Math.max(0.1, ceilingM - LISTENER_PLANE_M);
    sources.push({ sensitivityDb: spec.sensitivityDb, powerW: spec.maxPowerW, distanceM });
  }

  const combined = combinedOnAxisSplDb(sources);

  return (
    <Panel position="bottom-center" data-print-hide>
      <div className="rounded-md border border-[var(--ui-border)] bg-[var(--color-surface)] shadow-lg px-3 py-1.5 text-[11px] text-[var(--color-text)]">
        <span className="font-semibold">{speakers.length}</span> speaker
        {speakers.length === 1 ? "" : "s"} selected
        {combined != null ? (
          <>
            {" · combined on-axis SPL ≈ "}
            <span className="font-semibold tabular-nums">{combined.toFixed(1)} dB</span>
            <span className="text-[var(--color-text-muted)]">
              {" "}
              ({sources.length} with specs, nominal)
            </span>
          </>
        ) : (
          <span className="text-[var(--color-text-muted)]">
            {" · set sensitivity & power on a speaker to estimate SPL"}
          </span>
        )}
      </div>
    </Panel>
  );
}

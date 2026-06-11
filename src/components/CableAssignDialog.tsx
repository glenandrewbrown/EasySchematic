import { useEffect, useMemo, useState } from "react";
import { useSchematicStore } from "../store";
import {
  chainLength,
  fitStatus,
  intraRoomDistance,
  metersToUnit,
  remainingQuantities,
  suggestChain,
  type FitStatus,
} from "../cableFit";
import { computeCableLength, formatLength, getRoomDistance } from "../roomDistance";
import { DEFAULT_DISTANCE_SETTINGS } from "../types";
import type { OwnedCableItem } from "../types";

const FIT_BADGE: Record<FitStatus, { text: string; cls: string }> = {
  short: { text: "Too short", cls: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30" },
  ok: { text: "Fits", cls: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30" },
  excess: { text: "Wastefully long", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  unknown: { text: "No estimate", cls: "bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] border-[var(--ui-border)]" },
};

/** Assign owned cables (or a chain of them) to one connection and check the fit. */
export default function CableAssignDialog() {
  const edgeId = useSchematicStore((s) => s.cableAssignEdgeId);
  const setEdgeId = useSchematicStore((s) => s.setCableAssignEdgeId);
  const setShowInventory = useSchematicStore((s) => s.setShowCableInventory);
  const edges = useSchematicStore((s) => s.edges);
  const nodes = useSchematicStore((s) => s.nodes);
  const ownedCables = useSchematicStore((s) => s.ownedCables);
  const roomDistances = useSchematicStore((s) => s.roomDistances);
  const distanceSettings = useSchematicStore((s) => s.distanceSettings) ?? DEFAULT_DISTANCE_SETTINGS;
  const setEdgeAssignedCables = useSchematicStore((s) => s.setEdgeAssignedCables);

  const edge = edges.find((e) => e.id === edgeId);
  const [chainIds, setChainIds] = useState<string[]>([]);

  /* eslint-disable react-hooks/set-state-in-effect -- syncing store edge data to local editor state */
  useEffect(() => {
    setChainIds(edge?.data?.assignedCableIds ?? []);
  }, [edgeId, edge?.data?.assignedCableIds]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const byId = useMemo(
    () => new Map(ownedCables.map((c) => [c.id, c])),
    [ownedCables],
  );

  // Required run length: cross-room distance first, intra-room scale second.
  const required = useMemo(() => {
    if (!edge) return undefined;
    const src = nodes.find((n) => n.id === edge.source);
    const tgt = nodes.find((n) => n.id === edge.target);
    const roomDist = getRoomDistance(src?.parentId, tgt?.parentId, { roomDistances }, nodes);
    if (roomDist !== undefined) return computeCableLength(roomDist, distanceSettings);
    const intraM = intraRoomDistance(nodes, edge.source, edge.target);
    if (intraM !== undefined) {
      return computeCableLength(metersToUnit(intraM, distanceSettings.unit), distanceSettings);
    }
    return undefined;
  }, [edge, nodes, roomDistances, distanceSettings]);

  if (!edge) return null;

  const unit = distanceSettings.unit;
  const chain = chainIds.map((id) => byId.get(id)).filter(Boolean) as OwnedCableItem[];
  const total = chainLength(chain);
  const status = fitStatus(required, total);
  const badge = FIT_BADGE[status];

  // Stock not used by OTHER edges (this edge's saved assignment is freed up for
  // re-picking, minus what's already placed in the local chain).
  const otherEdges = edges.map((e) =>
    e.id === edge.id ? { ...e, data: { ...e.data!, assignedCableIds: undefined } } : e,
  );
  const remaining = remainingQuantities(ownedCables, otherEdges);
  for (const id of chainIds) {
    remaining.set(id, Math.max(0, (remaining.get(id) ?? 0) - 1));
  }

  const handleSuggest = () => {
    if (required === undefined) return;
    const pool = ownedCables.map((cable) => ({
      cable,
      remaining: (remaining.get(cable.id) ?? 0) + chainIds.filter((id) => id === cable.id).length,
    }));
    const suggestion = suggestChain(required, pool);
    if (suggestion) setChainIds(suggestion.map((c) => c.id));
  };

  const close = () => setEdgeId(null);
  const apply = () => {
    setEdgeAssignedCables(edge.id, chainIds);
    close();
  };

  return (
    <div className="ui-dialog-backdrop" data-print-hide onClick={close}>
      <div className="ui-dialog w-[440px] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-[var(--ui-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text-heading)]">
            Assign Cables{edge.data?.cableId ? ` — ${edge.data.cableId}` : ""}
          </h2>
          <button className="ui-btn ui-btn-ghost px-2 py-1" onClick={close} title="Close">✕</button>
        </div>

        <div className="px-4 py-3 overflow-y-auto flex-1 min-h-0">
          {/* Fit summary */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-[var(--color-text)]">
              <div>
                Required:{" "}
                <strong className="tabular-nums">
                  {required !== undefined ? formatLength(required, unit) : "no estimate"}
                </strong>
              </div>
              <div>
                Assigned:{" "}
                <strong className="tabular-nums">
                  {total > 0 ? formatLength(total, unit) : "nothing"}
                </strong>
                {chain.length > 1 && (
                  <span className="text-[var(--color-text-muted)]"> ({chain.length} chained)</span>
                )}
              </div>
            </div>
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${badge.cls}`}>
              {badge.text}
            </span>
          </div>
          {required === undefined && (
            <p className="text-[11px] text-[var(--color-text-muted)] mb-3">
              Set room-to-room distances (View → Room Distances) or give this room real
              dimensions (double-click the room) to get a required-length estimate.
            </p>
          )}

          {/* Current chain */}
          {chain.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                Chain (in order)
              </div>
              <div className="space-y-1">
                {chain.map((c, i) => (
                  <div
                    key={`${c.id}-${i}`}
                    className="flex items-center gap-2 text-xs bg-[var(--color-surface)] border border-[var(--ui-border)] rounded-md px-2 py-1.5"
                  >
                    <span className="text-[var(--color-text-muted)] tabular-nums w-4">{i + 1}.</span>
                    <span className="flex-1 truncate text-[var(--color-text-heading)]">{c.label}</span>
                    <span className="tabular-nums text-[var(--color-text-muted)]">
                      {formatLength(c.length, unit)}
                    </span>
                    <button
                      className="text-red-500/70 hover:text-red-600 cursor-pointer"
                      onClick={() => setChainIds(chainIds.filter((_, idx) => idx !== i))}
                      title="Remove from chain"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              {chain.length > 1 && (
                <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
                  Chained cables need a coupler/barrel at each join ({chain.length - 1} total).
                </p>
              )}
            </div>
          )}

          {/* Available stock */}
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1 flex items-center justify-between">
            <span>Available stock</span>
            {required !== undefined && ownedCables.length > 0 && (
              <button
                className="ui-btn ui-btn-ghost px-2 py-0.5 text-[10px] normal-case tracking-normal"
                onClick={handleSuggest}
              >
                Suggest best fit
              </button>
            )}
          </div>
          {ownedCables.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)] italic">
              Inventory is empty.{" "}
              <button
                className="text-[var(--color-accent)] underline cursor-pointer"
                onClick={() => setShowInventory(true)}
              >
                Add the cables you own
              </button>
              .
            </p>
          ) : (
            <div className="space-y-1 max-h-44 overflow-y-auto">
              {ownedCables.map((c) => {
                const free = remaining.get(c.id) ?? 0;
                return (
                  <div key={c.id} className="flex items-center gap-2 text-xs px-2 py-1 rounded-md hover:bg-[var(--color-surface-hover)]">
                    <span className="flex-1 truncate text-[var(--color-text)]">{c.label}</span>
                    <span className="tabular-nums text-[var(--color-text-muted)]">
                      {formatLength(c.length, unit)}
                    </span>
                    <span className={`tabular-nums w-10 text-right ${free === 0 ? "text-amber-600 dark:text-amber-400" : "text-[var(--color-text-muted)]"}`}>
                      {free} free
                    </span>
                    <button
                      className="ui-btn ui-btn-secondary px-2 py-0.5 text-[10px]"
                      disabled={free === 0}
                      onClick={() => setChainIds([...chainIds, c.id])}
                    >
                      Add
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[var(--ui-border)] flex justify-between gap-2">
          <button
            className="ui-btn ui-btn-ghost"
            onClick={() => setShowInventory(true)}
          >
            Manage Inventory…
          </button>
          <div className="flex gap-2">
            <button className="ui-btn ui-btn-secondary" onClick={close}>Cancel</button>
            <button className="ui-btn ui-btn-primary" onClick={apply}>Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
}

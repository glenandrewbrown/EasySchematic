import { useMemo } from "react";
import { useSchematicStore } from "../store";
import type { CableScheduleRow } from "../cableSchedule";
import type { RunLengthWarning } from "../cableBomBuild";

/**
 * "Cables" tab in the right rail — lists every run with reach/fit status and
 * click-to-locate. Read-only; no data model mutations. Mirrors ValidationPanel's
 * structure and styling so it inherits light/dark + per-workspace accent for free.
 */

interface CablesPanelProps {
  rows: CableScheduleRow[];
  warnings: RunLengthWarning[];
}

const MONO = { fontFamily: "var(--font-mono)" } as const;

function locateEdge(edgeId: string): void {
  useSchematicStore.setState((s) => ({
    nodes: s.nodes.map((n) => ({ ...n, selected: false })),
    edges: s.edges.map((e) => ({ ...e, selected: e.id === edgeId })),
  }));
}

function CableRow({ row, short }: { row: CableScheduleRow; short: boolean }) {
  const displayLength = row.computedLength ?? (row.cableLength || null);
  return (
    <button
      type="button"
      onClick={() => locateEdge(row.edgeId)}
      title="Locate connection on canvas"
      className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
    >
      {/* ID badge */}
      <span
        className="shrink-0 text-[9px] font-bold px-1 py-0.5 rounded border border-[var(--color-border)] text-[var(--color-text-muted)] bg-[var(--color-surface-2,var(--color-surface))]"
        style={MONO}
      >
        {row.cableId}
      </span>

      <span className="min-w-0 flex-1">
        {/* Source → Target */}
        <span className="block text-xs text-[var(--color-text)] leading-snug truncate">
          {row.sourceDevice} → {row.targetDevice}
        </span>
        {/* signal swatch + cable type · length */}
        <span className="flex items-center gap-1 mt-0.5">
          {row.signalTypeId && (
            <span
              aria-hidden="true"
              className="inline-block w-2 h-2 rounded-sm shrink-0"
              style={{ background: `var(--color-${row.signalTypeId})` }}
            />
          )}
          <span
            className="text-[10px] text-[var(--color-text-muted)] truncate"
            style={MONO}
          >
            {row.cableType}
            {displayLength ? ` · ${displayLength}` : ""}
          </span>
        </span>
      </span>

      {/* Fit / short status dot + label */}
      <span className="shrink-0 flex items-center gap-1">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: short ? "var(--color-error)" : "var(--color-success)" }}
          aria-hidden="true"
        />
        <span
          className="text-[9px] font-semibold"
          style={{ ...MONO, color: short ? "var(--color-error)" : "var(--color-success)" }}
        >
          {short ? "short" : "fits"}
        </span>
      </span>
    </button>
  );
}

export default function CablesPanel({ rows, warnings }: CablesPanelProps) {
  const shortEdgeIds = useMemo(
    () => new Set(warnings.map((w) => w.edgeId)),
    [warnings],
  );

  const bannerMessage = useMemo((): string | null => {
    if (warnings.length === 0) return null;
    if (warnings.length === 1) {
      const w = warnings[0];
      const overM = Math.round((w.lengthM - w.maxRunM) * 10) / 10;
      return `${w.cableId} is ${overM} m short`;
    }
    return `${warnings.length} runs exceed max cable length`;
  }, [warnings]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header summary */}
      <div className="px-3 py-2 border-b border-[var(--ui-border)] shrink-0 text-[11px] text-[var(--color-text-muted)] flex items-center gap-3">
        {rows.length === 0 ? (
          <span>No connections</span>
        ) : (
          <span style={MONO}>
            {rows.length} run{rows.length === 1 ? "" : "s"}
          </span>
        )}
        {warnings.length > 0 && (
          <span className="text-[var(--color-error)]" style={MONO}>
            {warnings.length} short
          </span>
        )}
      </div>

      {/* Coral warning banner — only when ≥1 short run */}
      {bannerMessage && (
        <div
          className="shrink-0 px-3 py-2 border-b text-[11px] flex items-center gap-1.5"
          style={{
            background: "color-mix(in srgb, var(--color-error) 12%, transparent)",
            borderColor: "color-mix(in srgb, var(--color-error) 30%, transparent)",
            color: "var(--color-error)",
          }}
        >
          <svg
            viewBox="0 0 16 16"
            className="w-3.5 h-3.5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M8 2L14 13H2L8 2z" />
            <path d="M8 7v3M8 11.5v.5" />
          </svg>
          <span>{bannerMessage}</span>
        </div>
      )}

      {/* Row list */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-px">
        {rows.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 px-4 text-center text-[var(--color-text-muted)]">
            <svg
              viewBox="0 0 24 24"
              className="w-7 h-7 opacity-40"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M17 7 7 17M7 7l10 10" />
              <circle cx="12" cy="12" r="9" />
            </svg>
            <span className="text-xs">No connections on this schematic.</span>
          </div>
        ) : (
          rows.map((row) => (
            <CableRow
              key={row.edgeId}
              row={row}
              short={shortEdgeIds.has(row.edgeId)}
            />
          ))
        )}
      </div>

      {/* Footer: Export pull-sheet */}
      <div className="shrink-0 border-t border-[var(--ui-border)] p-2">
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("easyschematic:open-cable-bom"))
          }
          className="ui-btn-commit w-full flex items-center justify-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-semibold transition-colors cursor-pointer"
        >
          Export pull-sheet
        </button>
      </div>
    </div>
  );
}

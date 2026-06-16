import { useMemo } from "react";
import { useSchematicStore } from "../store";
import type { IssueKind, ValidationIssue } from "../validation";

/**
 * The "Validate" tab of the right rail. Lists AV design-rule issues from the pure
 * validation engine; clicking a row selects the offending device(s)/connection on
 * the canvas (click-to-locate) so the Inspect tab can act on it.
 */

const KIND_LABEL: Record<IssueKind, string> = {
  "port-incompatible": "Signal mismatch",
  "missing-power": "No power",
  "unassigned-room": "No room",
  "duplicate-ip": "Duplicate IP",
};

/** Select the issue's participants on the canvas (single source of truth = node.selected). */
function locate(issue: ValidationIssue): void {
  const nodeIds = new Set(issue.nodeIds);
  useSchematicStore.setState((s) => ({
    nodes: s.nodes.map((n) => ({ ...n, selected: nodeIds.has(n.id) })),
    edges: s.edges.map((e) => ({ ...e, selected: e.id === issue.edgeId })),
  }));
  // Best-effort recenter; harmless if no listener is mounted.
  window.dispatchEvent(new CustomEvent("easyschematic:locate", { detail: { nodeIds: issue.nodeIds } }));
}

export default function ValidationPanel({ issues }: { issues: ValidationIssue[] }) {
  const sorted = useMemo(
    () => [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1)),
    [issues],
  );
  const errors = sorted.filter((i) => i.severity === "error").length;
  const warnings = sorted.length - errors;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--ui-border)] shrink-0 text-[11px] text-[var(--color-text-muted)] flex items-center gap-3">
        {sorted.length === 0 ? (
          <span>No issues</span>
        ) : (
          <>
            {errors > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                {errors} error{errors === 1 ? "" : "s"}
              </span>
            )}
            {warnings > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                {warnings} warning{warnings === 1 ? "" : "s"}
              </span>
            )}
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {sorted.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 px-4 text-center text-[var(--color-text-muted)]">
            <svg viewBox="0 0 24 24" className="w-7 h-7 text-green-500" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <span className="text-xs">No design issues detected.</span>
          </div>
        ) : (
          sorted.map((iss) => (
            <button
              key={iss.id}
              onClick={() => locate(iss)}
              className="w-full text-left flex gap-2 items-start px-2 py-1.5 rounded-md hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
              title="Select on canvas"
            >
              <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${iss.severity === "error" ? "bg-red-500" : "bg-amber-500"}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-[var(--color-text)] leading-snug">{iss.message}</span>
                <span className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mt-0.5">
                  {KIND_LABEL[iss.kind]}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

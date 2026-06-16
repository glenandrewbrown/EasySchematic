import { useMemo } from "react";
import { useSchematicStore } from "../store";
import { countIssues } from "../validation";
import type { IssueKind, IssueSeverity, ValidationIssue } from "../validation";

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

/** Tailwind classes for the leading severity dot — matches on-canvas dots + top-bar badge. */
const DOT_COLOR: Record<IssueSeverity, string> = {
  error: "bg-[#ef4444]",
  warning: "bg-[#f59e0b]",
};

/** A single issue row: severity dot + message + kind label, click-to-locate on the canvas. */
function IssueRow({ issue }: { issue: ValidationIssue }) {
  return (
    <button
      onClick={() => locate(issue)}
      className="w-full text-left flex gap-2 items-start px-2 py-1.5 rounded-md hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
      title="Select on canvas"
    >
      <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${DOT_COLOR[issue.severity]}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-[var(--color-text)] leading-snug">{issue.message}</span>
        <span className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mt-0.5">
          {KIND_LABEL[issue.kind]}
        </span>
      </span>
    </button>
  );
}

/** A severity group ("ERRORS 2" / "WARNINGS 4") with its issue rows; renders nothing when empty. */
function IssueGroup({ label, issues }: { label: string; issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <section className="space-y-0.5">
      <div className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-semibold select-none">
        {label} {issues.length}
      </div>
      <div className="space-y-px divide-y divide-[var(--ui-border)]">
        {issues.map((iss) => (
          <IssueRow key={iss.id} issue={iss} />
        ))}
      </div>
    </section>
  );
}

export default function ValidationPanel({ issues }: { issues: ValidationIssue[] }) {
  const { errorIssues, warningIssues, counts } = useMemo(() => {
    const errorIssues = issues.filter((i) => i.severity === "error");
    const warningIssues = issues.filter((i) => i.severity === "warning");
    return { errorIssues, warningIssues, counts: countIssues(issues) };
  }, [issues]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--ui-border)] shrink-0 text-[11px] text-[var(--color-text-muted)] flex items-center gap-3">
        {counts.total === 0 ? (
          <span>No issues</span>
        ) : (
          <>
            {counts.errors > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#ef4444]" />
                {counts.errors} error{counts.errors === 1 ? "" : "s"}
              </span>
            )}
            {counts.warnings > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
                {counts.warnings} warning{counts.warnings === 1 ? "" : "s"}
              </span>
            )}
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
        {counts.total === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 px-4 text-center text-[var(--color-text-muted)]">
            <svg viewBox="0 0 24 24" className="w-7 h-7 text-green-500" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <span className="text-xs">No issues found.</span>
          </div>
        ) : (
          <>
            <IssueGroup label="Errors" issues={errorIssues} />
            <IssueGroup label="Warnings" issues={warningIssues} />
          </>
        )}
      </div>
    </div>
  );
}

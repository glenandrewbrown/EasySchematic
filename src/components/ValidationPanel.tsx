import { useMemo, useState } from "react";
import { useSchematicStore } from "../store";
import { countIssues } from "../validation";
import type { IssueKind, IssueSeverity, ValidationIssue } from "../validation";

/**
 * The "Validate" tab of the right rail. Lists AV design-rule issues from the pure
 * validation engine; clicking a row selects the offending device(s)/connection on
 * the canvas (click-to-locate). Each row can be dismissed (×) — dismissed issues are
 * persisted per-document and hidden behind a "Show dismissed" toggle; the tab badge
 * and header counts exclude them. An issue re-surfaces automatically if it is fixed
 * and later recurs (dismissal is keyed on the stable issue id).
 */

const KIND_LABEL: Record<IssueKind, string> = {
  "port-incompatible": "Signal mismatch",
  "connector-mismatch": "Connector mismatch",
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
  error: "bg-[var(--color-error)]",
  warning: "bg-[var(--color-warning)]",
};

/** A single issue row: severity dot + message + kind label (click-to-locate), and a
 *  hover-revealed dismiss (×) / restore (↺) button on the right. */
function IssueRow({
  issue,
  dismissed,
  onToggleDismiss,
}: {
  issue: ValidationIssue;
  dismissed: boolean;
  onToggleDismiss: (id: string) => void;
}) {
  return (
    <div className="group/row flex items-stretch">
      <button
        onClick={() => locate(issue)}
        className={`flex-1 min-w-0 text-left flex gap-2 items-start px-2 py-1.5 rounded-md hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer ${
          dismissed ? "opacity-50" : ""
        }`}
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
      <button
        onClick={() => onToggleDismiss(issue.id)}
        className="shrink-0 px-1.5 flex items-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] opacity-0 group-hover/row:opacity-100 transition-opacity cursor-pointer"
        title={dismissed ? "Restore issue" : "Dismiss issue"}
        aria-label={dismissed ? "Restore issue" : "Dismiss issue"}
      >
        {dismissed ? (
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8a4.5 4.5 0 1 1 1.3 3.2M3.5 8V5M3.5 8h3" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        )}
      </button>
    </div>
  );
}

/** A severity group ("ERRORS 2" / "WARNINGS 4") with its issue rows; renders nothing when empty. */
function IssueGroup({
  label,
  issues,
  dismissed,
  onToggleDismiss,
}: {
  label: string;
  issues: ValidationIssue[];
  dismissed: boolean;
  onToggleDismiss: (id: string) => void;
}) {
  if (issues.length === 0) return null;
  return (
    <section className="space-y-0.5">
      <div className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-semibold select-none">
        {label} {issues.length}
      </div>
      <div className="space-y-px divide-y divide-[var(--ui-border)]">
        {issues.map((iss) => (
          <IssueRow key={iss.id} issue={iss} dismissed={dismissed} onToggleDismiss={onToggleDismiss} />
        ))}
      </div>
    </section>
  );
}

interface ValidationPanelProps {
  issues: ValidationIssue[];
  /** Stable ids of issues the user has dismissed (persisted per-document). */
  dismissedIds: Set<string>;
  onDismiss: (id: string) => void;
  onUndismiss: (id: string) => void;
}

export default function ValidationPanel({ issues, dismissedIds, onDismiss, onUndismiss }: ValidationPanelProps) {
  const [showDismissed, setShowDismissed] = useState(false);
  // Warnings are opt-in app-wide (View ▸ Show warnings). When off, the panel hides the
  // warnings group and offers a one-click reveal so they remain discoverable here.
  const showWarnings = useSchematicStore((s) => s.showWarnings);
  const setShowWarnings = useSchematicStore((s) => s.setShowWarnings);

  const { active, dismissed, counts } = useMemo(() => {
    const active = issues.filter((i) => !dismissedIds.has(i.id));
    const dismissed = issues.filter((i) => dismissedIds.has(i.id));
    return { active, dismissed, counts: countIssues(active) };
  }, [issues, dismissedIds]);

  const errorIssues = active.filter((i) => i.severity === "error");
  const warningIssues = active.filter((i) => i.severity === "warning");
  const warningsHidden = !showWarnings && warningIssues.length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--ui-border)] shrink-0 text-[11px] text-[var(--color-text-muted)] flex items-center gap-3">
        {counts.total === 0 ? (
          <span>No issues</span>
        ) : (
          <>
            {counts.errors > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[var(--color-error)]" />
                {counts.errors} error{counts.errors === 1 ? "" : "s"}
              </span>
            )}
            {counts.warnings > 0 && showWarnings && (
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[var(--color-warning)]" />
                {counts.warnings} warning{counts.warnings === 1 ? "" : "s"}
              </span>
            )}
          </>
        )}
        {warningsHidden && (
          <button
            onClick={() => setShowWarnings(true)}
            title="Warnings are hidden app-wide (View ▸ Show warnings). Click to reveal."
            className="inline-flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-[var(--color-warning)] opacity-40" />
            {counts.warnings} warning{counts.warnings === 1 ? "" : "s"} hidden · Show
          </button>
        )}
        {dismissed.length > 0 && (
          <button
            onClick={() => setShowDismissed((v) => !v)}
            className="ml-auto text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer shrink-0"
          >
            {showDismissed ? "Hide" : "Show"} dismissed ({dismissed.length})
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
        {errorIssues.length === 0 && (!showWarnings || warningIssues.length === 0) && dismissed.length === 0 ? (
          warningsHidden ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 px-4 text-center text-[var(--color-text-muted)]">
              <span className="text-xs">No errors.</span>
              <button
                onClick={() => setShowWarnings(true)}
                className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] underline decoration-dotted cursor-pointer"
              >
                {counts.warnings} warning{counts.warnings === 1 ? "" : "s"} hidden — show them
              </button>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-2 px-4 text-center text-[var(--color-text-muted)]">
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-[var(--color-success)]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <span className="text-xs">No issues found.</span>
            </div>
          )
        ) : (
          <>
            {counts.total === 0 && (
              <div className="px-2 py-3 text-center text-xs text-[var(--color-text-muted)]">
                All active issues dismissed.
              </div>
            )}
            <IssueGroup label="Errors" issues={errorIssues} dismissed={false} onToggleDismiss={onDismiss} />
            {showWarnings && (
              <IssueGroup label="Warnings" issues={warningIssues} dismissed={false} onToggleDismiss={onDismiss} />
            )}
            {showDismissed && (
              <IssueGroup label="Dismissed" issues={dismissed} dismissed={true} onToggleDismiss={onUndismiss} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

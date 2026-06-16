import { useMemo } from "react";
import { useSchematicStore } from "../store";
import { validateSchematic, countIssues } from "../validation";

/**
 * Persistent icon toolbar (OmniGraffle / draw.io style) sitting beneath the menu bar.
 * Surfaces the highest-value tools and the previously menu-buried features (Plan,
 * Coverage, Cable BOM, Reports, Guided Setup) as one-click, discoverable controls.
 *
 * Reads UI state from the store and fires window CustomEvents for actions owned by
 * MenuBar (save/open/new/reports/cable-bom/fit) so it needs no React Flow provider.
 */

const fire = (name: string) => window.dispatchEvent(new CustomEvent(name));

const ICON = {
  new: (
    <>
      <path d="M4.5 2.5h4.6L12 5.4V13a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5z" />
      <path d="M9 2.6V5.6h3" />
    </>
  ),
  open: <path d="M2.2 4.6a1 1 0 0 1 1-1h2.8L7.5 5H12.8a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3.2a1 1 0 0 1-1-1z" />,
  save: (
    <>
      <path d="M3 9.5v3a.8.8 0 0 0 .8.8h8.4a.8.8 0 0 0 .8-.8v-3" />
      <path d="M8 2.6v7.4M5.3 7.4 8 10.1l2.7-2.7" />
    </>
  ),
  undo: (
    <>
      <path d="M3 7h7a3 3 0 0 1 0 6H9" />
      <path d="M6 4 3 7l3 3" />
    </>
  ),
  redo: (
    <>
      <path d="M13 7H6a3 3 0 0 0 0 6h1" />
      <path d="M10 4l3 3-3 3" />
    </>
  ),
  coverage: <path d="M8 13 4.2 5.4a5 5 0 0 1 7.6 0z" />,
  fit: <path d="M3 6V3.4h2.6M13 6V3.4h-2.6M3 10v2.6h2.6M13 10v2.6h-2.6" />,
  bom: (
    <>
      <rect x="2.6" y="3" width="10.8" height="10" rx="1.2" />
      <path d="M2.6 6.4h10.8M7 6.4V13" />
    </>
  ),
  reports: (
    <>
      <path d="M4.4 2.6h4.4L12 5.5v7.9a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5z" />
      <path d="M6.2 11.2V9.4M8 11.2V7.8M9.8 11.2V8.8" />
    </>
  ),
  guide: (
    <>
      <path d="M6.5 4.2h6.8M6.5 8h6.8M6.5 11.8h6.8" />
      <path d="M2.4 4.1l.9.9 1.6-1.9M2.4 7.9l.9.9 1.6-1.9" />
    </>
  ),
} as const;

function Icon({ name }: { name: keyof typeof ICON }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="w-[15px] h-[15px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICON[name]}
    </svg>
  );
}

interface ToolButtonProps {
  label: string;
  name: keyof typeof ICON;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

function ToolButton({ label, name, onClick, active, disabled }: ToolButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer ${
        active
          ? "bg-[var(--color-accent)] text-white"
          : "text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
      }`}
    >
      <Icon name={name} />
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-[var(--ui-border)] mx-1.5 shrink-0" />;
}

export default function Toolbar() {
  const undo = useSchematicStore((s) => s.undo);
  const redo = useSchematicStore((s) => s.redo);
  const undoSize = useSchematicStore((s) => s.undoSize);
  const redoSize = useSchematicStore((s) => s.redoSize);
  const canvasViewMode = useSchematicStore((s) => s.canvasViewMode);
  const setCanvasViewMode = useSchematicStore((s) => s.setCanvasViewMode);
  const coverageVisible = useSchematicStore((s) => s.coverageVisible);
  const setCoverageVisible = useSchematicStore((s) => s.setCoverageVisible);
  const setGuidedSetupOpen = useSchematicStore((s) => s.setGuidedSetupOpen);
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const issueCounts = useMemo(() => countIssues(validateSchematic(nodes, edges)), [nodes, edges]);

  const segBtn = (mode: "schematic" | "plan" | "schedule", text: string) => (
    <button
      type="button"
      onClick={() => setCanvasViewMode(mode)}
      aria-pressed={canvasViewMode === mode}
      title={mode === "schematic" ? "Signal-flow diagram view" : mode === "plan" ? "To-scale floor-plan view" : "Cable schedule & BOM"}
      className={`px-3 h-7 text-xs font-medium transition-colors cursor-pointer ${
        canvasViewMode === mode
          ? "bg-[var(--color-accent)] text-white"
          : "text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
      }`}
    >
      {text}
    </button>
  );

  return (
    <div
      className="hidden md:flex items-center gap-0.5 h-11 px-2 bg-[var(--color-surface-raised)] border-b border-[var(--ui-border)] shrink-0 select-none"
      style={{ boxShadow: "var(--ui-shadow-toolbar)" }}
      data-print-hide
      role="toolbar"
      aria-label="Main toolbar"
    >
      <ToolButton label="New schematic" name="new" onClick={() => fire("easyschematic:new")} />
      <ToolButton label="Open…  (Ctrl+O)" name="open" onClick={() => fire("easyschematic:open")} />
      <ToolButton label="Save  (Ctrl+S)" name="save" onClick={() => fire("easyschematic:save")} />

      <Divider />

      <ToolButton label="Undo  (Ctrl+Z)" name="undo" onClick={undo} disabled={undoSize === 0} />
      <ToolButton label="Redo  (Ctrl+Shift+Z)" name="redo" onClick={redo} disabled={redoSize === 0} />

      <Divider />

      <div className="flex rounded-md border border-[var(--ui-border-strong)] overflow-hidden" role="group" aria-label="Canvas view">
        {segBtn("schematic", "Schematic")}
        {segBtn("plan", "Plan")}
        {segBtn("schedule", "Schedule")}
      </div>
      <ToolButton
        label={canvasViewMode === "plan" ? "Toggle speaker coverage" : "Coverage (switch to Plan first)"}
        name="coverage"
        active={coverageVisible && canvasViewMode === "plan"}
        disabled={canvasViewMode !== "plan"}
        onClick={() => setCoverageVisible(!coverageVisible)}
      />
      <ToolButton label="Fit to screen" name="fit" onClick={() => fire("easyschematic:fit-view")} />
      <button
        type="button"
        onClick={() => fire("easyschematic:show-validate")}
        title={issueCounts.total === 0 ? "No design issues" : `${issueCounts.errors} error(s) · ${issueCounts.warnings} warning(s) — open Validate`}
        aria-label="Validation issues"
        className="flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium transition-colors cursor-pointer hover:bg-[var(--color-surface-hover)]"
      >
        <span className={`w-2 h-2 rounded-full ${issueCounts.errors > 0 ? "bg-red-500" : issueCounts.total > 0 ? "bg-amber-500" : "bg-green-500"}`} />
        <span className="tabular-nums text-[var(--color-text-muted)]">{issueCounts.total}</span>
      </button>

      <Divider />

      <ToolButton label="Cable BOM" name="bom" onClick={() => fire("easyschematic:open-cable-bom")} />
      <ToolButton label="Reports" name="reports" onClick={() => fire("easyschematic:open-reports")} />

      <Divider />

      <ToolButton label="Guided Venue Setup" name="guide" onClick={() => setGuidedSetupOpen(true)} />

      <div className="flex-1" />
    </div>
  );
}

import { useMemo } from "react";
import {
  FilePlus,
  FolderOpen,
  Save,
  Undo2,
  Redo2,
  Cone,
  Maximize,
  ScanSearch,
  Table,
  FileText,
  Wand2,
  type LucideIcon,
} from "lucide-react";
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

/** Toolbar action -> lucide icon. One icon family across the whole app chrome. */
const ICON = {
  new: FilePlus,
  open: FolderOpen,
  save: Save,
  undo: Undo2,
  redo: Redo2,
  coverage: Cone,
  fit: Maximize,
  zoomSel: ScanSearch,
  bom: Table,
  reports: FileText,
  guide: Wand2,
} satisfies Record<string, LucideIcon>;

function Icon({ name }: { name: keyof typeof ICON }) {
  const Glyph = ICON[name];
  return <Glyph className="w-[15px] h-[15px]" strokeWidth={1.75} aria-hidden />;
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
          ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
          : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
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

  const segBtn = (mode: "schematic" | "layout" | "schedule", text: string) => (
    <button
      type="button"
      onClick={() => setCanvasViewMode(mode)}
      aria-pressed={canvasViewMode === mode}
      title={mode === "schematic" ? "Signal-flow diagram view" : mode === "layout" ? "To-scale layout view — floor plan, vectors, furniture" : "Cable schedule & BOM"}
      className={`px-3 h-7 text-[11px] font-medium uppercase transition-colors cursor-pointer ${
        canvasViewMode === mode
          ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-semibold"
          : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
      }`}
      style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}
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
        {segBtn("layout", "Layout")}
        {segBtn("schedule", "Schedule")}
      </div>
      <ToolButton
        label={canvasViewMode === "layout" ? "Toggle speaker coverage" : "Coverage (switch to Layout first)"}
        name="coverage"
        active={coverageVisible && canvasViewMode === "layout"}
        disabled={canvasViewMode !== "layout"}
        onClick={() => setCoverageVisible(!coverageVisible)}
      />
      <ToolButton label="Fit to screen" name="fit" onClick={() => fire("easyschematic:fit-view")} />
      <ToolButton label="Zoom to selection" name="zoomSel" onClick={() => fire("easyschematic:zoom-to-selection")} />
      <button
        type="button"
        onClick={() => fire("easyschematic:show-validate")}
        title={issueCounts.total === 0 ? "No design issues" : `${issueCounts.errors} error(s) · ${issueCounts.warnings} warning(s) — open Validate`}
        aria-label="Validation issues"
        className="flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium transition-colors cursor-pointer hover:bg-[var(--color-surface-hover)]"
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{
            background:
              issueCounts.errors > 0
                ? "var(--color-error)"
                : issueCounts.total > 0
                  ? "var(--color-warning)"
                  : "var(--color-success)",
          }}
        />
        <span className="tabular-nums text-[var(--color-text-muted)]" style={{ fontFamily: "var(--font-mono)" }}>
          {issueCounts.total}
        </span>
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

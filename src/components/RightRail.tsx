import { useEffect, useMemo, useRef, useState } from "react";
import { useSchematicStore } from "../store";
import { validateSchematic, countIssues, activeIssues } from "../validation";
import Inspector from "./Inspector";
import LayersPanel from "./LayersPanel";
import ValidationPanel from "./ValidationPanel";
import ViewOptionsPanel from "./ViewOptionsPanel";
import ShowInfoPanel from "./ShowInfoPanel";
import SignalColorPanel from "./SignalColorPanel";

/**
 * Single consolidated right rail, restructured to match the design mockup:
 *   - Top tab row: Inspect | Issues (Issues shows the validation engine's findings,
 *     with a live count badge).
 *   - Inspector / Issues content scrolls in the upper region.
 *   - Layers is docked at the bottom (Photoshop-style) in a collapsible section
 *     with its own "Layers · N items" header + chevron.
 *   - View Options (display / title-block / signal-colour settings) are relocated
 *     behind a "View" gear popover in the rail header, keeping every toggle reachable
 *     while freeing the tab row for just Inspect | Issues.
 */

type Tab = "inspect" | "issues";
const TAB_STORAGE_KEY = "easyschematic-rightrail-tab";
const LAYERS_STORAGE_KEY = "easyschematic-rightrail-layers-open";

/** Mono section/count label style — engineering-instrument look. */
const MONO_STYLE = { fontFamily: "var(--font-mono)" } as const;

function ChevronRight({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`w-3.5 h-3.5 ${className}`} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function LayersStackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round">
      <path d="M12 2 2 7l10 5 10-5-10-5z" />
      <path d="M2 12l10 5 10-5" />
      <path d="M2 17l10 5 10-5" />
    </svg>
  );
}

function TabButton({
  id,
  label,
  active,
  onSelect,
  badge,
  badgeTone,
}: {
  id: Tab;
  label: string;
  active: Tab;
  onSelect: (t: Tab) => void;
  badge?: number;
  badgeTone?: "error" | "warning";
}) {
  const selected = active === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => onSelect(id)}
      className={`relative flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer ${
        selected
          ? "text-[var(--color-accent)] bg-[var(--color-surface-2,var(--color-surface))] border border-[var(--color-border)]"
          : "text-[var(--color-text-muted)] border border-transparent hover:text-[var(--color-text)]"
      }`}
    >
      {label}
      {badge != null && badge > 0 && (
        <span
          className={`inline-flex items-center justify-center min-w-[15px] h-[15px] px-1 rounded text-[9px] font-bold text-white ${
            badgeTone === "error" ? "bg-red-500" : "bg-amber-500"
          }`}
          style={MONO_STYLE}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

export default function RightRail() {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const dismissedIssueIds = useSchematicStore((s) => s.dismissedIssueIds);
  const dismissIssue = useSchematicStore((s) => s.dismissIssue);
  const undismissIssue = useSchematicStore((s) => s.undismissIssue);
  const issues = useMemo(() => validateSchematic(nodes, edges), [nodes, edges]);
  const dismissedSet = useMemo(() => new Set(dismissedIssueIds), [dismissedIssueIds]);
  const counts = useMemo(() => countIssues(activeIssues(issues, dismissedSet)), [issues, dismissedSet]);
  const layerItemCount = nodes.length;

  const [tab, setTabState] = useState<Tab>(
    () => ((localStorage.getItem(TAB_STORAGE_KEY) as Tab | null) ?? "inspect"),
  );
  const setTab = (t: Tab) => {
    setTabState(t);
    localStorage.setItem(TAB_STORAGE_KEY, t);
  };

  const [layersOpen, setLayersOpen] = useState<boolean>(
    () => localStorage.getItem(LAYERS_STORAGE_KEY) !== "false",
  );
  const toggleLayers = () => {
    setLayersOpen((prev) => {
      const next = !prev;
      localStorage.setItem(LAYERS_STORAGE_KEY, String(next));
      return next;
    });
  };

  const [viewOpen, setViewOpen] = useState(false);
  const viewRef = useRef<HTMLDivElement | null>(null);

  // The top-bar validation badge dispatches this to jump straight to the Issues tab.
  useEffect(() => {
    const onShow = () => {
      setTabState("issues");
      localStorage.setItem(TAB_STORAGE_KEY, "issues");
    };
    window.addEventListener("easyschematic:show-validate", onShow);
    return () => window.removeEventListener("easyschematic:show-validate", onShow);
  }, []);

  // Close the View popover on outside-click / Escape.
  useEffect(() => {
    if (!viewOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (viewRef.current && !viewRef.current.contains(e.target as Node)) setViewOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [viewOpen]);

  return (
    <div className="w-72 bg-[var(--color-surface)] border-l border-[var(--color-border)] flex flex-col h-full overflow-hidden relative">
      {/* Tab row + View popover trigger */}
      <div
        className="flex items-center gap-1 px-2 py-2 border-b border-[var(--ui-border)] shrink-0"
        role="tablist"
        aria-label="Right panel"
      >
        <TabButton id="inspect" label="Inspect" active={tab} onSelect={setTab} />
        <TabButton
          id="issues"
          label="Issues"
          active={tab}
          onSelect={setTab}
          badge={counts.total}
          badgeTone={counts.errors > 0 ? "error" : "warning"}
        />
        <div className="ml-auto" ref={viewRef}>
          <button
            type="button"
            aria-label="View options"
            aria-expanded={viewOpen}
            title="View options"
            onClick={() => setViewOpen((v) => !v)}
            className={`flex items-center gap-1.5 h-7 px-2 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
              viewOpen
                ? "text-[var(--color-accent)] border-[var(--color-border)] bg-[var(--color-surface-2,var(--color-surface))]"
                : "text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text)]"
            }`}
          >
            <GearIcon />
            <span>View</span>
          </button>
          {viewOpen && (
            <div className="absolute right-2 top-12 z-30 w-72 max-h-[70vh] overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_14px_38px_-22px_rgba(0,0,0,.9)]">
              <ViewOptionsPanel mobile onClose={() => setViewOpen(false)} />
              <div className="border-t border-[var(--ui-border)]">
                <ShowInfoPanel mobile onClose={() => setViewOpen(false)} />
              </div>
              <div className="border-t border-[var(--ui-border)]">
                <SignalColorPanel mobile onClose={() => setViewOpen(false)} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upper region: Inspect / Issues content (scrolls) */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "inspect" && <Inspector embedded />}
        {tab === "issues" && (
          <ValidationPanel
            issues={issues}
            dismissedIds={dismissedSet}
            onDismiss={dismissIssue}
            onUndismiss={undismissIssue}
          />
        )}
      </div>

      {/* Docked Layers (bottom, collapsible) */}
      <div className="shrink-0 border-t border-[var(--color-border)] flex flex-col">
        <button
          type="button"
          onClick={toggleLayers}
          aria-expanded={layersOpen}
          className="flex items-center gap-2 px-3 py-2 cursor-pointer text-left hover:bg-[var(--color-surface-2,transparent)] transition-colors"
        >
          <span className="text-[var(--color-text-muted)]">
            <LayersStackIcon />
          </span>
          <span className="text-[11px] font-semibold text-[var(--color-text)]">Layers</span>
          <span className="text-[9px] text-[var(--color-text-muted)]" style={MONO_STYLE}>
            · {layerItemCount} item{layerItemCount === 1 ? "" : "s"}
          </span>
          <span className="ml-auto text-[var(--color-text-muted)]">
            <ChevronRight className={`transition-transform ${layersOpen ? "rotate-90" : ""}`} />
          </span>
        </button>
        {layersOpen && (
          <div className="h-56 min-h-0 border-t border-[var(--ui-border)] overflow-hidden">
            <LayersPanel embedded />
          </div>
        )}
      </div>
    </div>
  );
}

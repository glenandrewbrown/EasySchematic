import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useSchematicStore } from "../store";
import { validateSchematic, countIssues, activeIssues } from "../validation";
import { computeCableSchedule } from "../cableSchedule";
import { runLengthWarnings } from "../cableBomBuild";
import Inspector from "./Inspector";
import LayersPanel from "./LayersPanel";
import ValidationPanel from "./ValidationPanel";
import CablesPanel from "./CablesPanel";
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

type Tab = "inspect" | "issues" | "cables";
const TAB_STORAGE_KEY = "easyschematic-rightrail-tab";
const LAYERS_STORAGE_KEY = "easyschematic-rightrail-layers-open";
const LAYERS_HEIGHT_STORAGE_KEY = "easyschematic-rightrail-layers-height";
/** Docked Layers section: drag-resizable height bounds (px). */
const LAYERS_MIN_H = 120;
const LAYERS_MAX_H = 620;
const LAYERS_DEFAULT_H = 224;

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
          className="inline-flex items-center justify-center min-w-[15px] h-[15px] px-1 rounded text-[9px] font-bold"
          style={{
            ...MONO_STYLE,
            color: badgeTone === "error" ? "var(--color-error)" : "var(--color-warning)",
            background: `color-mix(in srgb, ${badgeTone === "error" ? "var(--color-error)" : "var(--color-warning)"} 18%, transparent)`,
          }}
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
  const layerColorMode = useSchematicStore((s) => s.layerColorMode);
  const setLayerColorMode = useSchematicStore((s) => s.setLayerColorMode);
  const dismissedIssueIds = useSchematicStore((s) => s.dismissedIssueIds);
  const dismissIssue = useSchematicStore((s) => s.dismissIssue);
  const undismissIssue = useSchematicStore((s) => s.undismissIssue);
  const showWarnings = useSchematicStore((s) => s.showWarnings);
  const cableNamingScheme = useSchematicStore((s) => s.cableNamingScheme);
  const roomDistances = useSchematicStore((s) => s.roomDistances);
  const distanceSettings = useSchematicStore((s) => s.distanceSettings);

  const issues = useMemo(() => validateSchematic(nodes, edges), [nodes, edges]);

  const cableRows = useMemo(
    () => computeCableSchedule(nodes, edges, cableNamingScheme, { roomDistances, distanceSettings }),
    [nodes, edges, cableNamingScheme, roomDistances, distanceSettings],
  );
  const cableWarnings = useMemo(() => runLengthWarnings(cableRows), [cableRows]);
  const dismissedSet = useMemo(() => new Set(dismissedIssueIds), [dismissedIssueIds]);
  const counts = useMemo(() => countIssues(activeIssues(issues, dismissedSet)), [issues, dismissedSet]);
  const layerItemCount = nodes.length;

  // Current single-selection id: exactly one node and no edges, or exactly one
  // edge and no nodes. Anything else (none / multi / mixed) is null.
  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedEdges = edges.filter((e) => e.selected);
  const singleSelId =
    selectedNodes.length === 1 && selectedEdges.length === 0
      ? selectedNodes[0].id
      : selectedNodes.length === 0 && selectedEdges.length === 1
        ? selectedEdges[0].id
        : null;

  const [tab, setTabState] = useState<Tab>(
    () => ((localStorage.getItem(TAB_STORAGE_KEY) as Tab | null) ?? "inspect"),
  );
  const setTab = (t: Tab) => {
    setTabState(t);
    localStorage.setItem(TAB_STORAGE_KEY, t);
  };

  // When the selection BECOMES a new single device/connection, focus the
  // Inspector. We adjust state during render (the ref-comparison pattern from
  // the React docs) rather than in an effect, so the switch is synchronous and
  // lint-clean. Only switch when the selected id changes to a new non-null
  // value — manually clicking Issues with the same node still selected stays on
  // Issues — and the ref is always updated (including to null) so re-selecting
  // the same device later triggers a switch again.
  const lastSingleSelId = useRef<string | null>(null);
  if (singleSelId !== lastSingleSelId.current) {
    lastSingleSelId.current = singleSelId;
    if (singleSelId != null) setTab("inspect");
  }

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

  // Drag-to-resize the docked Layers section (mirrors the RotationHandle pointer-capture
  // pattern). Dragging the divider up grows the panel; the height persists across reloads.
  const [layersHeight, setLayersHeight] = useState<number>(() => {
    const stored = Number(localStorage.getItem(LAYERS_HEIGHT_STORAGE_KEY));
    return Number.isFinite(stored) && stored >= LAYERS_MIN_H
      ? Math.min(stored, LAYERS_MAX_H)
      : LAYERS_DEFAULT_H;
  });
  const layersResizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const onLayersResizeDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    layersResizeRef.current = { startY: e.clientY, startH: layersHeight };
  };
  const onLayersResizeMove = (e: ReactPointerEvent) => {
    const drag = layersResizeRef.current;
    if (!drag) return;
    const next = Math.max(LAYERS_MIN_H, Math.min(LAYERS_MAX_H, drag.startH + (drag.startY - e.clientY)));
    setLayersHeight(next);
  };
  const onLayersResizeUp = (e: ReactPointerEvent) => {
    if (!layersResizeRef.current) return;
    layersResizeRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    localStorage.setItem(LAYERS_HEIGHT_STORAGE_KEY, String(layersHeight));
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

  // Command-palette "Go to cables" jumps directly to the Cables tab.
  useEffect(() => {
    const onShow = () => {
      setTabState("cables");
      localStorage.setItem(TAB_STORAGE_KEY, "cables");
    };
    window.addEventListener("easyschematic:show-cables", onShow);
    return () => window.removeEventListener("easyschematic:show-cables", onShow);
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
          badge={showWarnings ? counts.total : counts.errors}
          badgeTone={counts.errors > 0 ? "error" : "warning"}
        />
        <TabButton
          id="cables"
          label="Cables"
          active={tab}
          onSelect={setTab}
          badge={cableWarnings.length}
          badgeTone="error"
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
            <div
              className="absolute right-2 top-12 z-30 w-72 max-h-[70vh] overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
              style={{ boxShadow: "var(--ui-shadow-menu)" }}
            >
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
        {tab === "cables" && (
          <CablesPanel rows={cableRows} warnings={cableWarnings} />
        )}
      </div>

      {/* Docked Layers (bottom, collapsible) */}
      <div className="shrink-0 border-t border-[var(--color-border)] flex flex-col">
        <div className="flex items-center">
        <button
          type="button"
          onClick={toggleLayers}
          aria-expanded={layersOpen}
          className="flex-1 min-w-0 flex items-center gap-2 pl-3 pr-2 py-2 cursor-pointer text-left hover:bg-[var(--color-surface-2,transparent)] transition-colors"
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
        {/* How a layer's colour paints its devices on the canvas. Sibling of the section
             button, not nested — a button inside a button is invalid. */}
        <button
          onClick={() => setLayerColorMode(layerColorMode === "band" ? "tint" : "band")}
          title={
            layerColorMode === "band"
              ? "Layer colour shows as a band on each device's top edge — click for header tint"
              : "Layer colour tints each device's header — click for a top-edge band"
          }
          className="mr-2 shrink-0 px-1.5 py-0.5 rounded-[4px] border border-[var(--ui-border)] text-[8px] uppercase text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] hover:border-[var(--ui-border-strong)] cursor-pointer transition-colors"
          style={{ ...MONO_STYLE, letterSpacing: "0.1em" }}
        >
          {layerColorMode}
        </button>
        </div>
        {layersOpen && (
          <>
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize layers panel"
              title="Drag to resize"
              onPointerDown={onLayersResizeDown}
              onPointerMove={onLayersResizeMove}
              onPointerUp={onLayersResizeUp}
              className="group relative z-10 h-2 -my-1 flex items-center justify-center cursor-ns-resize touch-none"
            >
              <span className="h-[3px] w-8 rounded-full bg-[var(--color-border)] transition-colors group-hover:bg-[var(--color-accent)]" />
            </div>
            <div
              className="min-h-0 border-t border-[var(--ui-border)] overflow-hidden"
              style={{ height: layersHeight }}
            >
              <LayersPanel embedded />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import { useSchematicStore } from "../store";
import ViewOptionsPanel from "./ViewOptionsPanel";

/**
 * Floating canvas bottom bar (design §3) — a centered rounded pill over the canvas:
 * zoom out · zoom % · zoom in · density · labels · artwork · auto-route · view.
 * Mounted inside the floating overlay; reads zoom from the React Flow store and UI
 * toggles from the app store.
 */

const PILL_BTN =
  "w-[29px] h-[29px] flex items-center justify-center rounded-[7px] cursor-pointer text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors";

/** Shared shape for every labelled pill (toggles + the View trigger). */
const PILL_LABELLED =
  "h-[29px] px-2 flex items-center gap-1.5 rounded-[7px] border cursor-pointer text-[11px] font-medium transition-colors";

/** Active state carries an accent border as well as the accent wash, so the
 *  on/off distinction survives without colour perception. */
const ACTIVE_STYLE = {
  background: "var(--color-accent-soft)",
  color: "var(--color-accent)",
  borderColor: "var(--color-accent)",
} as const;
const INACTIVE_STYLE = { color: "var(--color-text)", borderColor: "transparent" } as const;

function ToggleBtn({
  active,
  label,
  title,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={PILL_LABELLED}
      style={active ? ACTIVE_STYLE : INACTIVE_STYLE}
    >
      {children}
      {/* Icon-only below `sm` where the pill would otherwise overrun a phone
          canvas; the title still names the control at every width. */}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export default function CanvasBottomBar() {
  const rf = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const nodeCompact = useSchematicStore((s) => s.nodeCompact);
  const setNodeCompact = useSchematicStore((s) => s.setNodeCompact);
  const showCableIdLabels = useSchematicStore((s) => s.showCableIdLabels);
  const setShowCableIdLabels = useSchematicStore((s) => s.setShowCableIdLabels);
  const showArtwork = useSchematicStore((s) => s.showArtwork);
  const setShowArtwork = useSchematicStore((s) => s.setShowArtwork);
  const autoRoute = useSchematicStore((s) => s.autoRoute);
  const toggleAutoRoute = useSchematicStore((s) => s.toggleAutoRoute);

  const [viewOpen, setViewOpen] = useState(false);
  const viewRef = useRef<HTMLDivElement | null>(null);

  // Close the View popover on outside-click / Escape (mirrors the right rail's
  // View popover).
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
    <div
      data-print-hide
      className="absolute left-1/2 bottom-3 -translate-x-1/2 flex items-center gap-0.5 p-1 rounded-[10px] bg-[var(--color-surface)] border border-[var(--ui-border)] pointer-events-auto select-none"
      style={{ boxShadow: "var(--ui-shadow-toolbar)" }}
    >
      <button type="button" title="Zoom out" onClick={() => rf.zoomOut()} className={PILL_BTN}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M5 12h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      <span
        className="min-w-[44px] text-center text-[11px] font-medium text-[var(--color-text)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {Math.round((zoom ?? 1) * 100)}%
      </span>
      <button type="button" title="Zoom in" onClick={() => rf.zoomIn()} className={PILL_BTN}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>

      <div className="w-px h-[17px] mx-1 bg-[var(--ui-border)]" />

      <ToggleBtn
        active={nodeCompact}
        label="Density"
        title={`Compact device density — ${nodeCompact ? "on" : "off"}`}
        onClick={() => setNodeCompact(!nodeCompact)}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="5" width="16" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="4" y="14" width="16" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </ToggleBtn>
      <ToggleBtn
        active={showCableIdLabels}
        label="Labels"
        title={`Connection cable ID labels — ${showCableIdLabels ? "on" : "off"}`}
        onClick={() => setShowCableIdLabels(!showCableIdLabels)}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M4 7h16M4 12h10M4 17h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </ToggleBtn>
      <ToggleBtn
        active={showArtwork}
        label="Artwork"
        title={`Device artwork — ${showArtwork ? "on" : "off"}`}
        onClick={() => setShowArtwork(!showArtwork)}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9" r="1.6" />
          <path d="M21 16l-5-5L5 20" />
        </svg>
      </ToggleBtn>

      <div className="w-px h-[17px] mx-1 bg-[var(--ui-border)]" />

      <button
        type="button"
        title={`Auto-route connections — ${autoRoute ? "on" : "off"}`}
        aria-pressed={autoRoute}
        onClick={toggleAutoRoute}
        className={PILL_LABELLED}
        style={autoRoute ? ACTIVE_STYLE : INACTIVE_STYLE}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
        Auto-route
        <span className="text-[9px] opacity-85" style={{ fontFamily: "var(--font-mono)" }}>
          {autoRoute ? "ON" : "OFF"}
        </span>
      </button>

      <div className="w-px h-[17px] mx-1 bg-[var(--ui-border)]" />

      <div className="relative" ref={viewRef}>
        <button
          type="button"
          title="View options"
          aria-haspopup="dialog"
          aria-expanded={viewOpen}
          onClick={() => setViewOpen((v) => !v)}
          className={PILL_LABELLED}
          style={viewOpen ? ACTIVE_STYLE : INACTIVE_STYLE}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          View
        </button>
        {viewOpen && (
          <div
            className="absolute bottom-[38px] right-0 z-30 w-[280px] max-h-[60vh] overflow-y-auto rounded-[var(--ui-radius-lg)] border border-[var(--ui-border)] bg-[var(--color-surface)]"
            style={{ boxShadow: "var(--ui-shadow-menu)" }}
          >
            <ViewOptionsPanel mobile onClose={() => setViewOpen(false)} />
          </div>
        )}
      </div>
    </div>
  );
}

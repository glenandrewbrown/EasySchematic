import { useReactFlow, useStore } from "@xyflow/react";
import { useSchematicStore } from "../store";

/**
 * Floating canvas bottom bar (design §3) — a centered rounded pill over the canvas:
 * zoom out · zoom % · zoom in · node density · wire labels · auto-route.
 * Mounted inside the floating overlay; reads zoom from the React Flow store and UI
 * toggles from the app store.
 */

const PILL_BTN =
  "w-[29px] h-[29px] flex items-center justify-center rounded-[7px] cursor-pointer text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors";

function ToggleBtn({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="relative w-[29px] h-[29px] flex items-center justify-center rounded-[7px] cursor-pointer transition-colors"
      style={
        active
          ? { background: "var(--color-accent-soft)", color: "var(--color-accent)" }
          : { color: "var(--color-text)" }
      }
    >
      {children}
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
  const autoRoute = useSchematicStore((s) => s.autoRoute);
  const toggleAutoRoute = useSchematicStore((s) => s.toggleAutoRoute);

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

      <ToggleBtn active={nodeCompact} title="Toggle node density" onClick={() => setNodeCompact(!nodeCompact)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="5" width="16" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="4" y="14" width="16" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </ToggleBtn>
      <ToggleBtn
        active={showCableIdLabels}
        title="Toggle wire labels"
        onClick={() => setShowCableIdLabels(!showCableIdLabels)}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M4 7h16M4 12h10M4 17h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </ToggleBtn>

      <div className="w-px h-[17px] mx-1 bg-[var(--ui-border)]" />

      <button
        type="button"
        title={autoRoute ? "Auto-route on" : "Auto-route off"}
        onClick={toggleAutoRoute}
        className="h-[29px] px-2.5 flex items-center gap-1.5 rounded-[7px] cursor-pointer text-[11px] font-medium transition-colors"
        style={
          autoRoute
            ? { background: "var(--color-accent-soft)", color: "var(--color-accent)" }
            : { color: "var(--color-text)" }
        }
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
        Auto-route
      </button>
    </div>
  );
}

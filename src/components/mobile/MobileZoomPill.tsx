import { useState } from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import ViewOptionsPanel from "../ViewOptionsPanel";
import ShowInfoPanel from "../ShowInfoPanel";
import SignalColorPanel from "../SignalColorPanel";

/**
 * Phone canvas controls (round-3 §R2 tier C / board 1a). The desktop bottom bar
 * folds into a compact zoom/view pill at bottom-right: zoom-out, live %, zoom-in,
 * and an eye trigger that opens the existing View options (display + info + signal
 * colour) as a bottom sheet. The live toggles that live in the desktop bar
 * (density / labels / artwork / auto-route) all appear inside that sheet, so every
 * control stays reachable.
 */
export default function MobileZoomPill() {
  const rf = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const pillBtn =
    "w-10 h-10 flex items-center justify-center rounded-full text-[var(--color-text)] active:bg-[var(--color-surface-hover)] transition-colors";

  return (
    <>
      <div
        data-print-hide
        className="pointer-events-auto absolute right-3 z-30 flex items-center gap-0.5 p-1 rounded-full bg-[var(--color-surface)] border border-[var(--ui-border)] select-none"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)", boxShadow: "var(--ui-shadow-toolbar)" }}
      >
        <button type="button" aria-label="Zoom out" onClick={() => rf.zoomOut()} className={pillBtn} style={{ touchAction: "manipulation" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <span className="min-w-[42px] text-center text-[12px] font-semibold text-[var(--color-text)]" style={{ fontFamily: "var(--font-mono)" }}>
          {Math.round((zoom ?? 1) * 100)}%
        </span>
        <button type="button" aria-label="Zoom in" onClick={() => rf.zoomIn()} className={pillBtn} style={{ touchAction: "manipulation" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <span className="w-px h-5 mx-0.5 bg-[var(--ui-border)]" />
        <button
          type="button"
          aria-label="View options"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen(true)}
          className={pillBtn}
          style={{ touchAction: "manipulation" }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>

      {sheetOpen && (
        <div className="pointer-events-auto fixed inset-0 z-[70] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="View options">
          <button
            type="button"
            aria-label="Close view options"
            className="absolute inset-0 bg-black/40"
            onClick={() => setSheetOpen(false)}
          />
          <div
            className="relative bg-[var(--color-surface)] border-t border-[var(--ui-border)] rounded-t-2xl max-h-[85vh] overflow-y-auto"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)", boxShadow: "var(--ui-shadow-menu)" }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-[var(--color-surface)] border-b border-[var(--ui-border)]">
              <span className="text-sm font-semibold text-[var(--color-text-heading)]">View options</span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSheetOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-full text-[var(--color-text-muted)] active:bg-[var(--color-surface-hover)]"
                style={{ touchAction: "manipulation" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </div>
            <ViewOptionsPanel mobile onClose={() => setSheetOpen(false)} />
            <div className="border-t border-[var(--ui-border)]">
              <ShowInfoPanel mobile onClose={() => setSheetOpen(false)} />
            </div>
            <div className="border-t border-[var(--ui-border)]">
              <SignalColorPanel mobile onClose={() => setSheetOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

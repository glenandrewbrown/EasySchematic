import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useSchematicStore } from "../store";
import type { DeviceData } from "../types";
import RightRail from "./RightRail";

/**
 * Phone inspector (round-3 §R2 tier C / board 1b). A bottom sheet that hosts the
 * EXISTING RightRail (Inspect | Issues | Cables tabs + docked Layers) — it does NOT
 * restructure Inspector.tsx, it only wraps it in a sheet shell.
 *
 * Behaviour (board 1b):
 *   - Opens at PEEK when a node/edge becomes selected.
 *   - Three detents: peek 96px / half 50vh / full 92vh. Drag the handle to resize
 *     (snaps to the nearest detent), or tap the handle/header to cycle them.
 *   - Spring transition cubic-bezier(.23,1,.32,1) 300ms.
 *   - A scrim covers the canvas once the sheet is above PEEK (half/full).
 *   - Swipe the handle down past PEEK, or tap ✕, to dismiss — the selection is KEPT,
 *     and the sheet re-opens at PEEK on the next new selection.
 */

const PEEK_PX = 96;
const HALF_VH = 0.5;
const FULL_VH = 0.92;
const SPRING = "cubic-bezier(.23,1,.32,1)";

type Detent = "peek" | "half" | "full";

function vh(fraction: number): number {
  return typeof window === "undefined" ? 0 : window.innerHeight * fraction;
}

function detentHeight(detent: Detent): number {
  if (detent === "peek") return PEEK_PX;
  if (detent === "half") return vh(HALF_VH);
  return vh(FULL_VH);
}

interface MobileInspectorSheetProps {
  /** Fires when the sheet becomes visible / hidden, so the canvas FAB + zoom pill
   *  can step aside while the sheet is up (board 1b). */
  onVisibilityChange?: (visible: boolean) => void;
}

export default function MobileInspectorSheet({ onVisibilityChange }: MobileInspectorSheetProps) {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);

  const selectedNodes = useMemo(() => nodes.filter((n) => n.selected), [nodes]);
  const selectedEdges = useMemo(() => edges.filter((e) => e.selected), [edges]);
  const selectionCount = selectedNodes.length + selectedEdges.length;

  // Stable key describing the current selection, so we can detect a NEW selection
  // and re-open a dismissed sheet.
  const selectionKey = useMemo(() => {
    const ids = [...selectedNodes.map((n) => n.id), ...selectedEdges.map((e) => e.id)].sort();
    return ids.join("|");
  }, [selectedNodes, selectedEdges]);

  const [detent, setDetent] = useState<Detent>("peek");
  const [dismissed, setDismissed] = useState(true);
  const [prevKey, setPrevKey] = useState<string>("");

  // Open at PEEK whenever the selection changes to a new non-empty set. Uses the
  // React-documented "store previous value in state, adjust during render" pattern
  // (no ref access, no setState-in-effect), so a new selection re-opens a dismissed
  // sheet and clearing the selection dismisses it.
  if (selectionKey !== prevKey) {
    setPrevKey(selectionKey);
    if (selectionKey) {
      setDetent("peek");
      setDismissed(false);
    } else {
      setDismissed(true);
    }
  }

  // Live height while dragging the handle (null = settled on a detent).
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const onHandleDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startH: detentHeight(detent) };
    setDragHeight(detentHeight(detent));
  };
  const onHandleMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const next = Math.max(24, Math.min(vh(FULL_VH), d.startH - (e.clientY - d.startY)));
    setDragHeight(next);
  };
  const onHandleUp = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const h = dragHeight ?? d.startH;
    dragRef.current = null;
    setDragHeight(null);
    // Dragged well below peek → dismiss.
    if (h < PEEK_PX * 0.7) {
      setDismissed(true);
      return;
    }
    // Snap to the nearest detent.
    const candidates: Detent[] = ["peek", "half", "full"];
    let best: Detent = "peek";
    let bestDist = Infinity;
    for (const c of candidates) {
      const dist = Math.abs(detentHeight(c) - h);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    setDetent(best);
  };

  const cycleDetent = () => {
    setDetent((d) => (d === "peek" ? "half" : d === "half" ? "full" : "peek"));
  };

  const visible = !dismissed && selectionCount > 0;
  useEffect(() => {
    onVisibilityChange?.(visible);
    return () => onVisibilityChange?.(false);
  }, [visible, onVisibilityChange]);

  if (!visible) return null;

  const height = dragHeight ?? detentHeight(detent);
  const abovePeek = height > PEEK_PX + 8;

  // Peek summary — a compact one-line description of the selection.
  const summary = describeSelection(selectedNodes, selectedEdges, edges);

  return (
    <>
      {/* Scrim above PEEK — dims the canvas; tap to collapse back to peek. */}
      {abovePeek && (
        <button
          type="button"
          aria-label="Collapse inspector"
          className="fixed inset-0 z-[55] bg-black/35"
          style={{ transition: `opacity 300ms ${SPRING}` }}
          onClick={() => setDetent("peek")}
        />
      )}

      <div
        data-print-hide
        role="dialog"
        aria-label="Inspector"
        className="fixed inset-x-0 z-[60] flex flex-col bg-[var(--color-surface)] border-t border-[var(--ui-border)] rounded-t-2xl overflow-hidden"
        style={{
          /* Float above the workspace tab bar so navigation stays reachable. */
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 58px)",
          height,
          transition: dragHeight == null ? `height 300ms ${SPRING}` : "none",
          boxShadow: "0 -12px 32px -18px rgba(0,0,0,.6)",
        }}
      >
        {/* Drag handle + peek summary header */}
        <div
          className="shrink-0 touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
        >
          <div className="flex justify-center pt-2 pb-1" onClick={cycleDetent}>
            <span className="h-1.5 w-10 rounded-full bg-[var(--ui-border-strong)]" />
          </div>
          <div className="flex items-center gap-2 px-4 pb-2.5">
            <div className="min-w-0 flex-1" onClick={cycleDetent}>
              <div className="text-sm font-semibold text-[var(--color-text-heading)] truncate">{summary.title}</div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)] truncate" style={{ fontFamily: "var(--font-mono)" }}>
                {summary.subtitle}
              </div>
            </div>
            <button
              type="button"
              aria-label="Dismiss inspector"
              onClick={() => setDismissed(true)}
              className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full text-[var(--color-text-muted)] active:bg-[var(--color-surface-hover)]"
              style={{ touchAction: "manipulation" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>

        {/* Full RightRail (tabs + docked Layers). Hidden from a11y/scroll at peek. */}
        <div className="mobile-sheet-railwrap flex-1 min-h-0 overflow-hidden border-t border-[var(--ui-border)]">
          <RightRail />
        </div>
      </div>
    </>
  );
}

interface SelectionSummary {
  title: string;
  subtitle: string;
}

function describeSelection(
  selectedNodes: ReturnType<typeof useSchematicStore.getState>["nodes"],
  selectedEdges: ReturnType<typeof useSchematicStore.getState>["edges"],
  allEdges: ReturnType<typeof useSchematicStore.getState>["edges"],
): SelectionSummary {
  if (selectedNodes.length + selectedEdges.length > 1) {
    const n = selectedNodes.length + selectedEdges.length;
    return { title: `${n} items selected`, subtitle: "MULTIPLE" };
  }
  if (selectedNodes.length === 1) {
    const node = selectedNodes[0];
    if (node.type === "device") {
      const data = node.data as DeviceData;
      const conns = allEdges.filter((e) => e.source === node.id || e.target === node.id).length;
      const cls = data.category || data.deviceType || "device";
      return {
        title: data.label || "Device",
        subtitle: `${cls} · ${conns} connection${conns === 1 ? "" : "s"}`,
      };
    }
    const label = (node.data as { label?: string })?.label;
    return { title: label || node.type || "Item", subtitle: (node.type || "item").toString().toUpperCase() };
  }
  if (selectedEdges.length === 1) {
    const edge = selectedEdges[0];
    const cableId = (edge.data as { cableId?: string })?.cableId;
    return { title: cableId || "Connection", subtitle: "CONNECTION" };
  }
  return { title: "Inspector", subtitle: "" };
}

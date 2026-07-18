/**
 * Signal-flow / path-explain overlay (R2-5, brief §C9).
 *
 * A compact floating card that answers "where does my signal actually go?".
 * It reads the live Connection graph, resolves patchbay normalling on the fly
 * (breaks + passive splits), and traces internal routes, then renders a
 * source → hops → sinks trace with forks at taps / fan-outs.
 *
 * Trigger: an explicit store trigger (openSignalFlow — a Connection or a patch
 * point) OR the currently selected Connection on the canvas. All AV terms:
 * Device / Connection / Port / Channel. Motion is Emil-Kowalski gentle:
 * opacity+scale(0.97)→1 transition on enter, opacity fade on exit, origin
 * bottom-left, reduced-motion-gated. Pills render statically (no per-pill
 * entry) so re-tracing on selection never flickers.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSchematicStore } from "../store";
import {
  buildSignalFlowTrace,
  type SignalFlowTrace,
  type SignalFlowTrigger,
  type TraceHop,
} from "../signalFlowTrace";

const ENTER_MS = 180;
const EXIT_MS = 140;

function signalColorVar(signalType: string): string {
  return `var(--color-${signalType}, var(--color-accent))`;
}

/** One hop pill + its downstream branches (recursive; >1 child = fork). */
function HopRow({ hop }: { hop: TraceHop }) {
  const accent = signalColorVar(hop.ref.signalType);
  const forked = hop.children.length > 1;

  return (
    <div className="sf-hop">
      <div className="sf-pill" style={{ ["--sf-accent" as string]: accent }}>
        <span className="sf-pill-bar" aria-hidden />
        <span className="sf-pill-body">
          <span className="sf-pill-line">
            <span className="sf-kind" data-kind={hop.kind}>
              {hop.kind === "source"
                ? "Source"
                : hop.kind === "sink"
                  ? "Sink"
                  : hop.kind === "patch"
                    ? "Patch"
                    : "Through"}
            </span>
            <span className="sf-device" title={hop.ref.deviceLabel}>
              {hop.ref.deviceLabel}
            </span>
          </span>
          <span className="sf-terminal" title={hop.ref.terminalLabel}>
            {hop.ref.terminalLabel}
          </span>
        </span>
      </div>

      {hop.patch && (
        <div className="sf-note sf-note-mode">
          <span className="sf-mono">{hop.patch.mode}</span>
          {hop.patch.normalBroken && <span className="sf-mode-broken">normal broken</span>}
        </div>
      )}
      {hop.marker === "break" && (
        <div className="sf-chip sf-chip-break">
          <span className="sf-chip-dot" aria-hidden />
          normal broken — signal stops here
        </div>
      )}
      {hop.marker === "passive-split" && (
        <div className="sf-chip sf-chip-split">
          <span className="sf-chip-dot" aria-hidden />
          {hop.advisory ?? "passive mult"}
        </div>
      )}

      {hop.children.length > 0 && (
        <div className={forked ? "sf-children sf-children-fork" : "sf-children"}>
          {forked && <div className="sf-fork-label">fork · {hop.children.length} branches</div>}
          {hop.children.map((child) => (
            <HopRow key={child.id} hop={child} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SignalFlowOverlay() {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const explicitTrigger = useSchematicStore((s) => s.signalFlowTrigger);
  const closeSignalFlow = useSchematicStore((s) => s.closeSignalFlow);

  // Selection-driven trigger: the single selected Connection, unless dismissed.
  const [dismissedEdgeId, setDismissedEdgeId] = useState<string | null>(null);
  const selectedEdgeId = useMemo(() => {
    const selected = edges.filter((e) => e.selected && e.data && "signalType" in e.data);
    return selected.length === 1 ? selected[0].id : null;
  }, [edges]);

  const trigger: SignalFlowTrigger | null = useMemo(
    () =>
      explicitTrigger ??
      (selectedEdgeId && selectedEdgeId !== dismissedEdgeId
        ? { kind: "connection", edgeId: selectedEdgeId }
        : null),
    [explicitTrigger, selectedEdgeId, dismissedEdgeId],
  );

  const trace: SignalFlowTrace | null = useMemo(() => {
    if (!trigger) return null;
    return buildSignalFlowTrace(trigger, nodes, edges);
  }, [trigger, nodes, edges]);

  const open = trigger != null;

  // Mount/visible lifecycle for enter/exit transitions (transitions, not keyframes).
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const exitTimer = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      if (exitTimer.current != null) {
        window.clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
      setMounted(true);
      const raf = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(raf);
    }
    setVisible(false);
    exitTimer.current = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => {
      if (exitTimer.current != null) window.clearTimeout(exitTimer.current);
    };
  }, [open]);

  const dismiss = () => {
    if (explicitTrigger) closeSignalFlow();
    else if (selectedEdgeId) setDismissedEdgeId(selectedEdgeId);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, explicitTrigger, selectedEdgeId]);

  if (!mounted) return null;

  return (
    <div
      className={visible ? "sf-card sf-card--visible" : "sf-card"}
      style={{ transitionDuration: `${visible ? ENTER_MS : EXIT_MS}ms` }}
      role="dialog"
      aria-label="Signal flow"
    >
      <style>{`
        .sf-card {
          position: fixed; left: 68px; bottom: 56px; z-index: 60;
          width: 320px; max-width: calc(100vw - 96px); max-height: 62vh;
          display: flex; flex-direction: column;
          background: var(--color-surface); color: var(--color-text-body);
          border: 1px solid var(--color-border); border-radius: 12px;
          box-shadow: 0 12px 32px -12px rgba(0,0,0,0.45), 0 2px 8px -4px rgba(0,0,0,0.3);
          font-family: var(--font-ui);
          opacity: 0; transform: scale(0.97); transform-origin: bottom left;
          transition-property: opacity, transform; transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
          will-change: opacity, transform;
        }
        .sf-card--visible { opacity: 1; transform: scale(1); }
        .sf-head {
          display: flex; align-items: center; gap: 8px;
          padding: 9px 10px 8px 12px; border-bottom: 1px solid var(--color-border);
        }
        .sf-title { font-size: 12px; font-weight: 600; color: var(--color-text-heading); }
        .sf-summary {
          font-family: var(--font-mono); font-size: 9.5px; letter-spacing: 0.02em;
          color: var(--color-text-muted); margin-left: auto;
        }
        .sf-close {
          display: inline-flex; align-items: center; justify-content: center;
          width: 20px; height: 20px; border-radius: 6px; margin-left: 4px;
          color: var(--color-text-muted); background: transparent; border: none; cursor: pointer;
          transition: background-color 120ms ease, color 120ms ease;
        }
        .sf-close:hover { background: var(--color-surface-hover); color: var(--color-text-heading); }
        .sf-close:active { transform: scale(0.94); }
        .sf-body { padding: 10px 12px 12px; overflow-y: auto; }
        .sf-empty { font-size: 11px; color: var(--color-text-muted); padding: 4px 2px; }

        .sf-hop { display: flex; flex-direction: column; gap: 4px; }
        .sf-pill {
          display: flex; align-items: stretch; gap: 8px;
          background: var(--color-surface-raised, var(--color-surface)); border: 1px solid var(--color-border);
          border-radius: 8px; padding: 5px 8px 5px 6px; min-width: 0;
        }
        .sf-pill-bar { width: 3px; border-radius: 3px; background: var(--sf-accent); flex: 0 0 auto; }
        .sf-pill-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .sf-pill-line { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
        .sf-kind {
          font-family: var(--font-mono); font-size: 8px; text-transform: uppercase; letter-spacing: 0.07em;
          color: var(--color-text-muted); flex: 0 0 auto;
        }
        .sf-kind[data-kind="source"] { color: var(--sf-accent); }
        .sf-device {
          font-size: 11.5px; font-weight: 600; color: var(--color-text-heading);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
        }
        .sf-terminal {
          font-family: var(--font-mono); font-size: 10px; color: var(--color-text-muted);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .sf-note { font-size: 9.5px; color: var(--color-text-muted); display: flex; gap: 6px; align-items: center; padding-left: 6px; }
        .sf-mono { font-family: var(--font-mono); }
        .sf-mode-broken { color: var(--color-error); font-weight: 600; }
        .sf-chip {
          display: inline-flex; align-items: center; gap: 6px; align-self: flex-start;
          font-size: 10px; line-height: 1.3; border-radius: 7px; padding: 4px 8px; margin-left: 6px;
          border: 1px solid transparent;
        }
        .sf-chip-dot { width: 6px; height: 6px; border-radius: 9999px; flex: 0 0 auto; }
        .sf-chip-break {
          color: var(--color-error);
          background: color-mix(in srgb, var(--color-error) 12%, transparent);
          border-color: color-mix(in srgb, var(--color-error) 40%, transparent);
        }
        .sf-chip-break .sf-chip-dot { background: var(--color-error); }
        .sf-chip-split {
          color: var(--color-warning);
          background: color-mix(in srgb, var(--color-warning) 14%, transparent);
          border-color: color-mix(in srgb, var(--color-warning) 42%, transparent);
        }
        .sf-chip-split .sf-chip-dot { background: var(--color-warning); }

        .sf-children {
          display: flex; flex-direction: column; gap: 6px;
          margin: 4px 0 0 10px; padding-left: 12px;
          border-left: 1px solid var(--color-border);
        }
        .sf-children-fork { border-left-color: color-mix(in srgb, var(--color-warning) 45%, var(--color-border)); }
        .sf-fork-label {
          font-family: var(--font-mono); font-size: 8px; text-transform: uppercase; letter-spacing: 0.06em;
          color: var(--color-text-muted); margin-bottom: -1px;
        }

        @media (prefers-reduced-motion: reduce) {
          .sf-card { transform: none; transition-property: opacity; }
          .sf-card--visible { transform: none; }
          .sf-close:active { transform: none; }
        }
      `}</style>

      <div className="sf-head">
        <span className="sf-title">Signal flow</span>
        {trace && (
          <span className="sf-summary">
            {trace.hopCount} hops · {trace.sinkCount} sink{trace.sinkCount === 1 ? "" : "s"}
            {trace.hasPassiveSplit ? " · split" : ""}
            {trace.hasBreak ? " · break" : ""}
          </span>
        )}
        <button type="button" className="sf-close" onClick={dismiss} aria-label="Close signal flow" title="Close (Esc)">
          ✕
        </button>
      </div>
      <div className="sf-body">
        {trace ? (
          <HopRow hop={trace.root} />
        ) : (
          <div className="sf-empty">Couldn't resolve this path — the Connection or patch point may be stale.</div>
        )}
      </div>
    </div>
  );
}

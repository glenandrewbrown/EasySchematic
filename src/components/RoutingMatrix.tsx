import { useCallback, useEffect, useMemo, useState } from "react";
import { useSchematicStore } from "../store";
import type { DeviceChannel, DeviceConnector, DeviceData, Port, SchematicNode, SignalType } from "../types";

/**
 * Full-screen in-device routing matrix (Trinnov-style). Rows = sources (input
 * channels + buses), columns = sinks (output channels + buses); a cell is a
 * cross-point that toggles a real internal Connection (data.internal, both
 * endpoints on this device). Buses are virtual connectors (role:"bus").
 *
 * Mounted alongside the app's other full-screen overlays (DeviceEditor /
 * DeviceDetailsPage) and driven by the store's `routingMatrixDeviceId`; renders
 * nothing when that id is null. Consumes the R2 store surface — it never
 * reimplements route/bus mutation.
 */

/** Modal enter/exit easing (falls back if the token is absent). */
const EASE_OUT = "var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1))";
/** Bus / AES violet — every route to or from a bus is drawn in this tint. */
const BUS_TINT = "var(--color-aes)";

const CELL = 26; // px — a cross-point square, on the instrument grid.
const ROW_HEADER_W = 148; // px — sticky source-label column.
const COL_HEADER_H = 108; // px — sticky sink-label header (vertical mono labels).
const GROUP_H = 22; // px — the OUTPUTS / BUSES section band above the labels.

const MONO = { fontFamily: "var(--font-mono)" } as const;

/** A routable endpoint — a channel, a fallback port, or a virtual bus. */
interface Endpoint {
  id: string;
  label: string;
  signalType: SignalType;
  isBus: boolean;
}

/** prefers-reduced-motion, live. */
function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduce;
}

/** channel → endpoint. */
function channelEndpoint(c: DeviceChannel): Endpoint {
  return { id: c.id, label: c.label, signalType: c.signalType, isBus: false };
}

/** bus connector → endpoint (signal is cosmetic — buses always draw violet). */
function busEndpoint(b: DeviceConnector): Endpoint {
  return { id: b.id, label: b.label, signalType: "aes", isBus: true };
}

/** port → endpoint (fallback when a device has no explicit channels). */
function portEndpoint(p: Port): Endpoint {
  return { id: p.id, label: p.label, signalType: p.signalType, isBus: false };
}

/** Derive the source (row) and sink (col) endpoint lists for a device. */
function deriveAxes(data: DeviceData): { sources: Endpoint[]; sinks: Endpoint[]; inputCount: number; outputCount: number; buses: DeviceConnector[] } {
  const channels = data.channels ?? [];
  const connectors = data.connectors ?? [];
  const buses = connectors.filter((c) => c.role === "bus");
  const busEps = buses.map(busEndpoint);

  let inputs: Endpoint[];
  let outputs: Endpoint[];
  if (channels.length > 0) {
    inputs = channels.filter((c) => c.direction === "in").map(channelEndpoint);
    outputs = channels.filter((c) => c.direction === "out").map(channelEndpoint);
  } else {
    // Fallback: input/bidirectional ports are sources, output/bidirectional are sinks.
    inputs = data.ports.filter((p) => p.direction === "input" || p.direction === "bidirectional").map(portEndpoint);
    outputs = data.ports.filter((p) => p.direction === "output" || p.direction === "bidirectional").map(portEndpoint);
  }

  return {
    sources: [...inputs, ...busEps],
    sinks: [...outputs, ...busEps],
    inputCount: inputs.length,
    outputCount: outputs.length,
    buses,
  };
}

interface BusHeaderProps {
  bus: Endpoint;
  onRename: (label: string) => void;
  onRemove: () => void;
}

/** Editable bus row-header cell (rename / remove). Buses render violet. */
function BusRowHeader({ bus, onRename, onRemove }: BusHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bus.label);

  const startEdit = () => {
    setDraft(bus.label); // sync to the live label just before editing
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== bus.label) onRename(next);
    else setDraft(bus.label);
  };

  return (
    <div className="group/bus flex items-center gap-1.5 h-full pl-2 pr-1.5">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: BUS_TINT }} />
      {editing ? (
        <input
          autoFocus
          className="ui-input h-6 text-[11px] flex-1 min-w-0 px-1.5"
          style={MONO}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(bus.label);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="rmx-btn flex-1 min-w-0 truncate text-left text-[11px] cursor-text"
          style={{ ...MONO, color: BUS_TINT }}
          title="Rename bus"
          onClick={startEdit}
        >
          {bus.label}
        </button>
      )}
      <button
        type="button"
        className="rmx-btn shrink-0 w-5 h-5 flex items-center justify-center rounded text-[var(--color-text-muted)] opacity-0 group-hover/bus:opacity-100 hover:text-[var(--color-error)] hover:bg-[var(--color-surface-hover)]"
        title="Remove bus"
        aria-label={`Remove ${bus.label}`}
        onClick={onRemove}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function Matrix({ node }: { node: SchematicNode }) {
  const data = node.data as DeviceData;
  const deviceId = node.id;
  const closeRoutingMatrix = useSchematicStore((s) => s.closeRoutingMatrix);
  const addInternalRoute = useSchematicStore((s) => s.addInternalRoute);
  const removeInternalRoute = useSchematicStore((s) => s.removeInternalRoute);
  const listInternalRoutes = useSchematicStore((s) => s.listInternalRoutes);
  const addDeviceConnector = useSchematicStore((s) => s.addDeviceConnector);
  const updateDeviceConnector = useSchematicStore((s) => s.updateDeviceConnector);
  const removeDeviceConnector = useSchematicStore((s) => s.removeDeviceConnector);
  // Re-derive against the live edge list so cells reflect route toggles immediately.
  const edges = useSchematicStore((s) => s.edges);

  const reduce = usePrefersReducedMotion();
  const [shown, setShown] = useState(false);
  const [closing, setClosing] = useState(false);
  const [hover, setHover] = useState<{ r: number | null; c: number | null }>({ r: null, c: null });

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const requestClose = useCallback(() => {
    setClosing(true);
    setShown(false);
    window.setTimeout(() => closeRoutingMatrix(), 170);
  }, [closeRoutingMatrix]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  const { sources, sinks, inputCount, outputCount, buses } = useMemo(() => deriveAxes(data), [data]);

  // Routed cross-points, keyed source\0sink, derived from the live internal edges.
  const routeSet = useMemo(() => {
    const set = new Set<string>();
    for (const e of listInternalRoutes(deviceId)) {
      if (e.sourceHandle && e.targetHandle) set.add(`${e.sourceHandle} ${e.targetHandle}`);
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, edges, listInternalRoutes]);

  const routeCount = routeSet.size;

  // Per-column source fan-in count → a Σ marker when a sink sums ≥2 sources.
  const summing = useMemo(() => {
    const counts = new Array(sinks.length).fill(0);
    sinks.forEach((sink, c) => {
      for (const src of sources) if (routeSet.has(`${src.id} ${sink.id}`)) counts[c] += 1;
    });
    return counts;
  }, [sources, sinks, routeSet]);

  const toggle = useCallback(
    (r: number, c: number) => {
      const from = sources[r];
      const to = sinks[c];
      if (!from || !to || from.id === to.id) return; // a bus can't route to itself
      if (routeSet.has(`${from.id} ${to.id}`)) removeInternalRoute(deviceId, from.id, to.id);
      else addInternalRoute(deviceId, from.id, to.id);
    },
    [sources, sinks, routeSet, deviceId, addInternalRoute, removeInternalRoute],
  );

  const addBus = useCallback(() => {
    const connectors = data.connectors ?? [];
    const existing = new Set(connectors.map((c) => c.id));
    let n = buses.length + 1;
    let id = `bus-${n}`;
    while (existing.has(id)) id = `bus-${++n}`;
    addDeviceConnector(deviceId, { id, label: `Bus ${n}`, type: "none", role: "bus", carries: [] });
  }, [data.connectors, buses.length, deviceId, addDeviceConnector]);

  const removeBus = useCallback(
    (busId: string) => {
      // Drop any internal routes touching the bus first, then the connector itself,
      // so no dangling internal Connection is left behind.
      for (const e of listInternalRoutes(deviceId)) {
        if (e.sourceHandle === busId && e.targetHandle) removeInternalRoute(deviceId, busId, e.targetHandle);
        else if (e.targetHandle === busId && e.sourceHandle) removeInternalRoute(deviceId, e.sourceHandle, busId);
      }
      removeDeviceConnector(deviceId, busId);
    },
    [deviceId, listInternalRoutes, removeInternalRoute, removeDeviceConnector],
  );

  // Event delegation for the whole grid — cheap even at 64×64 (no per-cell handlers).
  const onGridOver = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest("[data-r],[data-c]") as HTMLElement | null;
    if (!el) return;
    const r = el.dataset.r != null ? Number(el.dataset.r) : null;
    const c = el.dataset.c != null ? Number(el.dataset.c) : null;
    setHover((prev) => (prev.r === r && prev.c === c ? prev : { r, c }));
  };
  const onGridClick = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest("td[data-r][data-c]") as HTMLElement | null;
    if (!el || el.dataset.self === "1") return;
    toggle(Number(el.dataset.r), Number(el.dataset.c));
  };

  const panelTransition = `transform ${closing ? 160 : 220}ms ${EASE_OUT}, opacity ${closing ? 160 : 220}ms ${EASE_OUT}`;
  const panelTransform = reduce ? "none" : shown ? "scale(1)" : "scale(0.96)";

  // Column section bands (OUTPUTS / BUSES) above the label header.
  const colGroups = [
    { label: "OUTPUTS", count: outputCount },
    { label: "BUSES", count: buses.length },
  ].filter((g) => g.count > 0);

  // Row sections, iterated in the same order as `sources`.
  const rowSections = [
    { label: "INPUTS", start: 0, count: inputCount },
    { label: "BUSES", start: inputCount, count: buses.length },
  ].filter((g) => g.count > 0);

  const emptyGrid = sources.length === 0 || sinks.length === 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      data-print-hide
      data-rmx
    >
      {/* Structural + motion CSS (reduced-motion gated). */}
      <style>{`
        [data-rmx] .rmx-cell { transition: background-color 120ms ease; }
        [data-rmx] .rmx-btn { transition: transform 140ms ease-out; }
        [data-rmx] .rmx-btn:active { transform: scale(0.97); }
        @media (prefers-reduced-motion: reduce) {
          [data-rmx] .rmx-cell { transition: none; }
          [data-rmx] .rmx-btn { transition: none; }
          [data-rmx] .rmx-btn:active { transform: none; }
        }
      `}</style>
      {/* Cross-hair highlight — one dynamic rule, so cells never re-render on hover. */}
      <style>{
        (hover.r != null ? `[data-rmx] [data-r="${hover.r}"]{background:var(--color-surface-hover);}` : "") +
        (hover.c != null ? `[data-rmx] [data-c="${hover.c}"]{background:var(--color-surface-hover);}` : "")
      }</style>

      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--color-bg)_72%,transparent)]"
        style={{ opacity: shown ? 1 : 0, transition: `opacity ${closing ? 160 : 220}ms ${EASE_OUT}` }}
        onClick={requestClose}
      />

      {/* Panel */}
      <div
        className="relative flex flex-col w-full max-w-[1100px] max-h-full rounded-[var(--ui-radius-lg)] bg-[var(--color-surface)] border border-[var(--ui-border)] overflow-hidden"
        style={{
          transformOrigin: "center",
          transform: panelTransform,
          opacity: shown ? 1 : 0,
          transition: panelTransition,
          boxShadow: "var(--ui-shadow-menu, 0 24px 60px -28px rgba(0,0,0,.5))",
        }}
      >
        {/* Header */}
        <header className="h-[50px] shrink-0 flex items-center gap-3 px-4 border-b border-[var(--ui-border)]">
          <span className="text-[13px] font-semibold text-[var(--color-text-heading)]">Routing matrix</span>
          <span className="text-[11px] text-[var(--color-text-muted)] truncate">{data.label || "Device"}</span>
          <span className="flex-1" />
          <button
            type="button"
            className="rmx-btn flex items-center gap-1.5 h-[30px] pl-2 pr-3 border border-[var(--ui-border)] rounded-lg text-[11.5px] font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
            onClick={addBus}
            title="Add a virtual bus (source + sink)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Bus
          </button>
        </header>

        {/* Grid (scrolls in both axes inside this container; page body never scrolls sideways) */}
        <div className="flex-1 min-h-0 overflow-auto" onMouseOver={onGridOver} onMouseLeave={() => setHover({ r: null, c: null })} onClick={onGridClick}>
          {emptyGrid ? (
            <div className="h-full min-h-[240px] flex flex-col items-center justify-center gap-2 text-center px-6">
              <span className="text-[12px] text-[var(--color-text-muted)]">
                This device has no routable {sources.length === 0 ? "sources" : "sinks"} yet.
              </span>
              <span className="text-[11px] text-[var(--color-text-muted)]" style={MONO}>
                Add channels in the device editor, or add a bus above.
              </span>
            </div>
          ) : (
            <table className="border-separate" style={{ borderSpacing: 0 }}>
              <thead>
                {/* Section band: OUTPUTS / BUSES */}
                <tr>
                  <th
                    className="sticky left-0 top-0 z-30 bg-[var(--color-surface-raised)] border-b border-r border-[var(--ui-border)]"
                    rowSpan={2}
                    style={{ width: ROW_HEADER_W, minWidth: ROW_HEADER_W }}
                  >
                    <span className="block text-[9.5px] uppercase text-[var(--color-text-muted)] px-3 text-left" style={{ ...MONO, letterSpacing: "0.12em" }}>
                      Source ╲ Sink
                    </span>
                  </th>
                  {colGroups.map((g) => (
                    <th
                      key={g.label}
                      colSpan={g.count}
                      className="sticky top-0 z-20 bg-[var(--color-surface-raised)] border-b border-l border-[var(--ui-border)] text-[9.5px] uppercase text-[var(--color-text-muted)]"
                      style={{ height: GROUP_H, ...MONO, letterSpacing: "0.13em", color: g.label === "BUSES" ? BUS_TINT : undefined }}
                    >
                      {g.label}
                    </th>
                  ))}
                </tr>
                {/* Sink labels (vertical) */}
                <tr>
                  {sinks.map((sink, c) => (
                    <th
                      key={sink.id}
                      data-c={c}
                      className="rmx-cell sticky z-10 bg-[var(--color-surface-raised)] border-b border-l border-[var(--ui-border)] align-bottom"
                      style={{ top: GROUP_H, width: CELL, minWidth: CELL, height: COL_HEADER_H }}
                      title={sink.isBus ? `Bus · ${sink.label}` : sink.label}
                    >
                      <div className="flex flex-col items-center h-full pb-1.5 gap-1">
                        {summing[c] >= 2 && (
                          <span className="text-[10px] leading-none" style={{ ...MONO, color: sink.isBus ? BUS_TINT : "var(--color-text-muted)" }} title={`Sums ${summing[c]} sources`}>
                            Σ
                          </span>
                        )}
                        <span className="flex-1" />
                        <span
                          className="text-[10.5px] whitespace-nowrap"
                          style={{ ...MONO, writingMode: "vertical-rl", color: sink.isBus ? BUS_TINT : "var(--color-text)" }}
                        >
                          {sink.label}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowSections.map((section) => (
                  <RowSection
                    key={section.label}
                    label={section.label}
                    totalCols={sinks.length}
                    isBusSection={section.label === "BUSES"}
                  >
                    {sources.slice(section.start, section.start + section.count).map((src, i) => {
                      const r = section.start + i;
                      return (
                        <tr key={src.id}>
                          <th
                            data-r={r}
                            className="rmx-cell sticky left-0 z-10 bg-[var(--color-surface)] border-b border-r border-[var(--ui-border)] text-left"
                            style={{ width: ROW_HEADER_W, minWidth: ROW_HEADER_W, height: CELL }}
                            title={src.isBus ? `Bus · ${src.label}` : src.label}
                          >
                            {src.isBus ? (
                              <BusRowHeader
                                bus={src}
                                onRename={(label) => updateDeviceConnector(deviceId, src.id, { label })}
                                onRemove={() => removeBus(src.id)}
                              />
                            ) : (
                              <div className="flex items-center gap-1.5 h-full pl-2 pr-1.5">
                                <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: `var(--color-${src.signalType})` }} />
                                <span className="truncate text-[11px] text-[var(--color-text)]" style={MONO}>
                                  {src.label}
                                </span>
                              </div>
                            )}
                          </th>
                          {sinks.map((sink, c) => {
                            const self = src.id === sink.id;
                            const routed = !self && routeSet.has(`${src.id} ${sink.id}`);
                            const cellColor = src.isBus || sink.isBus ? BUS_TINT : `var(--color-${src.signalType})`;
                            return (
                              <td
                                key={sink.id}
                                data-r={r}
                                data-c={c}
                                data-self={self ? "1" : undefined}
                                className={`rmx-cell border-b border-l border-[var(--ui-border)] p-0 ${self ? "cursor-default" : "cursor-pointer"}`}
                                style={{ width: CELL, height: CELL }}
                                title={self ? undefined : `${src.label} → ${sink.label}${routed ? " (routed)" : ""}`}
                              >
                                <span className="flex items-center justify-center w-full h-full">
                                  {self ? (
                                    <span className="w-[10px] h-[1.5px] rounded-full" style={{ background: "var(--color-border)", opacity: 0.5, transform: "rotate(-45deg)" }} />
                                  ) : routed ? (
                                    <span className="rounded-[3px]" style={{ width: CELL - 8, height: CELL - 8, background: cellColor }} />
                                  ) : (
                                    <span className="w-[3px] h-[3px] rounded-full" style={{ background: "var(--color-border)", opacity: 0.4 }} />
                                  )}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </RowSection>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <footer className="h-[46px] shrink-0 flex items-center gap-3 px-4 border-t border-[var(--ui-border)]">
          <span className="text-[11px] text-[var(--color-text-muted)]" style={MONO}>
            {routeCount} {routeCount === 1 ? "route" : "routes"} · {buses.length} {buses.length === 1 ? "bus" : "buses"}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            className="rmx-btn ui-btn ui-btn-primary text-xs px-4"
            onClick={requestClose}
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

/** A body group: a mono-caps section divider row + its source rows. */
function RowSection({
  label,
  totalCols,
  isBusSection,
  children,
}: {
  label: string;
  totalCols: number;
  isBusSection: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr>
        <th
          colSpan={totalCols + 1}
          className="sticky left-0 z-[5] bg-[var(--color-surface-hover)] border-b border-[var(--ui-border)] text-left"
          style={{ height: 20 }}
        >
          <span className="inline-block pl-3 text-[9.5px] uppercase text-[var(--color-text-muted)]" style={{ ...MONO, letterSpacing: "0.13em", color: isBusSection ? BUS_TINT : undefined }}>
            {label}
          </span>
        </th>
      </tr>
      {children}
    </>
  );
}

/** Full-screen routing matrix — mounted with the app's other overlays; null when closed. */
export default function RoutingMatrix() {
  const routingMatrixDeviceId = useSchematicStore((s) => s.routingMatrixDeviceId);
  const node = useSchematicStore((s) => s.nodes.find((n) => n.id === routingMatrixDeviceId && n.type === "device"));
  if (!routingMatrixDeviceId || !node) return null;
  return <Matrix key={node.id} node={node} />;
}

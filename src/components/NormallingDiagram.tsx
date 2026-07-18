import {
  resolvePatchPoint,
  type NormallingMode,
  type PatchNet,
  type PatchResolution,
  type PlugState,
  type Terminal,
} from "../patchbayNormalling";

export interface NormallingDiagramProps {
  mode: NormallingMode;
  plug: PlugState;
  className?: string;
  /** Live-conductor colour. Defaults to the workspace accent token. */
  signalColor?: string;
}

interface Point {
  x: number;
  y: number;
}

/** Terminal geometry — front jacks (patch face) left, rear terminals (tie-lines) right. */
const X_FRONT = 34;
const X_REAR = 206;
const Y_A = 34;
const Y_B = 116;
const VIEW_W = 240;
const VIEW_H = 150;
const JUNCTION_R = 4.5;
const FRONT_JACK_R = 6;
const REAR_TERM_SIZE = 10;
const DANGLE_LEN = 24;

const TERMINAL_POS: Record<Terminal, Point> = {
  frontA: { x: X_FRONT, y: Y_A },
  frontB: { x: X_FRONT, y: Y_B },
  rearA: { x: X_REAR, y: Y_A },
  rearB: { x: X_REAR, y: Y_B },
};

const TERMINAL_LABEL: Record<Terminal, string> = {
  frontA: "FA",
  frontB: "FB",
  rearA: "RA",
  rearB: "RB",
};

const TERMINAL_NAME: Record<Terminal, string> = {
  frontA: "Front A",
  frontB: "Front B",
  rearA: "Rear A",
  rearB: "Rear B",
};

const FRONT_TERMINALS: readonly Terminal[] = ["frontA", "frontB"];

type TerminalState = "live" | "dangling" | "idle";

/** Orthogonal (horizontal-then-vertical) route between two points. Degenerates
 * to a straight line automatically when the points share a row or column. */
function elbowPath(a: Point, b: Point): string {
  return `M ${a.x} ${a.y} L ${b.x} ${a.y} L ${b.x} ${b.y}`;
}

/** Centroid of a net's terminal positions — the passive-mult junction point. */
function netJunction(terminals: Terminal[]): Point {
  const pts = terminals.map((t) => TERMINAL_POS[t]);
  const x = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
  const y = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
  return { x, y };
}

/** Which net (if any) a terminal belongs to, and what that implies visually.
 * A terminal absent from every net is simply idle (an unpatched jack that
 * isn't part of the current path) — not an error state. */
function terminalStateOf(terminal: Terminal, nets: readonly PatchNet[]): TerminalState {
  const net = nets.find((n) => n.terminals.includes(terminal));
  if (!net) return "idle";
  return net.terminals.length === 1 ? "dangling" : "live";
}

function terminalColor(state: TerminalState, signalColor: string): string {
  if (state === "live") return signalColor;
  if (state === "dangling") return "var(--color-error)";
  return "var(--color-border)";
}

/** A severed conductor: a stub running from the terminal toward the diagram's
 * interior, cut short by a break-tick pair. Direction is derived from which
 * column the terminal sits in, so it works for any dangling terminal without
 * per-mode cases. */
function DanglingStub({ terminal }: { terminal: Terminal }) {
  const pos = TERMINAL_POS[terminal];
  const dir = pos.x === X_FRONT ? 1 : -1;
  const endX = pos.x + dir * DANGLE_LEN;
  const tickX = pos.x + dir * (DANGLE_LEN - 7);

  return (
    <g className="nd-dangling">
      <line x1={pos.x} y1={pos.y} x2={endX} y2={pos.y} className="nd-conductor nd-conductor--broken" />
      <line x1={tickX} y1={pos.y - 5} x2={tickX + dir * 4} y2={pos.y + 5} className="nd-break-tick" />
      <line x1={tickX + dir * 5} y1={pos.y - 5} x2={tickX + dir * 9} y2={pos.y + 5} className="nd-break-tick" />
    </g>
  );
}

/** One net's conductor(s) — a straight/elbow run for a plain 2-terminal net,
 * or a radiating junction for a passive split (3+ terminals). A 1-terminal
 * net has nothing to conduct to, so it renders as a dangling stub instead. */
function NetConductor({ net, signalColor }: { net: PatchNet; signalColor: string }) {
  const { terminals, passiveSplit } = net;

  if (terminals.length === 1) {
    return <DanglingStub terminal={terminals[0]} />;
  }

  if (terminals.length === 2) {
    const path = elbowPath(TERMINAL_POS[terminals[0]], TERMINAL_POS[terminals[1]]);
    return <path d={path} className="nd-conductor" style={{ stroke: signalColor }} />;
  }

  const junction = netJunction(terminals);
  return (
    <g>
      {terminals.map((t) => (
        <path
          key={t}
          d={elbowPath(junction, TERMINAL_POS[t])}
          className="nd-conductor"
          style={{ stroke: signalColor }}
        />
      ))}
      <circle
        cx={junction.x}
        cy={junction.y}
        r={JUNCTION_R}
        className={`nd-junction${passiveSplit ? " nd-junction--split" : ""}`}
        style={{ stroke: signalColor }}
      />
      {passiveSplit && (
        <text x={junction.x} y={junction.y - JUNCTION_R - 6} textAnchor="middle" className="nd-tag nd-tag--warning">
          passive
        </text>
      )}
    </g>
  );
}

function TerminalMark({
  terminal,
  patched,
  state,
  signalColor,
}: {
  terminal: Terminal;
  patched: boolean;
  state: TerminalState;
  signalColor: string;
}) {
  const pos = TERMINAL_POS[terminal];
  const color = terminalColor(state, signalColor);
  const isFront = FRONT_TERMINALS.includes(terminal);
  const isTopRow = pos.y === Y_A;
  const labelY = isTopRow ? pos.y - 12 : pos.y + 17;

  return (
    <g className="nd-terminal">
      {isFront ? (
        // Patch jack: filled ring when a cable is plugged in, hollow when open.
        <circle
          cx={pos.x}
          cy={pos.y}
          r={FRONT_JACK_R}
          className={`nd-jack${patched ? " nd-jack--patched" : ""}`}
          style={{ stroke: color, fill: patched ? color : "none" }}
        />
      ) : (
        // Rear terminal block: permanently wired, always solid.
        <rect
          x={pos.x - REAR_TERM_SIZE / 2}
          y={pos.y - REAR_TERM_SIZE / 2}
          width={REAR_TERM_SIZE}
          height={REAR_TERM_SIZE}
          className="nd-rear-term"
          style={{ stroke: color, fill: color }}
        />
      )}
      <text x={pos.x} y={labelY} textAnchor="middle" className="nd-terminal-label">
        {TERMINAL_LABEL[terminal]}
      </text>
    </g>
  );
}

function describeNet(net: PatchNet): string {
  const names = net.terminals.map((t) => TERMINAL_NAME[t]);
  if (names.length === 1) return `${names[0]} — disconnected`;
  const joined = names.join(" ↔ ");
  return net.passiveSplit ? `${joined} — passive split` : `${joined} — live`;
}

/** One-line human summary of a resolution, for captions/tooltips — e.g.
 * "Rear A ↔ Rear B ↔ Front A — passive split". */
// eslint-disable-next-line react-refresh/only-export-components
export function describePatchResolution(resolution: PatchResolution): string {
  return resolution.nets.map(describeNet).join("; ");
}

/**
 * Clean per-patch-point schematic: four fixed terminals — Front A/B (patch
 * face, left) and Rear A/B (tie-lines, right) — with conductors drawn
 * entirely from `resolvePatchPoint(mode, plug)`'s nets, not from `mode`
 * directly. A net's terminal count decides its geometry (a 2-terminal net is
 * a straight/elbow run, 3+ is a radiating passive-split junction, 1 is a
 * severed stub) so all five canonical states — HN idle, HN front-A tap, HN
 * front-B insert, split, isolated — fall out of the same rendering code.
 *
 * Presentational and pure: no store, no side effects. Prop changes retarget
 * conductor colour/opacity with a plain CSS transition (never keyframes) so
 * rapid mode/plug flips settle smoothly instead of restarting an animation.
 */
export default function NormallingDiagram({
  mode,
  plug,
  className,
  signalColor = "var(--color-accent)",
}: NormallingDiagramProps) {
  const resolution = resolvePatchPoint(mode, plug);
  const { nets, normalBroken, passiveSplit } = resolution;

  const statusLabel = normalBroken ? "normal broken" : passiveSplit ? "passive split" : "normal live";
  const statusClass = normalBroken ? "nd-status--broken" : passiveSplit ? "nd-status--warning" : "nd-status--live";

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className={`nd-root${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={`Normalling diagram: ${mode}, ${describePatchResolution(resolution)}`}
    >
      <style>{`
        .nd-root { width: 100%; height: auto; font-family: var(--font-mono); overflow: visible; }
        .nd-conductor { fill: none; stroke-width: 1.75px; opacity: 1; transition: stroke 180ms ease, opacity 180ms ease; }
        .nd-conductor--broken { stroke: var(--color-error); }
        .nd-break-tick { stroke: var(--color-error); stroke-width: 1.75px; opacity: 1; transition: opacity 180ms ease; }
        .nd-junction { fill: var(--color-surface); stroke-width: 1.75px; transition: stroke 180ms ease, fill 180ms ease; }
        .nd-junction--split { fill: var(--color-warning); stroke: var(--color-warning); }
        .nd-jack { stroke-width: 1.75px; transition: stroke 180ms ease, fill 180ms ease; }
        .nd-rear-term { stroke-width: 1.5px; transition: stroke 180ms ease, fill 180ms ease; }
        .nd-terminal-label { font-size: 8.5px; fill: var(--color-text-muted); letter-spacing: 0.02em; }
        .nd-tag { font-size: 8px; letter-spacing: 0.04em; text-transform: uppercase; }
        .nd-tag--warning { fill: var(--color-warning); }
        .nd-status { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.05em; transition: fill 180ms ease; }
        .nd-status--live { fill: var(--color-text-muted); }
        .nd-status--warning { fill: var(--color-warning); }
        .nd-status--broken { fill: var(--color-error); }
        .nd-legend { font-size: 8px; fill: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
        /* First paint of a conductor/terminal (mount, or a net shape that only
           appears in some states) gets a gentle opacity fade — never a scale
           or position tween. Re-renders of an already-mounted element just
           retarget the transitions above; @starting-style only fires once
           per element, so flips between already-seen states don't replay it. */
        @starting-style {
          .nd-conductor, .nd-break-tick, .nd-junction, .nd-jack, .nd-rear-term { opacity: 0; }
        }
      `}</style>

      <text x={X_FRONT} y={12} textAnchor="middle" className="nd-legend">
        Front
      </text>
      <text x={X_REAR} y={12} textAnchor="middle" className="nd-legend">
        Rear
      </text>

      {nets.map((net, i) => (
        <NetConductor key={i} net={net} signalColor={signalColor} />
      ))}

      {(Object.keys(TERMINAL_POS) as Terminal[]).map((t) => (
        <TerminalMark
          key={t}
          terminal={t}
          patched={t === "frontA" ? plug.frontAPatched : t === "frontB" ? plug.frontBPatched : true}
          state={terminalStateOf(t, nets)}
          signalColor={signalColor}
        />
      ))}

      <text x={VIEW_W / 2} y={VIEW_H - 6} textAnchor="middle" className={`nd-status ${statusClass}`}>
        {statusLabel}
      </text>
    </svg>
  );
}

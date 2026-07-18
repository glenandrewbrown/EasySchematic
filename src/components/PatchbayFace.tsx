import { useState } from "react";
import type { DeviceConnector, PatchPoint } from "../types";
import type { NormallingMode, Terminal } from "../patchbayNormalling";
import NormallingDiagram from "./NormallingDiagram";

/** One rendered patchbay column: its point (id + label + mode), the four jack
 *  connectors resolved by role, and the point's resolved signal colour. Built by
 *  DeviceNode from `data.patchbay` + `data.connectors` + `data.channels`. */
export interface PatchbayColumn {
  point: PatchPoint;
  /** Jack connectors keyed by role. A well-formed patchbay carries all four. */
  jacks: Partial<Record<Terminal, DeviceConnector>>;
  /** Signal colour of this point's A circuit (its identity hue). */
  signalColor: string;
}

export interface PatchbayFaceProps {
  /** Device display name — the face overlays the node header, so it re-shows it. */
  deviceName: string;
  columns: PatchbayColumn[];
  /** Connector ids that a Connection currently sources/targets on this device.
   *  A FRONT jack in this set is patched (a patch cable is plugged in). */
  patchedConnectorIds: ReadonlySet<string>;
  /** Global live-signal flag → a patched jack gets a subtle halo. */
  liveSignal: boolean;
  /** When true, no keyframed pulse: the live halo becomes a static ring. */
  reduceMotion: boolean;
  onSetMode: (pointId: string, mode: NormallingMode) => void;
  displayLabel: (s: string) => string;
}

const MODES: readonly { mode: NormallingMode; short: string; long: string }[] = [
  { mode: "half-normalled", short: "HN", long: "Half-normalled" },
  { mode: "split", short: "SP", long: "Split" },
  { mode: "isolated", short: "IS", long: "Isolated" },
];

const MODE_SHORT: Record<NormallingMode, string> = {
  "half-normalled": "HN",
  split: "SP",
  isolated: "IS",
};

/** One front jack ring. Open = hollow (border only); patched = filled in the
 *  signal colour; a patched jack under a live signal gains a halo. Only fill and
 *  the halo transition (never scale/position) so a state flip settles quietly. */
function Jack({
  patched,
  live,
  reduceMotion,
  signalColor,
  title,
}: {
  patched: boolean;
  live: boolean;
  reduceMotion: boolean;
  signalColor: string;
  title: string;
}) {
  const haloed = patched && live;
  const cls =
    "pbf-jack" +
    (patched ? " pbf-jack--patched" : "") +
    (haloed ? (reduceMotion ? " pbf-jack--live-static" : " pbf-jack--live") : "");
  return (
    <span
      className={cls}
      style={{
        borderColor: signalColor,
        background: patched ? signalColor : "var(--color-surface)",
        // The pulse/halo colour rides the signal hue.
        ["--pbf-halo" as string]: signalColor,
      }}
      role="img"
      aria-label={title}
      title={title}
    />
  );
}

/**
 * C7 patchbay face — a schematic 1U strip drawn from the R2-5 channel/connector
 * model. Two rows of front jacks (A top, B bottom), one column per point, mono
 * point numbers and a compact per-point mode glyph (HN / SP / IS). Clicking a
 * column opens a detail panel with the C8 <NormallingDiagram> for that point's
 * mode + live plug state and a segmented mode selector.
 *
 * Presentational: all state (wiring, mode) is owned by the store and flows in as
 * props; the only local state is which point is expanded. The strip scrolls
 * horizontally inside its own container so 24+ points never widen the node body.
 */
export default function PatchbayFace({
  deviceName,
  columns,
  patchedConnectorIds,
  liveSignal,
  reduceMotion,
  onSetMode,
  displayLabel,
}: PatchbayFaceProps) {
  const [openPointId, setOpenPointId] = useState<string | null>(null);
  const openColumn = columns.find((c) => c.point.id === openPointId) ?? null;

  const isPatched = (jack: DeviceConnector | undefined): boolean =>
    jack != null && patchedConnectorIds.has(jack.id);

  return (
    <div className="pbf-root flex flex-col h-full">
      <style>{`
        .pbf-jack {
          width: 9px; height: 9px; border-radius: 9999px; border-width: 1.5px;
          border-style: solid; display: inline-block; box-sizing: border-box;
          box-shadow: 0 0 0 0 transparent;
          transition: background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
        }
        .pbf-jack--live-static { box-shadow: 0 0 0 2.5px color-mix(in srgb, var(--pbf-halo) 30%, transparent); }
        .pbf-jack--live { animation: pbf-jack-pulse 2.1s ease-in-out infinite; }
        @keyframes pbf-jack-pulse {
          0%, 100% { box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--pbf-halo) 22%, transparent); }
          50%      { box-shadow: 0 0 0 3px  color-mix(in srgb, var(--pbf-halo) 40%, transparent); }
        }
        .pbf-col { transition: background-color 150ms ease; }
        .pbf-col:hover { background: var(--color-surface-hover); }
        .pbf-col--open { background: var(--color-accent-soft); }
        .pbf-seg-indicator { transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1); }
        .pbf-seg-btn:active { transform: scale(0.97); }
        .pbf-detail { transform-origin: top center; }
        .pbf-detail--enter { animation: pbf-detail-in 180ms cubic-bezier(0.22, 1, 0.36, 1); }
        @keyframes pbf-detail-in {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .pbf-jack--live { animation: none; box-shadow: 0 0 0 2.5px color-mix(in srgb, var(--pbf-halo) 30%, transparent); }
          .pbf-seg-indicator { transition: none; }
          .pbf-detail--enter { animation: none; }
          .pbf-seg-btn:active { transform: none; }
        }
      `}</style>

      {/* Header — device name (heading) + archetype/point-count meta (mono). The face
          overlays the node's own header band, so identity is re-shown here. */}
      <div className="flex items-baseline gap-1.5 px-3 pt-2 pb-1 shrink-0 min-w-0">
        <span
          className="text-[11.5px] font-semibold text-[var(--color-text-heading)] truncate min-w-0"
          title={deviceName}
        >
          {deviceName}
        </span>
        <span
          className="text-[8px] uppercase text-[var(--color-text-muted)] shrink-0"
          style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}
        >
          Patchbay · {columns.length} pts
        </span>
      </div>

      {/* Jack strip — horizontal scroll inside its own container so the node body
          never grows sideways past the cap. */}
      <div className="px-2 pb-1 overflow-x-auto shrink-0">
        <div className="flex items-stretch gap-0.5 min-w-min">
          {columns.map((col) => {
            const { point, jacks, signalColor } = col;
            const frontA = jacks.frontA;
            const frontB = jacks.frontB;
            const aPatched = isPatched(frontA);
            const bPatched = isPatched(frontB);
            const open = point.id === openPointId;
            const pointLabel = point.label ?? "";
            return (
              <button
                key={point.id}
                type="button"
                className={`pbf-col flex flex-col items-center gap-1 px-1 py-1 rounded-[4px]${open ? " pbf-col--open" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenPointId(open ? null : point.id);
                }}
                title={`Point ${displayLabel(pointLabel)} — ${MODE_SHORT[point.mode]} (${point.mode})`}
                aria-expanded={open}
              >
                <span
                  className="text-[8px] text-[var(--color-text-muted)] leading-none"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {displayLabel(pointLabel)}
                </span>
                <Jack
                  patched={aPatched}
                  live={liveSignal}
                  reduceMotion={reduceMotion}
                  signalColor={signalColor}
                  title={`Front A${aPatched ? " — patched" : " — open"}`}
                />
                <Jack
                  patched={bPatched}
                  live={liveSignal}
                  reduceMotion={reduceMotion}
                  signalColor={signalColor}
                  title={`Front B${bPatched ? " — patched" : " — open"}`}
                />
                <span
                  className="text-[7.5px] uppercase text-[var(--color-text-muted)] leading-none"
                  style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}
                >
                  {MODE_SHORT[point.mode]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Expanded point detail — the C8 normalling diagram + a segmented mode
          selector. Panel scales/fades in from the top; conductors inside the
          diagram retarget with their own transition. */}
      {openColumn && (
        <div
          className={`pbf-detail${reduceMotion ? "" : " pbf-detail--enter"} mx-2 mb-2 rounded-[6px] border border-[var(--ui-border)] bg-[var(--color-surface)] p-2`}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex items-center justify-between mb-1 text-[8px] uppercase text-[var(--color-text-muted)]"
            style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}
          >
            <span>Point {displayLabel(openColumn.point.label ?? "")}</span>
            <button
              type="button"
              className="pbf-seg-btn text-[var(--color-text-muted)] hover:text-[var(--color-text)] leading-none"
              onClick={(e) => {
                e.stopPropagation();
                setOpenPointId(null);
              }}
              title="Close point detail"
              aria-label="Close point detail"
            >
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                <path d="M1.5 1.5l6 6M7.5 1.5l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <NormallingDiagram
            mode={openColumn.point.mode}
            plug={{
              frontAPatched: isPatched(openColumn.jacks.frontA),
              frontBPatched: isPatched(openColumn.jacks.frontB),
            }}
            signalColor={openColumn.signalColor}
          />

          {/* Segmented mode selector — sliding indicator behind the active
              segment; each button sets the point's mode via the store. */}
          <div
            className="relative mt-1 grid grid-cols-3 rounded-[6px] border border-[var(--ui-border)] overflow-hidden"
            role="group"
            aria-label="Normalling mode"
          >
            <span
              className="pbf-seg-indicator absolute inset-y-0 left-0 w-1/3 rounded-[5px] bg-[var(--color-surface-raised)] border border-[var(--color-accent)] pointer-events-none"
              style={{
                transform: `translateX(${MODES.findIndex((m) => m.mode === openColumn.point.mode) * 100}%)`,
              }}
              aria-hidden
            />
            {MODES.map((m) => {
              const active = m.mode === openColumn.point.mode;
              return (
                <button
                  key={m.mode}
                  type="button"
                  className={`pbf-seg-btn relative z-10 py-1 text-[8.5px] text-center ${active ? "text-[var(--color-text-heading)] font-semibold" : "text-[var(--color-text-muted)]"}`}
                  style={{ fontFamily: "var(--font-mono)" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetMode(openColumn.point.id, m.mode);
                  }}
                  title={m.long}
                  aria-pressed={active}
                >
                  {m.short}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

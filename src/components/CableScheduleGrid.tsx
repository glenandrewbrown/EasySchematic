import { useMemo, useState } from "react";
import type { CableScheduleRow } from "../cableSchedule";
import type { RunLengthWarning } from "../cableBomBuild";
import { DEFAULT_SIGNAL_COLORS } from "../signalColors";
import type { SignalType } from "../types";

/**
 * Full cable-schedule data grid (the "Cable BOM" tab of the Schedule workspace).
 *
 * Renders the design's per-run grid: a left filter sidebar (Summary KPI cards +
 * signal-type filter list with counts/swatches), a max-run **warning banner**, and a
 * sticky-header table — one row per cable run (From·Port → To·Port · Signal · Cable ·
 * Length · Status). All values derive from the real schedule rows; status and KPIs are
 * computed, never hardcoded. Styling is token-only so it tracks light/dark + the
 * per-workspace accent.
 */

/** Per-run resolved status used for the status pill + KPI tallies. */
type RunStatus = "in-stock" | "long-run" | "to-order";

interface RunView {
  row: CableScheduleRow;
  /** 1-based display index (matches schedule order). */
  index: number;
  /** Resolved swatch colour for this run's signal. */
  signalColor: string;
  /** Estimated run length in metres (undefined when unknown). */
  lengthM: number | undefined;
  /** True when this run exceeds its cable type's catalog maximum. */
  overMax: boolean;
  status: RunStatus;
}

interface SignalFilterEntry {
  /** Signal display label (e.g. "HDMI"). */
  label: string;
  /** Raw signal id, when known — drives the swatch colour + CSS var. */
  signalTypeId: SignalType | undefined;
  color: string;
  count: number;
}

interface CableScheduleGridProps {
  rows: CableScheduleRow[];
  warnings: RunLengthWarning[];
  /** Total estimated length across all runs, in metres. */
  totalLengthM: number;
  onExportCsv: () => void;
  onExportPdf: () => void;
}

const STATUS_LABEL: Record<RunStatus, string> = {
  "in-stock": "In stock",
  "long-run": "Long run",
  "to-order": "To order",
};

/** Token-backed colours for each status pill (success / warning / error). */
const STATUS_TOKEN: Record<RunStatus, string> = {
  "in-stock": "var(--color-success)",
  "long-run": "var(--color-warning)",
  "to-order": "var(--color-error)",
};

function resolveSignalColor(row: CableScheduleRow): string {
  if (row.signalTypeId) {
    return DEFAULT_SIGNAL_COLORS[row.signalTypeId] ?? "var(--color-text-muted)";
  }
  return "var(--color-text-muted)";
}

/** A run is assigned once it carries an owned-cable summary (ConnectionData.cableLength). */
function isAssigned(row: CableScheduleRow): boolean {
  return row.cableLength.trim().length > 0;
}

function resolveStatus(row: CableScheduleRow, overMax: boolean): RunStatus {
  if (overMax) return "long-run";
  if (isAssigned(row)) return "in-stock";
  return "to-order";
}

export default function CableScheduleGrid({
  rows,
  warnings,
  totalLengthM,
  onExportCsv,
  onExportPdf,
}: CableScheduleGridProps) {
  // null = "all signal types"; otherwise filter to a single signal display label.
  const [signalFilter, setSignalFilter] = useState<string | null>(null);

  const runs = useMemo<RunView[]>(() => {
    const overMaxIds = new Set(warnings.map((w) => w.edgeId));
    return rows.map((row, i) => {
      const overMax = overMaxIds.has(row.edgeId);
      return {
        row,
        index: i + 1,
        signalColor: resolveSignalColor(row),
        lengthM: row.computedLengthM,
        overMax,
        status: resolveStatus(row, overMax),
      };
    });
  }, [rows, warnings]);

  const kpis = useMemo(() => {
    let inStock = 0;
    let toOrder = 0;
    for (const r of runs) {
      if (r.status === "in-stock" || r.status === "long-run") inStock += 1;
      else toOrder += 1;
    }
    return { runCount: runs.length, totalLengthM, inStock, toOrder };
  }, [runs, totalLengthM]);

  const signalEntries = useMemo<SignalFilterEntry[]>(() => {
    const map = new Map<string, SignalFilterEntry>();
    for (const r of runs) {
      const label = r.row.signalType || "Unknown";
      const existing = map.get(label);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(label, {
          label,
          signalTypeId: r.row.signalTypeId,
          color: r.signalColor,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [runs]);

  const visibleRuns = useMemo(
    () => (signalFilter ? runs.filter((r) => r.row.signalType === signalFilter) : runs),
    [runs, signalFilter],
  );

  const isEmpty = runs.length === 0;

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <FilterSidebar
        kpis={kpis}
        signalEntries={signalEntries}
        activeFilter={signalFilter}
        onSelectFilter={setSignalFilter}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <HeaderBar onExportCsv={onExportCsv} onExportPdf={onExportPdf} disabled={isEmpty} />

        {warnings.length > 0 && <WarningBanner count={warnings.length} />}

        <div className="flex-1 overflow-auto">
          {isEmpty ? (
            <EmptyState />
          ) : (
            <ScheduleTable runs={visibleRuns} filtered={signalFilter !== null} />
          )}
        </div>
      </div>
    </div>
  );
}

interface FilterSidebarProps {
  kpis: { runCount: number; totalLengthM: number; inStock: number; toOrder: number };
  signalEntries: SignalFilterEntry[];
  activeFilter: string | null;
  onSelectFilter: (label: string | null) => void;
}

function FilterSidebar({ kpis, signalEntries, activeFilter, onSelectFilter }: FilterSidebarProps) {
  return (
    <aside
      className="w-[226px] shrink-0 border-r border-[var(--ui-border)] bg-[var(--color-surface)] flex flex-col gap-5 p-4 overflow-auto"
      aria-label="Cable schedule filters"
    >
      <section>
        <SectionLabel>Summary</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <KpiCard value={String(kpis.runCount)} label="Cable runs" />
          <KpiCard value={`${kpis.totalLengthM.toFixed(0)}`} unit="m" label="Total length" />
          <KpiCard
            value={String(kpis.toOrder)}
            label="To order"
            valueColor="var(--color-warning)"
          />
          <KpiCard
            value={String(kpis.inStock)}
            label="In stock"
            valueColor="var(--color-success)"
          />
        </div>
      </section>

      <section>
        <SectionLabel>Signal type</SectionLabel>
        <div className="flex flex-col gap-px">
          {signalEntries.length === 0 ? (
            <p className="text-[11px] text-[var(--color-text-muted)] px-2 py-1.5">No runs yet.</p>
          ) : (
            <>
              <SignalFilterRow
                label="All signals"
                count={signalEntries.reduce((sum, e) => sum + e.count, 0)}
                active={activeFilter === null}
                onClick={() => onSelectFilter(null)}
              />
              {signalEntries.map((entry) => (
                <SignalFilterRow
                  key={entry.label}
                  label={entry.label}
                  count={entry.count}
                  color={entry.color}
                  signalTypeId={entry.signalTypeId}
                  active={activeFilter === entry.label}
                  onClick={() =>
                    onSelectFilter(activeFilter === entry.label ? null : entry.label)
                  }
                />
              ))}
            </>
          )}
        </div>
      </section>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-2.5 text-[9.5px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      {children}
    </div>
  );
}

interface KpiCardProps {
  value: string;
  unit?: string;
  label: string;
  valueColor?: string;
}

function KpiCard({ value, unit, label, valueColor }: KpiCardProps) {
  return (
    <div className="rounded-md border border-[var(--ui-border)] bg-[var(--color-surface-raised)] px-2.5 py-2">
      <div
        className="text-[17px] font-semibold leading-none"
        style={{
          fontFamily: "var(--font-mono)",
          color: valueColor ?? "var(--color-text-heading)",
        }}
      >
        {value}
        {unit && (
          <span className="text-[10px] font-normal text-[var(--color-text-muted)]">{unit}</span>
        )}
      </div>
      <div className="mt-1.5 text-[9px] text-[var(--color-text-muted)]">{label}</div>
    </div>
  );
}

interface SignalFilterRowProps {
  label: string;
  count: number;
  color?: string;
  signalTypeId?: SignalType;
  active: boolean;
  onClick: () => void;
}

function SignalFilterRow({
  label,
  count,
  color,
  signalTypeId,
  active,
  onClick,
}: SignalFilterRowProps) {
  const swatchColor = signalTypeId ? `var(--color-${signalTypeId}, ${color})` : color;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-left transition-colors ${
        active ? "bg-[var(--color-accent-soft)]" : "hover:bg-[var(--color-surface-hover)]"
      }`}
    >
      {color ? (
        <span
          className="w-[9px] h-[9px] rounded-sm shrink-0"
          style={{ background: swatchColor }}
        />
      ) : (
        <span className="w-[9px] h-[9px] shrink-0" />
      )}
      <span className="text-[11.5px] text-[var(--color-text)] truncate">{label}</span>
      <span
        className="ml-auto text-[10px] text-[var(--color-text-muted)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {count}
      </span>
    </button>
  );
}

interface HeaderBarProps {
  onExportCsv: () => void;
  onExportPdf: () => void;
  disabled: boolean;
}

function HeaderBar({ onExportCsv, onExportPdf, disabled }: HeaderBarProps) {
  return (
    <div className="h-[50px] shrink-0 flex items-center gap-3 px-[18px] border-b border-[var(--ui-border)]">
      <span className="text-[13px] font-semibold text-[var(--color-text-heading)]">
        Cable Schedule
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className="ui-btn ui-btn-secondary"
          onClick={onExportCsv}
          disabled={disabled}
          style={disabled ? { opacity: 0.5 } : undefined}
        >
          CSV
        </button>
        <button
          type="button"
          className="ui-btn ui-btn-primary"
          onClick={onExportPdf}
          disabled={disabled}
          style={disabled ? { opacity: 0.5 } : undefined}
        >
          PDF
        </button>
      </div>
    </div>
  );
}

function WarningBanner({ count }: { count: number }) {
  return (
    <div
      className="mx-[18px] mt-3 flex items-center gap-2.5 rounded-lg px-3 py-2.5"
      style={{
        background: "color-mix(in srgb, var(--color-warning) 10%, transparent)",
        border: "1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)",
      }}
      role="status"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
        <path
          d="M12 3L2 20h20L12 3z"
          stroke="var(--color-warning)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M12 10v4M12 17v.5"
          stroke="var(--color-warning)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-[11.5px] text-[var(--color-text)]">
        <b className="font-semibold" style={{ color: "var(--color-warning)" }}>
          {count} run{count === 1 ? "" : "s"}
        </b>{" "}
        exceed the recommended max length for their signal type — long runs may need a stage box
        or active cable.
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center py-16 px-6">
      <p className="text-sm text-[var(--color-text-muted)] text-center">
        No cable runs to schedule. Connect devices on the schematic to build a cable schedule.
      </p>
    </div>
  );
}

interface ScheduleTableProps {
  runs: RunView[];
  filtered: boolean;
}

const HEAD_CELL =
  "sticky top-0 z-10 bg-[var(--color-bg)] px-2.5 py-2 text-[9px] uppercase tracking-[0.08em] font-medium text-[var(--color-text-muted)] border-b border-[var(--ui-border)]";

function ScheduleTable({ runs, filtered }: ScheduleTableProps) {
  if (runs.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 px-6">
        <p className="text-sm text-[var(--color-text-muted)] text-center">
          {filtered
            ? "No runs match the selected signal type."
            : "No cable runs to schedule."}
        </p>
      </div>
    );
  }

  return (
    <table
      className="w-full text-[11.5px]"
      style={{ borderCollapse: "separate", borderSpacing: 0 }}
    >
      <thead>
        <tr className="text-left">
          <th className={`${HEAD_CELL} text-left`} style={{ fontFamily: "var(--font-mono)" }}>
            #
          </th>
          <th className={HEAD_CELL} style={{ fontFamily: "var(--font-mono)" }}>
            From · Port
          </th>
          <th className={HEAD_CELL} style={{ fontFamily: "var(--font-mono)" }}>
            To · Port
          </th>
          <th className={HEAD_CELL} style={{ fontFamily: "var(--font-mono)" }}>
            Signal
          </th>
          <th className={HEAD_CELL} style={{ fontFamily: "var(--font-mono)" }}>
            Cable
          </th>
          <th
            className={`${HEAD_CELL} text-right`}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Length
          </th>
          <th className={HEAD_CELL} style={{ fontFamily: "var(--font-mono)" }}>
            Status
          </th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <ScheduleRow key={run.row.edgeId} run={run} />
        ))}
      </tbody>
    </table>
  );
}

function ScheduleRow({ run }: { run: RunView }) {
  const { row } = run;
  const lengthLabel =
    run.lengthM != null ? `${run.lengthM.toFixed(1)} m` : row.cableLength || "—";
  const cableAssigned = isAssigned(row);

  return (
    <tr className="border-b border-[var(--ui-border)]">
      <td
        className="px-2.5 py-2.5 text-[var(--color-text-muted)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {String(run.index).padStart(2, "0")}
      </td>
      <td className="px-2.5 py-2.5 text-[var(--color-text)]">
        {row.sourceDevice}
        {row.sourcePort && (
          <span className="text-[var(--color-text-muted)]"> · {row.sourcePort}</span>
        )}
      </td>
      <td className="px-2.5 py-2.5 text-[var(--color-text)]">
        {row.targetDevice}
        {row.targetPort && (
          <span className="text-[var(--color-text-muted)]"> · {row.targetPort}</span>
        )}
      </td>
      <td className="px-2.5 py-2.5 text-[var(--color-text)]">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-[9px] h-[9px] rounded-sm shrink-0"
            style={{
              background: row.signalTypeId
                ? `var(--color-${row.signalTypeId}, ${run.signalColor})`
                : run.signalColor,
            }}
          />
          {row.signalType || "—"}
        </span>
      </td>
      <td className="px-2.5 py-2.5">
        {cableAssigned || row.cableType ? (
          <span className="text-[var(--color-text-muted)]">{row.cableType || "—"}</span>
        ) : (
          <span className="italic text-[var(--color-text-muted)] opacity-70">
            — unassigned —
          </span>
        )}
      </td>
      <td
        className="px-2.5 py-2.5 text-right"
        style={{
          fontFamily: "var(--font-mono)",
          color: run.overMax ? "var(--color-warning)" : "var(--color-text)",
        }}
      >
        {lengthLabel}
      </td>
      <td className="px-2.5 py-2.5">
        <StatusPill status={run.status} />
      </td>
    </tr>
  );
}

function StatusPill({ status }: { status: RunStatus }) {
  const token = STATUS_TOKEN[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-medium"
      style={{
        color: token,
        background: `color-mix(in srgb, ${token} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${token} 28%, transparent)`,
      }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

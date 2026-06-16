import { useMemo } from "react";
import { useSchematicStore } from "../store";
import { computeCableSchedule } from "../cableSchedule";
import { scheduleToBomInputs, runLengthWarnings } from "../cableBomBuild";
import { buildCableBom, bomToCsv } from "../cableBom";
import { renderCableBomPdf } from "../cableBomPdf";
import { downloadCsv } from "../downloadCsv";

/**
 * Full-page "Schedule" view — the third top-level canvas mode
 * (Schematic | Plan | Schedule). Surfaces the existing Cable BOM (bill of
 * materials + max-run warnings) as a full-page data grid with its own header
 * and CSV/PDF export buttons.
 *
 * Data pipeline mirrors ReportsDialog's CableBomTab exactly:
 *   computeCableSchedule → scheduleToBomInputs → buildCableBom (+ runLengthWarnings).
 * Only the surrounding page chrome (header bar, empty state, export handlers)
 * is new here; the warnings banner and table markup are copied verbatim.
 */
export default function ScheduleView() {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const cableNamingScheme = useSchematicStore((s) => s.cableNamingScheme);
  const roomDistances = useSchematicStore((s) => s.roomDistances);
  const distanceSettings = useSchematicStore((s) => s.distanceSettings);
  const schematicName = useSchematicStore((s) => s.schematicName);

  const { rows, bom, warnings } = useMemo(() => {
    const scheduleRows = computeCableSchedule(nodes, edges, cableNamingScheme, {
      roomDistances,
      distanceSettings,
    });
    return {
      rows: scheduleRows,
      bom: buildCableBom(scheduleToBomInputs(scheduleRows)),
      warnings: runLengthWarnings(scheduleRows),
    };
  }, [nodes, edges, cableNamingScheme, roomDistances, distanceSettings]);

  const isEmpty = bom.length === 0;

  const handleExportCsv = () => {
    downloadCsv(bomToCsv(bom), `${schematicName} - Cable BOM.csv`);
  };

  const handleExportPdf = () => {
    renderCableBomPdf(bom, warnings, schematicName);
  };

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-[var(--color-surface)]">
      {/* Header bar */}
      <div className="px-4 py-3 border-b border-[var(--ui-border)] bg-[var(--color-surface-raised)] flex items-center gap-3 shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--color-text-heading)] truncate">
            Cable Schedule
          </h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            {rows.length} cable run{rows.length === 1 ? "" : "s"} · {bom.length} line item
            {bom.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button
            type="button"
            className="ui-btn ui-btn-secondary"
            onClick={handleExportCsv}
            disabled={isEmpty}
            style={isEmpty ? { opacity: 0.5 } : undefined}
          >
            CSV
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-secondary"
            onClick={handleExportPdf}
            disabled={isEmpty}
            style={isEmpty ? { opacity: 0.5 } : undefined}
          >
            PDF
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4">
        {warnings.length > 0 && (
          <div className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs max-w-3xl mb-3">
            <div className="font-semibold text-red-600 dark:text-red-400 mb-1">
              ⚠ {warnings.length} run{warnings.length === 1 ? "" : "s"} exceed recommended cable length
            </div>
            <ul className="space-y-0.5 text-[var(--color-text)]">
              {warnings.map((w) => (
                <li key={w.edgeId}>
                  {w.from} → {w.to} · {w.cableType}: {w.lengthM.toFixed(1)} m of {w.maxRunM} m max
                </li>
              ))}
            </ul>
          </div>
        )}
        {isEmpty ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <p className="text-sm text-[var(--color-text-muted)] text-center">
              No cable runs to report. Connect devices to build a schedule.
            </p>
          </div>
        ) : (
          <table className="w-full max-w-3xl text-xs border-collapse">
            <thead>
              <tr className="text-left text-[var(--color-text-muted)] border-b border-[var(--ui-border)]">
                <th className="py-1 pr-2 font-medium">Signal</th>
                <th className="py-1 pr-2 font-medium">Cable Type</th>
                <th className="py-1 pr-2 font-medium text-right">Length (m)</th>
                <th className="py-1 pr-2 font-medium text-right">Qty</th>
                <th className="py-1 font-medium text-right">Total (m)</th>
              </tr>
            </thead>
            <tbody>
              {bom.map((r, i) => (
                <tr key={i} className="border-b border-[var(--ui-border)]/50">
                  <td className="py-1 pr-2 text-[var(--color-text)]">{r.signalType}</td>
                  <td className="py-1 pr-2 text-[var(--color-text)]">{r.cableType ?? "—"}</td>
                  <td className="py-1 pr-2 text-right text-[var(--color-text)] tabular-nums">
                    {r.lengthM != null ? r.lengthM.toFixed(1) : "—"}
                  </td>
                  <td className="py-1 pr-2 text-right text-[var(--color-text)] tabular-nums">{r.quantity}</td>
                  <td className="py-1 text-right text-[var(--color-text)] tabular-nums">
                    {r.totalLengthM != null ? r.totalLengthM.toFixed(1) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

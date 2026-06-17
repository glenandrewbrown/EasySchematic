import { useMemo, useState } from "react";
import { useSchematicStore } from "../store";
import { computeCableSchedule } from "../cableSchedule";
import { scheduleToBomInputs, runLengthWarnings } from "../cableBomBuild";
import { buildCableBom, bomToCsv } from "../cableBom";
import { renderCableBomPdf } from "../cableBomPdf";
import { downloadCsv } from "../downloadCsv";
import CableScheduleGrid from "./CableScheduleGrid";
import GearInventoryPanel from "./GearInventoryPanel";
import LogisticsPanel from "./LogisticsPanel";

/**
 * Full-page "Schedule" view — the third top-level canvas mode
 * (Schematic | Layout | Schedule). The operational system-of-record workspace:
 * a sub-tab bar hosts the Cable BOM, the per-unit Gear Inventory, and the
 * Transport / Logistics checklist — all surfaced here as docked panels instead of
 * the old floating modals (round-2 review: working data does not belong in modals
 * launched from the Reports menu).
 */
type ScheduleTab = "bom" | "inventory" | "logistics";

export default function ScheduleView() {
  const [tab, setTab] = useState<ScheduleTab>("bom");

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-[var(--color-surface)]">
      {/* Sub-tab bar */}
      <div
        className="px-3 pt-2 border-b border-[var(--ui-border)] bg-[var(--color-surface-raised)] flex items-center gap-1 shrink-0"
        role="tablist"
        aria-label="Schedule sections"
      >
        <ScheduleTabButton id="bom" label="Cable BOM" active={tab} onSelect={setTab} />
        <ScheduleTabButton id="inventory" label="Inventory" active={tab} onSelect={setTab} />
        <ScheduleTabButton id="logistics" label="Logistics" active={tab} onSelect={setTab} />
      </div>

      {tab === "bom" && <CableBomTab />}
      {tab === "inventory" && <GearInventoryPanel />}
      {tab === "logistics" && <LogisticsPanel />}
    </div>
  );
}

interface ScheduleTabButtonProps {
  id: ScheduleTab;
  label: string;
  active: ScheduleTab;
  onSelect: (id: ScheduleTab) => void;
}

function ScheduleTabButton({ id, label, active, onSelect }: ScheduleTabButtonProps) {
  const isActive = active === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => onSelect(id)}
      className={`px-3 py-1.5 text-xs rounded-t cursor-pointer border border-b-0 transition-colors whitespace-nowrap ${
        isActive
          ? "bg-[var(--color-surface)] text-[var(--color-text-heading)] font-semibold border-[var(--ui-border)]"
          : "bg-transparent text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text)]"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Cable BOM (bill of materials + max-run warnings) as a full-page data grid.
 * Data pipeline mirrors ReportsDialog's CableBomTab:
 *   computeCableSchedule → scheduleToBomInputs → buildCableBom (+ runLengthWarnings).
 */
function CableBomTab() {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const cableNamingScheme = useSchematicStore((s) => s.cableNamingScheme);
  const roomDistances = useSchematicStore((s) => s.roomDistances);
  const distanceSettings = useSchematicStore((s) => s.distanceSettings);
  const schematicName = useSchematicStore((s) => s.schematicName);

  const { rows, bom, warnings, totalLengthM } = useMemo(() => {
    const scheduleRows = computeCableSchedule(nodes, edges, cableNamingScheme, {
      roomDistances,
      distanceSettings,
    });
    const total = scheduleRows.reduce(
      (sum, r) => sum + (typeof r.computedLengthM === "number" ? r.computedLengthM : 0),
      0,
    );
    return {
      rows: scheduleRows,
      bom: buildCableBom(scheduleToBomInputs(scheduleRows)),
      warnings: runLengthWarnings(scheduleRows),
      totalLengthM: total,
    };
  }, [nodes, edges, cableNamingScheme, roomDistances, distanceSettings]);

  const handleExportCsv = () => {
    downloadCsv(bomToCsv(bom), `${schematicName} - Cable BOM.csv`);
  };

  const handleExportPdf = () => {
    renderCableBomPdf(bom, warnings, schematicName);
  };

  return (
    <CableScheduleGrid
      rows={rows}
      warnings={warnings}
      totalLengthM={totalLengthM}
      onExportCsv={handleExportCsv}
      onExportPdf={handleExportPdf}
    />
  );
}

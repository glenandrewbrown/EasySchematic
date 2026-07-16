import React, { memo, useMemo, useState, useCallback, useEffect } from "react";
import { useSchematicStore } from "../store";
import { computeNetworkReport, computeDhcpServerSummary, computePoeBudget, type NetworkReportRow } from "../networkReport";
import { isValidIpv4, isValidSubnetMask, isValidVlan, findDuplicateIps, computeDhcpWarnings, computeSubnetConflicts, type DhcpWarning } from "../networkValidation";
import {
  computePackList,
  computeDocumentSummary,
  mergeDevicesByModel,
  mergeCablesByType,
  exportPackListCsv,
  getPackListTableData,
  getRoomLabel,
  type PackListDevice,
  type PackListSummaryRow,
  groupCablesByCategory,
  cableCostKey,
} from "../packList";
import {
  computeCableSchedule,
  exportCableScheduleCsv,
  getCableScheduleTableData,
  type CableScheduleRow,
} from "../cableSchedule";
import { buildCableBom, bomToCsv } from "../cableBom";
import { downloadCsv } from "../downloadCsv";
import { scheduleToBomInputs, runLengthWarnings } from "../cableBomBuild";
import { renderCableBomPdf } from "../cableBomPdf";
import {
  computePatchPanelSchedule,
  exportPatchPanelScheduleCsv,
  getPatchPanelScheduleTableData,
  type PatchPanelScheduleRow,
} from "../patchPanelSchedule";
import { createDefaultPackListLayout, createDefaultNetworkReportLayout, createDefaultCableScheduleLayout, createDefaultPatchPanelScheduleLayout, createDefaultPowerReportLayout } from "../reportLayout";
import { getNetworkReportTableData } from "../networkReport";
import { computePowerReport, exportPowerReportCsv, getPowerReportTableData } from "../powerReport";
import ReportPreviewDialog from "./ReportPreviewDialog";
import IpInput from "./IpInput";
import type { DeviceData, SchematicNode, ConnectionData, OwnedGearItem } from "../types";
import { inventoryKeyFromDeviceData, inventoryKeyFromTemplate } from "../inventoryKey";
import { formatCurrency } from "../auxiliaryData";
import { useSpreadsheetSelection } from "../spreadsheet/useSpreadsheetSelection";
import type { SpreadsheetColumn } from "../spreadsheet/types";
import FillSeriesDialog from "../spreadsheet/FillSeriesDialog";
import {
  buildPowerDashboard,
  buildThermalDashboard,
  buildNetworkDashboard,
  type ReportDashboard,
  type ReportStatus,
} from "../reportMetrics";

export type ReportsTab = "network" | "devices" | "packList" | "cableSchedule" | "cableBom" | "patchPanel" | "power";

/** Dashboard tabs (comp-styled "engineering instrument" view). */
type DashboardTab = "power" | "thermal" | "network";
/**
 * Table tabs (full editing surfaces, reached from the "More" menu). `networkDetail`
 * and `powerDetail` expose the original editable Network / Power report tables so the
 * read-only dashboards don't drop any existing editing or export capability.
 */
type TableTab =
  | "devices"
  | "packList"
  | "cableSchedule"
  | "cableBom"
  | "patchPanel"
  | "networkDetail"
  | "powerDetail";

interface ReportsDialogProps {
  initialTab: ReportsTab;
  onClose: () => void;
}

const PACKLIST_LAYOUT_KEY = "easyschematic-packlist-layout";
const NETWORK_LAYOUT_KEY = "easyschematic-network-report-layout";
const CABLE_SCHEDULE_LAYOUT_KEY = "easyschematic-cable-schedule-layout";
const PATCH_PANEL_LAYOUT_KEY = "easyschematic-patch-panel-layout";
const POWER_LAYOUT_KEY = "easyschematic-power-report-layout";

/** Labels for the table-tab "More" menu (full editing surfaces). */
const TABLE_TAB_LABELS: Record<TableTab, string> = {
  devices: "Devices",
  cableSchedule: "Cable Schedule",
  cableBom: "Cable BOM",
  patchPanel: "Patch Panels",
  packList: "Pack List",
  networkDetail: "Network (detail)",
  powerDetail: "Power (detail)",
};

/** Map a table tab onto the ReportsTab used by the CSV/PDF export routing. */
function tableTabToReportTab(t: TableTab): ReportsTab {
  if (t === "networkDetail") return "network";
  if (t === "powerDetail") return "power";
  return t;
}

const DASHBOARD_TABS: { id: DashboardTab; label: string }[] = [
  { id: "power", label: "Power" },
  { id: "thermal", label: "Thermal" },
  { id: "network", label: "Network" },
];

function ReportsDialog({ initialTab, onClose }: ReportsDialogProps) {
  // The comp surfaces three dashboard tabs (Power / Thermal / Network). The
  // remaining editing surfaces stay reachable via the "More" menu so no existing
  // report or export is lost. Map the requested initialTab onto either set.
  const initialDashboard: DashboardTab =
    initialTab === "power" || initialTab === "network" ? initialTab : "power";
  const initialTable: TableTab | null =
    initialTab === "devices" ||
    initialTab === "packList" ||
    initialTab === "cableSchedule" ||
    initialTab === "cableBom" ||
    initialTab === "patchPanel"
      ? initialTab
      : null;

  const [dashTab, setDashTab] = useState<DashboardTab>(initialDashboard);
  const [tableTab, setTableTab] = useState<TableTab | null>(initialTable);
  const [moreOpen, setMoreOpen] = useState(false);

  const [showPreview, setShowPreview] = useState(false);
  const [showNetworkPreview, setShowNetworkPreview] = useState(false);
  const [showCableSchedulePreview, setShowCableSchedulePreview] = useState(false);
  const [showPatchPanelPreview, setShowPatchPanelPreview] = useState(false);
  const [showPowerPreview, setShowPowerPreview] = useState(false);

  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const schematicName = useSchematicStore((s) => s.schematicName);
  const titleBlock = useSchematicStore((s) => s.titleBlock);

  // Close on Escape (matches dialog behaviour the menu relied on).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /**
   * The tab whose CSV/PDF export should fire. A table tab takes precedence when
   * open; otherwise the dashboard tab maps onto a ReportsTab — thermal reuses the
   * power report (its CSV/PDF already carry the BTU/h columns).
   */
  const activeReportTab: ReportsTab = tableTab
    ? tableTabToReportTab(tableTab)
    : dashTab === "thermal"
      ? "power"
      : dashTab;

  const handleCsvExport = useCallback(() => {
    const ownedGear = useSchematicStore.getState().ownedGear;
    const tab = activeReportTab;
    if (tab === "network") {
      exportNetworkCsv(nodes, edges, schematicName);
    } else if (tab === "devices") {
      exportDevicesCsv(nodes, ownedGear, schematicName);
    } else if (tab === "cableSchedule") {
      const s = useSchematicStore.getState();
      const rows = computeCableSchedule(nodes, edges, s.cableNamingScheme, {
        roomDistances: s.roomDistances,
        distanceSettings: s.distanceSettings,
      }, s.bundles);
      exportCableScheduleCsv(rows, schematicName);
    } else if (tab === "cableBom") {
      const s = useSchematicStore.getState();
      const rows = computeCableSchedule(nodes, edges, s.cableNamingScheme, {
        roomDistances: s.roomDistances,
        distanceSettings: s.distanceSettings,
      });
      const bom = buildCableBom(scheduleToBomInputs(rows));
      downloadCsv(bomToCsv(bom), `${schematicName} - Cable BOM.csv`);
    } else if (tab === "patchPanel") {
      const s = useSchematicStore.getState();
      const rows = computePatchPanelSchedule(nodes, edges, s.cableNamingScheme, {
        roomDistances: s.roomDistances,
        distanceSettings: s.distanceSettings,
      });
      exportPatchPanelScheduleCsv(rows, schematicName);
    } else if (tab === "power") {
      // Thermal shares the power CSV (it carries both watts and BTU/h columns).
      const data = computePowerReport(nodes, edges);
      exportPowerReportCsv(data, schematicName);
    } else {
      const pages = useSchematicStore.getState().pages;
      const data = computePackList(nodes, edges, pages);
      const cableCosts = useSchematicStore.getState().cableCosts;
      exportPackListCsv(data, schematicName, cableCosts, computeDocumentSummary(nodes, edges, pages));
    }
  }, [activeReportTab, nodes, edges, schematicName]);

  const handleCableBomPdf = useCallback(() => {
    const s = useSchematicStore.getState();
    const rows = computeCableSchedule(nodes, edges, s.cableNamingScheme, {
      roomDistances: s.roomDistances,
      distanceSettings: s.distanceSettings,
    });
    const bom = buildCableBom(scheduleToBomInputs(rows));
    renderCableBomPdf(bom, runLengthWarnings(rows), schematicName);
  }, [nodes, edges, schematicName]);

  // Route the header "Export PDF" button to the existing per-tab PDF preview/export.
  const handlePdfExport = useCallback(() => {
    const tab = activeReportTab;
    if (tab === "network") setShowNetworkPreview(true);
    else if (tab === "packList") setShowPreview(true);
    else if (tab === "cableSchedule") setShowCableSchedulePreview(true);
    else if (tab === "cableBom") handleCableBomPdf();
    else if (tab === "patchPanel") setShowPatchPanelPreview(true);
    // Power AND thermal both use the power report PDF (it includes thermal columns).
    else if (tab === "power") setShowPowerPreview(true);
    // "devices" has no standalone PDF in the original; fall back to network preview path is wrong,
    // so devices simply has no PDF — CSV remains available (matches original behaviour).
  }, [activeReportTab, handleCableBomPdf]);

  const hasPdfExport = activeReportTab !== "devices";

  const defaultLayout = useMemo(() => createDefaultPackListLayout(), []);
  const networkDefaultLayout = useMemo(() => createDefaultNetworkReportLayout(), []);
  const cableScheduleDefaultLayout = useMemo(() => createDefaultCableScheduleLayout(), []);
  const patchPanelDefaultLayout = useMemo(() => createDefaultPatchPanelScheduleLayout(), []);
  const powerDefaultLayout = useMemo(() => createDefaultPowerReportLayout(), []);

  const projectSubtitle =
    (titleBlock.showName || titleBlock.venue || schematicName || "Untitled").toUpperCase();

  const segBtn = (active: boolean) =>
    `relative h-7 px-3.5 rounded-md cursor-pointer text-[11.5px] font-medium transition-colors ${
      active
        ? "text-[var(--color-text-heading)]"
        : "text-[var(--color-text)] hover:text-[var(--color-text-heading)]"
    }`;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex flex-col bg-[var(--color-bg)]"
        style={{ animation: "ui-fade-in 0.16s var(--ui-ease) both" }}
      >
        {/* ── Header (50px) ── */}
        <header className="h-[50px] flex-none flex items-center gap-3 px-4 bg-[var(--color-surface)] border-b border-[var(--ui-border)] relative">
          <button
            onClick={onClose}
            title="Back to editor"
            className="flex items-center justify-center w-7 h-7 -ml-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] hover:bg-[var(--color-surface-hover)] cursor-pointer transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="flex flex-col leading-[1.25]">
            <span className="text-[13px] font-semibold text-[var(--color-text-heading)]">Reports</span>
            <span className="text-[9px] tracking-[0.04em] text-[var(--color-text-muted)]" style={{ fontFamily: "var(--font-mono)" }}>
              {projectSubtitle}
            </span>
          </div>

          {/* Centered segmented dashboard tabs */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-0.5 p-[3px] rounded-[9px] bg-[var(--color-bg)] border border-[var(--ui-border)]">
            {DASHBOARD_TABS.map((t) => {
              const active = tableTab == null && dashTab === t.id;
              return (
                <button
                  key={t.id}
                  className={segBtn(active)}
                  onClick={() => {
                    setTableTab(null);
                    setDashTab(t.id);
                  }}
                >
                  {active && (
                    <span
                      className="absolute inset-0 rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-accent)]"
                      style={{ boxShadow: "0 -2px 0 var(--color-accent) inset" }}
                    />
                  )}
                  <span className="relative z-[1]">{t.label}</span>
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* "More" menu for the full editing/table surfaces */}
            <div className="relative">
              <button
                onClick={() => setMoreOpen((o) => !o)}
                className={`flex items-center gap-1.5 h-[30px] px-3 rounded-lg border cursor-pointer text-[11.5px] font-medium transition-colors ${
                  tableTab != null
                    ? "bg-[var(--color-surface-raised)] border-[var(--color-accent)] text-[var(--color-text-heading)]"
                    : "bg-transparent border-[var(--ui-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                }`}
                title="More report tables"
              >
                {tableTab != null ? TABLE_TAB_LABELS[tableTab] : "Tables"}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-[1]" onClick={() => setMoreOpen(false)} />
                  <div className="chrome-menu absolute right-0 top-[36px] z-[2] min-w-[170px] py-1 rounded-lg bg-[var(--color-surface-raised)] border border-[var(--ui-border)] shadow-[var(--ui-shadow-menu)]">
                    {(Object.keys(TABLE_TAB_LABELS) as TableTab[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          setTableTab(t);
                          setMoreOpen(false);
                        }}
                        className={`block w-full text-left px-3 py-1.5 text-[12px] cursor-pointer transition-colors ${
                          tableTab === t
                            ? "text-[var(--color-text-heading)] bg-[var(--color-surface-hover)]"
                            : "text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                        }`}
                      >
                        {TABLE_TAB_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button
              onClick={handleCsvExport}
              className="flex items-center gap-1.5 h-[30px] px-3 rounded-lg bg-transparent border border-[var(--ui-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] cursor-pointer text-[11.5px] font-medium transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V4M8 8l4-4 4 4" />
              </svg>
              CSV
            </button>
            {hasPdfExport && (
              <button
                onClick={handlePdfExport}
                className="flex items-center gap-1.5 h-[30px] px-[13px] rounded-lg bg-[var(--color-accent)] text-[var(--color-on-accent)] border-none cursor-pointer text-[11.5px] font-semibold transition-colors hover:brightness-110"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 16V4M8 8l4-4 4 4M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />
                </svg>
                Export PDF
              </button>
            )}
          </div>
        </header>

        {/* ── Scrolling content ── */}
        {tableTab == null ? (
          <DashboardScroll>
            {dashTab === "power" && <PowerDashboard />}
            {dashTab === "thermal" && <ThermalDashboard />}
            {dashTab === "network" && <NetworkDashboard />}
          </DashboardScroll>
        ) : (
          <div className="flex-1 overflow-auto p-4 bg-[var(--color-bg)]">
            <div className="max-w-[1080px] mx-auto">
              {tableTab === "devices" && <DeviceReportTab />}
              {tableTab === "packList" && <PackListTabInline />}
              {tableTab === "cableSchedule" && <CableScheduleTabInline />}
              {tableTab === "cableBom" && <CableBomTab />}
              {tableTab === "patchPanel" && <PatchPanelScheduleTabInline />}
              {tableTab === "networkDetail" && <NetworkReportTab />}
              {tableTab === "powerDetail" && <PowerReportTab />}
            </div>
          </div>
        )}
      </div>

      {showNetworkPreview && (
        <ReportPreviewDialog
          reportKey={NETWORK_LAYOUT_KEY}
          defaultLayout={networkDefaultLayout}
          titleBlock={titleBlock}
          getTableData={(layout) =>
            getNetworkReportTableData(computeNetworkReport(nodes, edges), layout)
          }
          onClose={() => setShowNetworkPreview(false)}
          filename={`${schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "")} - Network Report.pdf`}
        />
      )}

      {showPreview && (
        <ReportPreviewDialog
          reportKey={PACKLIST_LAYOUT_KEY}
          defaultLayout={defaultLayout}
          titleBlock={titleBlock}
          getTableData={(layout) =>
            getPackListTableData(computePackList(nodes, edges, useSchematicStore.getState().pages), layout, useSchematicStore.getState().cableCosts)
          }
          onClose={() => setShowPreview(false)}
          filename={`${schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "")} - Pack List.pdf`}
        />
      )}

      {showCableSchedulePreview && (
        <ReportPreviewDialog
          reportKey={CABLE_SCHEDULE_LAYOUT_KEY}
          defaultLayout={cableScheduleDefaultLayout}
          titleBlock={titleBlock}
          getTableData={(layout) => {
            const s = useSchematicStore.getState();
            return getCableScheduleTableData(
              computeCableSchedule(nodes, edges, s.cableNamingScheme, {
                roomDistances: s.roomDistances,
                distanceSettings: s.distanceSettings,
              }, s.bundles),
              layout,
            );
          }}
          onClose={() => setShowCableSchedulePreview(false)}
          filename={`${schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "")} - Cable Schedule.pdf`}
        />
      )}

      {showPatchPanelPreview && (
        <ReportPreviewDialog
          reportKey={PATCH_PANEL_LAYOUT_KEY}
          defaultLayout={patchPanelDefaultLayout}
          titleBlock={titleBlock}
          getTableData={(layout) => {
            const s = useSchematicStore.getState();
            return getPatchPanelScheduleTableData(
              computePatchPanelSchedule(nodes, edges, s.cableNamingScheme, {
                roomDistances: s.roomDistances,
                distanceSettings: s.distanceSettings,
              }),
              layout,
            );
          }}
          onClose={() => setShowPatchPanelPreview(false)}
          filename={`${schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "")} - Patch Panel Schedule.pdf`}
        />
      )}

      {showPowerPreview && (
        <ReportPreviewDialog
          reportKey={POWER_LAYOUT_KEY}
          defaultLayout={powerDefaultLayout}
          titleBlock={titleBlock}
          getTableData={(layout) =>
            getPowerReportTableData(computePowerReport(nodes, edges), layout)
          }
          onClose={() => setShowPowerPreview(false)}
          filename={`${schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "")} - Power Report.pdf`}
        />
      )}
    </>
  );
}

export default memo(ReportsDialog);

// ─── Dashboard surface (comp-styled Power / Thermal / Network) ─────────────
// Presentational only: all numbers come from the reportMetrics view-models, which
// are pure functions of the real computed schematic reports.

/** Dotted-grid scroll container matching the comp's content backdrop. */
function DashboardScroll({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex-1 overflow-auto"
      style={{
        padding: "22px 26px",
        backgroundColor: "var(--color-bg)",
        backgroundImage:
          "radial-gradient(circle at 1px 1px, var(--color-accent-soft) 1px, transparent 0)",
        backgroundSize: "26px 26px",
      }}
    >
      <div className="max-w-[1080px] mx-auto">{children}</div>
    </div>
  );
}

const STATUS_TOKEN: Record<ReportStatus, string> = {
  ok: "var(--color-success)",
  watch: "var(--color-warning)",
  over: "var(--color-error)",
};

function PowerDashboard() {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const report = useMemo(() => computePowerReport(nodes, edges), [nodes, edges]);
  const view = useMemo(() => buildPowerDashboard(report), [report]);
  if (report.devices.length === 0) {
    return <DashboardEmpty message="No devices with power data in this schematic." />;
  }
  return <DashboardView view={view} />;
}

function ThermalDashboard() {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const report = useMemo(() => computePowerReport(nodes, edges), [nodes, edges]);
  const view = useMemo(() => buildThermalDashboard(report), [report]);
  if (report.totalThermalBtuh <= 0) {
    return <DashboardEmpty message="No thermal data yet — add power draw or rated BTU/h to devices." />;
  }
  return <DashboardView view={view} />;
}

function NetworkDashboard() {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const rows = useMemo(() => computeNetworkReport(nodes, edges), [nodes, edges]);
  const poeBudgets = useMemo(() => computePoeBudget(nodes, edges), [nodes, edges]);
  const dhcpServers = useMemo(() => computeDhcpServerSummary(nodes), [nodes]);
  const view = useMemo(
    () => buildNetworkDashboard({ rows, poeBudgets, dhcpServers }),
    [rows, poeBudgets, dhcpServers],
  );
  if (rows.length === 0) {
    return <DashboardEmpty message="No addressable network ports in this schematic." />;
  }
  return <DashboardView view={view} />;
}

function DashboardEmpty({ message }: { message: string }) {
  return (
    <div className="text-sm text-[var(--color-text-muted)] text-center py-16">{message}</div>
  );
}

/** The full dashboard layout for one tab: KPI row · chart+breakdown · detail table. */
function DashboardView({ view }: { view: ReportDashboard }) {
  return (
    <>
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-[13px] mb-4">
        {view.kpis.map((k, i) => (
          <KpiCardView key={i} card={k} />
        ))}
      </div>

      {/* Chart + breakdown */}
      <div className="grid gap-[13px] mb-4" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
        <BarChartCard view={view} />
        <BreakdownCard view={view} />
      </div>

      {/* Detail table */}
      <DetailTableCard view={view} />
    </>
  );
}

function KpiCardView({ card }: { card: KpiCardModel }) {
  const valueColor = card.accent ? "var(--color-accent)" : "var(--color-text-heading)";
  const noteColor = card.status ? STATUS_TOKEN[card.status] : "var(--color-text-muted)";
  return (
    <div className="rounded-[10px] px-4 py-[15px] bg-[var(--color-surface)] border border-[var(--ui-border)]">
      <div
        className="mb-[9px] text-[9px] uppercase"
        style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.13em", color: "var(--color-text-muted)" }}
      >
        {card.label}
      </div>
      <div
        className="text-[26px] font-semibold leading-none"
        style={{ fontFamily: "var(--font-mono)", color: valueColor }}
      >
        {card.value}
        {card.unit ? (
          <span className="text-[12px] ml-[3px] text-[var(--color-text-muted)]">{card.unit}</span>
        ) : null}
      </div>
      <div className="mt-[7px] text-[10.5px] flex items-center gap-[5px]" style={{ color: noteColor }}>
        {card.status && (
          <span className="w-[6px] h-[6px] rounded-full" style={{ background: noteColor }} />
        )}
        {card.note}
      </div>
    </div>
  );
}

function BarChartCard({ view }: { view: ReportDashboard }) {
  const max = Math.max(1, ...view.bars.map((b) => b.value));
  return (
    <div className="rounded-[10px] px-[18px] py-[17px] bg-[var(--color-surface)] border border-[var(--ui-border)]">
      <div className="flex items-center mb-[18px]">
        <span className="text-[13px] font-semibold text-[var(--color-text-heading)]">{view.chartTitle}</span>
        <span
          className="ml-auto text-[9px] uppercase"
          style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.13em", color: "var(--color-text-muted)" }}
        >
          {view.chartUnit}
        </span>
      </div>
      <div className="flex items-end gap-[14px] h-[180px] pb-[22px] relative">
        {/* Gridline underlay — 4 hairlines */}
        <div
          className="absolute left-0 right-0 top-0 flex flex-col justify-between pointer-events-none"
          style={{ bottom: "22px" }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-px bg-[var(--ui-border)]" />
          ))}
        </div>
        {view.bars.length === 0 ? (
          <div className="text-[11px] text-[var(--color-text-muted)] self-center mx-auto">
            No data to chart.
          </div>
        ) : (
          view.bars.map((b, i) => {
            const h = Math.round((b.value / max) * 150);
            return (
              <div
                key={i}
                className="flex-1 flex flex-col items-center h-full justify-end relative z-[1]"
              >
                <span
                  className="text-[9.5px] mb-[5px] text-[var(--color-text)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {b.valueLabel}
                </span>
                <div
                  className="w-full"
                  style={{
                    maxWidth: "46px",
                    height: `${h}px`,
                    borderRadius: "4px 4px 0 0",
                    background: `${b.color}33`,
                    border: `1px solid ${b.color}`,
                    borderBottom: "none",
                  }}
                />
                <span
                  className="absolute text-[8.5px] whitespace-nowrap text-[var(--color-text-muted)]"
                  style={{ bottom: "-20px", fontFamily: "var(--font-mono)" }}
                  title={b.name}
                >
                  {b.name}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function BreakdownCard({ view }: { view: ReportDashboard }) {
  return (
    <div className="rounded-[10px] px-[18px] py-[17px] bg-[var(--color-surface)] border border-[var(--ui-border)]">
      <div className="text-[13px] font-semibold text-[var(--color-text-heading)] mb-4">
        {view.breakdownTitle}
      </div>
      <div className="flex flex-col gap-[13px]">
        {view.breakdown.length === 0 ? (
          <div className="text-[11px] text-[var(--color-text-muted)]">No data.</div>
        ) : (
          view.breakdown.map((d, i) => (
            <div key={i} className="flex flex-col gap-[6px]">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 flex-none"
                  style={{ borderRadius: "2px", background: d.color }}
                />
                <span className="text-[11.5px] text-[var(--color-text)]">{d.name}</span>
                <span
                  className="ml-auto text-[10.5px] text-[var(--color-text)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {d.valueLabel}
                </span>
              </div>
              <div className="h-[5px] rounded-[3px] bg-[var(--color-bg)] overflow-hidden">
                <div
                  className="h-full rounded-[3px]"
                  style={{ width: `${d.pct}%`, background: d.color }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DetailTableCard({ view }: { view: ReportDashboard }) {
  return (
    <div className="rounded-[10px] overflow-hidden bg-[var(--color-surface)] border border-[var(--ui-border)]">
      <div className="flex items-center px-[18px] py-[14px] border-b border-[var(--ui-border)]">
        <span className="text-[13px] font-semibold text-[var(--color-text-heading)]">{view.tableTitle}</span>
        <span
          className="ml-auto text-[9px] uppercase"
          style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.13em", color: "var(--color-text-muted)" }}
        >
          {view.rows.length} {view.rows.length === 1 ? "device" : "devices"}
        </span>
      </div>
      <table className="w-full text-[11.5px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
        <thead>
          <tr className="text-left">
            <DashTh>Device</DashTh>
            <DashTh>Location</DashTh>
            <DashTh align="right">{view.col3}</DashTh>
            <DashTh align="right">{view.col4}</DashTh>
            <DashTh>Status</DashTh>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--ui-border)" }}>
              <td className="px-[18px] py-[10px] font-medium text-[var(--color-text-heading)]">{r.device}</td>
              <td className="px-[14px] py-[10px] text-[var(--color-text-muted)]">{r.location}</td>
              <td
                className="px-[14px] py-[10px] text-right text-[var(--color-text)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {r.v3}
              </td>
              <td
                className="px-[14px] py-[10px] text-right text-[var(--color-text)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {r.v4}
              </td>
              <td className="px-[18px] py-[10px]">
                <StatusChip status={r.status} label={r.statusLabel} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DashTh({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className="px-[18px] py-[9px] text-[9px] uppercase font-medium text-[var(--color-text-muted)]"
      style={{
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.08em",
        textAlign: align,
        borderBottom: "1px solid var(--ui-border)",
      }}
    >
      {children}
    </th>
  );
}

function StatusChip({ status, label }: { status: ReportStatus; label: string }) {
  const color = STATUS_TOKEN[status];
  return (
    <span
      className="inline-flex items-center gap-[5px] px-2 py-0.5 rounded-[5px] text-[10px] font-medium"
      style={{
        // Token-tinted chip: 13–18% alpha background, 30% border, full-strength text.
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
        color,
      }}
    >
      {label}
    </span>
  );
}

/** Local alias so the card renderer keeps a tidy prop type. */
type KpiCardModel = ReportDashboard["kpis"][number];

// ─── Shared styling ────────────────────────────────────────────

const thClass =
  "text-left text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide py-1.5 px-2 border-b border-[var(--ui-border)] cursor-pointer hover:text-[var(--color-text)] select-none";
const tdClass = "py-1 px-2 text-xs text-[var(--color-text)]";
const rowClass = (i: number) =>
  i % 2 === 1 ? "bg-[var(--color-surface)]" : "";

// Cable Schedule columns in DOM order. The `id` is the gate key shared by the
// header <th> and its matching body cell for show/hide toggling.
const CABLE_COLUMNS: { id: string; label: string }[] = [
  { id: "label", label: "Label" },
  { id: "cableId", label: "Cable ID" },
  { id: "sourceDevice", label: "Source" },
  { id: "sourcePort", label: "Src Port" },
  { id: "sourceConnector", label: "Src Conn" },
  { id: "targetDevice", label: "Target" },
  { id: "targetPort", label: "Tgt Port" },
  { id: "targetConnector", label: "Tgt Conn" },
  { id: "cableType", label: "Cable Type" },
  { id: "signalType", label: "Signal" },
  { id: "cableLength", label: "Length" },
  { id: "computedLength", label: "Est. Length" },
  { id: "gaugeAwg", label: "Gauge" },
  { id: "cableAlias", label: "Alias" },
  { id: "tested", label: "Tested" },
  { id: "cableUse", label: "Use" },
  { id: "sourceRoom", label: "Src Room" },
  { id: "targetRoom", label: "Tgt Room" },
  { id: "multicableLabel", label: "Snake" },
];

// ─── Network Report Tab ────────────────────────────────────────

type SortKey = "deviceLabel" | "portLabel" | "room" | "signalType" | "hostname" | "ip" | "subnetMask" | "gateway" | "vlan" | "linkSpeed" | "poeDrawW" | "dhcp" | "dhcpServerLabel" | "notes";

const networkColumns: SpreadsheetColumn<NetworkReportRow>[] = [
  { id: "deviceLabel", header: "Device", getValue: (r) => r.deviceLabel },
  { id: "portLabel", header: "Port", getValue: (r) => r.portLabel },
  { id: "room", header: "Room", getValue: (r) => r.room },
  { id: "signalType", header: "Signal", getValue: (r) => r.signalType },
  { id: "hostname", header: "Hostname", getValue: (r) => r.hostname, editable: true, fillType: "name" },
  { id: "ip", header: "IP", getValue: (r) => r.ip, editable: (r) => !r.dhcp, fillType: "ip" },
  { id: "subnetMask", header: "Subnet", getValue: (r) => r.subnetMask, editable: (r) => !r.dhcp, fillType: "subnet" },
  { id: "gateway", header: "Gateway", getValue: (r) => r.gateway, editable: (r) => !r.dhcp, fillType: "gateway" },
  { id: "vlan", header: "VLAN", getValue: (r) => r.vlan, editable: (r) => !r.dhcp, fillType: "vlan" },
  { id: "linkSpeed", header: "Speed", getValue: (r) => r.linkSpeed },
  { id: "poeDrawW", header: "PoE (W)", getValue: (r) => r.poeDrawW },
  { id: "notes", header: "Notes", getValue: (r) => r.notes, editable: true },
];

const COLUMN_LABELS: Record<string, string> = {
  hostname: "Hostname",
  ip: "IP",
  subnetMask: "Subnet",
  gateway: "Gateway",
  vlan: "VLAN",
  linkSpeed: "Speed",
  poeDrawW: "PoE (W)",
  notes: "Notes",
};

// ─── Cable BOM Tab ─────────────────────────────────────────────
// Grouped cable bill of materials + max-run warnings, derived from the cable
// schedule (computeCableSchedule → scheduleToBomInputs → buildCableBom).
function CableBomTab() {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const cableNamingScheme = useSchematicStore((s) => s.cableNamingScheme);
  const roomDistances = useSchematicStore((s) => s.roomDistances);
  const distanceSettings = useSchematicStore((s) => s.distanceSettings);

  const { bom, warnings } = useMemo(() => {
    const rows = computeCableSchedule(nodes, edges, cableNamingScheme, { roomDistances, distanceSettings });
    return { bom: buildCableBom(scheduleToBomInputs(rows)), warnings: runLengthWarnings(rows) };
  }, [nodes, edges, cableNamingScheme, roomDistances, distanceSettings]);

  return (
    <div className="space-y-3">
      {warnings.length > 0 && (
        <div className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs">
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
      {bom.length === 0 ? (
        <p className="text-xs text-[var(--color-text-muted)]">
          No cable runs to report. Connect devices to build a BOM.
        </p>
      ) : (
        <table className="w-full text-xs border-collapse">
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
                <td className="py-1 pr-2 text-right text-[var(--color-text)]">{r.lengthM != null ? r.lengthM.toFixed(1) : "—"}</td>
                <td className="py-1 pr-2 text-right text-[var(--color-text)]">{r.quantity}</td>
                <td className="py-1 text-right text-[var(--color-text)]">{r.totalLengthM != null ? r.totalLengthM.toFixed(1) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function NetworkReportTab() {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const patchDeviceData = useSchematicStore((s) => s.patchDeviceData);

  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("deviceLabel");
  const [sortAsc, setSortAsc] = useState(true);

  const rows = useMemo(() => computeNetworkReport(nodes, edges), [nodes, edges]);
  const duplicateIps = useMemo(() => findDuplicateIps(nodes), [nodes]);
  const dhcpServers = useMemo(() => computeDhcpServerSummary(nodes), [nodes]);
  const poeBudgets = useMemo(() => computePoeBudget(nodes, edges), [nodes, edges]);
  const dhcpWarnings = useMemo(() => {
    const warnings: DhcpWarning[] = [
      ...computeDhcpWarnings(rows, nodes, edges),
      ...computeSubnetConflicts(nodes, edges).map((c) => ({
        nodeId: c.nodeId,
        portId: c.portId,
        type: "subnet-conflict" as const,
        message: c.message,
      })),
    ];
    const map = new Map<string, DhcpWarning>();
    for (const w of warnings) map.set(`${w.nodeId}:${w.portId}`, w);
    return map;
  }, [rows, nodes, edges]);

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.deviceLabel.toLowerCase().includes(q) ||
        r.portLabel.toLowerCase().includes(q) ||
        r.room.toLowerCase().includes(q) ||
        r.hostname.toLowerCase().includes(q) ||
        r.ip.includes(q) ||
        r.subnetMask.includes(q) ||
        r.gateway.includes(q) ||
        r.vlan.includes(q) ||
        r.notes.toLowerCase().includes(q),
    );
  }, [rows, filter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp: number;
      if (sortKey === "dhcp") {
        cmp = (a.dhcp ? 1 : 0) - (b.dhcp ? 1 : 0);
      } else if (sortKey === "dhcpServerLabel") {
        cmp = a.dhcpServerLabel.localeCompare(b.dhcpServerLabel);
      } else {
        cmp = (a[sortKey] ?? "").localeCompare(b[sortKey] ?? "");
      }
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortAsc ? " ▴" : " ▾") : "";

  const updatePortNetworkField = useCallback(
    (row: NetworkReportRow, field: string, value: string | number | boolean | undefined) => {
      const node = nodes.find((n) => n.id === row.nodeId);
      if (!node || node.type !== "device") return;
      const data = node.data as DeviceData;
      // "hostname" lives on DeviceData, not on port
      if (field === "hostname") {
        patchDeviceData(row.nodeId, { hostname: (value as string) || undefined });
        return;
      }
      const newPorts = data.ports.map((p) => {
        if (p.id !== row.portId) return p;
        // "notes" lives directly on Port, everything else on networkConfig
        if (field === "notes") {
          return { ...p, notes: (value as string) || undefined };
        }
        const nc = { ...p.networkConfig, [field]: value };
        if (field === "ip" && typeof value === "string" && isValidIpv4(value) && !p.networkConfig?.subnetMask) {
          nc.subnetMask = "255.255.255.0";
        }
        return { ...p, networkConfig: nc };
      });
      patchDeviceData(row.nodeId, { ports: newPorts });
    },
    [nodes, patchDeviceData],
  );

  // Spreadsheet selection hook
  const isCellEditable = useCallback(
    (rowIndex: number, columnId: string) => {
      const row = sorted[rowIndex];
      if (!row) return false;
      const col = networkColumns.find((c) => c.id === columnId);
      if (!col || !col.editable) return false;
      if (typeof col.editable === "function") return col.editable(row);
      return true;
    },
    [sorted],
  );

  const getCellValue = useCallback(
    (rowIndex: number, columnId: string) => {
      const row = sorted[rowIndex];
      if (!row) return "";
      const col = networkColumns.find((c) => c.id === columnId);
      return col ? col.getValue(row) : "";
    },
    [sorted],
  );

  const onCellChange = useCallback(
    (rowIndex: number, columnId: string, value: string) => {
      const row = sorted[rowIndex];
      if (!row) return;
      if (columnId === "vlan") {
        updatePortNetworkField(row, columnId, value ? Number(value) : undefined);
      } else {
        updatePortNetworkField(row, columnId, value || undefined);
      }
    },
    [sorted, updatePortNetworkField],
  );

  const onBatchChange = useCallback(
    (changes: { rowIndex: number; columnId: string; value: string }[]) => {
      // Push a single undo snapshot, then apply all updates
      useSchematicStore.getState().pushSnapshot();

      // Group by nodeId for batching
      const nodeUpdates = new Map<string, { portId: string; field: string; value: string }[]>();
      for (const change of changes) {
        const row = sorted[change.rowIndex];
        if (!row) continue;
        const arr = nodeUpdates.get(row.nodeId) ?? [];
        arr.push({ portId: row.portId, field: change.columnId, value: change.value });
        nodeUpdates.set(row.nodeId, arr);
      }

      for (const [nodeId, updates] of nodeUpdates) {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node || node.type !== "device") continue;
        const data = node.data as DeviceData;
        const newPorts = data.ports.map((p) => {
          const portUpdates = updates.filter((u) => u.portId === p.id);
          if (portUpdates.length === 0) return p;
          const nc = { ...p.networkConfig };
          for (const u of portUpdates) {
            if (u.field === "vlan") {
              (nc as Record<string, unknown>)[u.field] = u.value ? Number(u.value) : undefined;
            } else {
              (nc as Record<string, unknown>)[u.field] = u.value || undefined;
            }
            if (u.field === "ip" && u.value && isValidIpv4(u.value) && !nc.subnetMask) {
              nc.subnetMask = "255.255.255.0";
            }
          }
          return { ...p, networkConfig: nc };
        });
        const state = useSchematicStore.getState();
        useSchematicStore.setState({
          nodes: state.nodes.map((n) => {
            if (n.id !== nodeId || n.type !== "device") return n;
            return { ...n, data: { ...n.data, ports: newPorts } } as import("../types").DeviceNode;
          }),
        });
      }
      useSchematicStore.getState().saveToLocalStorage();
    },
    [sorted, nodes],
  );

  const spreadsheet = useSpreadsheetSelection({
    rowCount: sorted.length,
    columns: networkColumns,
    isCellEditable,
    getCellValue,
    onCellChange,
    onBatchChange,
  });

  // Clear selection on sort/filter change
  useEffect(() => {
    spreadsheet.clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, sortAsc, filter]);

  if (rows.length === 0) {
    return (
      <div className="text-sm text-[var(--color-text-muted)] text-center py-8">
        No addressable ports in this schematic.
      </div>
    );
  }

  const getDupeWarning = (ip: string, nodeId: string, portId: string) => {
    const entries = duplicateIps.get(ip);
    if (!entries) return undefined;
    const others = entries.filter((e) => !(e.nodeId === nodeId && e.portId === portId));
    if (others.length === 0) return undefined;
    return `Duplicate IP — also used by: ${others.map((e) => `${e.deviceLabel} (${e.portLabel})`).join(", ")}`;
  };

  const selectedColLabel = spreadsheet.selectedColumn ? (COLUMN_LABELS[spreadsheet.selectedColumn] ?? spreadsheet.selectedColumn) : "";

  return (
    <>
      {/* DHCP Servers summary */}
      {dhcpServers.length > 0 && (
        <div className="mb-4 border border-[var(--ui-border)] rounded overflow-hidden">
          <div className="px-3 py-1.5 bg-[var(--color-surface)] border-b border-[var(--ui-border)]">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">DHCP Servers</span>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={thClass}>Device</th>
                <th className={thClass}>Pool Start</th>
                <th className={thClass}>Pool End</th>
                <th className={thClass}>Subnet</th>
                <th className={thClass}>Gateway</th>
              </tr>
            </thead>
            <tbody>
              {dhcpServers.map((srv, i) => (
                <tr key={srv.nodeId} className={rowClass(i)}>
                  <td className={tdClass}>{srv.deviceLabel}</td>
                  <td className={tdClass}>{srv.rangeStart || "—"}</td>
                  <td className={tdClass}>{srv.rangeEnd || "—"}</td>
                  <td className={tdClass}>{srv.subnetMask || "—"}</td>
                  <td className={tdClass}>{srv.gateway || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* PoE Budget summary */}
      {poeBudgets.length > 0 && (
        <div className="mb-4 border border-[var(--ui-border)] rounded overflow-hidden">
          <div className="px-3 py-1.5 bg-[var(--color-surface)] border-b border-[var(--ui-border)]">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">PoE Budget</span>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={thClass}>Switch</th>
                <th className={thClass}>Room</th>
                <th className={thClass}>Budget (W)</th>
                <th className={thClass}>Load (W)</th>
                <th className={thClass}>Remaining (W)</th>
                <th className={thClass}>Status</th>
              </tr>
            </thead>
            <tbody>
              {poeBudgets.map((poe, i) => (
                <tr key={poe.nodeId} className={rowClass(i)}>
                  <td className={tdClass}>{poe.deviceLabel}</td>
                  <td className={tdClass}>{poe.room}</td>
                  <td className={tdClass}>{poe.budgetW}</td>
                  <td className={tdClass}>{poe.loadW}</td>
                  <td className={tdClass}>{poe.remainingW}</td>
                  <td className={`${tdClass} ${poe.overBudget ? "text-red-600 font-semibold" : "text-green-600"}`}>
                    {poe.overBudget ? "OVER BUDGET" : "OK"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Action bar */}
      {spreadsheet.selectedCells.size > 0 && (
        <div className="mb-3 flex items-center gap-3 px-3 py-2 bg-[var(--color-accent-soft)] border border-[var(--color-accent)] rounded-lg">
          <span className="text-xs font-medium text-[var(--color-accent)]">
            {spreadsheet.selectedCells.size} cell{spreadsheet.selectedCells.size > 1 ? "s" : ""} selected in {selectedColLabel}
          </span>
          <span className="text-[11px] text-[var(--color-text-muted)]">
            {spreadsheet.selectedCells.size > 1 ? "Type a value + Enter to fill series" : "Double-click or type to edit"}
          </span>
          <div className="flex-1" />
          <button
            onClick={() => spreadsheet.clearSelection()}
            className="px-2 py-1 text-xs rounded text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      <div className="mb-3">
        <input
          className="w-full bg-[var(--color-surface)] border border-[var(--ui-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
          placeholder="Filter by device, port, room, or IP..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>
      <div {...spreadsheet.getContainerProps()}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={thClass} onClick={() => toggleSort("deviceLabel")}>
                Device{sortArrow("deviceLabel")}
              </th>
              <th className={thClass} onClick={() => toggleSort("portLabel")}>
                Port{sortArrow("portLabel")}
              </th>
              <th className={thClass} onClick={() => toggleSort("room")}>
                Room{sortArrow("room")}
              </th>
              <th className={thClass} onClick={() => toggleSort("signalType")}>
                Signal{sortArrow("signalType")}
              </th>
              <th className={thClass} onClick={() => toggleSort("hostname")}>
                Hostname{sortArrow("hostname")}
              </th>
              <th className={thClass} onClick={() => toggleSort("ip")}>
                IP{sortArrow("ip")}
              </th>
              <th className={thClass} onClick={() => toggleSort("subnetMask")}>
                Subnet{sortArrow("subnetMask")}
              </th>
              <th className={thClass} onClick={() => toggleSort("gateway")}>
                Gateway{sortArrow("gateway")}
              </th>
              <th className={thClass} onClick={() => toggleSort("vlan")}>
                VLAN{sortArrow("vlan")}
              </th>
              <th className={thClass} onClick={() => toggleSort("linkSpeed")}>
                Speed{sortArrow("linkSpeed")}
              </th>
              <th className={thClass} onClick={() => toggleSort("poeDrawW")}>
                PoE (W){sortArrow("poeDrawW")}
              </th>
              <th className={thClass} onClick={() => toggleSort("dhcp")}>
                DHCP{sortArrow("dhcp")}
              </th>
              <th className={thClass} onClick={() => toggleSort("dhcpServerLabel")}>
                DHCP Server{sortArrow("dhcpServerLabel")}
              </th>
              <th className={thClass} onClick={() => toggleSort("notes")}>
                Notes{sortArrow("notes")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <NetworkRow
                key={`${row.nodeId}:${row.portId}`}
                row={row}
                rowIndex={i}
                altClass={rowClass(i)}
                duplicateWarning={row.ip ? getDupeWarning(row.ip, row.nodeId, row.portId) : undefined}
                dhcpWarning={dhcpWarnings.get(`${row.nodeId}:${row.portId}`)}
                onUpdateField={(field, value) => updatePortNetworkField(row, field, value)}
                spreadsheet={spreadsheet}
              />
            ))}
          </tbody>
        </table>
      </div>

      {spreadsheet.fillSeriesRequest && (
        <FillSeriesDialog
          config={spreadsheet.fillSeriesRequest.config}
          startValue={spreadsheet.fillSeriesRequest.startValue}
          cellCount={spreadsheet.fillSeriesRequest.cellCount}
          onApply={(values) => spreadsheet.applyFillSeries(values)}
          onClose={() => spreadsheet.dismissFillSeries()}
        />
      )}
    </>
  );
}

const NetworkRow = memo(function NetworkRow({
  row,
  rowIndex,
  altClass,
  duplicateWarning,
  dhcpWarning,
  onUpdateField,
  spreadsheet,
}: {
  row: NetworkReportRow;
  rowIndex: number;
  altClass: string;
  duplicateWarning?: string;
  dhcpWarning?: DhcpWarning;
  onUpdateField: (field: string, value: string | number | boolean | undefined) => void;
  spreadsheet: ReturnType<typeof useSpreadsheetSelection<NetworkReportRow>>;
}) {
  // Check if any cell in this row is selected for row-level highlight
  const hasSelection = networkColumns.some((col) => {
    const props = spreadsheet.getCellProps(rowIndex, col.id);
    return props.isSelected;
  });

  const dhcpServerCell = (() => {
    if (dhcpWarning?.type === "no-server") {
      return (
        <td className={`${tdClass} bg-amber-50`} title={dhcpWarning.message}>
          <span className="text-amber-600 text-[10px]">None found</span>
        </td>
      );
    }
    if (dhcpWarning?.type === "ip-in-range") {
      return (
        <td className={`${tdClass} bg-amber-100`} title={dhcpWarning.message}>
          <span className="text-amber-700 text-[10px]">{row.dhcpServerLabel || "—"}</span>
        </td>
      );
    }
    if (dhcpWarning?.type === "subnet-conflict") {
      return (
        <td className={`${tdClass} bg-red-50`} title={dhcpWarning.message}>
          <span className="text-red-600 text-[10px]">Subnet mismatch</span>
        </td>
      );
    }
    return (
      <td className={tdClass}>
        <span className="text-[10px]">{row.dhcpServerLabel || "—"}</span>
      </td>
    );
  })();

  return (
    <tr className={hasSelection ? "bg-[var(--color-accent-soft)]" : altClass}>
      {/* Read-only columns */}
      <td className={tdClass}>{row.deviceLabel}</td>
      <td className={tdClass}>{row.portLabel}</td>
      <td className={tdClass}>{row.room}</td>
      <td className={tdClass}>{row.signalType}</td>

      {/* Editable: Hostname */}
      <SpreadsheetCell
        rowIndex={rowIndex}
        columnId="hostname"
        spreadsheet={spreadsheet}
        displayValue={row.hostname}
        placeholder="—"
        renderEditor={(value, onChange, onCommit, onCancel) => (
          <input
            className="w-full bg-[var(--color-surface)] border border-[var(--color-accent)] rounded px-1 py-0.5 text-[10px] outline-none"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); onCommit(); }
              else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
              else if (e.key === "Tab") { e.preventDefault(); onCommit(); }
              e.stopPropagation();
            }}
            placeholder="—"
            autoFocus
          />
        )}
      />

      {/* Editable: IP */}
      <SpreadsheetCell
        rowIndex={rowIndex}
        columnId="ip"
        spreadsheet={spreadsheet}
        displayValue={row.ip}
        placeholder="—"
        duplicateWarning={duplicateWarning}
        renderEditor={(value, onChange, onCommit, onCancel) => (
          <IpInput
            value={value}
            onChange={onChange}
            onCommit={onCommit}
            onCancel={onCancel}
            placeholder="—"
            duplicateWarning={duplicateWarning}
            className="w-full"
            autoFocus
          />
        )}
      />

      {/* Editable: Subnet */}
      <SpreadsheetCell
        rowIndex={rowIndex}
        columnId="subnetMask"
        spreadsheet={spreadsheet}
        displayValue={row.subnetMask}
        placeholder="—"
        renderEditor={(value, onChange, onCommit, onCancel) => (
          <IpInput
            value={value}
            onChange={onChange}
            onCommit={onCommit}
            onCancel={onCancel}
            placeholder="—"
            validate={isValidSubnetMask}
            className="w-full"
            autoFocus
          />
        )}
      />

      {/* Editable: Gateway */}
      <SpreadsheetCell
        rowIndex={rowIndex}
        columnId="gateway"
        spreadsheet={spreadsheet}
        displayValue={row.gateway}
        placeholder="—"
        renderEditor={(value, onChange, onCommit, onCancel) => (
          <IpInput
            value={value}
            onChange={onChange}
            onCommit={onCommit}
            onCancel={onCancel}
            placeholder="—"
            className="w-full"
            autoFocus
          />
        )}
      />

      {/* Editable: VLAN */}
      <SpreadsheetCell
        rowIndex={rowIndex}
        columnId="vlan"
        spreadsheet={spreadsheet}
        displayValue={row.vlan}
        placeholder="—"
        renderEditor={(value, onChange, onCommit, onCancel) => (
          <input
            className={`w-full bg-[var(--color-surface)] border rounded px-1 py-0.5 text-[10px] outline-none ${
              value !== "" && !isValidVlan(Number(value)) ? "border-red-400" : "border-[var(--color-accent)]"
            }`}
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); onCommit(); }
              else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
              else if (e.key === "Tab") { e.preventDefault(); onCommit(); }
              e.stopPropagation();
            }}
            placeholder="—"
            autoFocus
          />
        )}
      />

      {/* Read-only: Speed */}
      <td className={tdClass}>{row.linkSpeed || "—"}</td>

      {/* Read-only: PoE Draw */}
      <td className={tdClass}>{row.poeDrawW || "—"}</td>

      {/* DHCP: direct checkbox, not spreadsheet-managed */}
      <td className={`${tdClass} text-center`}>
        <input
          type="checkbox"
          checked={row.dhcp}
          onChange={(e) => onUpdateField("dhcp", e.target.checked || undefined)}
          className="cursor-pointer"
        />
      </td>

      {/* DHCP Server: read-only coverage column */}
      {dhcpServerCell}

      {/* Editable: Notes */}
      <SpreadsheetCell
        rowIndex={rowIndex}
        columnId="notes"
        spreadsheet={spreadsheet}
        displayValue={row.notes}
        placeholder="—"
        renderEditor={(value, onChange, onCommit, onCancel) => (
          <input
            className="w-full bg-[var(--color-surface)] border border-[var(--color-accent)] rounded px-1 py-0.5 text-[10px] outline-none"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); onCommit(); }
              else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
              else if (e.key === "Tab") { e.preventDefault(); onCommit(); }
              e.stopPropagation();
            }}
            placeholder="—"
            autoFocus
          />
        )}
      />
    </tr>
  );
});

/** Generic spreadsheet-aware cell: shows display text or renders editor */
function SpreadsheetCell({
  rowIndex,
  columnId,
  spreadsheet,
  displayValue,
  placeholder,
  duplicateWarning,
  renderEditor,
}: {
  rowIndex: number;
  columnId: string;
  spreadsheet: ReturnType<typeof useSpreadsheetSelection<NetworkReportRow>>;
  displayValue: string;
  placeholder?: string;
  duplicateWarning?: string;
  renderEditor: (
    value: string,
    onChange: (v: string) => void,
    onCommit: () => void,
    onCancel: () => void,
  ) => React.ReactNode;
}) {
  const cellProps = spreadsheet.getCellProps(rowIndex, columnId);

  if (cellProps.isEditing) {
    return (
      <td className={`${tdClass} p-0.5`}>
        {renderEditor(
          spreadsheet.editValue,
          spreadsheet.setEditValue,
          () => spreadsheet.commitEdit(spreadsheet.editValue),
          () => spreadsheet.cancelEdit(),
        )}
      </td>
    );
  }

  const isDupe = columnId === "ip" && !!duplicateWarning;
  const selectionBg = cellProps.isSelected ? "bg-[var(--color-accent-soft)] ring-1 ring-inset ring-[var(--color-accent)]" : "";
  const dupeBg = isDupe && !cellProps.isSelected ? "bg-yellow-50" : "";

  return (
    <td
      className={`${tdClass} p-0.5 ${cellProps.editable ? "cursor-cell" : ""} ${selectionBg} ${dupeBg}`}
      onMouseDown={cellProps.onMouseDown}
      onMouseEnter={cellProps.onMouseEnter}
      onDoubleClick={cellProps.onDoubleClick}
      title={isDupe ? duplicateWarning : undefined}
    >
      <span className="text-[10px] px-1 select-none">
        {displayValue || <span className="text-[var(--color-text-muted)]">{placeholder}</span>}
      </span>
    </td>
  );
}

// ─── Device Report Tab ─────────────────────────────────────────

interface DeviceReportRow {
  nodeId: string;
  label: string;
  shortName: string;
  deviceType: string;
  manufacturer: string;
  model: string;
  modelNumber: string;
  room: string;
  portCount: number;
  unitCost: number;
  color: string;
  ownedCount: number;
  neededCount: number;
}

function getDeviceInventoryCounts(nodes: SchematicNode[], ownedGear: OwnedGearItem[]) {
  const usedCounts = new Map<string, number>();
  for (const node of nodes) {
    if (node.type !== "device") continue;
    const data = node.data as DeviceData;
    if (data.isCableAccessory) continue;
    const key = inventoryKeyFromDeviceData(data);
    usedCounts.set(key, (usedCounts.get(key) ?? 0) + 1);
  }

  const ownedCounts = new Map<string, number>();
  for (const item of ownedGear) {
    const key = inventoryKeyFromTemplate(item.template);
    ownedCounts.set(key, (ownedCounts.get(key) ?? 0) + item.quantity);
  }

  return { usedCounts, ownedCounts };
}

function computeDeviceReport(nodes: SchematicNode[], ownedGear: OwnedGearItem[]): DeviceReportRow[] {
  const { usedCounts, ownedCounts } = getDeviceInventoryCounts(nodes, ownedGear);
  const rows: DeviceReportRow[] = [];
  for (const node of nodes) {
    if (node.type !== "device") continue;
    const data = node.data as DeviceData;
    if (data.isCableAccessory) continue;
    const room = getRoomLabel(nodes, node.parentId);
    const inventoryKey = inventoryKeyFromDeviceData(data);
    const ownedCount = ownedCounts.get(inventoryKey) ?? 0;
    const neededCount = Math.max((usedCounts.get(inventoryKey) ?? 0) - ownedCount, 0);

    rows.push({
      nodeId: node.id,
      label: data.label,
      shortName: data.shortName ?? "",
      deviceType: data.deviceType,
      manufacturer: data.manufacturer ?? "",
      model: data.model ?? data.label,
      modelNumber: data.modelNumber ?? "",
      room,
      portCount: data.ports.length,
      unitCost: data.unitCost ?? 0,
      color: data.color ?? "#6366f1",
      ownedCount,
      neededCount,
    });
  }
  return rows;
}

type DeviceSortKey = "label" | "shortName" | "deviceType" | "manufacturer" | "model" | "modelNumber" | "room" | "portCount" | "unitCost" | "ownedCount" | "neededCount";

const deviceColumns: SpreadsheetColumn<DeviceReportRow>[] = [
  { id: "label", header: "Device", getValue: (r) => r.label, editable: true, fillType: "deviceName" },
  { id: "shortName", header: "Short Name", getValue: (r) => r.shortName, editable: true, fillType: "deviceName" },
  { id: "unitCost", header: "Unit Cost", getValue: (r) => r.unitCost > 0 ? r.unitCost.toFixed(2) : "", editable: true },
];

function DeviceReportTab() {
  const nodes = useSchematicStore((s) => s.nodes);
  const ownedGear = useSchematicStore((s) => s.ownedGear);
  const showOwnedGearPane = useSchematicStore((s) => s.showOwnedGearPane);
  const patchDeviceData = useSchematicStore((s) => s.patchDeviceData);

  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<DeviceSortKey>("label");
  const [sortAsc, setSortAsc] = useState(true);
  const showInventoryColumns = showOwnedGearPane || ownedGear.length > 0;

  const rows = useMemo(() => computeDeviceReport(nodes, ownedGear), [nodes, ownedGear]);

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.shortName.toLowerCase().includes(q) ||
        r.deviceType.toLowerCase().includes(q) ||
        r.manufacturer.toLowerCase().includes(q) ||
        r.model.toLowerCase().includes(q) ||
        r.room.toLowerCase().includes(q),
    );
  }, [rows, filter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp: number;
      if (sortKey === "portCount" || sortKey === "unitCost" || sortKey === "ownedCount" || sortKey === "neededCount") {
        cmp = (a[sortKey] as number) - (b[sortKey] as number);
      } else {
        cmp = (a[sortKey] as string).localeCompare(b[sortKey] as string);
      }
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortAsc]);

  const toggleSort = (key: DeviceSortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sortArrow = (key: DeviceSortKey) =>
    sortKey === key ? (sortAsc ? " ▴" : " ▾") : "";

  const handleColorChange = useCallback(
    (nodeId: string, color: string) => {
      patchDeviceData(nodeId, { color });
    },
    [patchDeviceData],
  );

  const onCellChange = useCallback(
    (rowIndex: number, columnId: string, value: string) => {
      const row = sorted[rowIndex];
      if (!row) return;
      if (columnId === "unitCost") {
        const parsed = parseFloat(value);
        patchDeviceData(row.nodeId, { unitCost: isNaN(parsed) || parsed <= 0 ? undefined : parsed });
      } else if (columnId === "shortName") {
        // Empty value clears the short name (allowed); label requires non-empty.
        useSchematicStore.getState().updateDeviceShortName(row.nodeId, value);
      } else {
        if (!value.trim()) return;
        useSchematicStore.getState().updateDeviceLabel(row.nodeId, value.trim());
      }
    },
    [sorted, patchDeviceData],
  );

  const onBatchChange = useCallback(
    (changes: { rowIndex: number; columnId: string; value: string }[]) => {
      const labelChanges: { nodeId: string; label: string }[] = [];
      const shortNameChanges: { nodeId: string; shortName: string }[] = [];
      for (const c of changes) {
        const row = sorted[c.rowIndex];
        if (!row) continue;
        if (c.columnId === "unitCost") {
          const parsed = parseFloat(c.value);
          patchDeviceData(row.nodeId, { unitCost: isNaN(parsed) || parsed <= 0 ? undefined : parsed });
        } else if (c.columnId === "shortName") {
          shortNameChanges.push({ nodeId: row.nodeId, shortName: c.value });
        } else {
          if (c.value.trim()) labelChanges.push({ nodeId: row.nodeId, label: c.value.trim() });
        }
      }
      if (labelChanges.length > 0) {
        useSchematicStore.getState().batchUpdateDeviceLabels(labelChanges);
      }
      if (shortNameChanges.length > 0) {
        useSchematicStore.getState().batchUpdateDeviceShortNames(shortNameChanges);
      }
    },
    [sorted, patchDeviceData],
  );

  const isCellEditable = useCallback(
    (_rowIndex: number, _columnId: string) => true,
    [],
  );

  const getCellValue = useCallback(
    (rowIndex: number, columnId: string) => {
      const row = sorted[rowIndex];
      if (!row) return "";
      if (columnId === "unitCost") return row.unitCost > 0 ? row.unitCost.toFixed(2) : "";
      if (columnId === "shortName") return row.shortName ?? "";
      return row.label ?? "";
    },
    [sorted],
  );

  const spreadsheet = useSpreadsheetSelection({
    rowCount: sorted.length,
    columns: deviceColumns,
    isCellEditable,
    getCellValue,
    onCellChange,
    onBatchChange,
  });

  // Clear selection on sort/filter change
  useEffect(() => {
    spreadsheet.clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, sortAsc, filter]);

  if (rows.length === 0) {
    return (
      <div className="text-sm text-[var(--color-text-muted)] text-center py-8">
        No devices in this schematic.
      </div>
    );
  }

  return (
    <>
      {/* Action bar */}
      {spreadsheet.selectedCells.size > 0 && (
        <div className="mb-3 flex items-center gap-3 px-3 py-2 bg-[var(--color-accent-soft)] border border-[var(--color-accent)] rounded-lg">
          <span className="text-xs font-medium text-[var(--color-accent)]">
            {spreadsheet.selectedCells.size} device name{spreadsheet.selectedCells.size > 1 ? "s" : ""} selected
          </span>
          <span className="text-[11px] text-[var(--color-text-muted)]">
            {spreadsheet.selectedCells.size > 1 ? "Type a name + Enter to fill series" : "Double-click or type to rename"}
          </span>
          <div className="flex-1" />
          <button
            onClick={() => spreadsheet.clearSelection()}
            className="px-2 py-1 text-xs rounded text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      <div className="mb-3">
        <input
          className="w-full bg-[var(--color-surface)] border border-[var(--ui-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
          placeholder="Filter by name, type, manufacturer, or room..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>
      <div {...spreadsheet.getContainerProps()}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={thClass} onClick={() => toggleSort("label")}>
                Device{sortArrow("label")}
              </th>
              <th className={thClass} onClick={() => toggleSort("shortName")}>
                Short Name{sortArrow("shortName")}
              </th>
              <th className={thClass} onClick={() => toggleSort("deviceType")}>
                Type{sortArrow("deviceType")}
              </th>
              <th className={thClass} onClick={() => toggleSort("manufacturer")}>
                Manufacturer{sortArrow("manufacturer")}
              </th>
              <th className={thClass} onClick={() => toggleSort("model")}>
                Model{sortArrow("model")}
              </th>
              <th className={thClass} onClick={() => toggleSort("modelNumber")}>
                Model #{sortArrow("modelNumber")}
              </th>
              <th className={thClass} onClick={() => toggleSort("room")}>
                Room{sortArrow("room")}
              </th>
              <th className={thClass} onClick={() => toggleSort("portCount")}>
                Ports{sortArrow("portCount")}
              </th>
              {showInventoryColumns && (
                <th className={thClass} onClick={() => toggleSort("ownedCount")}>
                  Owned{sortArrow("ownedCount")}
                </th>
              )}
              {showInventoryColumns && (
                <th className={thClass} onClick={() => toggleSort("neededCount")}>
                  Need{sortArrow("neededCount")}
                </th>
              )}
              <th className={thClass} onClick={() => toggleSort("unitCost")}>
                Unit Cost{sortArrow("unitCost")}
              </th>
              <th className={thClass} style={{ width: 40 }}>Color</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <DeviceRow
                key={row.nodeId}
                row={row}
                rowIndex={i}
                altClass={rowClass(i)}
                spreadsheet={spreadsheet}
                showInventoryColumns={showInventoryColumns}
                onColorChange={handleColorChange}
              />
            ))}
          </tbody>
        </table>
      </div>

      {spreadsheet.fillSeriesRequest && (
        <FillSeriesDialog
          config={spreadsheet.fillSeriesRequest.config}
          startValue={spreadsheet.fillSeriesRequest.startValue}
          cellCount={spreadsheet.fillSeriesRequest.cellCount}
          onApply={(values) => spreadsheet.applyFillSeries(values)}
          onClose={() => spreadsheet.dismissFillSeries()}
        />
      )}
    </>
  );
}

const DeviceRow = memo(function DeviceRow({
  row,
  rowIndex,
  altClass,
  spreadsheet,
  showInventoryColumns,
  onColorChange,
}: {
  row: DeviceReportRow;
  rowIndex: number;
  altClass: string;
  spreadsheet: ReturnType<typeof useSpreadsheetSelection<DeviceReportRow>>;
  showInventoryColumns: boolean;
  onColorChange: (nodeId: string, color: string) => void;
}) {
  const cellProps = spreadsheet.getCellProps(rowIndex, "label");
  const hasSelection = cellProps.isSelected;
  const currency = useSchematicStore((s) => s.currency);

  return (
    <tr className={hasSelection ? "bg-[var(--color-accent-soft)]" : altClass}>
      {cellProps.isEditing ? (
        <td className={`${tdClass} p-0.5`}>
          <input
            className="w-full bg-[var(--color-surface)] border border-[var(--color-accent)] rounded px-1 py-0.5 text-xs outline-none"
            value={spreadsheet.editValue}
            onChange={(e) => spreadsheet.setEditValue(e.target.value)}
            onBlur={() => spreadsheet.commitEdit(spreadsheet.editValue)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") { e.preventDefault(); spreadsheet.commitEdit(spreadsheet.editValue); }
              else if (e.key === "Escape") { e.preventDefault(); spreadsheet.cancelEdit(); }
              else if (e.key === "Tab") { e.preventDefault(); spreadsheet.commitEdit(spreadsheet.editValue); }
            }}
            autoFocus
          />
        </td>
      ) : (
        <td
          className={`${tdClass} p-0.5 cursor-cell ${cellProps.isSelected ? "bg-[var(--color-accent-soft)] ring-1 ring-inset ring-[var(--color-accent)]" : ""}`}
          onMouseDown={cellProps.onMouseDown}
          onMouseEnter={cellProps.onMouseEnter}
          onDoubleClick={cellProps.onDoubleClick}
        >
          <span className="text-[10px] px-1 select-none">{row.label}</span>
        </td>
      )}
      {(() => {
        const sn = spreadsheet.getCellProps(rowIndex, "shortName");
        if (sn.isEditing) {
          return (
            <td className={`${tdClass} p-0.5`}>
              <input
                className="w-full bg-[var(--color-surface)] border border-[var(--color-accent)] rounded px-1 py-0.5 text-xs outline-none"
                value={spreadsheet.editValue}
                onChange={(e) => spreadsheet.setEditValue(e.target.value)}
                onBlur={() => spreadsheet.commitEdit(spreadsheet.editValue)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") { e.preventDefault(); spreadsheet.commitEdit(spreadsheet.editValue); }
                  else if (e.key === "Escape") { e.preventDefault(); spreadsheet.cancelEdit(); }
                  else if (e.key === "Tab") { e.preventDefault(); spreadsheet.commitEdit(spreadsheet.editValue); }
                }}
                autoFocus
                placeholder={row.modelNumber || ""}
              />
            </td>
          );
        }
        return (
          <td
            className={`${tdClass} p-0.5 cursor-cell ${sn.isSelected ? "bg-[var(--color-accent-soft)] ring-1 ring-inset ring-[var(--color-accent)]" : ""}`}
            onMouseDown={sn.onMouseDown}
            onMouseEnter={sn.onMouseEnter}
            onDoubleClick={sn.onDoubleClick}
          >
            <span className="text-[10px] px-1 select-none">
              {row.shortName || (row.modelNumber ? <span className="text-[var(--color-text-muted)] italic">{row.modelNumber}</span> : "—")}
            </span>
          </td>
        );
      })()}
      <td className={tdClass}>{row.deviceType}</td>
      <td className={tdClass}>{row.manufacturer || "—"}</td>
      <td className={tdClass}>{row.model}</td>
      <td className={tdClass}>{row.modelNumber || "—"}</td>
      <td className={tdClass}>{row.room}</td>
      <td className={tdClass}>{row.portCount}</td>
      {showInventoryColumns && <td className={tdClass}>{row.ownedCount}</td>}
      {showInventoryColumns && <td className={tdClass}>{row.neededCount}</td>}
      {(() => {
        const costCellProps = spreadsheet.getCellProps(rowIndex, "unitCost");
        if (costCellProps.isEditing) {
          return (
            <td className={`${tdClass} p-0.5`}>
              <input
                className="w-full bg-[var(--color-surface)] border border-[var(--color-accent)] rounded px-1 py-0.5 text-xs outline-none"
                value={spreadsheet.editValue}
                onChange={(e) => spreadsheet.setEditValue(e.target.value)}
                onBlur={() => spreadsheet.commitEdit(spreadsheet.editValue)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") { e.preventDefault(); spreadsheet.commitEdit(spreadsheet.editValue); }
                  else if (e.key === "Escape") { e.preventDefault(); spreadsheet.cancelEdit(); }
                  else if (e.key === "Tab") { e.preventDefault(); spreadsheet.commitEdit(spreadsheet.editValue); }
                }}
                autoFocus
                type="number"
                step={0.01}
                min={0}
              />
            </td>
          );
        }
        return (
          <td
            className={`${tdClass} p-0.5 cursor-cell ${costCellProps.isSelected ? "bg-[var(--color-accent-soft)] ring-1 ring-inset ring-[var(--color-accent)]" : ""}`}
            onMouseDown={costCellProps.onMouseDown}
            onMouseEnter={costCellProps.onMouseEnter}
            onDoubleClick={costCellProps.onDoubleClick}
          >
            <span className="text-[10px] px-1 select-none">
              {row.unitCost > 0 ? formatCurrency(row.unitCost, currency) : "—"}
            </span>
          </td>
        );
      })()}
      <td className={`${tdClass} p-0.5`}>
        <input
          type="color"
          value={row.color}
          onChange={(e) => onColorChange(row.nodeId, e.target.value)}
          className="w-6 h-5 p-0 border-0 cursor-pointer rounded"
        />
      </td>
    </tr>
  );
});

// ─── Cable Schedule Tab ────────────────────────────────────────

type CableSortKey = "cableId" | "sourceDevice" | "sourcePort" | "sourceConnector" | "targetDevice" | "targetPort" | "targetConnector" | "cableType" | "signalType" | "cableLength" | "computedLength" | "gaugeAwg" | "cableAlias" | "tested" | "cableUse" | "sourceRoom" | "targetRoom" | "multicableLabel";
type CableGroupBy = "" | "sourceRoom" | "signalType" | "cableType" | "multicableLabel" | "cableUse";

const cableScheduleColumns: SpreadsheetColumn<CableScheduleRow>[] = [
  { id: "label", header: "Label", getValue: () => "", editable: false },
  { id: "cableId", header: "Cable ID", getValue: (r) => r.cableId, editable: true, fillType: "deviceName" },
  { id: "cableLength", header: "Length", getValue: (r) => r.cableLength, editable: true },
  { id: "gaugeAwg", header: "Gauge", getValue: (r) => r.gaugeAwg, editable: true },
  { id: "cableAlias", header: "Alias", getValue: (r) => r.cableAlias, editable: true, fillType: "deviceName" },
];

function CableScheduleTabInline() {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const patchEdgeData = useSchematicStore((s) => s.patchEdgeData);
  const batchPatchEdgeData = useSchematicStore((s) => s.batchPatchEdgeData);

  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<CableSortKey>("cableId");
  const [sortAsc, setSortAsc] = useState(true);
  const [groupByKey, setGroupByKey] = useState<CableGroupBy>("");
  const [colMenu, setColMenu] = useState<{ x: number; y: number } | null>(null);

  // Hidden-column prefs persist in the file (per table id) so they survive reopening
  // the reports window and reloading the project.
  const hiddenColsArr = useSchematicStore((s) => s.reportHiddenColumns["cableSchedule"]);
  const setReportHiddenColumns = useSchematicStore((s) => s.setReportHiddenColumns);
  const hiddenCols = useMemo(() => new Set(hiddenColsArr ?? []), [hiddenColsArr]);
  const toggleCol = useCallback((id: string) => {
    const next = new Set(hiddenCols);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setReportHiddenColumns("cableSchedule", [...next]);
  }, [hiddenCols, setReportHiddenColumns]);
  const showAllCols = useCallback(() => setReportHiddenColumns("cableSchedule", []), [setReportHiddenColumns]);

  const cableNamingScheme = useSchematicStore((s) => s.cableNamingScheme);
  const roomDistances = useSchematicStore((s) => s.roomDistances);
  const distanceSettings = useSchematicStore((s) => s.distanceSettings);
  const bundles = useSchematicStore((s) => s.bundles);
  const rows = useMemo(
    () => computeCableSchedule(nodes, edges, cableNamingScheme, { roomDistances, distanceSettings }, bundles),
    [nodes, edges, cableNamingScheme, roomDistances, distanceSettings, bundles],
  );

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.cableId.toLowerCase().includes(q) ||
        r.sourceDevice.toLowerCase().includes(q) ||
        r.sourcePort.toLowerCase().includes(q) ||
        r.sourceConnector.toLowerCase().includes(q) ||
        r.targetDevice.toLowerCase().includes(q) ||
        r.targetPort.toLowerCase().includes(q) ||
        r.targetConnector.toLowerCase().includes(q) ||
        r.cableType.toLowerCase().includes(q) ||
        r.signalType.toLowerCase().includes(q) ||
        r.cableLength.toLowerCase().includes(q) ||
        (r.computedLength ?? "").toLowerCase().includes(q) ||
        r.sourceRoom.toLowerCase().includes(q) ||
        r.targetRoom.toLowerCase().includes(q) ||
        r.multicableLabel.toLowerCase().includes(q),
    );
  }, [rows, filter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const cmp = (a[sortKey] ?? "").localeCompare(b[sortKey] ?? "");
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortAsc]);

  const toggleSort = (key: CableSortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sortArrow = (key: CableSortKey) =>
    sortKey === key ? (sortAsc ? " ▴" : " ▾") : "";

  const onCellChange = useCallback(
    (rowIndex: number, columnId: string, value: string) => {
      const row = sorted[rowIndex];
      if (!row) return;
      const v = value.trim();
      if (columnId === "cableLength") {
        patchEdgeData(row.edgeId, { cableLength: v });
      } else if (columnId === "gaugeAwg") {
        patchEdgeData(row.edgeId, { gaugeAwg: v || undefined });
      } else if (columnId === "cableAlias") {
        patchEdgeData(row.edgeId, { cableAlias: v || undefined });
      } else {
        // Empty value clears the override → reverts to auto-generated ID
        patchEdgeData(row.edgeId, { cableId: v || undefined });
      }
    },
    [sorted, patchEdgeData],
  );

  const onBatchChange = useCallback(
    (changes: { rowIndex: number; columnId: string; value: string }[]) => {
      const edgeChanges = changes
        .map((c) => {
          const row = sorted[c.rowIndex];
          if (!row) return null;
          const v = c.value.trim();
          if (c.columnId === "cableLength") {
            return { edgeId: row.edgeId, patch: { cableLength: v } };
          }
          if (c.columnId === "gaugeAwg") {
            return { edgeId: row.edgeId, patch: { gaugeAwg: v || undefined } };
          }
          if (c.columnId === "cableAlias") {
            return { edgeId: row.edgeId, patch: { cableAlias: v || undefined } };
          }
          // Empty value clears the override → reverts to auto-generated ID
          return { edgeId: row.edgeId, patch: { cableId: v || undefined } };
        })
        .filter((c) => c !== null) as { edgeId: string; patch: Partial<ConnectionData> }[];
      if (edgeChanges.length > 0) {
        batchPatchEdgeData(edgeChanges);
      }
    },
    [sorted, batchPatchEdgeData],
  );

  const isCellEditable = useCallback(
    (_rowIndex: number, _columnId: string) => true,
    [],
  );

  const getCellValue = useCallback(
    (rowIndex: number, columnId: string) => {
      const row = sorted[rowIndex];
      if (!row) return "";
      if (columnId === "cableLength") return row.cableLength;
      if (columnId === "gaugeAwg") return row.gaugeAwg;
      if (columnId === "cableAlias") return row.cableAlias;
      return row.cableId;
    },
    [sorted],
  );

  const spreadsheet = useSpreadsheetSelection({
    rowCount: sorted.length,
    columns: cableScheduleColumns,
    isCellEditable,
    getCellValue,
    onCellChange,
    onBatchChange,
  });

  // Toggle label visibility for one row — if that row is part of a multi-selection, toggle all selected rows
  const onToggleLabel = useCallback(
    (rowIndex: number, currentHideLabel: boolean) => {
      const newValue = currentHideLabel ? undefined : true;
      // Collect selected row indices from the spreadsheet selection
      const selectedRows = new Set<number>();
      for (const key of spreadsheet.selectedCells) {
        const idx = Number(key.slice(0, key.indexOf(":")));
        selectedRows.add(idx);
      }
      if (selectedRows.size > 1 && selectedRows.has(rowIndex)) {
        // Batch toggle all selected rows to match the clicked row's new state
        const changes = Array.from(selectedRows)
          .map((ri) => sorted[ri])
          .filter(Boolean)
          .map((r) => ({ edgeId: r.edgeId, patch: { hideCableId: newValue } as Partial<ConnectionData> }));
        if (changes.length > 0) batchPatchEdgeData(changes);
      } else {
        const row = sorted[rowIndex];
        if (row) patchEdgeData(row.edgeId, { hideCableId: newValue });
      }
    },
    [sorted, spreadsheet.selectedCells, patchEdgeData, batchPatchEdgeData],
  );

  // Toggle the tested/certified flag for one row (or all selected rows). Stamps today's
  // date when marking tested; clears both flag and date when un-marking (#P2-031).
  const onToggleTested = useCallback(
    (rowIndex: number, currentTested: boolean) => {
      const patch: Partial<ConnectionData> = currentTested
        ? { tested: undefined, testedDate: undefined }
        : { tested: true, testedDate: new Date().toISOString().slice(0, 10) };
      const selectedRows = new Set<number>();
      for (const key of spreadsheet.selectedCells) {
        selectedRows.add(Number(key.slice(0, key.indexOf(":"))));
      }
      if (selectedRows.size > 1 && selectedRows.has(rowIndex)) {
        const changes = Array.from(selectedRows)
          .map((ri) => sorted[ri])
          .filter(Boolean)
          .map((r) => ({ edgeId: r.edgeId, patch }));
        if (changes.length > 0) batchPatchEdgeData(changes);
      } else {
        const row = sorted[rowIndex];
        if (row) patchEdgeData(row.edgeId, patch);
      }
    },
    [sorted, spreadsheet.selectedCells, patchEdgeData, batchPatchEdgeData],
  );

  // Set patch/field use for one row (or all selected rows when this row is in a multi-selection) (#P2-019).
  const onSetCableUse = useCallback(
    (rowIndex: number, value: "patch" | "field" | "") => {
      const patch: Partial<ConnectionData> = { cableUse: value || undefined };
      const selectedRows = new Set<number>();
      for (const key of spreadsheet.selectedCells) {
        selectedRows.add(Number(key.slice(0, key.indexOf(":"))));
      }
      if (selectedRows.size > 1 && selectedRows.has(rowIndex)) {
        const changes = Array.from(selectedRows)
          .map((ri) => sorted[ri])
          .filter(Boolean)
          .map((r) => ({ edgeId: r.edgeId, patch }));
        if (changes.length > 0) batchPatchEdgeData(changes);
      } else {
        const row = sorted[rowIndex];
        if (row) patchEdgeData(row.edgeId, patch);
      }
    },
    [sorted, spreadsheet.selectedCells, patchEdgeData, batchPatchEdgeData],
  );

  // Clear selection on sort/filter change
  useEffect(() => {
    spreadsheet.clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, sortAsc, filter]);

  if (rows.length === 0) {
    return (
      <div className="text-sm text-[var(--color-text-muted)] text-center py-8">
        No connections in this schematic.
      </div>
    );
  }

  const grouped = groupByKey
    ? groupCableScheduleRows(sorted, groupByKey)
    : null;

  return (
    <>
      {/* Action bar */}
      {spreadsheet.selectedCells.size > 0 && (
        <div className="mb-3 flex items-center gap-3 px-3 py-2 bg-[var(--color-accent-soft)] border border-[var(--color-accent)] rounded-lg">
          <span className="text-xs font-medium text-[var(--color-accent)]">
            {spreadsheet.selectedCells.size} cell{spreadsheet.selectedCells.size > 1 ? "s" : ""} selected
          </span>
          <span className="text-[11px] text-[var(--color-text-muted)]">
            {spreadsheet.selectedCells.size > 1 ? "Type a value + Enter to fill series" : "Double-click or type to edit"}
          </span>
          <div className="flex-1" />
          <button
            onClick={() => spreadsheet.clearSelection()}
            className="px-2 py-1 text-xs rounded text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <input
          className="flex-1 bg-[var(--color-surface)] border border-[var(--ui-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
          placeholder="Filter by device, port, cable type, signal, room..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <select
          className="bg-[var(--color-surface)] border border-[var(--ui-border)] rounded px-2 py-1 text-xs outline-none cursor-pointer"
          value={groupByKey}
          onChange={(e) => setGroupByKey(e.target.value as CableGroupBy)}
        >
          <option value="">No Grouping</option>
          <option value="sourceRoom">Source Room</option>
          <option value="signalType">Signal Type</option>
          <option value="cableType">Cable Type</option>
          <option value="multicableLabel">Snake</option>
          <option value="cableUse">Patch / Field</option>
        </select>
        <button
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none cursor-pointer hover:text-[var(--color-text)] whitespace-nowrap"
          title="Show / hide columns"
          onClick={(e) => setColMenu({ x: e.clientX, y: e.clientY })}
        >
          Columns ▾
        </button>
      </div>
      <div {...spreadsheet.getContainerProps()}>
        <table className="w-full border-collapse">
          <thead>
            <tr onContextMenu={(e) => { e.preventDefault(); setColMenu({ x: e.clientX, y: e.clientY }); }}>
              {!hiddenCols.has("label") && (
                <th className={thClass} style={{ width: 28, textAlign: "center" }} title="Show label on schematic">Label</th>
              )}
              {!hiddenCols.has("cableId") && (
                <th className={thClass} onClick={() => toggleSort("cableId")}>Cable ID{sortArrow("cableId")}</th>
              )}
              {!hiddenCols.has("sourceDevice") && (
                <th className={thClass} onClick={() => toggleSort("sourceDevice")}>Source{sortArrow("sourceDevice")}</th>
              )}
              {!hiddenCols.has("sourcePort") && (
                <th className={thClass} onClick={() => toggleSort("sourcePort")}>Src Port{sortArrow("sourcePort")}</th>
              )}
              {!hiddenCols.has("sourceConnector") && (
                <th className={thClass} onClick={() => toggleSort("sourceConnector")}>Src Conn{sortArrow("sourceConnector")}</th>
              )}
              {!hiddenCols.has("targetDevice") && (
                <th className={thClass} onClick={() => toggleSort("targetDevice")}>Target{sortArrow("targetDevice")}</th>
              )}
              {!hiddenCols.has("targetPort") && (
                <th className={thClass} onClick={() => toggleSort("targetPort")}>Tgt Port{sortArrow("targetPort")}</th>
              )}
              {!hiddenCols.has("targetConnector") && (
                <th className={thClass} onClick={() => toggleSort("targetConnector")}>Tgt Conn{sortArrow("targetConnector")}</th>
              )}
              {!hiddenCols.has("cableType") && (
                <th className={thClass} onClick={() => toggleSort("cableType")}>Cable Type{sortArrow("cableType")}</th>
              )}
              {!hiddenCols.has("signalType") && (
                <th className={thClass} onClick={() => toggleSort("signalType")}>Signal{sortArrow("signalType")}</th>
              )}
              {!hiddenCols.has("cableLength") && (
                <th className={thClass} onClick={() => toggleSort("cableLength")}>Length{sortArrow("cableLength")}</th>
              )}
              {!hiddenCols.has("computedLength") && (
                <th className={thClass} onClick={() => toggleSort("computedLength")} title="Estimated length from room-to-room distance + slack">Est. Length{sortArrow("computedLength")}</th>
              )}
              {!hiddenCols.has("gaugeAwg") && (
                <th className={thClass} onClick={() => toggleSort("gaugeAwg")} title="Conductor gauge (AWG)">Gauge{sortArrow("gaugeAwg")}</th>
              )}
              {!hiddenCols.has("cableAlias") && (
                <th className={thClass} onClick={() => toggleSort("cableAlias")} title="Alternate / contractor cable name">Alias{sortArrow("cableAlias")}</th>
              )}
              {!hiddenCols.has("tested") && (
                <th className={thClass} style={{ textAlign: "center" }} onClick={() => toggleSort("tested")} title="Tested / certified">Tested{sortArrow("tested")}</th>
              )}
              {!hiddenCols.has("cableUse") && (
                <th className={thClass} style={{ minWidth: 64 }} onClick={() => toggleSort("cableUse")} title="Patch lead vs fixed field / infrastructure cable">Use{sortArrow("cableUse")}</th>
              )}
              {!hiddenCols.has("sourceRoom") && (
                <th className={thClass} onClick={() => toggleSort("sourceRoom")}>Src Room{sortArrow("sourceRoom")}</th>
              )}
              {!hiddenCols.has("targetRoom") && (
                <th className={thClass} onClick={() => toggleSort("targetRoom")}>Tgt Room{sortArrow("targetRoom")}</th>
              )}
              {!hiddenCols.has("multicableLabel") && (
                <th className={thClass} onClick={() => toggleSort("multicableLabel")}>Snake{sortArrow("multicableLabel")}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {grouped
              ? renderGroupedCableSchedule(grouped, spreadsheet, onToggleLabel, onToggleTested, onSetCableUse, hiddenCols)
              : sorted.map((r, i) => (
                  <CableScheduleRow_
                    key={r.edgeId}
                    row={r}
                    rowIndex={i}
                    altClass={rowClass(i)}
                    spreadsheet={spreadsheet}
                    onToggleLabel={onToggleLabel}
                    onToggleTested={onToggleTested}
                    onSetCableUse={onSetCableUse}
                    hiddenCols={hiddenCols}
                  />
                ))
            }
          </tbody>
        </table>
      </div>

      {spreadsheet.fillSeriesRequest && (
        <FillSeriesDialog
          config={spreadsheet.fillSeriesRequest.config}
          startValue={spreadsheet.fillSeriesRequest.startValue}
          cellCount={spreadsheet.fillSeriesRequest.cellCount}
          onApply={(values) => spreadsheet.applyFillSeries(values)}
          onClose={() => spreadsheet.dismissFillSeries()}
        />
      )}

      {colMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setColMenu(null)} />
          <div
            className="fixed z-50 bg-white border border-[var(--color-border)] rounded shadow-lg py-1 text-xs max-h-[70vh] overflow-y-auto"
            style={{ left: colMenu.x, top: colMenu.y }}
          >
            <div className="flex items-center justify-between gap-3 px-3 py-1">
              <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                Columns
              </span>
              <button
                onClick={showAllCols}
                disabled={hiddenCols.size === 0}
                className="text-[10px] text-blue-600 hover:text-blue-500 disabled:text-[var(--color-text-muted)] disabled:opacity-50 disabled:cursor-default cursor-pointer"
              >
                Show all
              </button>
            </div>
            {CABLE_COLUMNS.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2 px-3 py-1 hover:bg-[var(--color-surface)] cursor-pointer whitespace-nowrap"
              >
                <input
                  type="checkbox"
                  checked={!hiddenCols.has(c.id)}
                  onChange={() => toggleCol(c.id)}
                  className="w-3 h-3 accent-blue-500 cursor-pointer"
                />
                {c.label}
              </label>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function EditableCell({ spreadsheet, rowIndex, columnId, value }: {
  spreadsheet: ReturnType<typeof useSpreadsheetSelection<CableScheduleRow>>;
  rowIndex: number;
  columnId: string;
  value: string;
}) {
  const cellProps = spreadsheet.getCellProps(rowIndex, columnId);
  if (cellProps.isEditing) {
    return (
      <td className={`${tdClass} p-0.5`}>
        <input
          className="w-full bg-[var(--color-surface)] border border-[var(--color-accent)] rounded px-1 py-0.5 text-xs outline-none"
          value={spreadsheet.editValue}
          onChange={(e) => spreadsheet.setEditValue(e.target.value)}
          onBlur={() => spreadsheet.commitEdit(spreadsheet.editValue)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") { e.preventDefault(); spreadsheet.commitEdit(spreadsheet.editValue); }
            else if (e.key === "Escape") { e.preventDefault(); spreadsheet.cancelEdit(); }
            else if (e.key === "Tab") { e.preventDefault(); spreadsheet.commitEdit(spreadsheet.editValue); }
          }}
          autoFocus
        />
      </td>
    );
  }
  return (
    <td
      className={`${tdClass} p-0.5 cursor-cell ${cellProps.isSelected ? "bg-[var(--color-accent-soft)] ring-1 ring-inset ring-[var(--color-accent)]" : ""}`}
      onMouseDown={cellProps.onMouseDown}
      onMouseEnter={cellProps.onMouseEnter}
      onDoubleClick={cellProps.onDoubleClick}
    >
      <span className="text-[10px] px-1 select-none">{value}</span>
    </td>
  );
}

const CableScheduleRow_ = memo(function CableScheduleRow_({
  row,
  rowIndex,
  altClass,
  spreadsheet,
  onToggleLabel,
  onToggleTested,
  onSetCableUse,
  hiddenCols,
}: {
  row: CableScheduleRow;
  rowIndex: number;
  altClass: string;
  spreadsheet: ReturnType<typeof useSpreadsheetSelection<CableScheduleRow>>;
  onToggleLabel: (rowIndex: number, currentHideLabel: boolean) => void;
  onToggleTested: (rowIndex: number, currentTested: boolean) => void;
  onSetCableUse: (rowIndex: number, value: "patch" | "field" | "") => void;
  hiddenCols: Set<string>;
}) {
  const labelProps = spreadsheet.getCellProps(rowIndex, "label");
  const cableIdProps = spreadsheet.getCellProps(rowIndex, "cableId");
  const lengthProps = spreadsheet.getCellProps(rowIndex, "cableLength");
  const hasSelection = labelProps.isSelected || cableIdProps.isSelected || lengthProps.isSelected;
  const hideLabel = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === row.edgeId);
    return edge?.data?.hideCableId === true;
  });
  const tested = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === row.edgeId);
    return edge?.data?.tested === true;
  });

  return (
    <tr className={hasSelection ? "bg-[var(--color-accent-soft)]" : altClass}>
      {!hiddenCols.has("label") && (
        <td
          className={`${tdClass} ${labelProps.isSelected ? "bg-[var(--color-accent-soft)] ring-1 ring-inset ring-[var(--color-accent)]" : ""}`}
          style={{ textAlign: "center" }}
          onMouseDown={labelProps.onMouseDown}
          onMouseEnter={labelProps.onMouseEnter}
        >
          <input
            type="checkbox"
            checked={!hideLabel}
            onChange={() => onToggleLabel(rowIndex, hideLabel)}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-3 h-3 cursor-pointer"
            style={{ accentColor: "var(--color-accent)" }}
            title={hideLabel ? "Show label" : "Hide label"}
          />
        </td>
      )}
      {!hiddenCols.has("cableId") && (
        <EditableCell spreadsheet={spreadsheet} rowIndex={rowIndex} columnId="cableId" value={row.cableId} />
      )}
      {!hiddenCols.has("sourceDevice") && <td className={tdClass}>{row.sourceDevice}</td>}
      {!hiddenCols.has("sourcePort") && <td className={tdClass}>{row.sourcePort}</td>}
      {!hiddenCols.has("sourceConnector") && <td className={tdClass}>{row.sourceConnector}</td>}
      {!hiddenCols.has("targetDevice") && <td className={tdClass}>{row.targetDevice}</td>}
      {!hiddenCols.has("targetPort") && <td className={tdClass}>{row.targetPort}</td>}
      {!hiddenCols.has("targetConnector") && <td className={tdClass}>{row.targetConnector}</td>}
      {!hiddenCols.has("cableType") && <td className={tdClass}>{row.cableType}</td>}
      {!hiddenCols.has("signalType") && <td className={tdClass}>{row.signalType}</td>}
      {!hiddenCols.has("cableLength") && (
        <EditableCell spreadsheet={spreadsheet} rowIndex={rowIndex} columnId="cableLength" value={row.cableLength} />
      )}
      {!hiddenCols.has("computedLength") && (
        <td className={`${tdClass} text-[var(--color-text-muted)]`}>{row.computedLength ?? ""}</td>
      )}
      {!hiddenCols.has("gaugeAwg") && (
        <EditableCell spreadsheet={spreadsheet} rowIndex={rowIndex} columnId="gaugeAwg" value={row.gaugeAwg} />
      )}
      {!hiddenCols.has("cableAlias") && (
        <EditableCell spreadsheet={spreadsheet} rowIndex={rowIndex} columnId="cableAlias" value={row.cableAlias} />
      )}
      {!hiddenCols.has("tested") && (
        <td className={tdClass} style={{ textAlign: "center" }} title={row.tested || "Not tested"}>
          <input
            type="checkbox"
            checked={tested}
            onChange={() => onToggleTested(rowIndex, tested)}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-3 h-3 cursor-pointer"
            style={{ accentColor: "var(--color-success)" }}
          />
        </td>
      )}
      {!hiddenCols.has("cableUse") && (
        <td className={`${tdClass} p-0.5`} style={{ minWidth: 64 }}>
          <select
            value={row.cableUse}
            onChange={(e) => onSetCableUse(rowIndex, e.target.value as "patch" | "field" | "")}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full min-w-[3.5rem] bg-transparent border-none text-[10px] outline-none cursor-pointer"
            title="Patch lead vs fixed field / infrastructure cable"
          >
            <option value="">—</option>
            <option value="patch">Patch</option>
            <option value="field">Field</option>
          </select>
        </td>
      )}
      {!hiddenCols.has("sourceRoom") && <td className={tdClass}>{row.sourceRoom}</td>}
      {!hiddenCols.has("targetRoom") && <td className={tdClass}>{row.targetRoom}</td>}
      {!hiddenCols.has("multicableLabel") && <td className={tdClass}>{row.multicableLabel}</td>}
    </tr>
  );
});

function groupCableScheduleRows(rows: CableScheduleRow[], key: CableGroupBy): Map<string, CableScheduleRow[]> {
  const map = new Map<string, CableScheduleRow[]>();
  for (const r of rows) {
    const groupKey = key === "sourceRoom" ? r.sourceRoom : key === "signalType" ? r.signalType : key === "multicableLabel" ? (r.multicableLabel || "Ungrouped") : key === "cableUse" ? (r.cableUse ? r.cableUse.charAt(0).toUpperCase() + r.cableUse.slice(1) : "Unspecified") : r.cableType;
    const arr = map.get(groupKey);
    if (arr) arr.push(r);
    else map.set(groupKey, [r]);
  }
  return map;
}

function renderGroupedCableSchedule(
  groups: Map<string, CableScheduleRow[]>,
  spreadsheet: ReturnType<typeof useSpreadsheetSelection<CableScheduleRow>>,
  onToggleLabel: (rowIndex: number, currentHideLabel: boolean) => void,
  onToggleTested: (rowIndex: number, currentTested: boolean) => void,
  onSetCableUse: (rowIndex: number, value: "patch" | "field" | "") => void,
  hiddenCols: Set<string>,
) {
  const elements: React.ReactNode[] = [];
  const visibleColCount = CABLE_COLUMNS.length - hiddenCols.size;
  let idx = 0;
  for (const [group, rows] of groups) {
    elements.push(
      <tr key={`h-${group}`}>
        <td
          colSpan={visibleColCount}
          className="pt-3 pb-1 px-2 text-xs font-semibold text-[var(--color-text-heading)] border-b border-[var(--ui-border)]"
        >
          {group}
        </td>
      </tr>,
    );
    for (const r of rows) {
      elements.push(
        <CableScheduleRow_
          key={r.edgeId}
          row={r}
          rowIndex={idx}
          altClass={rowClass(idx)}
          spreadsheet={spreadsheet}
          onToggleLabel={onToggleLabel}
          onToggleTested={onToggleTested}
          onSetCableUse={onSetCableUse}
          hiddenCols={hiddenCols}
        />,
      );
      idx++;
    }
  }
  return elements;
}

// ─── Patch Panel Schedule Tab ──────────────────────────────────

type PatchPanelSortKey =
  | "panel" | "panelRoom" | "face" | "position" | "signalType"
  | "connector" | "gender"
  | "remoteDevice" | "remotePort" | "remoteRoom"
  | "cableId" | "cableType" | "cableLength" | "computedLength" | "multicableLabel"
  | "rearConnector" | "rearGender" | "rearRemoteDevice" | "rearRemotePort" | "rearCableId" | "rearCableType" | "rearCableLength"
  | "frontConnector" | "frontGender" | "frontRemoteDevice" | "frontRemotePort" | "frontCableId" | "frontCableType" | "frontCableLength"
  | "normalling";

type PatchPanelGroupBy = "" | "panel" | "panelRoom" | "signalType" | "face";

function PatchPanelScheduleTabInline() {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const cableNamingScheme = useSchematicStore((s) => s.cableNamingScheme);
  const roomDistances = useSchematicStore((s) => s.roomDistances);
  const distanceSettings = useSchematicStore((s) => s.distanceSettings);

  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<PatchPanelSortKey>("panel");
  const [sortAsc, setSortAsc] = useState(true);
  const [groupByKey, setGroupByKey] = useState<PatchPanelGroupBy>("panel");
  const [hideUnconnected, setHideUnconnected] = useState(false);

  const rows = useMemo(
    () => computePatchPanelSchedule(nodes, edges, cableNamingScheme, { roomDistances, distanceSettings }),
    [nodes, edges, cableNamingScheme, roomDistances, distanceSettings],
  );

  const filtered = useMemo(() => {
    let list = rows;
    if (hideUnconnected) list = list.filter((r) => r.edgeId !== "");
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        r.panel.toLowerCase().includes(q) ||
        r.panelRoom.toLowerCase().includes(q) ||
        r.face.toLowerCase().includes(q) ||
        r.position.toLowerCase().includes(q) ||
        r.signalType.toLowerCase().includes(q) ||
        r.connector.toLowerCase().includes(q) ||
        r.remoteDevice.toLowerCase().includes(q) ||
        r.remotePort.toLowerCase().includes(q) ||
        r.remoteRoom.toLowerCase().includes(q) ||
        r.cableId.toLowerCase().includes(q) ||
        r.cableType.toLowerCase().includes(q) ||
        r.cableLength.toLowerCase().includes(q) ||
        r.computedLength.toLowerCase().includes(q) ||
        r.multicableLabel.toLowerCase().includes(q) ||
        (r.rearConnector ?? "").toLowerCase().includes(q) ||
        (r.rearRemoteDevice ?? "").toLowerCase().includes(q) ||
        (r.rearRemotePort ?? "").toLowerCase().includes(q) ||
        (r.rearRemoteRoom ?? "").toLowerCase().includes(q) ||
        (r.rearCableId ?? "").toLowerCase().includes(q) ||
        (r.frontConnector ?? "").toLowerCase().includes(q) ||
        (r.frontRemoteDevice ?? "").toLowerCase().includes(q) ||
        (r.frontRemotePort ?? "").toLowerCase().includes(q) ||
        (r.frontRemoteRoom ?? "").toLowerCase().includes(q) ||
        (r.frontCableId ?? "").toLowerCase().includes(q),
    );
  }, [rows, filter, hideUnconnected]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    if (sortKey === "position") {
      // Natural rear-then-front-by-index order from compute(); keep the existing
      // sort and only flip direction if user asks descending.
      if (!sortAsc) copy.reverse();
      return copy;
    }
    copy.sort((a, b) => {
      const va = (a[sortKey] ?? "") as string;
      const vb = (b[sortKey] ?? "") as string;
      const cmp = va.localeCompare(vb);
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortAsc]);

  const toggleSort = (key: PatchPanelSortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const sortArrow = (key: PatchPanelSortKey) =>
    sortKey === key ? (sortAsc ? " ▴" : " ▾") : "";

  if (rows.length === 0) {
    return (
      <div className="text-sm text-[var(--color-text-muted)] text-center py-8">
        No patch panels in this schematic.
      </div>
    );
  }

  const groups: { label: string; rows: PatchPanelScheduleRow[] }[] = [];
  if (groupByKey) {
    const map = new Map<string, PatchPanelScheduleRow[]>();
    for (const r of sorted) {
      const k = groupByKey === "signalType"
        ? (r.signalType || "Unconnected")
        : (r[groupByKey] || "—");
      const arr = map.get(k);
      if (arr) arr.push(r); else map.set(k, [r]);
    }
    for (const [label, list] of map) groups.push({ label, rows: list });
  } else {
    groups.push({ label: "", rows: sorted });
  }

  // Occupancy summary: unique panels × (connected / total ports).
  const perPanel = new Map<string, { connected: number; total: number; label: string }>();
  for (const r of rows) {
    const key = `${r.panelId}`;
    const entry = perPanel.get(key) ?? { connected: 0, total: 0, label: r.panel };
    entry.total += 1;
    if (r.edgeId) entry.connected += 1;
    perPanel.set(key, entry);
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          className="flex-1 min-w-[240px] bg-[var(--color-surface)] border border-[var(--ui-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
          placeholder="Filter by panel, port, device, cable, signal, room..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <select
          className="bg-[var(--color-surface)] border border-[var(--ui-border)] rounded px-2 py-1 text-xs outline-none cursor-pointer"
          value={groupByKey}
          onChange={(e) => setGroupByKey(e.target.value as PatchPanelGroupBy)}
          title="Group by"
        >
          <option value="">No Grouping</option>
          <option value="panel">Panel</option>
          <option value="panelRoom">Panel Room</option>
          <option value="signalType">Signal Type</option>
          <option value="face">Face</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideUnconnected}
            onChange={(e) => setHideUnconnected(e.target.checked)}
            className="cursor-pointer"
          />
          Hide empty
        </label>
      </div>

      {/* Occupancy summary */}
      <div className="flex gap-2 flex-wrap mb-3">
        {Array.from(perPanel.values()).map((p) => {
          const pct = p.total > 0 ? Math.round((p.connected / p.total) * 100) : 0;
          return (
            <div
              key={p.label}
              className="bg-[var(--color-surface)] border border-[var(--ui-border)] rounded px-2 py-1 text-[10px]"
              title={`${p.connected} of ${p.total} ports used`}
            >
              <span className="font-semibold text-[var(--color-text-heading)]">{p.label}</span>
              <span className="text-[var(--color-text-muted)] ml-1.5">
                {p.connected}/{p.total} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={thClass} onClick={() => toggleSort("panel")}>Panel{sortArrow("panel")}</th>
            <th className={thClass} onClick={() => toggleSort("panelRoom")}>Panel Room{sortArrow("panelRoom")}</th>
            <th className={thClass} onClick={() => toggleSort("face")}>Face{sortArrow("face")}</th>
            <th className={thClass} onClick={() => toggleSort("position")}>Position{sortArrow("position")}</th>
            <th className={thClass} onClick={() => toggleSort("signalType")}>Signal{sortArrow("signalType")}</th>
            {/* Legacy (non-passthrough) columns */}
            <th className={thClass} onClick={() => toggleSort("connector")}>Connector{sortArrow("connector")}</th>
            <th className={thClass} onClick={() => toggleSort("gender")}>M/F{sortArrow("gender")}</th>
            <th className={thClass} onClick={() => toggleSort("remoteDevice")}>Remote Device{sortArrow("remoteDevice")}</th>
            <th className={thClass} onClick={() => toggleSort("remotePort")}>Remote Port{sortArrow("remotePort")}</th>
            <th className={thClass} onClick={() => toggleSort("remoteRoom")}>Remote Room{sortArrow("remoteRoom")}</th>
            <th className={thClass} onClick={() => toggleSort("cableId")}>Cable ID{sortArrow("cableId")}</th>
            <th className={thClass} onClick={() => toggleSort("cableType")}>Cable Type{sortArrow("cableType")}</th>
            <th className={thClass} onClick={() => toggleSort("cableLength")}>Length{sortArrow("cableLength")}</th>
            <th className={thClass} onClick={() => toggleSort("computedLength")} title="Estimated length from room-to-room distance + slack">Est. Length{sortArrow("computedLength")}</th>
            <th className={thClass} onClick={() => toggleSort("multicableLabel")}>Snake{sortArrow("multicableLabel")}</th>
            {/* Passthrough-only columns */}
            <th className={thClass} onClick={() => toggleSort("rearConnector")}>Rear Connector{sortArrow("rearConnector")}</th>
            <th className={thClass} onClick={() => toggleSort("rearGender")}>Rear M/F{sortArrow("rearGender")}</th>
            <th className={thClass} onClick={() => toggleSort("rearRemoteDevice")}>Rear Remote Device{sortArrow("rearRemoteDevice")}</th>
            <th className={thClass} onClick={() => toggleSort("rearRemotePort")}>Rear Remote Port{sortArrow("rearRemotePort")}</th>
            <th className={thClass} title="Room of the rear-face remote device">Rear Remote Room</th>
            <th className={thClass} onClick={() => toggleSort("rearCableId")}>Rear Cable ID{sortArrow("rearCableId")}</th>
            <th className={thClass} onClick={() => toggleSort("rearCableType")}>Rear Cable Type{sortArrow("rearCableType")}</th>
            <th className={thClass} onClick={() => toggleSort("rearCableLength")}>Rear Length{sortArrow("rearCableLength")}</th>
            <th className={thClass} title="Estimated length from room-to-room distance + slack">Rear Est. Length</th>
            <th className={thClass} onClick={() => toggleSort("frontConnector")}>Front Connector{sortArrow("frontConnector")}</th>
            <th className={thClass} onClick={() => toggleSort("frontGender")}>Front M/F{sortArrow("frontGender")}</th>
            <th className={thClass} onClick={() => toggleSort("frontRemoteDevice")}>Front Remote Device{sortArrow("frontRemoteDevice")}</th>
            <th className={thClass} onClick={() => toggleSort("frontRemotePort")}>Front Remote Port{sortArrow("frontRemotePort")}</th>
            <th className={thClass} title="Room of the front-face remote device">Front Remote Room</th>
            <th className={thClass} onClick={() => toggleSort("frontCableId")}>Front Cable ID{sortArrow("frontCableId")}</th>
            <th className={thClass} onClick={() => toggleSort("frontCableType")}>Front Cable Type{sortArrow("frontCableType")}</th>
            <th className={thClass} onClick={() => toggleSort("frontCableLength")}>Front Length{sortArrow("frontCableLength")}</th>
            <th className={thClass} title="Estimated length from room-to-room distance + slack">Front Est. Length</th>
            <th className={thClass} onClick={() => toggleSort("normalling")}>Normalling{sortArrow("normalling")}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => (
            <React.Fragment key={g.label || `__g${gi}`}>
              {g.label && (
                <tr>
                  <td
                    colSpan={34}
                    className="bg-[var(--color-surface)] text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] py-1 px-2"
                  >
                    {g.label}
                  </td>
                </tr>
              )}
              {g.rows.map((r, i) => {
                const unconnected = r.edgeId === "";
                return (
                  <tr
                    key={r.rowId}
                    className={`${rowClass(i)} ${unconnected ? "opacity-60" : ""}`}
                  >
                    <td className={tdClass}>{r.panel}</td>
                    <td className={tdClass}>{r.panelRoom}</td>
                    <td className={tdClass}>{r.face}</td>
                    <td className={tdClass}>{r.position}</td>
                    <td className={tdClass}>{r.signalType || "—"}</td>
                    {/* Legacy columns */}
                    <td className={tdClass}>{r.connector}</td>
                    <td className={tdClass}>{r.gender}</td>
                    <td className={tdClass}>{r.remoteDevice}</td>
                    <td className={tdClass}>{r.remotePort}</td>
                    <td className={tdClass}>{r.remoteRoom}</td>
                    <td className={tdClass}>{r.cableId || "—"}</td>
                    <td className={tdClass}>{r.cableType || "—"}</td>
                    <td className={tdClass}>{r.cableLength || "—"}</td>
                    <td className={`${tdClass} text-[var(--color-text-muted)]`}>{r.computedLength || "—"}</td>
                    <td className={tdClass}>{r.multicableLabel || "—"}</td>
                    {/* Passthrough columns */}
                    <td className={tdClass}>{r.rearConnector || "—"}</td>
                    <td className={tdClass}>{r.rearGender || "—"}</td>
                    <td className={tdClass}>{r.rearRemoteDevice || "—"}</td>
                    <td className={tdClass}>{r.rearRemotePort || "—"}</td>
                    <td className={tdClass}>{r.rearRemoteRoom || "—"}</td>
                    <td className={tdClass}>{r.rearCableId || "—"}</td>
                    <td className={tdClass}>{r.rearCableType || "—"}</td>
                    <td className={tdClass}>{r.rearCableLength || "—"}</td>
                    <td className={`${tdClass} text-[var(--color-text-muted)]`}>{r.rearComputedLength || "—"}</td>
                    <td className={tdClass}>{r.frontConnector || "—"}</td>
                    <td className={tdClass}>{r.frontGender || "—"}</td>
                    <td className={tdClass}>{r.frontRemoteDevice || "—"}</td>
                    <td className={tdClass}>{r.frontRemotePort || "—"}</td>
                    <td className={tdClass}>{r.frontRemoteRoom || "—"}</td>
                    <td className={tdClass}>{r.frontCableId || "—"}</td>
                    <td className={tdClass}>{r.frontCableType || "—"}</td>
                    <td className={tdClass}>{r.frontCableLength || "—"}</td>
                    <td className={`${tdClass} text-[var(--color-text-muted)]`}>{r.frontComputedLength || "—"}</td>
                    <td className={tdClass}>{r.normalling || "—"}</td>
                  </tr>
                );
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ─── Pack List Tab (inline, reusing packList.ts logic) ─────────

function PackListTabInline() {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);

  type SubTab = "devices" | "cables" | "accessories" | "racks";
  const [subTab, setSubTab] = useState<SubTab>("devices");
  const [groupDevicesByRoom, setGroupDevicesByRoom] = useState(false);
  type CableGrouping = "" | "path" | "category";
  const [cableGrouping, setCableGrouping] = useState<CableGrouping>("category");

  const cableCosts = useSchematicStore((s) => s.cableCosts);
  const setCableCost = useSchematicStore((s) => s.setCableCost);
  const currency = useSchematicStore((s) => s.currency);

  const pages = useSchematicStore((s) => s.pages);
  const data = useMemo(() => computePackList(nodes, edges, pages), [nodes, edges, pages]);
  const docSummary = useMemo(() => computeDocumentSummary(nodes, edges, pages), [nodes, edges, pages]);

  const totalCost = useMemo(() => {
    let sum = 0;
    for (const d of data.devices) {
      sum += (d.unitCost ?? 0) * d.count;
      for (const c of d.cards) sum += (c.cardUnitCost ?? 0) * c.count;
    }
    // Include cable costs
    for (const s of data.summary) {
      const uc = cableCosts?.[cableCostKey(s.cableType, s.signalType, s.cableLength)] ?? 0;
      sum += uc * s.count;
    }
    // Include rack enclosure costs (#P2-024)
    for (const r of data.racks) sum += (r.unitCost ?? 0) * r.count;
    return sum;
  }, [data, cableCosts]);

  const subTabClass = (t: SubTab) =>
    `px-2 py-1 text-[10px] rounded cursor-pointer transition-colors ${
      subTab === t
        ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-semibold"
        : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
    }`;

  const plThClass =
    "text-left text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide py-1.5 px-2 border-b border-[var(--ui-border)]";

  return (
    <>
      <p className="mb-2 text-[11px] text-[var(--color-text-muted)] italic" title="Auto-generated document summary (#P3-019)">
        {docSummary}
      </p>
      <div className="flex items-center gap-2 mb-3">
        <button className={subTabClass("devices")} onClick={() => setSubTab("devices")}>
          Devices
        </button>
        <button className={subTabClass("cables")} onClick={() => setSubTab("cables")}>
          Cables
        </button>
        {data.accessories.length > 0 && (
          <button className={subTabClass("accessories")} onClick={() => setSubTab("accessories")}>
            Accessories
          </button>
        )}
        {data.racks.length > 0 && (
          <button className={subTabClass("racks")} onClick={() => setSubTab("racks")}>
            Racks
          </button>
        )}
        <div className="flex-1" />
        {subTab === "devices" && (
          <label className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={groupDevicesByRoom}
              onChange={(e) => setGroupDevicesByRoom(e.target.checked)}
              style={{ accentColor: "var(--color-accent)" }}
            />
            Group by Room
          </label>
        )}
        {subTab === "cables" && (
          <label className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)] select-none">
            Group by
            <select
              value={cableGrouping}
              onChange={(e) => setCableGrouping(e.target.value as CableGrouping)}
              className="bg-[var(--color-surface)] border border-[var(--ui-border)] rounded px-1.5 py-0.5 text-[10px] text-[var(--color-text)] outline-none cursor-pointer"
            >
              <option value="">None</option>
              <option value="path">Path</option>
              <option value="category">Category</option>
            </select>
          </label>
        )}
      </div>

      {totalCost > 0 && (
        <div className="mb-3 bg-[var(--color-surface)] border border-[var(--ui-border)] rounded px-3 py-2 inline-block">
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">Project Total</div>
          <div className="text-sm font-semibold text-[var(--color-text-heading)]">
            ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      )}

      {subTab === "devices" && (
        <>
          {data.devices.length === 0 ? (
            <div className="text-sm text-[var(--color-text-muted)] text-center py-8">
              No devices in this schematic.
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={plThClass}>Qty</th>
                  <th className={plThClass}>Device</th>
                  <th className={plThClass}>Type</th>
                  <th className={plThClass}>Unit Cost</th>
                  <th className={plThClass}>Ext. Cost</th>
                </tr>
              </thead>
              <tbody>
                {(groupDevicesByRoom
                  ? renderGroupedDevices(data.devices, currency)
                  : renderDeviceRows(mergeDevicesByModel(data.devices), "", currency)
                )}
              </tbody>
            </table>
          )}
        </>
      )}

      {subTab === "cables" && (
        <>
          {data.summary.length === 0 && data.adapters.length === 0 ? (
            <div className="text-sm text-[var(--color-text-muted)] text-center py-8">
              No connections in this schematic.
            </div>
          ) : (
            <>
              {(() => {
                const showPath = cableGrouping === "path";
                const cableRows = showPath ? data.summary : mergeCablesByType(data.summary);
                const renderRow = (s: PackListSummaryRow, i: number) => {
                  const key = cableCostKey(s.cableType, s.signalType, s.cableLength);
                  const uc = cableCosts?.[key] ?? 0;
                  const ext = uc > 0 ? uc * s.count : 0;
                  return (
                    <tr key={i} className={rowClass(i)}>
                      <td className={tdClass}>{s.count}&times;</td>
                      <td className={tdClass}>{s.cableType}</td>
                      <td className={tdClass}>{s.signalType}</td>
                      <td className={tdClass}>{s.cableLength}</td>
                      {showPath && <td className={tdClass}>{s.route}</td>}
                      <td className={`${tdClass} p-0.5`}>
                        <CableCostCell costKey={key} value={uc} onChange={setCableCost} currency={currency} />
                      </td>
                      <td className={tdClass}>{ext > 0 ? formatCurrency(ext, currency) : "—"}</td>
                    </tr>
                  );
                };

                const categories = cableGrouping === "category" ? groupCablesByCategory(cableRows) : null;
                let rowIdx = 0;

                return (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={plThClass}>Qty</th>
                        <th className={plThClass}>Cable Type</th>
                        <th className={plThClass}>Signal</th>
                        <th className={plThClass}>Length</th>
                        {showPath && <th className={plThClass}>Route</th>}
                        <th className={plThClass}>Unit Cost</th>
                        <th className={plThClass}>Ext. Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories
                        ? categories.map((group) => {
                            const rows = group.rows.map((s) => renderRow(s, rowIdx++));
                            return categories.length > 1 ? (
                              <React.Fragment key={group.category}>
                                <tr>
                                  <td
                                    colSpan={99}
                                    className="pt-3 pb-1 px-2 text-xs font-semibold text-[var(--color-text-heading)] border-b border-[var(--ui-border)]"
                                  >
                                    {group.category} ({group.total} cable{group.total !== 1 ? "s" : ""})
                                  </td>
                                </tr>
                                {rows}
                              </React.Fragment>
                            ) : rows;
                          })
                        : cableRows.map((s, i) => renderRow(s, i))
                      }
                      {data.adapters.length > 0 && (
                        <>
                          <tr>
                            <td
                              colSpan={99}
                              className="pt-3 pb-1 px-2 text-xs font-semibold text-[var(--color-text-heading)] border-b border-[var(--ui-border)]"
                            >
                              Adapters ({data.adapters.reduce((sum, a) => sum + a.count, 0)})
                            </td>
                          </tr>
                          {data.adapters.map((a, i) => (
                            <tr key={`adapter-${i}`} className={rowClass(i)}>
                              <td className={tdClass}>{a.count}&times;</td>
                              <td className={tdClass}>{a.model}</td>
                              <td className={tdClass}></td>
                              <td className={tdClass}></td>
                              {showPath && <td className={tdClass}></td>}
                            </tr>
                          ))}
                        </>
                      )}
                    </tbody>
                  </table>
                );
              })()}
            </>
          )}
        </>
      )}

      {subTab === "accessories" && (
        <>
          {data.accessories.length === 0 ? (
            <div className="text-sm text-[var(--color-text-muted)] text-center py-8">
              No cable accessories in this schematic.
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={plThClass}>Qty</th>
                  <th className={plThClass}>Accessory</th>
                  <th className={plThClass}>Type</th>
                  <th className={plThClass}>Room</th>
                </tr>
              </thead>
              <tbody>
                {data.accessories.map((a, i) => (
                  <tr key={i} className={rowClass(i)}>
                    <td className={tdClass}>{a.count}&times;</td>
                    <td className={tdClass}>{a.model}</td>
                    <td className={tdClass}>{a.accessoryType}</td>
                    <td className={tdClass}>{a.room}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {subTab === "racks" && (
        <>
          {data.racks.length === 0 ? (
            <div className="text-sm text-[var(--color-text-muted)] text-center py-8">
              No racks in this project.
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={plThClass}>Qty</th>
                  <th className={plThClass}>Rack</th>
                  <th className={plThClass}>Type</th>
                  <th className={plThClass}>Height</th>
                  <th className={plThClass}>Room</th>
                  <th className={plThClass}>Unit Cost</th>
                  <th className={plThClass}>Ext. Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.racks.map((r, i) => {
                  const ext = r.unitCost > 0 ? r.unitCost * r.count : 0;
                  return (
                    <tr key={i} className={rowClass(i)}>
                      <td className={tdClass}>{r.count}&times;</td>
                      <td className={tdClass}>{r.label}</td>
                      <td className={tdClass}>{r.rackType}</td>
                      <td className={tdClass}>{r.heightU}U</td>
                      <td className={tdClass}>{r.room}</td>
                      <td className={tdClass}>{r.unitCost > 0 ? formatCurrency(r.unitCost, currency) : "—"}</td>
                      <td className={tdClass}>{ext > 0 ? formatCurrency(ext, currency) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}

function renderDeviceRows(devices: PackListDevice[], keyPrefix = "", currency = "USD") {
  const elements: React.ReactNode[] = [];
  let idx = 0;
  for (const d of devices) {
    const extCost = d.unitCost > 0 ? d.unitCost * d.count : 0;
    elements.push(
      <tr key={`${keyPrefix}${idx}`} className={rowClass(idx)}>
        <td className={tdClass}>{d.count}&times;</td>
        <td className={tdClass}>{d.model}</td>
        <td className={tdClass}>{d.deviceType}</td>
        <td className={tdClass}>{d.unitCost > 0 ? formatCurrency(d.unitCost, currency) : "—"}</td>
        <td className={tdClass}>{extCost > 0 ? formatCurrency(extCost, currency) : "—"}</td>
      </tr>,
    );
    idx++;
    for (let ci = 0; ci < d.cards.length; ci++) {
      const c = d.cards[ci];
      const cardExt = c.cardUnitCost > 0 ? c.cardUnitCost * c.count : 0;
      elements.push(
        <tr key={`${keyPrefix}${idx}-c${ci}`} className="bg-[var(--color-surface)]">
          <td className={`${tdClass} pl-6 text-[var(--color-text-muted)]`}>{c.count}&times;</td>
          <td className={`${tdClass} text-[var(--color-text-muted)]`}>
            <span className="pl-3">{c.cardLabel}</span>
          </td>
          <td className={tdClass} />
          <td className={`${tdClass} text-[var(--color-text-muted)]`}>{c.cardUnitCost > 0 ? formatCurrency(c.cardUnitCost, currency) : ""}</td>
          <td className={`${tdClass} text-[var(--color-text-muted)]`}>{cardExt > 0 ? formatCurrency(cardExt, currency) : ""}</td>
        </tr>,
      );
    }
  }
  return elements;
}

function renderGroupedDevices(devices: PackListDevice[], currency = "USD") {
  const groups = new Map<string, PackListDevice[]>();
  for (const d of devices) {
    const arr = groups.get(d.room);
    if (arr) arr.push(d);
    else groups.set(d.room, [d]);
  }

  const elements: React.ReactNode[] = [];
  for (const [room, rows] of groups) {
    elements.push(
      <tr key={`h-${room}`}>
        <td
          colSpan={99}
          className="pt-3 pb-1 px-2 text-xs font-semibold text-[var(--color-text-heading)] border-b border-[var(--ui-border)]"
        >
          {room}
        </td>
      </tr>,
    );
    elements.push(...renderDeviceRows(rows, `${room}-`, currency));
  }
  return elements;
}

// ─── CSV export helpers ────────────────────────────────────────

function exportNetworkCsv(nodes: SchematicNode[], edges: import("../types").ConnectionEdge[], schematicName: string) {
  const rows = computeNetworkReport(nodes, edges);
  const header = ["Device", "Port", "Room", "Signal", "Hostname", "IP", "Subnet Mask", "Gateway", "VLAN", "Speed", "PoE (W)", "DHCP", "DHCP Server", "Notes"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        csvEscape(r.deviceLabel),
        csvEscape(r.portLabel),
        csvEscape(r.room),
        csvEscape(r.signalType),
        csvEscape(r.hostname),
        r.ip,
        r.subnetMask,
        r.gateway,
        r.vlan,
        r.linkSpeed,
        r.poeDrawW,
        r.dhcp ? "Yes" : "No",
        csvEscape(r.dhcpServerLabel),
        csvEscape(r.notes),
      ].join(","),
    ),
  ];
  downloadCsv(lines.join("\n"), `${schematicName} - Network Report.csv`);
}

function exportDevicesCsv(nodes: SchematicNode[], ownedGear: OwnedGearItem[], schematicName: string) {
  const showInventoryColumns = useSchematicStore.getState().showOwnedGearPane || ownedGear.length > 0;
  const rows = computeDeviceReport(nodes, ownedGear);
  // Group identical devices (same model, manufacturer, type, room) for quantity column
  const grouped = new Map<string, { row: DeviceReportRow; count: number; owned: number; need: number }>();
  for (const r of rows) {
    const key = `${r.model}|${r.manufacturer}|${r.deviceType}|${r.room}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count++;
    } else {
      grouped.set(key, { row: r, count: 1, owned: r.ownedCount, need: r.neededCount });
    }
  }
  const header = showInventoryColumns
    ? ["Qty", "Device", "Manufacturer", "Model #", "Type", "Room", "Ports", "Owned", "Need", "Unit Cost", "Extended Cost"]
    : ["Qty", "Device", "Manufacturer", "Model #", "Type", "Room", "Ports", "Unit Cost", "Extended Cost"];
  const groupedValues = [...grouped.values()];
  const lines = [
    header.join(","),
    ...groupedValues.map(({ row: r, count, owned, need }) => {
      const extCost = r.unitCost > 0 ? r.unitCost * count : 0;
      const cells = [
        count,
        csvEscape(r.model),
        csvEscape(r.manufacturer),
        csvEscape(r.modelNumber),
        csvEscape(r.deviceType),
        csvEscape(r.room),
        r.portCount,
        r.unitCost > 0 ? r.unitCost.toFixed(2) : "",
        extCost > 0 ? extCost.toFixed(2) : "",
      ];
      if (showInventoryColumns) cells.splice(7, 0, owned, need);
      return cells.join(",");
    }),
  ];
  const totalCost = groupedValues.reduce(
    (sum, { row, count }) => sum + (row.unitCost > 0 ? row.unitCost * count : 0), 0,
  );
  if (totalCost > 0) {
    lines.push(
      (showInventoryColumns
        ? ["", "", "", "", "", "", "", "", "", "TOTAL", totalCost.toFixed(2)]
        : ["", "", "", "", "", "", "", "TOTAL", totalCost.toFixed(2)]
      ).join(","),
    );
  }
  downloadCsv(lines.join("\n"), `${schematicName} - Device List.csv`);
}

// ─── Power Report Tab ─────────────────────────────────────────

function PowerReportTab() {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);

  const report = useMemo(() => computePowerReport(nodes, edges), [nodes, edges]);

  if (report.devices.length === 0) {
    return (
      <div className="text-sm text-[var(--color-text-muted)] text-center py-8">
        No devices with power data in this schematic.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex gap-4 text-xs">
        <div className="bg-[var(--color-surface)] border border-[var(--ui-border)] rounded px-3 py-2">
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">Total Power</div>
          <div className="text-sm font-semibold text-[var(--color-text-heading)]">{report.totalPowerW.toLocaleString()}W</div>
          <div className="text-[10px] text-[var(--color-text-muted)]">
            {(report.totalPowerW / 120).toFixed(1)}A @120V &middot; {(report.totalPowerW / 208).toFixed(1)}A @208V
          </div>
        </div>
        {report.totalThermalBtuh > 0 && (
          <div
            className="bg-[var(--color-surface)] border border-[var(--ui-border)] rounded px-3 py-2"
            title="Thermal load for HVAC sizing. Auto-derived from power draw (× 3.412) where not explicitly entered."
          >
            <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">Total Thermal</div>
            <div className="text-sm font-semibold text-[var(--color-text-heading)]">{report.totalThermalBtuh.toLocaleString()} BTU/h</div>
            <div className="text-[10px] text-[var(--color-text-muted)]">
              ≈ {(report.totalThermalBtuh / 12000).toFixed(1)} ton AC
            </div>
          </div>
        )}
        {report.unconnectedPowerW > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2">
            <div className="text-[10px] text-amber-600 uppercase tracking-wide">Unconnected</div>
            <div className="text-sm font-semibold text-amber-700">{report.unconnectedPowerW.toLocaleString()}W</div>
            <div className="text-[10px] text-amber-600">Not wired to any distro</div>
          </div>
        )}
      </div>

      {/* Distribution Loading */}
      {report.distros.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
            Distribution Loading
          </div>
          <table className="w-full border-collapse border border-[var(--ui-border)] rounded overflow-hidden">
            <thead>
              <tr>
                <th className={thClass}>Distro</th>
                <th className={thClass}>Room</th>
                <th className={thClass}>Capacity (W)</th>
                <th className={thClass}>Load (W)</th>
                <th className={thClass}>Load %</th>
                <th className={thClass}>Status</th>
              </tr>
            </thead>
            <tbody>
              {report.distros.map((d, i) => (
                <tr key={d.nodeId} className={rowClass(i)}>
                  <td className={tdClass}>{d.label}</td>
                  <td className={tdClass}>{d.room}</td>
                  <td className={tdClass}>{d.capacityW.toLocaleString()}</td>
                  <td className={tdClass}>{d.loadW.toLocaleString()}</td>
                  <td className={tdClass}>{d.loadPercent}%</td>
                  <td className={tdClass}>
                    <span className={
                      d.status === "Overloaded" ? "text-red-600 font-semibold" :
                      d.status === "Warning" ? "text-amber-600 font-semibold" :
                      "text-green-600"
                    }>
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Device Power Draw */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
          Device Power Draw
        </div>
        <table className="w-full border-collapse border border-[var(--ui-border)] rounded overflow-hidden">
          <thead>
            <tr>
              <th className={thClass}>Qty</th>
              <th className={thClass}>Device</th>
              <th className={thClass}>Type</th>
              <th className={thClass}>Room</th>
              <th className={thClass}>Power (W)</th>
              <th className={thClass}>Total (W)</th>
              <th className={thClass}>Thermal (BTU/h)</th>
              <th className={thClass}>Total (BTU/h)</th>
              <th className={thClass}>Voltage</th>
            </tr>
          </thead>
          <tbody>
            {report.devices.map((d, i) => {
              const thermalTitle = d.thermalDerived ? "Auto-derived from power draw (× 3.412)" : undefined;
              const thermalCls = d.thermalDerived ? `${tdClass} italic text-[var(--color-text-muted)]` : tdClass;
              return (
                <tr key={`${d.model}-${d.room}-${i}`} className={rowClass(i)}>
                  <td className={tdClass}>{d.count}x</td>
                  <td className={tdClass}>{d.model}</td>
                  <td className={tdClass}>{d.deviceType}</td>
                  <td className={tdClass}>{d.room}</td>
                  <td className={tdClass}>{d.powerDrawW > 0 ? d.powerDrawW.toLocaleString() : "—"}</td>
                  <td className={tdClass}>{d.powerDrawW > 0 ? (d.powerDrawW * d.count).toLocaleString() : "—"}</td>
                  <td className={thermalCls} title={thermalTitle}>
                    {d.thermalBtuh > 0 ? `${d.thermalDerived ? "~" : ""}${d.thermalBtuh.toLocaleString()}` : "—"}
                  </td>
                  <td className={thermalCls} title={thermalTitle}>
                    {d.thermalBtuh > 0 ? `${d.thermalDerived ? "~" : ""}${(d.thermalBtuh * d.count).toLocaleString()}` : "—"}
                  </td>
                  <td className={tdClass}>{d.voltage || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Inline-editable cost cell for cable rows */
const CableCostCell = memo(function CableCostCell({
  costKey,
  value,
  onChange,
  currency = "USD",
}: {
  costKey: string;
  value: number;
  onChange: (key: string, cost: number | undefined) => void;
  currency?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const commit = () => {
    const parsed = parseFloat(editValue);
    onChange(costKey, isNaN(parsed) || parsed <= 0 ? undefined : parsed);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        className="w-full bg-[var(--color-surface)] border border-[var(--color-accent)] rounded px-1 py-0.5 text-xs outline-none"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          else if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
        }}
        autoFocus
        type="number"
        step={0.01}
        min={0}
      />
    );
  }

  return (
    <span
      className="text-[10px] px-1 cursor-cell select-none block"
      onDoubleClick={() => { setEditValue(value > 0 ? value.toFixed(2) : ""); setEditing(true); }}
    >
      {value > 0 ? formatCurrency(value, currency) : "—"}
    </span>
  );
});

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Report dashboard view-models. Pure functions that turn the real computed
 * schematic reports (power / thermal / network) into the KPI-card / bar-chart /
 * breakdown / detail-table shapes the Reports dashboard renders.
 *
 * Every value here traces to data the app already computes from the schematic:
 *   - power draw, per-device watts, distro capacity/load → src/powerReport.ts
 *   - thermal BTU/h (real, or derived as watts × 3.412)   → src/thermal.ts
 *   - addressable network ports, PoE budget, DHCP servers → src/networkReport.ts
 *
 * A few headline metrics the comp shows are not stored on the model; those are
 * DERIVED with a simple, clearly-commented formula (peak inrush, tons of AC,
 * Dante bandwidth). None are invented constants — they are functions of real data.
 */
import type { PowerReportData } from "./powerReport";
import type {
  NetworkReportRow,
  PoeBudgetRow,
  DhcpServerSummaryRow,
} from "./networkReport";
import { SIGNAL_FAMILY_COLORS } from "./signalFamilies";

// ─── Derivation constants (documented, all functions of real data) ───────────

/**
 * Peak/inrush headroom factor. AV amps and motorised gear momentarily draw above
 * their steady-state rating at power-on; 1.25× steady-state is the conventional
 * sizing allowance. Applied only to derive the "Peak load" KPI from real draw.
 */
const PEAK_INRUSH_FACTOR = 1.25;
/** 12,000 BTU/h = 1 ton of air-conditioning (standard HVAC conversion). */
const BTUH_PER_TON = 12000;
/**
 * Approx. Dante/AES67 audio bandwidth per uncompressed flow on a 1 Gb link
 * (48 kHz / 24-bit ≈ 1.15 Mbps/channel; a typical multichannel flow ≈ 6 Mbps).
 * Used only to derive a bandwidth estimate from the real flow count.
 */
const MBPS_PER_AUDIO_FLOW = 6;
/** Capacity of a single 1 Gb (1000 Mbps) network link, for the bandwidth headroom KPI. */
const GIGABIT_LINK_MBPS = 1000;
/** Max bars to show in a chart before truncating to the largest contributors. */
const MAX_CHART_BARS = 8;

export type ReportStatus = "ok" | "watch" | "over";

export interface KpiCard {
  label: string;
  value: string;
  unit?: string;
  note: string;
  /** When set, marks the card as the accent-coloured emphasis card (comp's 4th). */
  accent?: boolean;
  /** Status tint for the note dot/text (only the 1st card uses it in the comp). */
  status?: ReportStatus;
}

export interface ChartBar {
  name: string;
  /** Numeric value used to scale bar height; the display label is `valueLabel`. */
  value: number;
  valueLabel: string;
  color: string;
}

export interface BreakdownItem {
  name: string;
  valueLabel: string;
  /** 0–100 fill percentage for the progress bar. */
  pct: number;
  color: string;
}

export interface DetailRow {
  device: string;
  location: string;
  v3: string;
  v4: string;
  status: ReportStatus;
  statusLabel: string;
}

export interface ReportDashboard {
  kpis: KpiCard[];
  chartTitle: string;
  chartUnit: string;
  bars: ChartBar[];
  breakdownTitle: string;
  breakdown: BreakdownItem[];
  tableTitle: string;
  col3: string;
  col4: string;
  rows: DetailRow[];
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

/** Cycle through family hues so breakdown/bar rows stay visually distinct. */
const PALETTE: readonly string[] = [
  SIGNAL_FAMILY_COLORS.audio,
  SIGNAL_FAMILY_COLORS.video,
  SIGNAL_FAMILY_COLORS.control,
  SIGNAL_FAMILY_COLORS.network,
  SIGNAL_FAMILY_COLORS.speaker,
  SIGNAL_FAMILY_COLORS.rf,
  SIGNAL_FAMILY_COLORS.power,
  SIGNAL_FAMILY_COLORS.other,
];
function paletteColor(i: number): string {
  return PALETTE[i % PALETTE.length];
}

/** Take the N largest entries by `weight`, preserving real values. */
function topN<T>(items: T[], weight: (t: T) => number, n: number): T[] {
  return [...items].sort((a, b) => weight(b) - weight(a)).slice(0, n);
}

// ─── Power dashboard ─────────────────────────────────────────────────────────

export function buildPowerDashboard(data: PowerReportData): ReportDashboard {
  const totalW = data.totalPowerW;
  // DERIVED: steady-state draw × inrush allowance (real total × 1.25).
  const peakW = Math.round(totalW * PEAK_INRUSH_FACTOR);
  const circuits = data.distros.length;

  // Headroom from real distro capacity vs. real load, where distros exist.
  const totalCapacityW = data.distros.reduce((s, d) => s + d.capacityW, 0);
  const totalLoadW = data.distros.reduce((s, d) => s + d.loadW, 0);
  const headroomPct =
    totalCapacityW > 0 ? Math.round(((totalCapacityW - totalLoadW) / totalCapacityW) * 100) : null;

  const worstDistroPct = data.distros.reduce((m, d) => Math.max(m, d.loadPercent), 0);
  const headStatus: ReportStatus =
    worstDistroPct > 100 ? "over" : worstDistroPct > 80 ? "watch" : "ok";

  const kpis: KpiCard[] = [
    {
      label: "Total draw",
      value: totalW.toLocaleString(),
      unit: "W",
      note:
        circuits > 0
          ? `${(totalW / 120).toFixed(1)} A @120V · ${(totalW / 208).toFixed(1)} A @208V`
          : "No distros wired",
      status: headStatus,
    },
    {
      label: "Peak load",
      value: peakW.toLocaleString(),
      unit: "W",
      note: "Est. inrush at startup (×1.25)",
    },
    {
      label: "Circuits",
      value: String(circuits),
      unit: circuits === 1 ? "distro" : "distros",
      note:
        circuits > 0
          ? `${totalLoadW.toLocaleString()} W load wired`
          : "Add a power distro to size circuits",
    },
    {
      label: "Headroom",
      value: headroomPct != null ? String(headroomPct) : "—",
      unit: headroomPct != null ? "%" : "",
      note: headroomPct != null ? "Distro budget remaining" : "No distro capacity set",
      accent: true,
    },
  ];

  // Bars: per-device total draw (count × per-unit), largest first.
  const drawDevices = data.devices.filter((d) => d.powerDrawW > 0);
  const bars: ChartBar[] = topN(drawDevices, (d) => d.powerDrawW * d.count, MAX_CHART_BARS).map(
    (d, i) => {
      const w = d.powerDrawW * d.count;
      return {
        name: d.count > 1 ? `${d.model} ×${d.count}` : d.model,
        value: w,
        valueLabel: `${w.toLocaleString()}`,
        color: paletteColor(i),
      };
    },
  );

  // Breakdown: draw grouped by device type, as a share of total.
  const byType = new Map<string, number>();
  for (const d of drawDevices) {
    byType.set(d.deviceType, (byType.get(d.deviceType) ?? 0) + d.powerDrawW * d.count);
  }
  const breakdown: BreakdownItem[] = topN([...byType.entries()], (e) => e[1], 6).map(
    ([type, w], i) => ({
      name: type,
      valueLabel: `${w.toLocaleString()} W`,
      pct: pct(w, totalW),
      color: paletteColor(i),
    }),
  );

  // Detail table: per-device draw with a status from the device's distro load.
  const distroByNode = new Map(data.distros.map((d) => [d.nodeId, d]));
  const rows: DetailRow[] = drawDevices.map((d) => {
    const distro = distroByNode.get(d.nodeId);
    const status: ReportStatus = distro
      ? distro.status === "Overloaded"
        ? "over"
        : distro.status === "Warning"
          ? "watch"
          : "ok"
      : "ok";
    return {
      device: d.count > 1 ? `${d.model} ×${d.count}` : d.model,
      location: d.room,
      v3: `${(d.powerDrawW * d.count).toLocaleString()} W`,
      v4: d.voltage || "—",
      status,
      statusLabel: status === "over" ? "Over" : status === "watch" ? "Watch" : "OK",
    };
  });

  return {
    kpis,
    chartTitle: "Power draw by device",
    chartUnit: "Watts",
    bars,
    breakdownTitle: "Draw by category",
    breakdown,
    tableTitle: "Per-device power",
    col3: "Draw",
    col4: "Voltage",
    rows,
  };
}

// ─── Thermal dashboard ───────────────────────────────────────────────────────

export function buildThermalDashboard(data: PowerReportData): ReportDashboard {
  const totalBtuh = data.totalThermalBtuh;
  const tonsAc = totalBtuh / BTUH_PER_TON;
  const thermalDevices = data.devices.filter((d) => d.thermalBtuh > 0);
  const derivedCount = thermalDevices.filter((d) => d.thermalDerived).length;

  const kpis: KpiCard[] = [
    {
      label: "Heat output",
      value: totalBtuh.toLocaleString(),
      unit: "BTU/h",
      note: "Total dissipated by powered gear",
      status: "ok",
    },
    {
      label: "Cooling load",
      value: tonsAc > 0 ? tonsAc.toFixed(1) : "0",
      unit: "ton AC",
      note: `${BTUH_PER_TON.toLocaleString()} BTU/h = 1 ton`,
    },
    {
      label: "Heat sources",
      value: String(thermalDevices.length),
      unit: thermalDevices.length === 1 ? "device" : "devices",
      note:
        derivedCount > 0
          ? `${derivedCount} est. from power (×3.412)`
          : "All from rated thermal data",
    },
    {
      label: "kW dissipated",
      value: totalBtuh > 0 ? (totalBtuh / 3412).toFixed(2) : "0",
      unit: "kW",
      note: "Equivalent electrical heat",
      accent: true,
    },
  ];

  const bars: ChartBar[] = topN(thermalDevices, (d) => d.thermalBtuh * d.count, MAX_CHART_BARS).map(
    (d, i) => {
      const b = d.thermalBtuh * d.count;
      return {
        name: d.count > 1 ? `${d.model} ×${d.count}` : d.model,
        value: b,
        valueLabel: `${b.toLocaleString()}`,
        color: paletteColor(i),
      };
    },
  );

  // Breakdown: heat grouped by room (zone) as a share of total.
  const byRoom = new Map<string, number>();
  for (const d of thermalDevices) {
    byRoom.set(d.room, (byRoom.get(d.room) ?? 0) + d.thermalBtuh * d.count);
  }
  const breakdown: BreakdownItem[] = topN([...byRoom.entries()], (e) => e[1], 6).map(
    ([room, b], i) => ({
      name: room,
      valueLabel: `${b.toLocaleString()} BTU`,
      pct: pct(b, totalBtuh),
      color: paletteColor(i),
    }),
  );

  const rows: DetailRow[] = thermalDevices.map((d) => {
    const b = d.thermalBtuh * d.count;
    return {
      device: d.count > 1 ? `${d.model} ×${d.count}` : d.model,
      location: d.room,
      v3: `${b.toLocaleString()}${d.thermalDerived ? " ~" : ""}`,
      v4: d.thermalDerived ? "Est." : "Rated",
      status: d.thermalDerived ? "watch" : "ok",
      statusLabel: d.thermalDerived ? "Est." : "OK",
    };
  });

  return {
    kpis,
    chartTitle: "Heat output by device",
    chartUnit: "BTU/h",
    bars,
    breakdownTitle: "Heat by zone",
    breakdown,
    tableTitle: "Per-device thermal",
    col3: "BTU/h",
    col4: "Source",
    rows,
  };
}

// ─── Network dashboard ───────────────────────────────────────────────────────

export interface NetworkDashboardInput {
  rows: NetworkReportRow[];
  poeBudgets: PoeBudgetRow[];
  dhcpServers: DhcpServerSummaryRow[];
}

export function buildNetworkDashboard(input: NetworkDashboardInput): ReportDashboard {
  const { rows, poeBudgets, dhcpServers } = input;
  const portCount = rows.length;

  // DERIVED bandwidth: real addressable-port count × per-flow estimate, vs a 1 Gb link.
  const estBandwidthMbps = portCount * MBPS_PER_AUDIO_FLOW;
  const bandwidthPct = pct(estBandwidthMbps, GIGABIT_LINK_MBPS);

  // Real PoE totals from the switch budgets the app computes.
  const totalPoeBudget = poeBudgets.reduce((s, p) => s + p.budgetW, 0);
  const totalPoeLoad = poeBudgets.reduce((s, p) => s + p.loadW, 0);
  const anyPoeOver = poeBudgets.some((p) => p.overBudget);

  // IP assignment coverage (real): static + DHCP-covered vs addressable ports.
  const assigned = rows.filter((r) => r.ip || r.dhcp || r.dhcpCovered).length;
  const unassigned = portCount - assigned;

  const headStatus: ReportStatus = anyPoeOver ? "over" : unassigned > 0 ? "watch" : "ok";

  const kpis: KpiCard[] = [
    {
      label: "Network ports",
      value: String(portCount),
      unit: portCount === 1 ? "port" : "ports",
      note: assigned > 0 ? `${assigned} addressed` : "None addressed yet",
      status: headStatus,
    },
    {
      label: "Est. bandwidth",
      value: estBandwidthMbps.toLocaleString(),
      unit: "Mbps",
      note: `~${bandwidthPct}% of a 1 Gb link`,
    },
    {
      label: "PoE load",
      value: totalPoeBudget > 0 ? totalPoeLoad.toLocaleString() : "—",
      unit: totalPoeBudget > 0 ? "W" : "",
      note:
        totalPoeBudget > 0
          ? `of ${totalPoeBudget.toLocaleString()} W budget`
          : "No PoE switches",
    },
    {
      label: "DHCP servers",
      value: String(dhcpServers.length),
      unit: dhcpServers.length === 1 ? "pool" : "pools",
      note: dhcpServers.length > 0 ? "Address pools defined" : "Static addressing only",
      accent: true,
    },
  ];

  // Bars: addressable ports per device (fan-out), largest first.
  const portsByDevice = new Map<string, number>();
  for (const r of rows) {
    portsByDevice.set(r.deviceLabel, (portsByDevice.get(r.deviceLabel) ?? 0) + 1);
  }
  const bars: ChartBar[] = topN([...portsByDevice.entries()], (e) => e[1], MAX_CHART_BARS).map(
    ([device, count], i) => ({
      name: device,
      value: count,
      valueLabel: String(count),
      color: paletteColor(i),
    }),
  );

  // Breakdown: ports grouped by signal type, as a share of all addressable ports.
  const bySignal = new Map<string, number>();
  for (const r of rows) {
    bySignal.set(r.signalType, (bySignal.get(r.signalType) ?? 0) + 1);
  }
  const breakdown: BreakdownItem[] = topN([...bySignal.entries()], (e) => e[1], 6).map(
    ([signal, count], i) => ({
      name: signal,
      valueLabel: `${count} ${count === 1 ? "port" : "ports"}`,
      pct: pct(count, portCount),
      color: paletteColor(i),
    }),
  );

  // Detail table: per-port endpoints with addressing status.
  const rowsOut: DetailRow[] = rows.map((r) => {
    const addressed = !!r.ip || r.dhcp || r.dhcpCovered;
    return {
      device: r.deviceLabel,
      location: r.room,
      v3: r.ip || (r.dhcp ? "DHCP" : "—"),
      v4: r.vlan || "—",
      status: addressed ? "ok" : "watch",
      statusLabel: addressed ? "OK" : "Unset",
    };
  });

  return {
    kpis,
    chartTitle: "Ports by device",
    chartUnit: "Ports",
    bars,
    breakdownTitle: "Ports by signal",
    breakdown,
    tableTitle: "Network endpoints",
    col3: "IP",
    col4: "VLAN",
    rows: rowsOut,
  };
}

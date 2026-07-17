import { memo, useMemo, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { DeviceNode as DeviceNodeType, Port, SchematicNode, ConnectionEdge, SignalType } from "../types";
import { SIGNAL_COLORS, SIGNAL_LABELS, CONNECTOR_LABELS, portSide, DEFAULT_LAYER_ID } from "../types";
import { deviceClassColor } from "../deviceClassColor";
import { useSchematicStore, type NodeViewTier } from "../store";
import { signalLabel as signalTypeLabel, portLabel } from "../plainLanguage";
import { validateSchematic, type IssueSeverity } from "../validation";
import {
  resolveAuxiliaryLine,
  auxRowHeight,
  rowsInSlot,
  headerBandHeight,
  HEADER_LABEL_ZONE_PX,
  HEADER_LABEL_ZONE_2_PX,
} from "../auxiliaryData";
import type { AuxRow } from "../types";
import { useDisplayLabel } from "../labelCaseUtils";
import { resolveDeviceLabel } from "../displayName";
import ArtworkChip from "./ArtworkChip";
import "../deviceNodeMotion.css";

/** Minimal store shape the per-node severity selector reads. Structurally a subset of
 *  SchematicState so it can be used as a Zustand selector arg without importing the
 *  (non-exported) store interface. */
type SeveritySelectorState = {
  nodes: SchematicNode[];
  edges: ConnectionEdge[];
  dismissedIssueIds: string[];
};

/** Module-level memo so the full-graph validation runs ONCE per (nodes, edges,
 *  dismissedIssueIds) change — not once per DeviceNode. Every node instance subscribes via
 *  `selectNodeSeverity`, which returns a primitive string so Zustand's default equality
 *  prevents re-render storms. Error severity wins over warning; absence ⇒ no issue. */
let severityCache: {
  nodes: SchematicNode[];
  edges: ConnectionEdge[];
  dismissed: string[];
  map: Map<string, IssueSeverity>;
} | null = null;

function severityMapFor(state: SeveritySelectorState): Map<string, IssueSeverity> {
  if (
    severityCache &&
    severityCache.nodes === state.nodes &&
    severityCache.edges === state.edges &&
    severityCache.dismissed === state.dismissedIssueIds
  ) {
    return severityCache.map;
  }
  const dismissed = new Set(state.dismissedIssueIds);
  const map = new Map<string, IssueSeverity>();
  for (const issue of validateSchematic(state.nodes, state.edges)) {
    if (dismissed.has(issue.id)) continue;
    for (const nodeId of issue.nodeIds) {
      if (issue.severity === "error" || !map.has(nodeId)) map.set(nodeId, issue.severity);
    }
  }
  severityCache = {
    nodes: state.nodes,
    edges: state.edges,
    dismissed: state.dismissedIssueIds,
    map,
  };
  return map;
}

/** Status-dot severity for one device: "error" | "warning" | null (clean). */
function selectNodeSeverity(state: SeveritySelectorState, nodeId: string): IssueSeverity | null {
  return severityMapFor(state).get(nodeId) ?? null;
}

/** The one hue that means "logical, not a socket" — used for virtual Ports and the internal-link
 *  markers. It is deliberately the AES violet: that token already carries this exact value, and a
 *  device is never simultaneously read for its AES ports and its virtual ones. A token rather than
 *  a hex so it tracks the theme. Shape + tooltip carry the meaning too; the colour never does it
 *  alone. */
const VIRTUAL_PORT_COLOR = "var(--color-aes)";

type ColumnItem =
  | { type: "port"; port: Port }
  | { type: "section"; name: string }
  | { type: "divider" };

/** Hover-tooltip suffix surfacing a USB-C port's Power Delivery rating, if set. */
function usbcPowerSuffix(port: Port): string {
  const parts: string[] = [];
  if (port.usbcPowerSourceW != null) parts.push(`delivers ${port.usbcPowerSourceW}W`);
  if (port.usbcPowerDrawW != null) parts.push(`draws ${port.usbcPowerDrawW}W`);
  return parts.length ? ` — USB-C PD: ${parts.join(", ")}` : "";
}

/** Middle-truncate: "Dante Network Redundant Out" → "Dante Netw…dant Out". Used only when the
 *  node is at its width cap — the full name stays in the row tooltip. */
function middleTruncate(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  const keep = Math.max(3, maxChars - 1);
  const head = Math.ceil(keep * 0.6);
  return `${s.slice(0, head)}…${s.slice(s.length - (keep - head))}`;
}

/** Build a list of ports interleaved with section headers where section changes. */
function buildColumnItems(ports: Port[]): ColumnItem[] {
  const items: ColumnItem[] = [];
  let lastSection: string | undefined;
  for (const port of ports) {
    if (port.section && port.section !== lastSection) {
      items.push({ type: "section", name: port.section });
    } else if (!port.section && lastSection) {
      // A section just ended into unsectioned ports — emit a closing divider so
      // the following ports don't read as part of the section. (A section
      // followed by ANOTHER section needs nothing; that section's own header is
      // the boundary.)
      items.push({ type: "divider" });
    }
    items.push({ type: "port", port });
    lastSection = port.section;
  }
  return items;
}

function DeviceNodeComponent({ id, data, selected }: NodeProps<DeviceNodeType>) {
  const setEditingNodeId = useSchematicStore((s) => s.setEditingNodeId);
  const displayLabel = useDisplayLabel();
  const useShortNames = useSchematicStore((s) => s.useShortNames);
  const hostLabel = useSchematicStore((s) =>
    data.hostDeviceId
      ? ((s.nodes.find((n) => n.id === data.hostDeviceId)?.data as { label?: string } | undefined)?.label ?? null)
      : null,
  );
  const wrapDeviceLabels = useSchematicStore((s) => s.wrapDeviceLabels);
  const resolvedLabel = useMemo(
    () => resolveDeviceLabel(data, { useShortNames, wrapDeviceLabels }),
    [data, useShortNames, wrapDeviceLabels],
  );
  const labelZone = resolvedLabel.wrap ? HEADER_LABEL_ZONE_2_PX : HEADER_LABEL_ZONE_PX;
  const hiddenPinSignalTypesStr = useSchematicStore((s) => s.hiddenPinSignalTypes);
  const isHiddenAdapter = useSchematicStore((s) => s.hiddenAdapterNodeIds.has(id));
  const isOverlapping = useSchematicStore((s) => s.overlapNodeId === id);

  const hiddenPinSignalTypes = useMemo(
    () => (hiddenPinSignalTypesStr ? new Set(hiddenPinSignalTypesStr.split(",")) : null),
    [hiddenPinSignalTypesStr],
  );

  // Layer colour on the node. Selectors return primitives (never a fresh object) so the node
  // doesn't re-render on every store tick.
  const layerColorMode = useSchematicStore((s) => s.layerColorMode);
  const layerColor = useSchematicStore(
    (s) => s.layers.find((l) => l.id === (data.layerId ?? DEFAULT_LAYER_ID))?.color,
  );
  const layerName = useSchematicStore(
    (s) => s.layers.find((l) => l.id === (data.layerId ?? DEFAULT_LAYER_ID))?.name,
  );
  const hideUnconnectedPorts = useSchematicStore((s) => s.hideUnconnectedPorts);
  const showPortCounts = useSchematicStore((s) => s.showPortCounts);
  const currency = useSchematicStore((s) => s.currency);
  const nodeCompact = useSchematicStore((s) => s.nodeCompact);
  const liveSignal = useSchematicStore((s) => s.liveSignal);
  const reduceMotion = useSchematicStore((s) => s.reduceMotion);
  // Connect tool armed → open connectors halo in their signal colour (board 2b).
  const connectArmed = useSchematicStore((s) => s.activeTool === "connect");
  const detailLevel = useSchematicStore((s) => s.detailLevel);
  // Per-device overrides written by the Inspector. Both selectors return a primitive (or
  // undefined), so a device only re-renders when ITS OWN entry changes.
  const nodeColorOverride = useSchematicStore((s) => s.nodeColors[id]);
  const nodeViewOverride = useSchematicStore((s) => s.nodeView[id]);

  // Density tier: the per-device override wins, else the schematic-wide `nodeCompact` baseline.
  const tier: NodeViewTier = nodeViewOverride ?? (nodeCompact ? "compact" : "default");
  // "tile" is drawn as an OVERLAY, never as its own layout: the underlying tree still renders at
  // the density baseline (hidden via visibility, which keeps its layout box) so the node's height,
  // its handle bounds and therefore every wire anchor are identical tiled or not. Nothing about the
  // tile may be allowed to change the box — React Flow measures handles off the live DOM rects.
  const isTile = tier === "tile";
  const baselineTier: NodeViewTier = isTile ? (nodeCompact ? "compact" : "default") : tier;
  const isCompact = baselineTier === "compact";
  // The footer stats block is the "detailed" tier's only addition over "default".
  const showFooterStats = baselineTier === "detailed";
  // Real validation-engine severity for this device's status dot. Computed once per
  // (nodes, edges, dismissedIssueIds) change via a module-level memo; selector returns a
  // primitive so this subscription only re-renders when THIS node's severity changes.
  const nodeSeverity = useSchematicStore((s) => selectNodeSeverity(s, id));
  const templateHiddenStr = useSchematicStore((s) => {
    if (!data.templateId) return "";
    const arr = s.templateHiddenSignals[data.templateId];
    return arr ? arr.sort().join(",") : "";
  });

  const connectedHandleStr = useSchematicStore((s) => {
    const ids: string[] = [];
    for (const e of s.edges) {
      if (e.source === id && e.sourceHandle) ids.push(e.sourceHandle);
      if (e.target === id && e.targetHandle) ids.push(e.targetHandle);
    }
    return ids.sort().join(",");
  });
  const connectedHandles = useMemo(
    () => new Set(connectedHandleStr ? connectedHandleStr.split(",") : []),
    [connectedHandleStr],
  );

  // Reactive signal-type map for edges connected to this node — drives passthrough port
  // color/label when the port inherits its signal type from the connected edge. Serialized
  // as "handleId:signalType" pairs so Zustand's shallow equality catches signal-type edits.
  const connectedEdgeSignalsStr = useSchematicStore((s) => {
    const parts: string[] = [];
    for (const e of s.edges) {
      if (!e.data?.signalType) continue;
      if (e.source === id && e.sourceHandle) parts.push(`${e.sourceHandle}:${e.data.signalType}`);
      if (e.target === id && e.targetHandle) parts.push(`${e.targetHandle}:${e.data.signalType}`);
    }
    return parts.sort().join(",");
  });
  const signalByHandle = useMemo<Map<string, string>>(() => {
    const m = new Map<string, string>();
    if (!connectedEdgeSignalsStr) return m;
    for (const pair of connectedEdgeSignalsStr.split(",")) {
      const colon = pair.lastIndexOf(":");
      if (colon > 0) m.set(pair.slice(0, colon), pair.slice(colon + 1));
    }
    return m;
  }, [connectedEdgeSignalsStr]);

  const visiblePorts = useMemo(() => {
    if (data.showAllPorts) {
      return hiddenPinSignalTypes
        ? data.ports.filter((p) => !hiddenPinSignalTypes.has(p.signalType))
        : data.ports;
    }

    const tplHidden = templateHiddenStr ? new Set(templateHiddenStr.split(",")) : null;
    const devHiddenPorts = data.hiddenPorts?.length ? new Set(data.hiddenPorts) : null;

    return data.ports.filter((p) => {
      if (hiddenPinSignalTypes?.has(p.signalType)) return false;
      if (tplHidden?.has(p.signalType)) return false;
      if (devHiddenPorts?.has(p.id)) return false;
      if (hideUnconnectedPorts) {
        const connected = p.direction === "bidirectional"
          ? connectedHandles.has(`${p.id}-in`) || connectedHandles.has(`${p.id}-out`)
          : p.direction === "passthrough"
          ? connectedHandles.has(`${p.id}-rear`) || connectedHandles.has(`${p.id}-front`)
          : connectedHandles.has(p.id);
        if (!connected) return false;
      }
      return true;
    });
  }, [data.ports, data.showAllPorts, data.hiddenPorts,
      hiddenPinSignalTypes, templateHiddenStr, hideUnconnectedPorts, connectedHandles]);

  // Intra-device routing, keyed BOTH ways so either end of a link finds its partner. Endpoints are
  // port LABELS (not ids) — that is the schema's contract, so a template sync that re-issues ids
  // leaves the links intact.
  //  A port may hold SEVERAL internal links (one input feeding two aux buses is ordinary), so
  //  each label maps to a LIST — a plain last-write-wins map would silently drop every partner
  //  but the last, and mis-mark rows when a device repeats a port label.
  const internalPartnersByLabel = useMemo(() => {
    const m = new Map<string, string[]>();
    const add = (key: string, partner: string) => {
      const existing = m.get(key);
      if (existing) existing.push(partner);
      else m.set(key, [partner]);
    };
    for (const link of data.internalLinks ?? []) {
      add(link.from, link.to);
      add(link.to, link.from);
    }
    return m;
  }, [data.internalLinks]);

  const headerAuxRows = useMemo(
    () => rowsInSlot(data.auxiliaryData, "header"),
    [data.auxiliaryData],
  );
  const footerAuxRows = useMemo(
    () => rowsInSlot(data.auxiliaryData, "footer"),
    [data.auxiliaryData],
  );

  const portCountInfo = useMemo(() => {
    if (!showPortCounts) return null;
    const total = data.ports.length;
    if (total === 0) return null;
    let connected = 0;
    for (const p of data.ports) {
      if (p.direction === "bidirectional") {
        if (connectedHandles.has(`${p.id}-in`) || connectedHandles.has(`${p.id}-out`)) connected++;
      } else if (p.direction === "passthrough") {
        if (connectedHandles.has(`${p.id}-rear`) || connectedHandles.has(`${p.id}-front`)) connected++;
      } else {
        if (connectedHandles.has(p.id)) connected++;
      }
    }
    return { connected, total };
  }, [showPortCounts, data.ports, connectedHandles]);

  // I/O summary for the compact-mode chip. Always derivable from ports + connected handles,
  // independent of the showPortCounts preference. Declared before the isHiddenAdapter early
  // return so hook order stays stable.
  const ioSummary = useMemo(() => {
    const total = data.ports.length;
    let connected = 0;
    for (const p of data.ports) {
      if (p.direction === "bidirectional") {
        if (connectedHandles.has(`${p.id}-in`) || connectedHandles.has(`${p.id}-out`)) connected++;
      } else if (p.direction === "passthrough") {
        if (connectedHandles.has(`${p.id}-rear`) || connectedHandles.has(`${p.id}-front`)) connected++;
      } else if (connectedHandles.has(p.id)) {
        connected++;
      }
    }
    return { connected, total };
  }, [data.ports, connectedHandles]);

  const openPortMenu = useCallback((e: React.MouseEvent, port: Port) => {
    e.preventDefault();
    e.stopPropagation();
    useSchematicStore.setState({
      portContextMenu: { nodeId: id, portId: port.id, screenX: e.clientX, screenY: e.clientY },
    });
  }, [id]);


  // Split ports by visual side (respects flip), not semantic direction.
  // When hideUnconnectedPorts is on, bidir ports with only one side connected
  // collapse into the appropriate column so the device gets smaller.
  // Passthrough ports go into their own list — they render as full-width rows with
  // two handles (rear-left, front-right), similar to bidirectional but spanning both sides.
  const { leftPorts, rightPorts, bidirectional, passthroughPorts, collapsedBidir } = useMemo(() => {
    const collapsedBidir = new Map<string, "in" | "out">();
    const leftPorts: Port[] = [];
    const rightPorts: Port[] = [];
    const bidirectional: Port[] = [];
    const passthroughPorts: Port[] = [];
    for (const p of visiblePorts) {
      if (p.direction === "passthrough") {
        passthroughPorts.push(p);
      } else if (p.direction === "bidirectional") {
        if (hideUnconnectedPorts) {
          const inConn = connectedHandles.has(`${p.id}-in`);
          const outConn = connectedHandles.has(`${p.id}-out`);
          if (inConn && !outConn) {
            (p.flipped ? rightPorts : leftPorts).push(p);
            collapsedBidir.set(p.id, "in");
            continue;
          }
          if (outConn && !inConn) {
            (p.flipped ? leftPorts : rightPorts).push(p);
            collapsedBidir.set(p.id, "out");
            continue;
          }
        }
        bidirectional.push(p);
      } else if (portSide(p) === "left") {
        leftPorts.push(p);
      } else {
        rightPorts.push(p);
      }
    }
    return { leftPorts, rightPorts, bidirectional, passthroughPorts, collapsedBidir };
  }, [visiblePorts, hideUnconnectedPorts, connectedHandles]);

  /** Get handle ID and type for a port in a column, accounting for collapsed bidir ports.
   *  All bidirectional handles use type="source" so React Flow always includes them in
   *  handleBounds.source — its getEdgePosition only searches source bounds for sourceHandle,
   *  even in ConnectionMode.Loose. Our isValidConnection handles real direction checks. */
  const handleProps = (port: Port, _side: "left" | "right") => {
    const connSide = collapsedBidir.get(port.id);
    if (connSide) {
      return connSide === "in"
        ? { handleId: `${port.id}-in`, handleType: "source" as const }
        : { handleId: `${port.id}-out`, handleType: "source" as const };
    }
    return {
      handleId: port.id,
      handleType: (port.direction === "input" ? "target" : "source") as "target" | "source",
    };
  };

  const isPatchPanel = data.deviceType === "patch-panel";

  const leftItems = useMemo(() => {
    const items = buildColumnItems(leftPorts);
    if (isPatchPanel && leftPorts.length > 0) {
      return [{ type: "section" as const, name: "Rear" }, ...items];
    }
    return items;
  }, [leftPorts, isPatchPanel]);
  const rightItems = useMemo(() => {
    const items = buildColumnItems(rightPorts);
    if (isPatchPanel && rightPorts.length > 0) {
      return [{ type: "section" as const, name: "Front" }, ...items];
    }
    return items;
  }, [rightPorts, isPatchPanel]);

  const hasSections = leftItems.some((i) => i.type === "section") ||
    rightItems.some((i) => i.type === "section");

  // Build bidirectional items with section support
  const bidirItems = useMemo(() => buildColumnItems(bidirectional), [bidirectional]);

  // Build passthrough items. On patch panels, prepend Rear/Front column headers in the
  // passthrough row header so the label row shows "Rear ← label → Front".
  const passthroughItems = useMemo(
    () => buildColumnItems(passthroughPorts),
    [passthroughPorts],
  );

  /** A thin closing line marking the end of a section that runs into unsectioned ports. */
  const renderDivider = (key: string) => (
    <div key={key} className="h-1.5 flex items-center px-2" aria-hidden>
      <div className="border-b border-[var(--color-border)]/30 w-full" />
    </div>
  );

  /** Port row text. Plain language shows the Port's own name; technical detail appends the
   *  jargon suffix the design shows ("Mic 1 · XLR"). Passthrough Ports carry their connector
   *  per face, so the rear face stands in for the row. */
  const portRowLabel = (port: Port) => {
    const connector = port.connectorType ?? port.rearConnectorType;
    return portLabel(
      displayLabel(port.label),
      connector ? CONNECTOR_LABELS[connector] : undefined,
      detailLevel,
    );
  };

  /** Colour of a port's edge connector (the @xyflow Handle). Virtual ports drop their signal hue
   *  for the violet: the handle is a picture of a socket, and a virtual port has none. */
  const portHandleColor = (port: Port) =>
    port.virtual ? VIRTUAL_PORT_COLOR : SIGNAL_COLORS[port.signalType];

  /** Single-glyph edge connector (boards 2a/2b): the 9px indicator ON the edge IS the Handle —
   *  filled = wired, 1.5px hollow ring = open socket, violet = virtual (no socket), soft halo =
   *  multi-connect. Hue is always the port's resolved signal colour. The indicator centre sits
   *  exactly on the node edge (9px at −4.5px = the same centre the old 10px/−5px handle had),
   *  so wire anchors do not move. The old inner square swatches and grey outer rings are gone —
   *  this is the ONE connector glyph per port.
   *  Glow (deviceNodeMotion.css) is anchored here now: wired connectors pulse while Live signal
   *  is on; open connectors halo while the Connect tool is armed. Both reduced-motion gated. */
  const connectorClass = (side: "left" | "right", connected: boolean) =>
    `!w-[9px] !h-[9px] !border-0 ${side === "left" ? "!-left-[4.5px]" : "!-right-[4.5px]"}` +
    (connected && liveSignal && !reduceMotion ? " device-node-swatch--glow" : "") +
    (!connected && connectArmed && !reduceMotion ? " device-node-connector--armed" : "");
  const connectorStyle = (
    color: string,
    connected: boolean,
    opts?: { multi?: boolean; disabled?: boolean },
  ): React.CSSProperties => {
    const halo = opts?.multi
      ? `, 0 0 0 2.5px color-mix(in srgb, ${color} 28%, transparent)`
      : "";
    return {
      top: "50%",
      ...(connected
        ? { background: color, ...(halo ? { boxShadow: halo.slice(2) } : {}) }
        : {
            background: "var(--color-surface)",
            boxShadow: `inset 0 0 0 1.5px ${color}${halo}`,
          }),
      "--swatch-glow": color,
      ...(opts?.disabled ? { opacity: 0.4 } : {}),
    } as React.CSSProperties;
  };

  // CATEGORY mono-caps label — the device's class/type, shown under the name. Omitted when empty.
  const categoryText = (data.category || data.deviceType || "").trim();
  // A layer only marks its devices once it has been given a colour — an uncoloured layer
  // (including the default "Base") stays neutral: no band, no tint, no chip.
  const layerChipName = layerColor ? (layerName?.trim() || null) : null;

  // Content-fit width (board 2a §5): widen from the 144px floor toward the 330px cap so port
  // labels stay legible BEFORE any truncation ("Network …" must not happen at default widths).
  // Estimated from label lengths at the 10px row font (~5.2px/char, generous); the CSS truncate
  // on each label stays as the backstop for estimate error. Snapped up to a 16px multiple so
  // the node keeps clean routing-grid geometry; floor stays 144 (the historical fixed width)
  // so existing docs' wire anchors don't shift on nodes that never needed more room.
  const CHAR_W = 5.2;
  const SIDE_CHROME = 12 /* edge padding */ + 10 /* connector + gap */;
  const nodeWidth = useMemo(() => {
    let need = 132;
    const rows = Math.max(leftPorts.length, rightPorts.length);
    for (let i = 0; i < rows; i++) {
      const l = leftPorts[i] ? portRowLabel(leftPorts[i]).length * CHAR_W + SIDE_CHROME : 0;
      const r = rightPorts[i] ? portRowLabel(rightPorts[i]).length * CHAR_W + SIDE_CHROME : 0;
      need = Math.max(need, l + r + 8);
    }
    for (const p of [...bidirectional, ...passthroughPorts]) {
      need = Math.max(need, portRowLabel(p).length * CHAR_W + 64);
    }
    if (categoryText || layerChipName) {
      need = Math.max(need, (categoryText.length + (layerChipName?.length ?? 0)) * 4.6 + 56);
    }
    return Math.min(330, Math.max(144, Math.ceil(need / 16) * 16));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- portRowLabel is render-stable per detailLevel/displayLabel below
  }, [leftPorts, rightPorts, bidirectional, passthroughPorts, categoryText, layerChipName, detailLevel, displayLabel]);

  /** At the width cap, middle-truncate a row label to its half-row character budget — the CSS
   *  end-ellipsis then never fires and the tooltip carries the full name (board 2a §5). */
  const fitPortLabel = (label: string, fullRow = false) => {
    if (nodeWidth < 330) return label;
    const budget = fullRow
      ? Math.floor((nodeWidth - 64) / CHAR_W)
      : Math.floor((nodeWidth / 2 - SIDE_CHROME - 4) / CHAR_W);
    return middleTruncate(label, budget);
  };

  /** Port row tooltip: name, signal, a USB-C port's Power Delivery rating, and — on a virtual
   *  port — the fact that it is logical, in words. Matches the " — passthrough" /
   *  " — bidirectional" suffix convention used below. */
  const portRowTitle = (port: Port) =>
    `${portRowLabel(port)} (${signalTypeLabel(port.signalType, detailLevel)})${
      port.virtual ? " — virtual (no socket)" : ""
    }${usbcPowerSuffix(port)}`;

  /** Violet pip marking a port that is internally linked to another port on the SAME device. It
   *  sits in the gap between the outer Handle and the signal swatch, mirroring the outer connector
   *  on the inside — the design uses these instead of curves drawn across the block, which read as
   *  messy the moment a device has more than one link. Absolutely positioned inside the (already
   *  `relative`) port row, so it adds no height and the port grid is untouched. The tile tier
   *  hides it for free: the whole port tree sits under that tier's `visibility: hidden` wrapper. */
  const renderInternalMark = (port: Port, side: "left" | "right") => {
    const partners = internalPartnersByLabel.get(port.label);
    if (!partners?.length) return null;
    const title = `Internal link → ${partners.map((p) => displayLabel(p)).join(", ")}`;
    return (
      <span
        className="absolute w-[5px] h-[5px] rounded-full top-1/2 -translate-y-1/2"
        style={
          side === "left"
            ? { background: VIRTUAL_PORT_COLOR, left: 6 }
            : { background: VIRTUAL_PORT_COLOR, right: 6 }
        }
        title={title}
        role="img"
        aria-label={title}
      />
    );
  };

  /** Render a port row for a column (left or right). */
  const renderColumnPort = (port: Port, side: "left" | "right") => {
    const h = handleProps(port, side);
    const isLeft = side === "left";
    return (
      <div
        key={port.id}
        className={`device-port-row flex items-center gap-1 ${isLeft ? "pl-3" : "pr-3 justify-end"} h-4 relative`}
        onContextMenu={(e) => openPortMenu(e, port)}
      >
        {isLeft && (
          <Handle
            type={h.handleType}
            position={Position.Left}
            id={h.handleId}
            data-connected={connectedHandles.has(h.handleId) || undefined}
            data-multi-connect={port.multiConnect || undefined}
            className={connectorClass("left", connectedHandles.has(h.handleId))}
            style={connectorStyle(portHandleColor(port), connectedHandles.has(h.handleId), { multi: port.multiConnect })}
          />
        )}
        {isLeft && renderInternalMark(port, "left")}
        <span
          className="text-[10px] leading-4 truncate"
          style={{ color: "var(--color-text)" }}
          title={portRowTitle(port)}
        >
          {fitPortLabel(portRowLabel(port))}
        </span>
        {!isLeft && renderInternalMark(port, "right")}
        {!isLeft && (
          <Handle
            type={h.handleType}
            position={Position.Right}
            id={h.handleId}
            data-connected={connectedHandles.has(h.handleId) || undefined}
            data-multi-connect={port.multiConnect || undefined}
            className={connectorClass("right", connectedHandles.has(h.handleId))}
            style={connectorStyle(portHandleColor(port), connectedHandles.has(h.handleId), { multi: port.multiConnect })}
          />
        )}
      </div>
    );
  };

  /** Render a passthrough port as a full-width row with rear (left) and front (right) handles. */
  const renderPassthroughPort = (port: Port) => {
    const rearId = `${port.id}-rear`;
    const frontId = `${port.id}-front`;
    const rearConnected = connectedHandles.has(rearId);
    const frontConnected = connectedHandles.has(frontId);
    // For inheriting ports, pick up the connected edge's signal type reactively from
    // signalByHandle (derived from connectedEdgeSignalsStr selector). Prefer rear side;
    // fall back to front, then to the port's stored placeholder.
    const resolvedSignal: string = port.inheritsSignal
      ? (signalByHandle.get(rearId) ?? signalByHandle.get(frontId) ?? port.signalType)
      : port.signalType;
    const signalColor = SIGNAL_COLORS[resolvedSignal as keyof typeof SIGNAL_COLORS] ?? SIGNAL_COLORS.custom;
    // A port that inherits its signal can resolve to a type the label maps don't know (custom
    // edges); fall back to the raw type rather than rendering "undefined".
    const resolvedSignalLabel = SIGNAL_LABELS[resolvedSignal as SignalType]
      ? signalTypeLabel(resolvedSignal as SignalType, detailLevel)
      : resolvedSignal;
    return (
      <div
        key={port.id}
        className="device-port-row flex justify-between items-center relative h-4"
        onContextMenu={(e) => openPortMenu(e, port)}
      >
        {/* Rear handle — left edge, source (ConnectionMode.Loose; isValidConnection enforces direction) */}
        <Handle
          type="source"
          position={Position.Left}
          id={rearId}
          data-connected={rearConnected || undefined}
          className={connectorClass("left", rearConnected)}
          style={connectorStyle(signalColor, rearConnected)}
        />
        <span
          className="text-[10px] leading-4 truncate px-3 flex-1 text-center"
          style={{ color: signalColor }}
          title={`${portRowLabel(port)} (${resolvedSignalLabel}) — passthrough`}
        >
          ⇔ {fitPortLabel(portRowLabel(port), true)}
        </span>
        {/* Front handle — right edge, source (same reasoning as rear) */}
        <Handle
          type="source"
          position={Position.Right}
          id={frontId}
          data-connected={frontConnected || undefined}
          className={connectorClass("right", frontConnected)}
          style={connectorStyle(signalColor, frontConnected)}
        />
      </div>
    );
  };

  if (isHiddenAdapter) {
    // Render 1x1 invisible placeholder — keeps React Flow handle refs valid but
    // doesn't block device placement (RF re-measures this as ~1px)
    return (
      <div style={{ width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" }}>
        {data.ports.map((p) => {
          if (p.direction === "bidirectional") {
            return (
              <span key={p.id}>
                <Handle type="target" position={Position.Left} id={`${p.id}-in`} style={{ opacity: 0 }} />
                <Handle type="source" position={Position.Right} id={`${p.id}-out`} style={{ opacity: 0 }} />
              </span>
            );
          }
          if (p.direction === "passthrough") {
            return (
              <span key={p.id}>
                <Handle type="source" position={Position.Left} id={`${p.id}-rear`} style={{ opacity: 0 }} />
                <Handle type="source" position={Position.Right} id={`${p.id}-front`} style={{ opacity: 0 }} />
              </span>
            );
          }
          const side = portSide(p);
          return (
            <Handle
              key={p.id}
              type={p.direction === "input" ? "target" : "source"}
              position={side === "left" ? Position.Left : Position.Right}
              id={p.id}
              style={{ opacity: 0 }}
            />
          );
        })}
      </div>
    );
  }

  /** Footer aux block — rows below the port area. Grid-rounded (16-multiple) so device
   *  bottom stays on the snap grid. Blank rows render as 6-px separator gaps. */
  function renderFooterAuxBlock(rows: AuxRow[]) {
    if (rows.length === 0) return null;
    const raw = 1 + rows.reduce((sum, r) => sum + auxRowHeight(r), 0);
    const totalPad = Math.ceil(raw / 16) * 16 - raw;
    const pt = Math.floor(totalPad / 2);
    const pb = totalPad - pt;
    return (
      <div
        className="auxiliaryData px-3 border-t border-[var(--ui-border)]"
        style={{ paddingTop: pt, paddingBottom: pb }}
      >
        {rows.map((row, i) => renderAuxRow(row, i))}
      </div>
    );
  }

  /** Individual aux row markup shared between header band and footer block. */
  function renderAuxRow(row: AuxRow, key: number) {
    if (!row.text.trim()) {
      return <div key={key} aria-hidden style={{ height: 6 }} />;
    }
    const resolved = displayLabel(resolveAuxiliaryLine(row.text, data, { connectedCount: portCountInfo?.connected, currency }));
    return (
      <div
        key={key}
        className="text-[9px] text-[var(--color-text-muted)] leading-3 truncate whitespace-nowrap text-center"
        style={{ fontFamily: "var(--font-mono)" }}
        title={resolved}
      >
        {resolved}
      </div>
    );
  }

  /** Header band — label zone + header aux rows, centered together in a 16-multiple band.
   *  Replaces the old separate name strip + header aux block: eliminates the ~14-px
   *  wasted whitespace between the label and the first aux row.
   *
   *  Keep the band-height formula in sync with `headerBandHeight()` in auxiliaryData.ts —
   *  snapUtils uses it to estimate device height before React Flow measures it. */
  function renderHeaderBand(rows: AuxRow[]) {
    const bandH = headerBandHeight(data.auxiliaryData, labelZone);
    const content = labelZone + rows.reduce((sum, r) => sum + auxRowHeight(r), 0);
    const totalPad = bandH - content;
    const pt = Math.floor(totalPad / 2);
    const pb = totalPad - pt;
    const labelStyle = resolvedLabel.wrap
      ? {
          display: "-webkit-box" as const,
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as const,
          overflow: "hidden" as const,
          wordBreak: "break-word" as const,
          textAlign: "center" as const,
          lineHeight: "14px",
        }
      : undefined;
    return (
      <div
        className="px-3 border-b border-[var(--ui-border)] rounded-t-[7px] flex flex-col"
        style={{
          // Header band tint = CLASS colour at 14% over raised (board 2a §2). The old
          // washed-out failure came from tinting with the block/header colour; the class
          // hue at 14% matches the body's 7% wash and keeps the name legible.
          backgroundColor: `color-mix(in srgb, ${classColor} 14%, var(--color-surface-raised))`,
          // Layer "tint" mode washes the header in the layer colour, left-to-right. Kept at 20%
          // and fading to transparent so the name stays legible; the layer chip below carries
          // the text pairing. "band" mode instead draws the top bar on the node root.
          ...(layerColor && layerColorMode === "tint"
            ? {
                backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${layerColor} 20%, transparent), transparent)`,
              }
            : null),
          paddingTop: pt,
          paddingBottom: pb,
        }}
      >
        <div
          className="relative flex items-center gap-1.5"
          style={{ height: labelZone }}
        >
          {/* Identity, LEFT-aligned (board 2a §3): artwork chip · name (+ meta beneath) ·
              status dot right. The chip may extend into the band's vertical padding
              (the row itself keeps the declared labelZone height, so headerBandHeight()
              and every port anchor beneath are untouched). */}
          <ArtworkChip
            artworkAssetId={data.artworkAssetId}
            device={data}
            size={isCompact ? 16 : resolvedLabel.wrap ? 24 : 20}
            color={classColor}
          />
          <span className="flex flex-col items-start justify-center min-w-0 flex-1">
          <span
            className={
              resolvedLabel.wrap
                ? "text-[11.5px] font-semibold text-[var(--color-text-heading)] max-w-full"
                : "text-[11.5px] font-semibold text-[var(--color-text-heading)] truncate leading-tight max-w-full"
            }
            style={labelStyle ? { ...labelStyle, textAlign: "left" } : undefined}
            title={displayLabel(resolvedLabel.text)}
          >
            {displayLabel(resolvedLabel.text)}
          </span>
          {/* CATEGORY mono-caps sub-label + layer chip — both sit within the fixed labelZone
               height (no new row, so the 20px header-band invariant holds). Hidden when the
               name wraps to 2 lines and reclaims the zone. The layer chip pairs the swatch with
               the layer's NAME, so layer colour is never the only cue (a11y). */}
          {(categoryText || layerChipName) && !resolvedLabel.wrap && (
            <span className="flex items-center gap-1 max-w-full leading-none">
              {categoryText && (
                <span
                  className="text-[8px] uppercase truncate text-[var(--color-text-muted)]"
                  style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}
                  title={categoryText}
                >
                  {displayLabel(categoryText)}
                </span>
              )}
              {categoryText && layerChipName && (
                <span className="text-[8px] text-[var(--color-text-muted)] opacity-50">·</span>
              )}
              {layerChipName && (
                <span
                  className="flex items-center gap-0.5 shrink-0 max-w-[64px]"
                  title={`Layer: ${layerChipName}`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-[2px] shrink-0"
                    style={{ background: layerColor }}
                  />
                  <span
                    className="text-[8px] uppercase truncate text-[var(--color-text-muted)]"
                    style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}
                  >
                    {layerChipName}
                  </span>
                </span>
              )}
            </span>
          )}
          </span>
          {/* Status dot — absolutely positioned right so it never shifts the name or node width. */}
          <span
            className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
            style={{ background: statusColor }}
            title={statusLabel}
            role="img"
            aria-label={statusLabel}
          />
        </div>
        {rows.map((row, i) => renderAuxRow(row, i))}
      </div>
    );
  }

  // Device-class hue = the device's representative signal-type colour (its dominant signal),
  // shared via deviceClassColor() with the Insert chip, Plan footprint, Inspector hero, and
  // Command-palette swatch so every surface agrees — and it matches this node's own port swatches
  // + outgoing cables. (Legacy per-device headerColor is stale pre-signalFamilies noise, ignored
  // here.) Drives the class icon tint AND the full-perimeter border (replaces the old left
  // edge-stripe). Selection stays a SEPARATE accent halo; the class colour is never overwritten.
  // A per-device `nodeColors` entry (the Inspector's block-colour swatch) replaces the derived hue
  // wholesale, so every class-coloured surface on the node follows the override together.
  const classColor = nodeColorOverride ?? deviceClassColor(data.ports);

  // Near-imperceptible class wash over the body. At 7% the device still reads as its class at
  // low zoom without the card turning into a coloured panel — the header band keeps the neutral
  // instrument face, and the layer-tint feature owns the header background.
  const bodyWash = `color-mix(in srgb, ${classColor} 7%, var(--color-surface))`;

  // Tile tier (board 2c): a light class-tinted card — artwork + name + "N IN · M OUT" — with ONE
  // aggregate connector dot per side. The dot is signal-coloured when that side's ports share a
  // signal, neutral slate when mixed (colour is never the only cue; the counts line says what's
  // concatenated).
  const tileFill = `color-mix(in srgb, ${classColor} 16%, var(--color-surface))`;
  const TILE_MIXED = "#74819a";
  const sideAggColor = (ports: Port[]): string => {
    if (ports.length === 0) return TILE_MIXED;
    const first = portHandleColor(ports[0]);
    return ports.every((p) => portHandleColor(p) === first) ? first : TILE_MIXED;
  };
  const tileLeftColor = sideAggColor([...leftPorts, ...bidirectional, ...passthroughPorts]);
  const tileRightColor = sideAggColor([...rightPorts, ...bidirectional, ...passthroughPorts]);
  const dirIn = data.ports.filter((p) => p.direction === "input" || p.direction === "bidirectional").length;
  const dirOut = data.ports.filter((p) => p.direction === "output" || p.direction === "bidirectional").length;


  // Status-dot colour mirrors the validation engine: error wins, then warning, else clean.
  const statusColor =
    nodeSeverity === "error"
      ? "var(--color-error)"
      : nodeSeverity === "warning"
        ? "var(--color-warning)"
        : "var(--color-success)";
  const statusLabel =
    nodeSeverity === "error"
      ? "Has errors"
      : nodeSeverity === "warning"
        ? "Has warnings"
        : "No issues";

  return (
    <div
      onDoubleClick={() => setEditingNodeId(id)}
      className={`relative rounded-[7px] border${isTile ? " device-node-tiled" : ""}`}
      style={{
        width: nodeWidth,
        backgroundColor: bodyWash,
        // v3 "Currents": the device-class hue is the node's full-perimeter border (replaces the
        // old 2.5px left edge-stripe). Width stays 1px to keep the port-grid invariant exact.
        // Overlap flags error red; selection adds a SEPARATE accent halo (box-shadow) so the
        // class colour is never overwritten.
        borderColor: isOverlapping ? "var(--color-error)" : classColor,
        boxShadow: isOverlapping
          ? "0 0 0 3px color-mix(in srgb, var(--color-error) 20%, transparent)"
          : selected
            ? "0 0 0 3px var(--color-accent-soft)"
            : undefined,
      }}
    >
      {/* Layout wrapper. `visibility: hidden` (never `display: none`) keeps every layout box —
           and so every handle's DOM rect — exactly where it sits untiled, while taking the
           hidden tree out of hit-testing and the accessibility tree. */}
      <div style={{ visibility: isTile ? "hidden" : undefined }}>
      {/* Layer colour, "band" mode — a 3px bar across the node's top edge. Absolutely
           positioned (like the status dot) so it overlays the header rather than adding a row:
           the header-band invariant is untouched. The header's layer chip carries the
           text pairing. */}
      {layerColor && layerColorMode === "band" && (
        <div
          // Inset 1.5px inside the class border (radius = outer − border, board 2a §1) so the
          // band never bleeds unevenly over the border corners.
          className="absolute left-[1.5px] right-[1.5px] top-[1.5px] h-[3px] rounded-t-[5px] pointer-events-none z-10"
          style={{ background: layerColor }}
          title={`Layer: ${layerChipName}`}
        />
      )}
      {/* Header band — merged name strip + header aux rows. Height is always a 16-multiple
           (min 32) so the first port below stays on the pathfinding grid. */}
      {renderHeaderBand(headerAuxRows)}

      {/* Software-host link badge — absolutely positioned above the node so it
           never shifts the port grid */}
      {hostLabel && (
        <div
          className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] px-1.5 py-px rounded-full whitespace-nowrap border"
          style={{
            background: "var(--color-surface)",
            borderColor: "var(--color-border)",
            color: "var(--color-text-muted)",
            pointerEvents: "none",
          }}
        >
          ⚙ runs on {hostLabel}
        </div>
      )}

      {/* Compact density — header only + a mono used/total I/O chip where the port grid would
           start. The port-row body and footer collapse, but ALL @xyflow Handles still render
           (positioned at the node's left/right edges with opacity 0) so connected edges keep
           valid handle bounds and never break. */}
      {isCompact && (
        <>
          {/* Same handle ids/types as the canonical (isHiddenAdapter) path, kept at
               default measurable size but invisible (opacity 0) and pinned to the node's
               vertical middle. Zero-sized handles can't be measured by React Flow, which
               breaks edge creation — so we only hide them, never shrink them. */}
          {data.ports.map((p) => {
            if (p.direction === "bidirectional") {
              // A collapsed bidirectional port renders a single handle whose type/id
              // depends on which side it's connected — reuse handleProps so the compact
              // handle matches expanded mode exactly (else its edge can't be created).
              const collapsed = collapsedBidir.get(p.id);
              if (collapsed) {
                const h = handleProps(p, "left");
                return <Handle key={p.id} type={h.handleType} position={Position.Left} id={h.handleId} style={{ opacity: 0, top: "50%" }} />;
              }
              return (
                <span key={p.id}>
                  <Handle type="target" position={Position.Left} id={`${p.id}-in`} style={{ opacity: 0, top: "50%" }} />
                  <Handle type="source" position={Position.Right} id={`${p.id}-out`} style={{ opacity: 0, top: "50%" }} />
                </span>
              );
            }
            if (p.direction === "passthrough") {
              return (
                <span key={p.id}>
                  <Handle type="source" position={Position.Left} id={`${p.id}-rear`} style={{ opacity: 0, top: "50%" }} />
                  <Handle type="source" position={Position.Right} id={`${p.id}-front`} style={{ opacity: 0, top: "50%" }} />
                </span>
              );
            }
            const side = portSide(p);
            return (
              <Handle
                key={p.id}
                type={p.direction === "input" ? "target" : "source"}
                position={side === "left" ? Position.Left : Position.Right}
                id={p.id}
                style={{ opacity: 0, top: "50%" }}
              />
            );
          })}
          <div className="flex items-center justify-center h-5">
            <span
              className="text-[9px] text-[var(--color-text-muted)]"
              style={{ fontFamily: "var(--font-mono)" }}
              title={`${ioSummary.connected} of ${ioSummary.total} I/O connected`}
            >
              {ioSummary.connected}/{ioSummary.total} I/O
            </span>
          </div>
        </>
      )}

      {/* Port area — 6px top padding lands handle centers on the 16px grid:
           1px (outer top border) + headerBand(16-mult) + 1px (header border-b)
           + 6px (pt) + 8px (half row) ≡ 0 mod 16.
           The header's `border-b` adds 1px between the band and the port column,
           which the `pt` value (6 not 7) compensates for. */}
      {!isCompact && (
      <div className="pt-[6px] pb-[7px]">
      {/* Input/Output Ports — two independent columns */}
      {(leftPorts.length > 0 || rightPorts.length > 0) && (
        hasSections ? (
          /* Sectioned layout: independent columns */
          <div className="flex">
            {/* Left column */}
            <div className="flex-1 min-w-0">
              {leftItems.map((item, i) =>
                item.type === "section" ? (
                  <div key={`lsec-${i}`} className="h-4 flex items-end pl-2">
                    <span className="text-[9px] text-[var(--color-text-muted)] truncate border-b border-[var(--color-border)]/30 w-full pb-0.5 mr-1">
                      {item.name}
                    </span>
                  </div>
                ) : item.type === "divider" ? (
                  renderDivider(`ldiv-${i}`)
                ) : renderColumnPort(item.port, "left"),
              )}
            </div>

            {/* Right column */}
            <div className="flex-1 min-w-0">
              {rightItems.map((item, i) =>
                item.type === "section" ? (
                  <div key={`rsec-${i}`} className="h-4 flex items-end pr-2">
                    <span className="text-[9px] text-[var(--color-text-muted)] truncate text-right border-b border-[var(--color-border)]/30 w-full pb-0.5 ml-1">
                      {item.name}
                    </span>
                  </div>
                ) : item.type === "divider" ? (
                  renderDivider(`rdiv-${i}`)
                ) : renderColumnPort(item.port, "right"),
              )}
            </div>
          </div>
        ) : (
          /* Non-sectioned layout: paired rows */
          <div>
            {Array.from({ length: Math.max(leftPorts.length, rightPorts.length, 1) }, (_, i) => {
              const left = leftPorts[i];
              const right = rightPorts[i];
              const lh = left ? handleProps(left, "left") : null;
              const rh = right ? handleProps(right, "right") : null;
              return (
                <div key={i} className="device-port-row flex justify-between items-center relative h-4">
                  <div className="flex items-center gap-1 pl-3 min-w-0 flex-1" onContextMenu={left ? (e) => openPortMenu(e, left) : undefined}>
                    {left && lh && (
                      <>
                        <Handle
                          type={lh.handleType}
                          position={Position.Left}
                          id={lh.handleId}
                          data-connected={connectedHandles.has(lh.handleId) || undefined}
                          data-multi-connect={left.multiConnect || undefined}
                          className={connectorClass("left", connectedHandles.has(lh.handleId))}
                          style={connectorStyle(portHandleColor(left), connectedHandles.has(lh.handleId), { multi: left.multiConnect })}
                        />
                        {renderInternalMark(left, "left")}
                        <span
                          className="text-[10px] leading-4 truncate"
                          style={{ color: "var(--color-text)" }}
                          title={portRowTitle(left)}
                        >
                          {fitPortLabel(portRowLabel(left))}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1 pr-3 min-w-0 flex-1 justify-end" onContextMenu={right ? (e) => openPortMenu(e, right) : undefined}>
                    {right && rh && (
                      <>
                        <span
                          className="text-[10px] leading-4 truncate"
                          style={{ color: "var(--color-text)" }}
                          title={portRowTitle(right)}
                        >
                          {fitPortLabel(portRowLabel(right))}
                        </span>
                        {renderInternalMark(right, "right")}
                        <Handle
                          type={rh.handleType}
                          position={Position.Right}
                          id={rh.handleId}
                          data-connected={connectedHandles.has(rh.handleId) || undefined}
                          data-multi-connect={right.multiConnect || undefined}
                          className={connectorClass("right", connectedHandles.has(rh.handleId))}
                          style={connectorStyle(portHandleColor(right), connectedHandles.has(rh.handleId), { multi: right.multiConnect })}
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Empty Expansion Slots — hidden when slot.hideWhenEmpty (template, storage media
          etc.) or slot.hidden (per-instance user toggle, #211). */}
      {data.slots?.some((s) => !s.cardTemplateId && !s.hideWhenEmpty && !s.hidden) && (
        <div>
          {data.slots.filter((s) => !s.cardTemplateId && !s.hideWhenEmpty && !s.hidden).map((slot) => (
            <div key={slot.slotId} className="flex justify-center items-center h-4 mx-1">
              <span className="text-[9px] text-[var(--color-text-muted)] opacity-40 truncate text-center italic">
                {displayLabel(slot.label)} (empty)
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Passthrough Ports — one row per circuit, rear handle left, front handle right */}
      {passthroughPorts.length > 0 && (
        <div>
          <div className="flex h-4">
            <div className="flex-1 flex items-end pl-2">
              <span className="text-[9px] text-[var(--color-text-muted)] truncate border-b border-[var(--color-border)]/30 w-full pb-0.5 mr-1">
                Rear
              </span>
            </div>
            <div className="flex-1 flex items-end pr-2 justify-end">
              <span className="text-[9px] text-[var(--color-text-muted)] truncate text-right border-b border-[var(--color-border)]/30 w-full pb-0.5 ml-1">
                Front
              </span>
            </div>
          </div>
          {passthroughItems.map((item, i) =>
            item.type === "section" ? (
              <div key={`psec-${i}`} className="flex justify-center items-end h-4 mx-1">
                <span className="text-[9px] text-[var(--color-text-muted)] pb-0.5 truncate border-b border-[var(--color-border)]/30 w-full text-center">
                  {item.name}
                </span>
              </div>
            ) : item.type === "divider" ? (
              renderDivider(`pdiv-${i}`)
            ) : renderPassthroughPort(item.port),
          )}
        </div>
      )}

      {/* Bidirectional Ports */}
      {bidirectional.length > 0 && (
        <div>
          {bidirItems.map((item, i) => {
            if (item.type === "section") {
              return (
                <div key={`bsec-${i}`} className="flex justify-center items-end h-4 mx-1">
                  <span className="text-[9px] text-[var(--color-text-muted)] pb-0.5 truncate border-b border-[var(--color-border)]/30 w-full text-center">
                    {item.name}
                  </span>
                </div>
              );
            }
            if (item.type === "divider") {
              return renderDivider(`bdiv-${i}`);
            }

            const port = item.port;
            const inId = `${port.id}-in`;
            const outId = `${port.id}-out`;
            const inConnected = connectedHandles.has(inId);
            const outConnected = connectedHandles.has(outId);
            const inDisabled = outConnected;
            const outDisabled = inConnected;

            return (
              <div key={port.id} className="device-port-row flex justify-center items-center relative h-4">
                <Handle
                  type="source"
                  position={Position.Left}
                  id={inId}
                  data-connected={connectedHandles.has(inId) || undefined}
                  data-multi-connect={port.multiConnect || undefined}
                  className={connectorClass("left", inConnected)}
                  style={connectorStyle(portHandleColor(port), inConnected, { multi: port.multiConnect, disabled: inDisabled })}
                />
                {/* No internal-link mark here: a bidirectional row is centred with a connector on
                     each face, so there is no single side for the mark to mirror. Internal links
                     are drawn on the left/right column ports, which is where the design scopes
                     them and where the geometry is unambiguous. */}
                <span
                  className="text-[10px] leading-4 truncate"
                  style={{ color: portHandleColor(port) }}
                  title={portRowTitle(port) + " — bidirectional"}
                >
                  ↔ {fitPortLabel(portRowLabel(port), true)}
                </span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={outId}
                  data-connected={connectedHandles.has(outId) || undefined}
                  data-multi-connect={port.multiConnect || undefined}
                  className={connectorClass("right", outConnected)}
                  style={connectorStyle(portHandleColor(port), outConnected, { multi: port.multiConnect, disabled: outDisabled })}
                />
              </div>
            );
          })}
        </div>
      )}
      {/* Instrument footer — mono row: used/total I/O · power W · template ID. Mirrors the design
           mockup §4. Template ID is faint and right-aligned. This block is what the "detailed"
           tier adds over "default"; it sits below the ports, so its height never moves them. */}
      {showFooterStats && (ioSummary.total > 0 || data.powerDrawW || data.templateId) && (
        <div className="flex items-center gap-1.5 px-3 h-5 border-t border-[var(--ui-border)]">
          {ioSummary.total > 0 && (
            <span
              className="text-[8px] text-[var(--color-text)]"
              style={{ fontFamily: "var(--font-mono)" }}
              title={`${dirIn} inputs · ${dirOut} outputs — ${ioSummary.connected} of ${ioSummary.total} I/O connected`}
            >
              {dirIn} in · {dirOut} out
            </span>
          )}
          {data.powerDrawW ? (
            <span
              className="text-[8px] text-[var(--color-text-muted)]"
              style={{ fontFamily: "var(--font-mono)" }}
              title={`${data.powerDrawW} watts`}
            >
              · {data.powerDrawW}W
            </span>
          ) : null}
          {data.templateId && (
            <span
              className="text-[8px] text-[var(--color-text-muted)] truncate ml-auto"
              style={{ fontFamily: "var(--font-mono)" }}
              title={data.templateId}
            >
              {data.templateId}
            </span>
          )}
        </div>
      )}
      {renderFooterAuxBlock(footerAuxRows)}
      </div>
      )}
      </div>

      {/* Tile tier — a solid class-colour block covering the (still-laid-out) node. The code, the
           Device name and the connected/total count are all text, so the class colour is never
           the only thing carrying meaning. Ports aren't reachable while tiled: the handles below
           stay mounted for wire anchoring, but this block owns the pointer. */}
      {isTile && (
        <div
          className="absolute inset-0 rounded-[6px] px-1.5 flex flex-col items-center justify-center overflow-hidden"
          style={{ background: tileFill }}
          title={`${displayLabel(resolvedLabel.text)} — ${ioSummary.connected} of ${ioSummary.total} I/O connected`}
        >
          {/* Aggregate connector dots — the visible face of the converged handles beneath
              (deviceNodeMotion.css collapses every per-port anchor onto these centres). */}
          <span
            aria-hidden
            className="absolute left-[-4.5px] top-1/2 -translate-y-1/2 w-[9px] h-[9px] rounded-full"
            style={{ background: tileLeftColor }}
          />
          <span
            aria-hidden
            className="absolute right-[-4.5px] top-1/2 -translate-y-1/2 w-[9px] h-[9px] rounded-full"
            style={{ background: tileRightColor }}
          />
          <ArtworkChip
            artworkAssetId={data.artworkAssetId}
            device={data}
            size={26}
            color={classColor}
          />
          <span className="mt-1 max-w-full text-[9px] font-semibold leading-tight truncate text-[var(--color-text-heading)]">
            {displayLabel(resolvedLabel.text)}
          </span>
          <span
            className="mt-0.5 text-[8px] font-semibold uppercase leading-none text-[var(--color-text)]"
            style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}
          >
            {dirIn} in · {dirOut} out
          </span>
        </div>
      )}
    </div>
  );
}

export default memo(DeviceNodeComponent);

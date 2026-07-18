import { memo, useState, useRef, useEffect } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
} from "@xyflow/react";
import { useSchematicStore } from "../store";
import {
  CONNECTOR_LABELS,
  DEFAULT_DISTANCE_SETTINGS,
  LINE_STYLE_DASHARRAY,
  type ConnectionEdge,
  type LineStyle,
  type Port,
} from "../types";
import { usbcPowerShortfallW } from "../connectorTypes";
import { resolvePort } from "../packList";
import { bundleChannelCount, channelCountSuffix, channelFit } from "../cableFit";
import { computeCableLength, getRoomDistance } from "../roomDistance";
import { FEET_PER_METER, formatLengthMode } from "../lengthFormat";
import "../liveSignal.css";

// Whether the user has asked the OS to reduce motion. Read once at module load —
// matches how the rest of the app treats this as a static environment preference.
const PREFERS_REDUCED_MOTION =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Contrast under-stroke drawn beneath every wired signal core, so dark signal hues lift off the
// canvas and crossings de-clutter. It has to invert with the theme (light casing on the dark
// ground, dark casing on light paper), and this file has no theme read — --color-text-heading is
// the token that already flips in exactly that direction, so the casing rides it instead of a
// JS-side hex pair.
const WIRE_CASING = "color-mix(in srgb, var(--color-text-heading) 24%, transparent)";

/** How much wider the casing is than the core it sits under. */
const CASING_EXTRA = 2.4;

/** Bundle trunk: the neutral sheath a multicore's cores run inside. Wide enough to read as one
 *  physical thing behind the cores, faint enough that the cores stay the signal. */
const TRUNK_WIDTH = 12;
const TRUNK_OPACITY = 0.26;

/** Which way signal flows at ONE end of a connection, from that port's direction:
 *  "out" = signal leaves here · "in" = signal arrives here · "bi" = bidirectional or ambiguous
 *  (a bidirectional port like Ethernet/USB, a passthrough, or an unresolved port → two-way). */
function endSignalDir(port: Port | undefined): "out" | "in" | "bi" {
  const d = port?.direction;
  if (d === "output") return "out";
  if (d === "input") return "in";
  return "bi";
}

function OffsetEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  selected,
  interactionWidth,
}: EdgeProps<ConnectionEdge>) {
  const debugEdges = useSchematicStore((s) => s.debugEdges);
  const debugShowLabels = useSchematicStore((s) => s.debugShowLabels);
  const liveSignal = useSchematicStore((s) => s.liveSignal);
  const reduceMotion = useSchematicStore((s) => s.reduceMotion);
  const lengthUnitMode = useSchematicStore((s) => s.lengthUnitMode);
  const cableIdLabelScope = useSchematicStore((s) => s.cableIdLabelScope);

  // Hover state for showing visual reconnect indicators in HTML layer
  const [isHovered, setIsHovered] = useState(false);
  // Tooltip state — tracks which updater circle the mouse is over
  const [tooltipType, setTooltipType] = useState<"source" | "target" | null>(null);

  useEffect(() => {
    const el = document.querySelector(`.react-flow__edge[data-id="${id}"]`);
    if (!el) return;
    const onEnter = () => setIsHovered(true);
    const onLeave = () => { setIsHovered(false); setTooltipType(null); };
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);

    // Track hover on individual updater circles for tooltip
    const srcUpdater = el.querySelector('.react-flow__edgeupdater-source');
    const tgtUpdater = el.querySelector('.react-flow__edgeupdater-target');
    const onEnterSrc = () => setTooltipType("source");
    const onEnterTgt = () => setTooltipType("target");
    const onLeaveUpdater = () => setTooltipType(null);
    srcUpdater?.addEventListener('mouseenter', onEnterSrc);
    tgtUpdater?.addEventListener('mouseenter', onEnterTgt);
    srcUpdater?.addEventListener('mouseleave', onLeaveUpdater);
    tgtUpdater?.addEventListener('mouseleave', onLeaveUpdater);

    return () => {
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
      srcUpdater?.removeEventListener('mouseenter', onEnterSrc);
      tgtUpdater?.removeEventListener('mouseenter', onEnterTgt);
      srcUpdater?.removeEventListener('mouseleave', onLeaveUpdater);
      tgtUpdater?.removeEventListener('mouseleave', onLeaveUpdater);
    };
  }, [id]);

  // Read pre-computed route from store (serialized to string to avoid re-render loops)
  const routeStr = useSchematicStore((s) => {
    const r = s.routedEdges[id];
    if (!r) return "";
    const path = (s.showLineJumps && r.svgPathWithHops) || r.svgPath;
    return `${path}\0${r.labelX}\0${r.labelY}\0${r.turns}`;
  });

  // Read connector mismatch flag (stable primitive selector)
  const connectorMismatch = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return edge?.data?.connectorMismatch === true;
  });

  // USB-C Power Delivery shortfall — derived live from the connected ports (wattage is
  // edited after the connection exists, so it can't be a flag frozen at creation time).
  // Returns the deficit in watts, or null when adequately supplied / not applicable.
  const usbcShortfall = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    if (!edge) return null;
    const srcNode = s.nodes.find((n) => n.id === edge.source);
    const tgtNode = s.nodes.find((n) => n.id === edge.target);
    return usbcPowerShortfallW(
      resolvePort(srcNode, edge.sourceHandle),
      resolvePort(tgtNode, edge.targetHandle),
    );
  });

  // Check if this edge is hidden (part of a virtual pair, the secondary half)
  const isHiddenVirtualEdge = useSchematicStore((s) => s.hiddenVirtualEdgeIds.has(id));

  // Check if this edge is the primary half of a virtual pair (target is a hidden adapter)
  const isVirtualPrimary = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return edge ? s.hiddenAdapterNodeIds.has(edge.target) : false;
  });

  // Check if this edge should render as a gradient (virtual edge bridging different signal types)
  const gradientColors = useSchematicStore((s) => {
    const g = s.virtualEdgeGradients[id];
    if (!g) return "";
    return `${g.sourceColor}\0${g.targetColor}`;
  });

  // Read allow incompatible override (stable primitive selector)
  const allowIncompatible = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return edge?.data?.allowIncompatible === true;
  });

  // Read direct-attach flag (edge represents physical plug-in, not a cable)
  const directAttach = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return edge?.data?.directAttach === true;
  });

  // Wireless link — a port whose connector is "wireless" (mirrors packList's BOM-exclusion test,
  // so these stay out of the cable BOM). Rendered as a broadcast arc, never a routed cable.
  const isWireless = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    if (!edge) return false;
    const srcNode = s.nodes.find((n) => n.id === edge.source);
    const tgtNode = s.nodes.find((n) => n.id === edge.target);
    return (
      resolvePort(srcNode, edge.sourceHandle)?.connectorType === "wireless" ||
      resolvePort(tgtNode, edge.targetHandle)?.connectorType === "wireless"
    );
  });

  // Multi-channel cable bundle (C4): connector + channel count for the hover/selection chip,
  // e.g. "DB25 · 8ch". Connector label comes from each end's Port.connectorType; the channel
  // count comes from Port.isMulticable/channelCount (the populated multicable-port model —
  // see cableFit.ts's bundle helpers). Empty string when neither end resolves a connector, so
  // the chip renders nothing rather than an empty badge. Serialized (label\0fit) like every
  // other selector here for a stable primitive comparison.
  const channelChipStr = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    if (!edge) return "";
    const srcNode = s.nodes.find((n) => n.id === edge.source);
    const tgtNode = s.nodes.find((n) => n.id === edge.target);
    const srcPort = resolvePort(srcNode, edge.sourceHandle);
    const tgtPort = resolvePort(tgtNode, edge.targetHandle);
    const srcLabel = srcPort?.connectorType ? CONNECTOR_LABELS[srcPort.connectorType] : "";
    const tgtLabel = tgtPort?.connectorType ? CONNECTOR_LABELS[tgtPort.connectorType] : "";
    const label = srcLabel && tgtLabel && srcLabel !== tgtLabel ? `${srcLabel} → ${tgtLabel}` : srcLabel || tgtLabel;
    if (!label) return "";
    const srcCount = srcPort?.isMulticable ? srcPort.channelCount : undefined;
    const tgtCount = tgtPort?.isMulticable ? tgtPort.channelCount : undefined;
    const suffix = channelCountSuffix(bundleChannelCount(srcCount, tgtCount));
    return `${label}${suffix}\0${channelFit(srcCount, tgtCount)}`;
  });
  const [channelChipLabel, channelChipFit] = channelChipStr
    ? (channelChipStr.split("\0") as [string, string])
    : ["", "unknown"];

  // Real signal-flow direction along the cable (OUTPUT end → INPUT end), independent of React
  // Flow's source/target (which only reflect the order the connection was drawn). Drives the
  // live-signal band so it always travels out of an output into an input. "bi" = a bidirectional
  // port (e.g. Ethernet/USB) is involved → the band animates BOTH ways.
  const flowDir = useSchematicStore((s): "forward" | "reverse" | "bi" => {
    const edge = s.edges.find((e) => e.id === id);
    if (!edge) return "forward";
    const srcNode = s.nodes.find((n) => n.id === edge.source);
    const tgtNode = s.nodes.find((n) => n.id === edge.target);
    const sEnd = endSignalDir(resolvePort(srcNode, edge.sourceHandle));
    const tEnd = endSignalDir(resolvePort(tgtNode, edge.targetHandle));
    // A definite end decides the direction even when the other end is a passthrough or
    // bidirectional port (a patch-panel leg fed by an output still flows one way). Only a
    // connection with NO definite end (bi↔bi, e.g. Ethernet) animates both ways.
    if (sEnd === "out") return "forward"; // source is the output → signal flows source→target
    if (tEnd === "out") return "reverse"; // target is the output → signal flows target→source
    if (sEnd === "in") return "reverse"; // signal arrives at the source end → target→source
    if (tEnd === "in") return "forward"; // signal arrives at the target end → source→target
    return "bi";
  });

  // Read user-defined connection label (stable primitive selector)
  const edgeLabel = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return (edge?.data?.label as string) ?? "";
  });
  // Per-end label overrides (#114)
  const edgeSourceLabel = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return (edge?.data?.sourceLabel as string) ?? "";
  });
  const edgeTargetLabel = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return (edge?.data?.targetLabel as string) ?? "";
  });

  // Cable ID label from pre-computed map
  const showCableIdLabels = useSchematicStore((s) => s.showCableIdLabels);
  const showCustomLabels = useSchematicStore((s) => s.showCustomLabels);
  const globalCableIdGap = useSchematicStore((s) => s.cableIdGap);
  const globalCableIdMidOffset = useSchematicStore((s) => s.cableIdMidOffset);
  const globalCableIdLabelMode = useSchematicStore((s) => s.cableIdLabelMode);
  const cableId = useSchematicStore((s) => s.cableIdMap[id] ?? "");

  // Estimated run for this connection, in metres. Same source as the inspector's run reading and
  // the cable schedule's "Est. Length": the source→target room distance plus the document's slack
  // settings. Derived here per edge rather than via computeCableSchedule, which walks the whole
  // graph — one schedule build per edge component would be quadratic on a large canvas.
  // Undefined whenever the rooms carry no distance (or the ends share a room): the label then
  // shows the cable ID alone rather than inventing a number.
  const runMeters = useSchematicStore((s): number | undefined => {
    const edge = s.edges.find((e) => e.id === id);
    if (!edge) return undefined;
    const srcParent = s.nodes.find((n) => n.id === edge.source)?.parentId;
    const tgtParent = s.nodes.find((n) => n.id === edge.target)?.parentId;
    const dist = getRoomDistance(srcParent, tgtParent, { roomDistances: s.roomDistances }, s.nodes);
    if (dist === undefined) return undefined;
    const settings = s.distanceSettings ?? DEFAULT_DISTANCE_SETTINGS;
    const value = computeCableLength(dist, settings);
    // Room distances are stored in the document's display unit; lengthFormat speaks metres.
    return settings.unit === "ft" ? value / FEET_PER_METER : value;
  });

  const hideCableId = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return edge?.data?.hideCableId === true || edge?.data?.hideLabel === true;
  });
  const edgeCableIdGap = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return edge?.data?.cableIdGap as number | undefined;
  });
  const edgeCableIdMidOffset = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return edge?.data?.cableIdMidOffset as number | undefined;
  });
  const edgeCableIdLabelMode = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return edge?.data?.cableIdLabelMode as "endpoint" | "midpoint" | undefined;
  });

  // Endpoint cable-ID labels are suppressed at any stub-label endpoint — the stub box
  // itself already identifies the connection there; printing the cable ID at both the
  // device port AND the stub label would yield 4 IDs per logical cable instead of 2.
  const sourceIsStub = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    if (!edge) return false;
    return s.nodes.find((n) => n.id === edge.source)?.type === "stub-label";
  });
  const targetIsStub = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    if (!edge) return false;
    return s.nodes.find((n) => n.id === edge.target)?.type === "stub-label";
  });

  // When the "Colour by" axis is not signal, connections take a flat axis colour
  // (set on style.stroke upstream) — suppress the multi-signal gradient so it shows through.
  const colorBySignal = useSchematicStore((s) => s.colorBy === "signal");

  // Bundle trunk — the neutral sheath under the coloured cores of every connection sharing a
  // ConnectionData.bundleId (the multicore/snake read). A bundle is ONE trunk shared by N
  // connections, but each connection renders itself, so exactly one member draws it: the first in
  // the edges array. React Flow paints edges in array order (elevateEdgesOnSelect is off on
  // <ReactFlow>), so drawing there puts the trunk beneath every sibling's core. Serialized like
  // every selector here — an object identity would re-render on each store tick.
  const trunkStr = useSchematicStore((s) => {
    if (!s.bundleView) return "";
    const bundleId = s.edges.find((e) => e.id === id)?.data?.bundleId;
    if (!bundleId) return "";
    // The hidden half of a virtual adapter pair renders nothing, so it can never be the drawer.
    const members = s.edges.filter(
      (e) => e.data?.bundleId === bundleId && !s.hiddenVirtualEdgeIds.has(e.id),
    );
    // One cable is not a multicore — a trunk behind a lone core would assert something untrue.
    if (members.length < 2 || members[0].id !== id) return "";
    let sumX = 0;
    let routed = 0;
    let y1 = Infinity;
    let y2 = -Infinity;
    for (const m of members) {
      const r = s.routedEdges[m.id];
      const wps = r?.waypoints;
      if (!wps || wps.length < 2) continue;
      sumX += r.labelX;
      y1 = Math.min(y1, wps[0].y, wps[wps.length - 1].y);
      y2 = Math.max(y2, wps[0].y, wps[wps.length - 1].y);
      routed += 1;
    }
    // Mid-route (or an unroutable bundle): draw nothing rather than a trunk in the wrong place.
    if (routed < 2) return "";
    return `${Math.round(sumX / routed)}\0${y1}\0${y2}\0${members.length}\0${bundleId}`;
  });

  // Read effective line style: per-connection override > per-signal-type default > solid
  const lineStyle = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    if (edge?.data?.lineStyle) return edge.data.lineStyle as LineStyle;
    const signalType = edge?.data?.signalType;
    if (signalType && s.signalLineStyles?.[signalType]) return s.signalLineStyles[signalType]!;
    return "solid" as LineStyle;
  });

  // Read routed waypoints (serialized for stability)
  const routeWpStr = useSchematicStore((s) => {
    const r = s.routedEdges[id];
    if (!r?.waypoints?.length) return "";
    return r.waypoints.map((p) => `${p.x},${p.y}`).join("|");
  });

  // Read manual waypoints directly (serialized for stable selector)
  const manualWpStr = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    if (!edge?.data?.manualWaypoints?.length) return "";
    return edge.data.manualWaypoints.map((p) => `${p.x},${p.y}`).join("|");
  });

  const isManual = manualWpStr.length > 0;

  // Motion is off if EITHER source says so: the OS-level preference, or the in-app toggle for
  // users whose OS setting doesn't match how they want to read this canvas.
  const motionOff = PREFERS_REDUCED_MOTION || reduceMotion;

  let edgePath: string;
  let lx: number;
  let ly: number;
  let turns: string;

  if (routeStr) {
    const parts = routeStr.split("\0");
    edgePath = parts[0];
    lx = Number(parts[1]);
    ly = Number(parts[2]);
    turns = parts[3];
  } else {
    edgePath = `M ${sourceX} ${sourceY} L ${sourceX} ${sourceY}`;
    lx = sourceX;
    ly = sourceY;
    turns = "pending";
  }

  // Edge stroke colour = the signal-type colour resolved upstream (the locked signal palette).
  const signalColor = (style?.stroke as string) ?? "#6b7280";

  // Wireless links render as a dashed broadcast arc (quadratic Bézier arcing 26px up), not a
  // routed cable — a distinct shape so over-air links never read as a wired run. Routing geometry
  // itself is untouched; only this component's rendered path is swapped.
  const wirelessArcPath = isWireless
    ? `M ${sourceX} ${sourceY} Q ${(sourceX + targetX) / 2} ${Math.min(sourceY, targetY) - 26} ${targetX} ${targetY}`
    : null;
  const renderPath = wirelessArcPath ?? edgePath;

  // Gradient for virtual edges bridging different signal types
  const hasGradient = gradientColors.length > 0 && colorBySignal;
  const gradientId = hasGradient ? `gradient-${id}` : "";
  let gradientDef: React.ReactNode = null;
  if (hasGradient && routeStr) {
    const [srcColor, tgtColor] = gradientColors.split("\0");
    // Use the first and last waypoints for gradient direction
    const routeData = useSchematicStore.getState().routedEdges[id];
    const wps = routeData?.waypoints;
    if (wps && wps.length >= 2) {
      const first = wps[0];
      const last = wps[wps.length - 1];
      gradientDef = (
        <defs>
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={first.x}
            y1={first.y}
            x2={last.x}
            y2={last.y}
          >
            <stop offset="0%" stopColor={srcColor} />
            <stop offset="100%" stopColor={tgtColor} />
          </linearGradient>
        </defs>
      );
    }
  }

  // v3 "Currents": a soft luminance glow on every signal-coloured strand (theme-aware blur via
  // --cur-glow-blur, set in liveSignal.css). Skipped for direct-attach (grey physical plug-ins).
  const strandGlow =
    routeStr && !directAttach
      ? `drop-shadow(0 0 var(--cur-glow-blur, 4px) color-mix(in srgb, ${signalColor} 55%, transparent))`
      : undefined;

  // Width of a wired signal core — shared by the static strand, its casing, and the live band so
  // the three stay registered on top of each other.
  const coreW = selected ? 2.6 : 1.8;

  // The dash pattern the wired core actually renders with. A connector mismatch is a fault, so its
  // warning dashes outrank the cosmetic line-style preference. Undefined = solid.
  const coreDash =
    connectorMismatch && !allowIncompatible ? "6 3" : LINE_STYLE_DASHARRAY[lineStyle];

  const edgeStyle = routeStr
    ? {
        ...style,
        ...(directAttach
          ? { stroke: "#9ca3af", strokeWidth: selected ? 2 : 1 }
          : isWireless
            ? { strokeWidth: selected ? 2.2 : 1.7 }
            : { strokeWidth: coreW }),
        ...(isWireless
          ? { strokeDasharray: "2 6", strokeLinecap: "round" as const, opacity: 0.85 }
          : coreDash
            ? { strokeDasharray: coreDash }
            : {}),
        // USB-C power undersupply: amber dashed cue (yields to a gradient edge, which is rare here)
        ...(usbcShortfall != null && !hasGradient ? { stroke: "#f59e0b", strokeDasharray: "5 3" } : {}),
        ...(hasGradient ? { stroke: `url(#${gradientId})` } : {}),
        ...(strandGlow ? { filter: strandGlow } : {}),
      }
    : { ...style, strokeWidth: 0, opacity: 0 };

  // Casing under-stroke — wired cores only. A wireless arc is a broadcast, not a cable, and a
  // direct-attach plug-in already reads as flat grey chrome, so neither is cased (matching the
  // strand glow's exclusions). The casing carries the core's dash pattern rather than running
  // solid beneath it: a dashed line is a data cue (fault / line style), and a solid casing would
  // fill the gaps back in and erase it.
  const casingLayer =
    routeStr && !isWireless && !directAttach ? (
      <path
        d={edgePath}
        fill="none"
        style={{
          stroke: WIRE_CASING,
          strokeWidth: coreW + CASING_EXTRA,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          ...(coreDash ? { strokeDasharray: coreDash } : {}),
          pointerEvents: "none",
        }}
      />
    ) : null;

  // Show label at both source and target ends so it's visible even if the path goes behind a device
  const debugLabel = (debugEdges && debugShowLabels) ? (
    <>
      <foreignObject
        x={sourceX + 4}
        y={sourceY - 7}
        width={1}
        height={1}
        style={{ pointerEvents: "none", overflow: "visible" }}
      >
        <div style={{
          fontSize: 9,
          fontFamily: "monospace",
          fontWeight: 700,
          color: "#e44",
          background: "rgba(255,255,255,0.9)",
          padding: "0 3px",
          borderRadius: 2,
          whiteSpace: "nowrap",
          width: "max-content",
          border: "1px solid #fcc",
        }}>
          {id}{isManual ? " [manual]" : ""}
        </div>
      </foreignObject>
      <foreignObject
        x={targetX - 4}
        y={targetY - 7}
        width={1}
        height={1}
        style={{ pointerEvents: "none", overflow: "visible" }}
      >
        <div style={{
          fontSize: 9,
          fontFamily: "monospace",
          fontWeight: 700,
          color: "#e44",
          background: "rgba(255,255,255,0.9)",
          padding: "0 3px",
          borderRadius: 2,
          whiteSpace: "nowrap",
          width: "max-content",
          direction: "rtl",
          border: "1px solid #fcc",
        }}>
          {id}
        </div>
      </foreignObject>
    </>
  ) : null;

  // Compute direction vectors at source and target from routed waypoints
  // (needed early for stub exit direction and label positioning)
  let srcDx = 0, srcDy = 0, tgtDx = 0, tgtDy = 0;
  if (routeWpStr) {
    const wps = routeWpStr.split("|").map((s) => {
      const [x, y] = s.split(",");
      return { x: Number(x), y: Number(y) };
    });
    if (wps.length >= 2) {
      const sdx = wps[1].x - wps[0].x;
      const sdy = wps[1].y - wps[0].y;
      const slen = Math.sqrt(sdx * sdx + sdy * sdy);
      if (slen > 0) { srcDx = sdx / slen; srcDy = sdy / slen; }
      const tdx = wps[wps.length - 1].x - wps[wps.length - 2].x;
      const tdy = wps[wps.length - 1].y - wps[wps.length - 2].y;
      const tlen = Math.sqrt(tdx * tdx + tdy * tdy);
      if (tlen > 0) { tgtDx = tdx / tlen; tgtDy = tdy / tlen; }
    }
  }

  // --- Label rendering (#5, #61, #114) ---
  const labelText = cableId;
  const cableIdGap = edgeCableIdGap ?? globalCableIdGap;
  const cableIdLabelMode = edgeCableIdLabelMode ?? globalCableIdLabelMode;
  const cidMidOff = edgeCableIdMidOffset ?? globalCableIdMidOffset;
  // Custom labels use a fixed endpoint gap (#114 rework — no longer user-tunable).
  const CUSTOM_LABEL_GAP = 4;

  // Build cumulative distances along the routed path (shared by midpoint calculations)
  let pathWps: { x: number; y: number }[] = [];
  let cumDist: number[] = [];
  let totalLen = 0;
  if (routeWpStr) {
    pathWps = routeWpStr.split("|").map((s) => {
      const [wx, wy] = s.split(",");
      return { x: Number(wx), y: Number(wy) };
    });
    if (pathWps.length >= 2) {
      cumDist = [0];
      for (let i = 1; i < pathWps.length; i++) {
        const ddx = pathWps[i].x - pathWps[i - 1].x;
        const ddy = pathWps[i].y - pathWps[i - 1].y;
        cumDist.push(cumDist[i - 1] + Math.sqrt(ddx * ddx + ddy * ddy));
      }
      totalLen = cumDist[cumDist.length - 1];
    }
  }

  // Interpolate a point + direction along the path at a given distance from the start
  const pointAtDistance = (dist: number): { x: number; y: number; dx: number; dy: number } => {
    const d = Math.max(0, Math.min(totalLen, dist));
    for (let i = 1; i < cumDist.length; i++) {
      if (cumDist[i] >= d) {
        const segLen = cumDist[i] - cumDist[i - 1];
        const t = segLen > 0 ? (d - cumDist[i - 1]) / segLen : 0;
        const sdx = pathWps[i].x - pathWps[i - 1].x;
        const sdy = pathWps[i].y - pathWps[i - 1].y;
        const len = Math.sqrt(sdx * sdx + sdy * sdy);
        return {
          x: pathWps[i - 1].x + t * sdx,
          y: pathWps[i - 1].y + t * sdy,
          dx: len > 0 ? sdx / len : 1,
          dy: len > 0 ? sdy / len : 0,
        };
      }
    }
    const last = pathWps.length > 0 ? pathWps[pathWps.length - 1] : { x: lx, y: ly };
    return { ...last, dx: 1, dy: 0 };
  };

  // On-canvas label chrome follows the theme tokens — these sit on the canvas, so a hardcoded
  // white plate reads as a bright patch on the dark ground. A cable ID is an identifier, so it
  // takes the mono face; the custom label is prose and takes the UI face.
  const cableIdLabelStyle: React.CSSProperties = {
    position: "absolute",
    pointerEvents: "none",
    fontSize: 9,
    fontFamily: "var(--font-mono)",
    fontWeight: 600,
    color: "var(--color-text-heading)",
    background: "var(--color-surface)",
    padding: "0 3px",
    borderRadius: 2,
    whiteSpace: "nowrap",
    border: `1px solid ${signalColor}`,
    // Column so the run length can stack under the ID; harmless when the ID is the only line.
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    lineHeight: 1,
  };

  // Custom labels match the cable-ID badge in size and color (font 9, signal-colored
  // border) so the two read as one consistent set instead of the custom label being
  // greyer and a touch larger. (#209)
  const customLabelStyle: React.CSSProperties = {
    position: "absolute",
    pointerEvents: "none",
    fontSize: 9,
    fontFamily: "var(--font-ui)",
    fontWeight: 600,
    color: "var(--color-text-heading)",
    background: "var(--color-surface)",
    padding: "0 3px",
    borderRadius: 2,
    whiteSpace: "nowrap",
    border: `1px solid ${signalColor}`,
  };

  // Estimate badge width from text length (for offset positioning)
  const estimateBadgeWidth = (text: string, fontSize: number, paddingH: number) =>
    text.length * fontSize * 0.58 + paddingH * 2 + 2; // +2 for border

  // Build a positioned endpoint label that follows the cable path
  const makeEndpointLabel = (
    fromSource: boolean, offset: number,
    text: React.ReactNode, labelStyle: React.CSSProperties, key: string,
    // Fallbacks when no routed path is available
    fallbackX: number, fallbackY: number, fallbackDx: number, fallbackDy: number,
  ) => {
    let px: number, py: number, dirDx: number, dirDy: number;
    if (totalLen > 0) {
      // Walk along the path from source or target end
      const dist = fromSource ? offset : totalLen - offset;
      const pt = pointAtDistance(dist);
      px = pt.x;
      py = pt.y;
      // Direction pointing away from the endpoint (for anchor alignment)
      dirDx = fromSource ? pt.dx : -pt.dx;
      dirDy = fromSource ? pt.dy : -pt.dy;
    } else {
      // No route yet — fall back to straight-line offset
      const isHoriz = Math.abs(fallbackDx) >= Math.abs(fallbackDy);
      px = isHoriz ? fallbackX + Math.sign(fallbackDx) * offset : fallbackX;
      py = isHoriz ? fallbackY : fallbackY + Math.sign(fallbackDy) * offset;
      dirDx = fallbackDx;
      dirDy = fallbackDy;
    }
    const isHoriz = Math.abs(dirDx) >= Math.abs(dirDy);
    const anchorX = isHoriz ? (dirDx < 0 ? "-100%" : "0%") : "-50%";
    const anchorY = isHoriz ? "-50%" : (dirDy < 0 ? "-100%" : "0%");

    return (
      <div
        key={key}
        style={{
          ...labelStyle,
          transform: `translate(${anchorX}, ${anchorY}) translate(${px}px, ${py}px)`,
        }}
      >
        {text}
      </div>
    );
  };

  // For virtual primary edges, the target label should be at the end of the routed path
  // (not at the hidden adapter's handle position)
  let tgtLabelX = targetX;
  let tgtLabelY = targetY;
  if (isVirtualPrimary && routeWpStr) {
    const wps = routeWpStr.split("|").map((s) => {
      const [x, y] = s.split(",");
      return { x: Number(x), y: Number(y) };
    });
    if (wps.length >= 1) {
      tgtLabelX = wps[wps.length - 1].x;
      tgtLabelY = wps[wps.length - 1].y;
    }
  }

  // Determine which labels to show. "selected" scope narrows the labels to the connection the
  // user is actually working on — a full canvas of run labels is unreadable when only one run
  // is in question.
  const inLabelScope = cableIdLabelScope === "all" || !!selected;
  const showCableId = showCableIdLabels && inLabelScope && !hideCableId && labelText && routeStr;
  const showAnyCustom = !!showCustomLabels && !!routeStr;

  // Second line of the run label: the estimated run, in the user's unit mode. Omitted entirely
  // when this connection has no estimate — a run label with no run beats a placeholder that
  // reads like a measured value.
  const runLengthText = runMeters !== undefined ? formatLengthMode(runMeters, lengthUnitMode) : "";
  const cableIdContent: React.ReactNode = runLengthText ? (
    <>
      <span>{labelText}</span>
      <span style={{ color: "var(--color-text-muted)", marginTop: 1 }}>{runLengthText}</span>
    </>
  ) : (
    labelText
  );

  // Each custom label slot is visible iff its text is non-empty (#114 rework).
  const showSrcLabel = showAnyCustom && !!edgeSourceLabel;
  const showMidLabel = showAnyCustom && !!edgeLabel;
  const showTgtLabel = showAnyCustom && !!edgeTargetLabel;

  // Calculate custom label endpoint offset (past cable ID badge when cable ID is also at the same
  // endpoint). The badge is as wide as its widest line, which the run length can outgrow.
  const cableIdBadgeWidth = labelText
    ? Math.max(
        estimateBadgeWidth(labelText, 9, 3),
        runLengthText ? estimateBadgeWidth(runLengthText, 9, 3) : 0,
      )
    : 0;
  const customEndpointOffset = (showCableId && cableIdLabelMode === "endpoint")
    ? cableIdGap + cableIdBadgeWidth + 3 // base gap + badge + 3px padding
    : CUSTOM_LABEL_GAP;

  // Compute midpoint position along the path (for cable ID midpoint and custom midpoint label).
  // When a custom middle label shares the midpoint, the cable ID is nudged further along
  // the route so the two render side by side instead of stacking on top of each other —
  // the custom label stays centered, the cable ID sits just past it (#175).
  const midPairOffset = showMidLabel
    ? estimateBadgeWidth(edgeLabel, 9, 3) / 2 + estimateBadgeWidth(labelText, 9, 3) / 2 + 6
    : 0;
  const cidMidPt = totalLen > 0 ? pointAtDistance(totalLen / 2 + cidMidOff + midPairOffset) : { x: lx, y: ly };
  const customMidPt = totalLen > 0 ? pointAtDistance(totalLen / 2) : { x: lx, y: ly };

  // Cable ID labels — at endpoints or midpoint depending on mode.
  const cableIdLabels = showCableId ? (
    cableIdLabelMode === "endpoint" ? (
      <>
        {!sourceIsStub && makeEndpointLabel(true, cableIdGap, cableIdContent, cableIdLabelStyle, "cid-src",
          sourceX, sourceY, srcDx, srcDy)}
        {!targetIsStub && makeEndpointLabel(false, cableIdGap, cableIdContent, cableIdLabelStyle, "cid-tgt",
          tgtLabelX, tgtLabelY, -tgtDx, -tgtDy)}
      </>
    ) : (
      <div
        key="cid-mid"
        style={{
          ...cableIdLabelStyle,
          transform: `translate(-50%, -50%) translate(${cidMidPt.x}px, ${cidMidPt.y}px)`,
        }}
      >
        {cableIdContent}
      </div>
    )
  ) : null;

  // Custom labels — three independent slots (#114 rework). Each renders if its text is set.
  const customLabels = (showSrcLabel || showMidLabel || showTgtLabel) ? (
    <>
      {showSrcLabel && makeEndpointLabel(true, customEndpointOffset, edgeSourceLabel, customLabelStyle, "clbl-src",
        sourceX, sourceY, srcDx, srcDy)}
      {showMidLabel && (
        <div
          key="clbl-mid"
          style={{
            ...customLabelStyle,
            transform: `translate(-50%, -50%) translate(${customMidPt.x}px, ${customMidPt.y}px)`,
          }}
        >
          {edgeLabel}
        </div>
      )}
      {showTgtLabel && makeEndpointLabel(false, customEndpointOffset, edgeTargetLabel, customLabelStyle, "clbl-tgt",
        tgtLabelX, tgtLabelY, -tgtDx, -tgtDy)}
    </>
  ) : null;

  // USB-C power undersupply badge — amber pill at the midpoint stating the shortfall.
  const usbcWarningBadge = usbcShortfall != null ? (
    <div
      key="usbc-undersupply"
      title={`USB-C power undersupply: source delivers ${usbcShortfall}W less than the connected device draws`}
      style={{
        position: "absolute",
        transform: `translate(-50%, -50%) translate(${customMidPt.x}px, ${customMidPt.y}px)`,
        fontSize: 9,
        fontWeight: 700,
        lineHeight: 1.4,
        color: "#fff",
        background: "#f59e0b",
        padding: "0 4px",
        borderRadius: 4,
        whiteSpace: "nowrap",
        pointerEvents: "auto",
      }}
    >
      ⚡ −{usbcShortfall}W
    </div>
  ) : null;

  // Multi-channel bundle chip (C4) — connector + `·Nch` at the cable's midpoint, revealed on
  // hover/selection only (a chip on every cable would clutter the canvas). Not shown for
  // wireless (has its own identity badge) or direct-attach (not a cable). Always mounted once
  // there's a connector to show — visibility toggles via opacity/scale so the reveal transitions
  // rather than popping in on mount. Coral border+text when the two ends' channel counts
  // mismatch (an over/under-capacity run), same signal-colour border otherwise.
  const showChannelChip = !!channelChipLabel && !isWireless && !directAttach && !!routeStr;
  const channelChipVisible = showChannelChip && (selected || isHovered);
  const channelChipMismatch = channelChipFit === "mismatch";
  const channelChip = showChannelChip ? (
    <div
      key="channel-chip"
      style={{
        position: "absolute",
        pointerEvents: "none",
        transform:
          `translate(-50%, -100%) translate(${customMidPt.x}px, ${customMidPt.y - 10}px)` +
          (motionOff ? "" : ` scale(${channelChipVisible ? 1 : 0.95})`),
        transformOrigin: "50% 100%",
        opacity: channelChipVisible ? 1 : 0,
        transition: motionOff ? "opacity 140ms ease-out" : "opacity 140ms ease-out, transform 140ms ease-out",
        fontSize: 8.5,
        fontFamily: "var(--font-mono)",
        fontWeight: 700,
        letterSpacing: "0.02em",
        color: channelChipMismatch ? "var(--color-error)" : "var(--color-text-heading)",
        background: "var(--color-surface)",
        border: `1px solid ${channelChipMismatch ? "var(--color-error)" : signalColor}`,
        borderRadius: 4,
        padding: "1px 5px",
        whiteSpace: "nowrap",
      }}
    >
      {channelChipLabel}
    </div>
  ) : null;

  // Visual-only reconnect circles + tooltip — rendered in HTML layer above cable labels.
  // Interaction is handled by RF's native SVG updater circles (pointer events pass through
  // labels since they have pointer-events: none). These HTML elements are purely decorative.
  const RECONNECT_OFFSET = 12; // matches reconnectRadius prop on <ReactFlow>
  const showReconnect = (selected || isHovered) && routeStr;
  const srcVisualX = sourceX + srcDx * RECONNECT_OFFSET;
  const srcVisualY = sourceY + srcDy * RECONNECT_OFFSET;
  const tgtVisualX = targetX - tgtDx * RECONNECT_OFFSET;
  const tgtVisualY = targetY - tgtDy * RECONNECT_OFFSET;

  const reconnectVisuals = showReconnect ? (
    <>
      <div className="reconnect-visual"
        style={{ transform: `translate(-50%, -50%) translate(${srcVisualX}px, ${srcVisualY}px)` }} />
      <div className="reconnect-visual"
        style={{ transform: `translate(-50%, -50%) translate(${tgtVisualX}px, ${tgtVisualY}px)` }} />
      {tooltipType === "source" && (
        <div className="reconnect-tooltip"
          style={{ transform: `translate(-50%, -100%) translate(${srcVisualX}px, ${srcVisualY - 10}px)` }}>
          Drag to reroute
        </div>
      )}
      {tooltipType === "target" && (
        <div className="reconnect-tooltip"
          style={{ transform: `translate(-50%, -100%) translate(${tgtVisualX}px, ${tgtVisualY - 10}px)` }}>
          Drag to reroute
        </div>
      )}
    </>
  ) : null;

  // Wireless link badge — identity chrome at the middle of the broadcast arc, so an over-air link
  // names itself instead of relying on the reader decoding a dashed curve. The glyph and the mono
  // label carry the same fact, and the label repeats it in words: colour is never the only cue.
  // Not gated on showCableIdLabels — a wireless link carries no cable ID, so hiding run labels
  // would otherwise leave it unlabelled. Sits at the Bézier's t=0.5 point (0.25·A + 0.5·ctrl +
  // 0.25·B), matching the arc drawn in wirelessArcPath.
  const wirelessBadge = isWireless && routeStr ? (
    <div
      key="wl-badge"
      style={{
        position: "absolute",
        pointerEvents: "none",
        transform: `translate(-50%, -50%) translate(${(sourceX + targetX) / 2}px, ${
          0.25 * sourceY + 0.5 * (Math.min(sourceY, targetY) - 26) + 0.25 * targetY
        }px)`,
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 5px",
        borderRadius: 4,
        background: "var(--color-surface)",
        border: `1px solid ${signalColor}`,
        whiteSpace: "nowrap",
      }}
    >
      <svg
        width="9"
        height="9"
        viewBox="0 0 24 24"
        fill="none"
        stroke={signalColor}
        strokeWidth="2.2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M5 13a10 10 0 0 1 14 0M8 16a5 5 0 0 1 8 0" />
        <circle cx="12" cy="19.5" r="1" fill={signalColor} />
      </svg>
      <span
        style={{
          fontSize: 8.5,
          fontFamily: "var(--font-mono)",
          fontWeight: 700,
          color: "var(--color-text-heading)",
          letterSpacing: "0.02em",
        }}
      >
        RF · wireless
      </span>
    </div>
  ) : null;

  // --- Bundle trunk (multicore / snake) ---
  const trunk = trunkStr
    ? (() => {
        const [gx, ty1, ty2, n, label] = trunkStr.split("\0");
        return { gx: Number(gx), y1: Number(ty1), y2: Number(ty2), n: Number(n), label };
      })()
    : null;

  // The sheath itself: one neutral stroke down the shared channel. Neutral is the point — the
  // trunk is the conduit, and each core keeps its own signal colour riding on top of it.
  const trunkLayer = trunk ? (
    <path
      d={`M ${trunk.gx} ${trunk.y1} L ${trunk.gx} ${trunk.y2}`}
      fill="none"
      stroke="var(--color-text-muted)"
      strokeWidth={TRUNK_WIDTH}
      strokeLinecap="round"
      opacity={TRUNK_OPACITY}
      style={{ pointerEvents: "none" }}
    />
  ) : null;

  // Trunk badge — names the bundle and counts its cores, so the trunk is read from words rather
  // than from a reader inferring "thick grey line" = multicore. The count is spelled "6×" beside
  // the id, matching how a snake is called out on a real patch sheet.
  const trunkBadge = trunk ? (
    <div
      key="bundle-badge"
      style={{
        position: "absolute",
        pointerEvents: "none",
        transform: `translate(-50%, -100%) translate(${trunk.gx}px, ${trunk.y1 - 6}px)`,
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 7px",
        borderRadius: 6,
        background: "var(--color-surface)",
        border: "1px solid var(--ui-border)",
        whiteSpace: "nowrap",
      }}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-text-muted)"
        strokeWidth="1.7"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
      <span
        style={{
          fontSize: 8.5,
          fontFamily: "var(--font-mono)",
          fontWeight: 700,
          color: "var(--color-text-heading)",
          letterSpacing: "0.02em",
          // Display-only: bundle ids are slugs ("snake1"), and a trunk is called out in caps on a
          // patch sheet. The stored id is never rewritten.
          textTransform: "uppercase",
        }}
      >
        {trunk.label}
      </span>
      <span
        style={{
          fontSize: 8.5,
          fontFamily: "var(--font-mono)",
          fontWeight: 600,
          color: "var(--color-text-muted)",
        }}
      >
        {trunk.n}×
      </span>
    </div>
  ) : null;

  // All labels + reconnect visuals rendered via EdgeLabelRenderer (HTML layer above all SVG edges)
  const hasPortalContent =
    customLabels || cableIdLabels || reconnectVisuals || wirelessBadge || trunkBadge ||
    usbcWarningBadge || channelChip;
  const edgeLabelsPortal = hasPortalContent ? (
    <EdgeLabelRenderer>
      {cableIdLabels}
      {customLabels}
      {wirelessBadge}
      {trunkBadge}
      {usbcWarningBadge}
      {channelChip}
      {reconnectVisuals}
    </EdgeLabelRenderer>
  ) : null;

  // Log routing data when debug mode is active
  const prevDebugRef = useRef(false);
  useEffect(() => {
    if (debugEdges && !prevDebugRef.current) {
      console.log(`[EDGE_DEBUG] ${id} | src=${Math.round(sourceX)},${Math.round(sourceY)} tgt=${Math.round(targetX)},${Math.round(targetY)} | ${turns}`);
    }
    prevDebugRef.current = debugEdges;
  }, [debugEdges, id, sourceX, sourceY, targetX, targetY, turns]);

  // --- Live signal motion (additive, pointer-events:none) ---
  // Signal march: a lit dash overlay rides the SAME routed `d` as the core strand, so the band
  // follows every leg of a multi-turn route (a chord-axis gradient cannot — legs running against
  // the chord appeared to flow backwards). Keyframes live in liveSignal.css: stroke-dashoffset
  // 72→0 moves the dashes forward along path direction = source→target; the --reverse variant
  // plays the same animation backwards. The selected edge marches faster (1.7s) than idle (3s).
  // Gated by the liveSignal store flag (default OFF); skipped under reduced motion, for wireless,
  // and for direct-attach. Touches no routing geometry, marker, hit area, or default appearance.
  // Also skipped on a dashed core: the march is itself a dash pattern, so riding it over another
  // dash rhythm puts two competing cadences on one strand and neither reads.
  const showLiveBand =
    liveSignal && !motionOff && !!routeStr && !isWireless && !directAttach && !coreDash;
  const bandBright = `color-mix(in srgb, white 65%, ${signalColor})`;
  // One marching overlay. `reverse` plays the march target→source (used when the OUTPUT port is
  // the target end). `phase` offsets the dash pattern so the bi pair doesn't strobe where the
  // two opposing marches cross.
  const renderBand = (reverse: boolean, key: string, phase = 0) => (
    <path
      key={key}
      className={
        "cur-dash-march" +
        (reverse ? " cur-dash-march--reverse" : "") +
        (selected ? " cur-dash-march--live" : "")
      }
      d={edgePath}
      fill="none"
      stroke={bandBright}
      strokeWidth={coreW}
      strokeLinecap="round"
      strokeOpacity={0.9}
      style={{ pointerEvents: "none", ...(phase ? { animationDelay: `${phase}s` } : {}) }}
    />
  );
  // Band travels OUTPUT→INPUT: forward (source end is the output) marches source→target;
  // reverse marches the other way. bi (both ends bidirectional, e.g. Ethernet) renders BOTH
  // directions as two phase-offset marches — the chosen bi treatment (kept from the gradient
  // era) — so the link reads as live traffic with no false directionality.
  const liveBandLayer = showLiveBand ? (
    flowDir === "bi" ? (
      <>
        {renderBand(false, "fwd")}
        {renderBand(true, "rev", -1.5)}
      </>
    ) : (
      renderBand(flowDir === "reverse", "flow")
    )
  ) : null;

  // Wireless broadcast: TX pulse rings radiate from the source (transmitter). NOT gated on
  // liveSignal — a wireless link is always broadcasting, so the rings are identity chrome that
  // marks the connection as wireless, not a "signal is flowing" state like the cable band below.
  // Reduced motion still stops them.
  const showWirelessPulse = isWireless && !motionOff && !!routeStr;
  const wirelessPulseLayer = showWirelessPulse ? (
    <g style={{ pointerEvents: "none" }}>
      <circle
        className="wireless-tx-pulse"
        cx={sourceX}
        cy={sourceY}
        r={10}
        fill="none"
        stroke={signalColor}
        strokeWidth={1.5}
      />
      <circle
        className="wireless-tx-pulse wireless-tx-pulse--delay"
        cx={sourceX}
        cy={sourceY}
        r={10}
        fill="none"
        stroke={signalColor}
        strokeWidth={1.5}
      />
    </g>
  ) : null;

  // Hidden virtual edges (secondary half of adapter pair) — render nothing
  if (isHiddenVirtualEdge) {
    return null;
  }

  return (
    <>
      {gradientDef}
      {/* First in paint order — the trunk is the sheath, so every core sits on top of it. */}
      {trunkLayer}
      {casingLayer}
      <BaseEdge
        id={id}
        path={renderPath}
        labelX={lx}
        labelY={ly}
        style={edgeStyle}
        markerEnd={markerEnd}
        interactionWidth={interactionWidth}
      />
      {liveBandLayer}
      {wirelessPulseLayer}
      {edgeLabelsPortal}
      {debugLabel}
    </>
  );
}

export default memo(OffsetEdgeComponent);

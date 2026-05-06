import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSchematicStore } from "../store";
import type { PrintSheetPage, PrintViewport, RackElevationPage, DeviceData, TitleBlock, TitleBlockLayout } from "../types";
import { RACK_ACCESSORY_LABELS } from "../types";
import { getPaperSize, PAGE_MARGIN_IN, TITLE_BLOCK_HEIGHT_IN } from "../printConfig";
import { inferRackHeightU, shelfDepthMm, shelfInnerWidthMm, PX_PER_MM } from "../rackUtils";
import { computeRackStats, formatStatsLine } from "../rackStats";
import { computeCellRects, normalizeSizes, getFieldValue } from "../titleBlockLayout";

const IN_TO_MM = 25.4;
const SCREEN_PPI = 96;

// ── Rack face constants — mirrors RackRenderer.tsx exactly ──────────
const PX_PER_U = 24;
const RACK_WIDTH = 260;
const RULER_WIDTH = 28;
const RAIL_WIDTH = 8;
const FULL_WIDTH = RACK_WIDTH - 2 * RAIL_WIDTH; // 244
const DEVICE_INSET = RAIL_WIDTH;
const HALF_WIDTH = (RACK_WIDTH - 2 * DEVICE_INSET) / 2 - 1;

function uToY(uPos: number, rackH: number) { return (rackH - uPos) * PX_PER_U; }
function sideW(depthMm: number) { return Math.max(80, depthMm * PX_PER_MM); }

const ACC_COLORS: Record<string, string> = {
  "blank-panel": "#888", "vent-panel": "#aaa", "shelf": "#a0855b",
  "drawer": "#8a7a5a", "cable-manager": "#666", "fan-unit": "#556b7a",
};

// ── Title block helper ──────────────────────────────────────────────
const PT_TO_PX = SCREEN_PPI / 72;

interface TitleBlockSVGProps {
  tb: TitleBlock;
  layout: TitleBlockLayout;
  pageNum: number;
  totalPages: number;
  widthPx: number;
  heightPx: number;
}

function TitleBlockSVG({ tb, layout, pageNum, totalPages, widthPx, heightPx }: TitleBlockSVGProps) {
  const cellRects = computeCellRects(layout);
  const normCols = normalizeSizes(layout.columns);
  const normRows = normalizeSizes(layout.rows);

  const colStarts: number[] = [0];
  for (const v of normCols) colStarts.push(colStarts[colStarts.length - 1] + v);
  const rowStarts: number[] = [0];
  for (const v of normRows) rowStarts.push(rowStarts[rowStarts.length - 1] + v);

  // Build skip sets (merged cells don't get interior lines)
  const skipHLines = new Set<string>();
  const skipVLines = new Set<string>();
  for (const cell of layout.cells) {
    for (let r = cell.row + 1; r < cell.row + cell.rowSpan; r++)
      for (let c = cell.col; c < cell.col + cell.colSpan; c++)
        skipHLines.add(`${r},${c}`);
    for (let c = cell.col + 1; c < cell.col + cell.colSpan; c++)
      for (let r = cell.row; r < cell.row + cell.rowSpan; r++)
        skipVLines.add(`${c},${r}`);
  }

  // Horizontal grid lines
  const hLines: React.ReactElement[] = [];
  for (let ri = 1; ri < layout.rows.length; ri++) {
    const y = rowStarts[ri] * heightPx;
    let seg: number | null = null;
    for (let c = 0; c <= layout.columns.length; c++) {
      const done = c === layout.columns.length || skipHLines.has(`${ri},${c}`);
      if (done) {
        if (seg !== null) {
          hLines.push(<line key={`h${ri}-${seg}-${c}`} x1={colStarts[seg] * widthPx} y1={y} x2={(colStarts[c] ?? 1) * widthPx} y2={y} stroke="#646464" strokeWidth={0.5} />);
          seg = null;
        }
      } else if (seg === null) { seg = c; }
    }
  }

  // Vertical grid lines
  const vLines: React.ReactElement[] = [];
  for (let ci = 1; ci < layout.columns.length; ci++) {
    const x = colStarts[ci] * widthPx;
    let seg: number | null = null;
    for (let r = 0; r <= layout.rows.length; r++) {
      const done = r === layout.rows.length || skipVLines.has(`${ci},${r}`);
      if (done) {
        if (seg !== null) {
          vLines.push(<line key={`v${ci}-${seg}-${r}`} x1={x} y1={rowStarts[seg] * heightPx} x2={x} y2={(rowStarts[r] ?? 1) * heightPx} stroke="#646464" strokeWidth={0.5} />);
          seg = null;
        }
      } else if (seg === null) { seg = r; }
    }
  }

  const pad = 3;
  return (
    <svg width={widthPx} height={heightPx} style={{ display: "block", overflow: "visible" }}>
      <rect x={0} y={0} width={widthPx} height={heightPx} fill="white" stroke="#646464" strokeWidth={0.75} />
      {hLines}
      {vLines}
      {layout.cells.map((cell) => {
        const rect = cellRects.get(cell.id);
        if (!rect) return null;
        const cX = rect.x * widthPx;
        const cY = rect.y * heightPx;
        const cW = rect.w * widthPx;
        const cH = rect.h * heightPx;

        if (cell.content.type === "logo") {
          if (!tb.logo) return null;
          return <image key={cell.id} href={tb.logo} x={cX + 2} y={cY + 2} width={cW - 4} height={cH - 4} preserveAspectRatio="xMidYMid meet" />;
        }

        let text: string;
        if (cell.content.type === "field") {
          text = getFieldValue(tb, cell.content.field);
          if (!text) return null;
        } else if (cell.content.type === "static") {
          text = cell.content.text;
        } else {
          text = `Page ${pageNum} / ${totalPages}`;
        }

        const fsPx = cell.fontSize * PT_TO_PX;
        let textX: number;
        let anchor: "start" | "middle" | "end";
        if (cell.align === "center") { textX = cX + cW / 2; anchor = "middle"; }
        else if (cell.align === "right") { textX = cX + cW - pad; anchor = "end"; }
        else { textX = cX + pad; anchor = "start"; }

        return (
          <text
            key={cell.id}
            x={textX}
            y={cY + cH / 2}
            textAnchor={anchor}
            dominantBaseline="central"
            fontSize={fsPx}
            fontWeight={cell.fontWeight}
            fill={cell.color}
          >
            {text}
          </text>
        );
      })}
    </svg>
  );
}

function wrapLabel(text: string, maxChars: number, maxLines: number): string[] {
  if (maxChars < 2) return [text.slice(0, 1) + "…"];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    if (lines.length >= maxLines) break;
    const candidate = cur ? cur + " " + word : word;
    if (candidate.length <= maxChars) { cur = candidate; }
    else { if (cur) lines.push(cur); cur = word.length > maxChars ? word.slice(0, maxChars - 1) + "…" : word; }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === 0) lines.push(text.slice(0, maxChars - 1) + "…");
  return lines;
}

// ── Rack face SVG — uses exact same coordinate system as RackRenderer ──

interface RackFaceProps {
  elevPage: RackElevationPage;
  viewport: PrintViewport;
  widthPx: number;
  heightPx: number;
  deviceDataMap: Map<string, DeviceData>;
}

function RackFaceSVG({ elevPage, viewport, widthPx, heightPx, deviceDataMap }: RackFaceProps) {
  const rack = elevPage.racks.find((r) => r.id === viewport.rackRefId);
  if (!rack) {
    return (
      <svg width={widthPx} height={heightPx}>
        <rect width={widthPx} height={heightPx} fill="#f5f5f5" stroke="#ccc" />
        <text x={widthPx / 2} y={heightPx / 2} textAnchor="middle" dominantBaseline="central" fontSize={10} fill="#aaa">Rack not found</text>
      </svg>
    );
  }

  const placements = elevPage.placements.filter((p) => p.rackId === rack.id);
  const accessories = elevPage.accessories.filter((a) => a.rackId === rack.id);

  const totalH = rack.heightU * PX_PER_U;
  const is2Post = rack.rackType === "open-2post";
  const isOpen = is2Post || rack.rackType === "open-4post";
  const isSide = viewport.kind === "rack-side";
  const face = viewport.kind === "rack-rear" ? "rear" : "front";

  if (isSide) {
    const SW = sideW(rack.depthMm);
    const depthScale = PX_PER_MM;
    // ViewBox: 8px left pad, 20px above for label, 8px right pad, 4px below
    const vbX = -8;
    const vbY = -20;
    const vbW = SW + 16;
    const vbH = totalH + 24;

    return (
      <svg width={widthPx} height={heightPx} viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet">
        {/* Rack label */}
        <text x={SW / 2} y={-8} textAnchor="middle" fontSize={12} fontWeight={600} fill="#333">{rack.label}</text>
        {/* Frame */}
        <rect x={0} y={0} width={SW} height={totalH}
          fill={isOpen ? "rgba(250,250,250,0.4)" : "#fafafa"} stroke="#333" strokeWidth={1}
          strokeDasharray={isOpen ? "4 2" : undefined} rx={1} />
        {/* U lines */}
        {Array.from({ length: rack.heightU }, (_, i) => (
          <line key={i} x1={0} y1={i * PX_PER_U} x2={SW} y2={i * PX_PER_U} stroke="#eee" strokeWidth={0.5} />
        ))}
        {/* Front rail */}
        <line x1={4} y1={0} x2={4} y2={totalH} stroke="#aaa" strokeWidth={1} strokeDasharray="2 2" />
        <text x={4} y={-3} textAnchor="middle" fontSize={7} fill="#aaa">F</text>
        {/* Rear rail (4-post only) */}
        {!is2Post && (
          <>
            <line x1={SW - 4} y1={0} x2={SW - 4} y2={totalH} stroke="#aaa" strokeWidth={1} strokeDasharray="2 2" />
            <text x={SW - 4} y={-3} textAnchor="middle" fontSize={7} fill="#aaa">R</text>
          </>
        )}
        {/* Shelf accessories */}
        {accessories.filter((a) => a.type === "shelf").map((a) => {
          const ay = uToY(a.uPosition + a.heightU - 1, rack.heightU);
          const ah = a.heightU * PX_PER_U - 1;
          const sd = shelfDepthMm(a, rack) * depthScale;
          const ax = (is2Post || a.face === "front") ? 4 : SW - 4 - sd;
          return <rect key={a.id} x={ax} y={ay + ah - 2} width={sd} height={2} fill="#a0855b" stroke="#7a6240" strokeWidth={0.5} />;
        })}
        {/* Devices */}
        {placements.map((pl) => {
          const dd = deviceDataMap.get(pl.deviceNodeId);
          if (!dd) return null;
          const heightU = inferRackHeightU(dd);
          if (pl.mountedOnShelfId) {
            const shelf = accessories.find((a) => a.id === pl.mountedOnShelfId);
            if (!shelf) return null;
            const ay = uToY(shelf.uPosition + shelf.heightU - 1, rack.heightU);
            const ah = shelf.heightU * PX_PER_U - 1;
            const dDepth = (dd.depthMm ?? shelfDepthMm(shelf, rack)) * depthScale;
            const hMm = pl.rotated ? (dd.widthMm ?? 44.45) : (dd.heightMm ?? 44.45);
            const dh = hMm * PX_PER_MM;
            const surfaceY = ay + ah - 0.5;
            const dy = surfaceY - dh - (pl.shelfOffsetMm?.y ?? 0) * PX_PER_MM;
            const dx = (is2Post || shelf.face === "front") ? 4 : SW - 4 - dDepth;
            return <rect key={pl.id} x={dx} y={dy} width={dDepth} height={dh} fill={dd.headerColor ?? dd.color ?? "#4a90d9"} stroke="#333" strokeWidth={0.5} rx={1} opacity={0.85} />;
          }
          const y = uToY(pl.uPosition + heightU - 1, rack.heightU);
          const h = heightU * PX_PER_U - 1;
          const deviceDepth = (dd.depthMm ?? rack.depthMm * 0.6) * depthScale;
          const x = (is2Post || pl.face === "front") ? 4 : SW - 4 - deviceDepth;
          return <rect key={pl.id} x={x} y={y} width={deviceDepth} height={h} fill={dd.headerColor ?? dd.color ?? "#4a90d9"} stroke="#333" strokeWidth={0.5} opacity={0.85} />;
        })}
      </svg>
    );
  }

  // Front / rear view
  const showRails = !(is2Post && face === "rear");
  const activePlacements = placements.filter((p) => p.face === face && !p.mountedOnShelfId);
  const activeAccessories = accessories.filter((a) => a.face === face);

  // ViewBox: ruler to left, label above, small padding right/below
  const vbX = -(RULER_WIDTH + 4); // -32
  const vbY = -20;
  const vbW = RACK_WIDTH + RULER_WIDTH + 8; // 296
  const vbH = totalH + 24;

  return (
    <svg width={widthPx} height={heightPx} viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet">
      {/* Rack label */}
      <text x={RACK_WIDTH / 2} y={-8} textAnchor="middle" fontSize={12} fontWeight={600} fill="#333">{rack.label}</text>

      {/* Frame */}
      <rect x={0} y={0} width={RACK_WIDTH} height={totalH}
        fill={isOpen ? "rgba(245,245,245,0.4)" : "#f5f5f5"} stroke="#333"
        strokeWidth={isOpen ? 1 : 1.5} strokeDasharray={isOpen ? "4 2" : undefined} rx={2} />

      {/* Main rails */}
      <rect x={0} y={0} width={RAIL_WIDTH} height={totalH} fill="#d4d4d4" stroke="#999" strokeWidth={0.5} />
      <rect x={RACK_WIDTH - RAIL_WIDTH} y={0} width={RAIL_WIDTH} height={totalH} fill="#d4d4d4" stroke="#999" strokeWidth={0.5} />

      {/* Inner pseudo-rails */}
      {showRails && (
        <>
          <rect x={RAIL_WIDTH + 1} y={0} width={3} height={totalH} fill="#e0e0e0" stroke="#ccc" strokeWidth={0.25} />
          <rect x={RACK_WIDTH - RAIL_WIDTH - 4} y={0} width={3} height={totalH} fill="#e0e0e0" stroke="#ccc" strokeWidth={0.25} />
        </>
      )}

      {/* U gridlines + ruler numbers */}
      {Array.from({ length: rack.heightU }, (_, i) => {
        const uNum = rack.heightU - i;
        const y = i * PX_PER_U;
        return (
          <g key={uNum}>
            <line x1={0} y1={y} x2={RACK_WIDTH} y2={y} stroke="#ddd" strokeWidth={0.5} />
            <text x={-RULER_WIDTH / 2 - 2} y={y + PX_PER_U / 2} textAnchor="middle" dominantBaseline="central" fontSize={8} fill="#999">{uNum}</text>
          </g>
        );
      })}

      {/* Accessories + shelf occupants — mirrors AccessoryBlock from RackRenderer exactly */}
      {activeAccessories.map((a) => {
        const ay = uToY(a.uPosition + a.heightU - 1, rack.heightU);
        const ah = a.heightU * PX_PER_U - 1;
        const fill = ACC_COLORS[a.type] ?? "#888";
        const isShelf = a.type === "shelf";
        const occupants = isShelf ? placements.filter((p) => p.mountedOnShelfId === a.id && p.face === face) : [];
        return (
          <g key={a.id}>
            <rect x={DEVICE_INSET} y={ay} width={FULL_WIDTH} height={ah} fill={fill} stroke="#555" strokeWidth={0.5} rx={1} />
            {a.type === "vent-panel" && Array.from({ length: Math.max(1, Math.floor(ah / 6)) }, (_, i) => (
              <line key={i} x1={DEVICE_INSET + 8} y1={ay + 3 + i * 6} x2={DEVICE_INSET + FULL_WIDTH - 8} y2={ay + 3 + i * 6} stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
            ))}
            {!isShelf && (
              <text x={DEVICE_INSET + FULL_WIDTH / 2} y={ay + ah / 2} textAnchor="middle" dominantBaseline="central" fontSize={8} fill="rgba(255,255,255,0.8)" style={{ pointerEvents: "none" }}>
                {a.label ?? RACK_ACCESSORY_LABELS[a.type]}
              </text>
            )}
            {isShelf && (() => {
              const surfaceY = ay + ah - 0.5;
              const innerW = shelfInnerWidthMm();
              return occupants.map((p) => {
                const dd = deviceDataMap.get(p.deviceNodeId);
                if (!dd) return null;
                const wMm = p.rotated ? (dd.heightMm ?? 44.45) : (dd.widthMm ?? innerW);
                const hMm = p.rotated ? (dd.widthMm ?? innerW) : (dd.heightMm ?? 44.45);
                const wPx = wMm * PX_PER_MM;
                const hPx = hMm * PX_PER_MM;
                const offset = p.shelfOffsetMm ?? { x: 0, y: 0 };
                const xPx = DEVICE_INSET + offset.x * PX_PER_MM;
                const topY = surfaceY - hPx - offset.y * PX_PER_MM;
                const effectiveWidthPx = p.rotated ? hPx : wPx;
                const labelTrim = Math.max(4, Math.floor(effectiveWidthPx / 5));
                const lbl = dd.label.length > labelTrim ? dd.label.slice(0, Math.max(1, labelTrim - 1)) + "…" : dd.label;
                return (
                  <g key={p.id}>
                    <rect x={xPx} y={topY} width={wPx} height={hPx}
                      fill={dd.headerColor ?? dd.color ?? "#4a90d9"} stroke="#333" strokeWidth={0.5} rx={1} />
                    <text
                      x={xPx + wPx / 2} y={topY + hPx / 2}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize={Math.min(7, hPx * 0.4)} fill="#fff"
                      style={{ pointerEvents: "none" }}
                      transform={p.rotated ? `rotate(-90 ${xPx + wPx / 2} ${topY + hPx / 2})` : undefined}
                    >
                      {lbl}
                    </text>
                  </g>
                );
              });
            })()}
          </g>
        );
      })}

      {/* Rack-mounted devices (not on shelves) — mirrors DeviceBlock from RackRenderer */}
      {activePlacements.map((p) => {
        const dd = deviceDataMap.get(p.deviceNodeId);
        if (!dd) return null;
        const hU = inferRackHeightU(dd);
        const color = dd.headerColor ?? dd.color ?? "#4a90d9";
        const y = uToY(p.uPosition + hU - 1, rack.heightU);
        const h = hU * PX_PER_U - 1;
        const isHalf = !!p.halfRackSide;
        const w = isHalf ? HALF_WIDTH : FULL_WIDTH;
        const x = DEVICE_INSET + (isHalf && p.halfRackSide === "right" ? HALF_WIDTH + 2 : 0);
        const fs = h > 20 ? 8 : 7;
        const maxChars = Math.min(isHalf ? 14 : 36, Math.floor(w / (fs * 0.58)));
        const lines = wrapLabel(dd.label, maxChars, Math.max(1, Math.floor(h / (fs * 1.5))));
        const lineH = fs * 1.35;
        const baseY = y + h / 2 - ((lines.length - 1) * lineH) / 2;
        return (
          <g key={p.id}>
            <clipPath id={`psp-clip-${p.id}`}><rect x={x} y={y} width={w} height={h} rx={1} /></clipPath>
            <rect x={x} y={y} width={w} height={h} fill={color} stroke="#333" strokeWidth={0.75} rx={1} />
            <g clipPath={`url(#psp-clip-${p.id})`}>
              <text x={x + w / 2} textAnchor="middle" fontSize={fs} fill="#fff" fontWeight={600} style={{ pointerEvents: "none" }}>
                {lines.map((line, i) => (
                  <tspan key={i} x={x + w / 2} y={baseY + i * lineH} dominantBaseline="central">{line}</tspan>
                ))}
              </text>
              {hU > 1 && (
                <text x={x + w - 4} y={y + 8} textAnchor="end" fontSize={7} fill="rgba(255,255,255,0.7)" style={{ pointerEvents: "none" }}>{hU}U</text>
              )}
            </g>
          </g>
        );
      })}
    </svg>
  );
}

// ── Main renderer ───────────────────────────────────────────────────

interface Props {
  page: PrintSheetPage;
}

export default function PrintSheetRenderer({ page }: Props) {
  const nodes = useSchematicStore((s) => s.nodes);
  const allPages = useSchematicStore((s) => s.pages);
  const addViewport = useSchematicStore((s) => s.addViewport);
  const updateViewport = useSchematicStore((s) => s.updateViewport);
  const removeViewport = useSchematicStore((s) => s.removeViewport);
  const titleBlock = useSchematicStore((s) => s.titleBlock);
  const titleBlockLayout = useSchematicStore((s) => s.titleBlockLayout);
  const panMode = useSchematicStore((s) => s.panMode);

  const deviceDataMap = useMemo(() => {
    const m = new Map<string, DeviceData>();
    for (const n of nodes) if (n.type === "device") m.set(n.id, n.data as DeviceData);
    return m;
  }, [nodes]);

  const elevationPages = allPages.filter((p): p is RackElevationPage => p.type === "rack-elevation");

  const paper = getPaperSize(page.paperId, page.customWidthIn, page.customHeightIn);
  const pageWIn = page.orientation === "landscape" ? paper.heightIn : paper.widthIn;
  const pageHIn = page.orientation === "landscape" ? paper.widthIn : paper.heightIn;
  const pageWPx = pageWIn * SCREEN_PPI;
  const pageHPx = pageHIn * SCREEN_PPI;
  const mmToPagePx = (mm: number) => (mm / IN_TO_MM) * SCREEN_PPI;

  // Title block geometry (matches pdfExport.ts drawTitleBlock)
  const marginPx = PAGE_MARGIN_IN * SCREEN_PPI;
  const tbHeightPx = (titleBlockLayout?.heightIn ?? TITLE_BLOCK_HEIGHT_IN) * SCREEN_PPI;
  const tbWidthPx = Math.min((titleBlockLayout?.widthIn ?? 3) * SCREEN_PPI, pageWPx - 2 * marginPx);
  const tbLeftPx = pageWPx - marginPx - tbWidthPx;
  const tbTopPx = pageHPx - marginPx - tbHeightPx;

  // Page number for title block
  const printSheetPages = allPages.filter((p) => p.type === "print-sheet");
  const pageNum = printSheetPages.findIndex((p) => p.id === page.id) + 1;
  const totalPages = printSheetPages.length;

  // ── Zoom / pan (mirrors main canvas controls) ───────────────────
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const vpRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  const setViewport = useCallback((z: number, p: { x: number; y: number }) => {
    vpRef.current = { zoom: z, pan: p };
    setZoom(z);
    setPan(p);
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);

  const [spaceHeld, setSpaceHeld] = useState(false);
  const ctrlHeldRef = useRef(false);
  const spaceHeldRef = useRef(false);
  const trackpadActiveRef = useRef(false);
  const trackpadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fitView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const padding = 48;
    const z = Math.min((el.clientWidth - padding * 2) / pageWPx, (el.clientHeight - padding * 2) / pageHPx, 2);
    const p = { x: (el.clientWidth - pageWPx * z) / 2, y: (el.clientHeight - pageHPx * z) / 2 };
    setViewport(z, p);
  }, [pageWPx, pageHPx, setViewport]);

  useEffect(() => { fitView(); }, [page.id, page.paperId, page.orientation, fitView]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Control") ctrlHeldRef.current = true;
      if (e.key === " ") {
        if (document.activeElement && (document.activeElement as HTMLElement).tagName === "INPUT") return;
        e.preventDefault();
        spaceHeldRef.current = true;
        setSpaceHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control") ctrlHeldRef.current = false;
      if (e.key === " ") { spaceHeldRef.current = false; setSpaceHeld(false); }
    };
    const onBlur = () => { ctrlHeldRef.current = false; spaceHeldRef.current = false; setSpaceHeld(false); };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest("[data-allow-scroll]")) return;
      e.preventDefault();
      const cfg = useSchematicStore.getState().scrollConfig;
      const { zoom: z, pan: p } = vpRef.current;
      if (cfg.trackpadEnabled) {
        if (e.deltaX !== 0 || (e.ctrlKey && !ctrlHeldRef.current)) trackpadActiveRef.current = true;
        clearTimeout(trackpadTimerRef.current);
        trackpadTimerRef.current = setTimeout(() => { trackpadActiveRef.current = false; }, 400);
      }
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (cfg.trackpadEnabled && e.ctrlKey && !ctrlHeldRef.current) {
        const factor = 1 - e.deltaY * 0.01 * cfg.zoomSpeed;
        const newZ = Math.min(4, Math.max(0.1, z * factor));
        const ratio = newZ / z;
        setViewport(newZ, { x: mx * (1 - ratio) + p.x * ratio, y: my * (1 - ratio) + p.y * ratio });
        return;
      }
      if (!e.ctrlKey && !e.shiftKey && trackpadActiveRef.current) {
        setViewport(z, { x: p.x - e.deltaX * cfg.panSpeed, y: p.y - e.deltaY * cfg.panSpeed });
        return;
      }
      const action = e.ctrlKey ? cfg.ctrlScroll : e.shiftKey ? cfg.shiftScroll : cfg.scroll;
      const delta = e.deltaY;
      if (action === "zoom") {
        const factor = 1 - delta * 0.001 * cfg.zoomSpeed;
        const newZ = Math.min(4, Math.max(0.1, z * factor));
        const ratio = newZ / z;
        setViewport(newZ, { x: mx * (1 - ratio) + p.x * ratio, y: my * (1 - ratio) + p.y * ratio });
      } else if (action === "pan-x") {
        setViewport(z, { x: p.x - delta * cfg.panSpeed, y: p.y });
      } else {
        setViewport(z, { x: p.x, y: p.y - delta * cfg.panSpeed });
      }
    };
    el.addEventListener("wheel", handler, { passive: false, capture: true });
    return () => { el.removeEventListener("wheel", handler, { capture: true }); clearTimeout(trackpadTimerRef.current); };
  }, [setViewport]);

  // ── Viewport interaction ─────────────────────────────────────────
  const [selectedVpId, setSelectedVpId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ vpId: string; startX: number; startY: number; startPosMm: { x: number; y: number } } | null>(null);
  const [resizing, setResizing] = useState<{ vpId: string; startX: number; startY: number; startSizeMm: { w: number; h: number } } | null>(null);
  const [panning, setPanning] = useState<{ startX: number; startY: number; startPan: { x: number; y: number } } | null>(null);
  const didMoveRef = useRef(false);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    const willPan = e.button === 1 || spaceHeld || panMode === "pan-first";
    if (e.button === 1) e.preventDefault();
    didMoveRef.current = false;
    setPanning({ startX: e.clientX, startY: e.clientY, startPan: { ...vpRef.current.pan } });
    if (!willPan) return;
  }, [spaceHeld, panMode]);

  const handleVpMouseDown = useCallback((e: React.MouseEvent, vp: PrintViewport) => {
    e.stopPropagation();
    setSelectedVpId(vp.id);
    setDragging({ vpId: vp.id, startX: e.clientX, startY: e.clientY, startPosMm: { ...vp.positionMm } });
  }, []);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, vp: PrintViewport) => {
    e.stopPropagation();
    setSelectedVpId(vp.id);
    setResizing({ vpId: vp.id, startX: e.clientX, startY: e.clientY, startSizeMm: { ...vp.sizeMm } });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const { zoom: z } = vpRef.current;
    if (dragging) {
      const dxMm = ((e.clientX - dragging.startX) / z / pageWPx) * pageWIn * IN_TO_MM;
      const dyMm = ((e.clientY - dragging.startY) / z / pageHPx) * pageHIn * IN_TO_MM;
      updateViewport(page.id, dragging.vpId, { positionMm: { x: dragging.startPosMm.x + dxMm, y: dragging.startPosMm.y + dyMm } });
    } else if (resizing) {
      const dxMm = ((e.clientX - resizing.startX) / z / pageWPx) * pageWIn * IN_TO_MM;
      const dyMm = ((e.clientY - resizing.startY) / z / pageHPx) * pageHIn * IN_TO_MM;
      updateViewport(page.id, resizing.vpId, { sizeMm: { w: Math.max(20, resizing.startSizeMm.w + dxMm), h: Math.max(20, resizing.startSizeMm.h + dyMm) } });
    } else if (panning) {
      const dx = e.clientX - panning.startX;
      const dy = e.clientY - panning.startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didMoveRef.current = true;
      setViewport(vpRef.current.zoom, { x: panning.startPan.x + dx, y: panning.startPan.y + dy });
    }
  }, [dragging, resizing, panning, page.id, pageWIn, pageHIn, pageWPx, pageHPx, updateViewport, setViewport]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (panning && !didMoveRef.current && e.button === 0 && panMode !== "pan-first" && !spaceHeldRef.current) {
      setSelectedVpId(null);
    }
    setDragging(null);
    setResizing(null);
    setPanning(null);
  }, [panning, panMode]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/x-print-viewport");
    if (!raw) return;
    const { pageId, rackId, kind } = JSON.parse(raw) as { pageId: string; rackId: string; kind: PrintViewport["kind"] };
    const rect = containerRef.current!.getBoundingClientRect();
    const { zoom: z, pan: p } = vpRef.current;
    const paperX = (e.clientX - rect.left - p.x) / z;
    const paperY = (e.clientY - rect.top - p.y) / z;
    const dropXMm = (paperX / pageWPx) * pageWIn * IN_TO_MM;
    const dropYMm = (paperY / pageHPx) * pageHIn * IN_TO_MM;
    const defaultW = (pageWIn / 3) * IN_TO_MM;
    const defaultH = (pageHIn / 2) * IN_TO_MM;
    addViewport(page.id, { kind, rackRefPageId: pageId, rackRefId: rackId, positionMm: { x: dropXMm - defaultW / 2, y: dropYMm - defaultH / 2 }, sizeMm: { w: defaultW, h: defaultH }, showLabel: true });
  }, [page.id, pageWIn, pageHIn, pageWPx, pageHPx, addViewport]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === "Delete" || e.key === "Backspace") && selectedVpId) {
      e.preventDefault();
      removeViewport(page.id, selectedVpId);
      setSelectedVpId(null);
    }
  }, [selectedVpId, page.id, removeViewport]);

  const isPanning = panning !== null && (didMoveRef.current || spaceHeld || panMode === "pan-first");

  return (
    <div className="flex-1 relative overflow-hidden">
      <div
        ref={containerRef}
        className="absolute inset-0 bg-neutral-300 outline-none"
        tabIndex={0}
        style={{ cursor: isPanning ? "grabbing" : spaceHeld ? "grab" : "default", userSelect: "none" }}
        onKeyDown={handleKeyDown}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {/* Paper */}
        <div
          className="bg-white shadow-xl absolute"
          style={{ width: pageWPx, height: pageHPx, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
        >
          {/* Content border (matches pdfExport.ts drawContentBorder) */}
          <div
            className="absolute pointer-events-none"
            style={{ left: marginPx, top: marginPx, right: marginPx, bottom: marginPx, border: "0.72px solid #000" }}
          />

          {/* Viewports */}
          {page.viewports.map((vp) => {
            const xPx = mmToPagePx(vp.positionMm.x);
            const yPx = mmToPagePx(vp.positionMm.y);
            const wPx = mmToPagePx(vp.sizeMm.w);
            const hPx = mmToPagePx(vp.sizeMm.h);
            const elevPage = elevationPages.find((p) => p.id === vp.rackRefPageId);
            const isSelected = selectedVpId === vp.id;
            const rackLabel = elevPage?.racks.find((r) => r.id === vp.rackRefId)?.label ?? "";
            const kindLabel = vp.kind === "rack-front" ? "Front" : vp.kind === "rack-rear" ? "Rear" : "Side";

            let statsLine: string | null = null;
            if (vp.showStats && elevPage) {
              const rack = elevPage.racks.find((r) => r.id === vp.rackRefId);
              if (rack) {
                const rackPl = elevPage.placements.filter((p) => p.rackId === rack.id);
                const rackAcc = elevPage.accessories.filter((a) => a.rackId === rack.id);
                statsLine = formatStatsLine(computeRackStats(rack, rackPl, rackAcc, deviceDataMap));
              }
            }

            return (
              <Fragment key={vp.id}>
                <div
                  className={`absolute ${isSelected ? "z-10" : ""}`}
                  style={{ left: xPx, top: yPx, width: wPx, height: hPx, cursor: "move" }}
                  onMouseDown={(e) => handleVpMouseDown(e, vp)}
                >
                  {elevPage ? (
                    <RackFaceSVG elevPage={elevPage} viewport={vp} widthPx={wPx} heightPx={hPx} deviceDataMap={deviceDataMap} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-neutral-100 border border-neutral-300 text-neutral-400 text-xs">
                      Rack not found
                    </div>
                  )}
                  {/* Selection ring drawn over the SVG */}
                  {isSelected && (
                    <div className="absolute inset-0 border-2 border-blue-500 pointer-events-none" />
                  )}
                  {vp.showLabel !== false && (
                    <div className="absolute top-0 left-0 text-[8px] text-neutral-500 bg-white/80 px-1 leading-tight pointer-events-none">
                      {kindLabel}{rackLabel ? ` · ${rackLabel}` : ""}
                    </div>
                  )}
                  {isSelected && (
                    <div
                      className="absolute bottom-0 right-0 w-3 h-3 bg-blue-500 cursor-se-resize"
                      onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, vp); }}
                    />
                  )}
                </div>
                {statsLine && (
                  <div
                    className="absolute text-[7px] text-neutral-500 pointer-events-none text-center"
                    style={{ left: xPx, top: yPx + hPx + 2, width: wPx }}
                  >
                    {statsLine}
                  </div>
                )}
              </Fragment>
            );
          })}

          {/* Title block (matches pdfExport.ts layout) */}
          {page.showTitleBlock && titleBlockLayout && (
            <div className="absolute pointer-events-none" style={{ left: tbLeftPx, top: tbTopPx, width: tbWidthPx, height: tbHeightPx }}>
              <TitleBlockSVG
                tb={titleBlock}
                layout={titleBlockLayout}
                pageNum={pageNum}
                totalPages={totalPages}
                widthPx={tbWidthPx}
                heightPx={tbHeightPx}
              />
            </div>
          )}

          {/* Empty state */}
          {page.viewports.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-neutral-400 text-sm pointer-events-none">
              Drag a rack view from the sidebar, or use Auto-Fill in the toolbar
            </div>
          )}
        </div>
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-white/90 border border-neutral-300 rounded shadow px-2 py-1 text-xs select-none" data-print-hide>
        <button className="px-2 py-0.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded cursor-pointer" onClick={fitView}>Fit</button>
        <div className="border-l border-neutral-200 h-3" />
        <button className="w-6 h-6 flex items-center justify-center text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded cursor-pointer" onClick={() => { const z = Math.max(0.1, vpRef.current.zoom / 1.25); setViewport(z, vpRef.current.pan); }}>−</button>
        <span className="w-10 text-center text-neutral-600">{Math.round(zoom * 100)}%</span>
        <button className="w-6 h-6 flex items-center justify-center text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded cursor-pointer" onClick={() => { const z = Math.min(4, vpRef.current.zoom * 1.25); setViewport(z, vpRef.current.pan); }}>+</button>
      </div>
    </div>
  );
}

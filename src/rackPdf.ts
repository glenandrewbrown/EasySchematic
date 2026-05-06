import { jsPDF } from "jspdf";
import type {
  DeviceData,
  RackAccessory,
  RackData,
  RackDevicePlacement,
  RackElevationPage,
  SchematicNode,
  SchematicPage,
  TitleBlock,
} from "./types";
import { RACK_ACCESSORY_LABELS } from "./types";
import { getPageDimensions, type PaperSize } from "./reportLayout";
import {
  inferRackHeightU,
  getRackDepthConflicts,
  shelfDepthMm,
} from "./rackUtils";
import { computeRackStats, formatStatsLine } from "./rackStats";

// ─── Inter font embedding (self-contained copy of reportPdf logic) ───

let interRegularB64: string | null = null;
let interBoldB64: string | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function loadInterFont(doc: jsPDF) {
  if (!interRegularB64) {
    const [r, b] = await Promise.all([
      fetch("/fonts/Inter-Regular.ttf"),
      fetch("/fonts/Inter-Bold.ttf"),
    ]);
    if (!r.ok || !b.ok) throw new Error(`Font fetch failed: ${r.status}/${b.status}`);
    const [rb, bb] = await Promise.all([r.arrayBuffer(), b.arrayBuffer()]);
    interRegularB64 = arrayBufferToBase64(rb);
    interBoldB64 = arrayBufferToBase64(bb);
  }
  doc.addFileToVFS("Inter-Regular.ttf", interRegularB64);
  doc.addFileToVFS("Inter-Bold.ttf", interBoldB64!);
  doc.addFont("Inter-Regular.ttf", "Inter", "normal");
  doc.addFont("Inter-Bold.ttf", "Inter", "bold");
}

// ─── Color helpers ───

export function setFillHex(doc: jsPDF, hex: string | undefined, fallback: [number, number, number]) {
  const m = (hex ?? "").match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (m) doc.setFillColor(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16));
  else doc.setFillColor(...fallback);
}

// ─── Title bar ───

const PAGE_MARGIN_MM = 12;
const TITLE_BAR_H_MM = 14;

function drawTitleBar(
  doc: jsPDF,
  pageWidthMm: number,
  titleBlock: TitleBlock | undefined,
  rack: RackData,
  schematicName: string,
  pageNum: number,
  totalPages: number,
) {
  const x = PAGE_MARGIN_MM;
  const y = PAGE_MARGIN_MM;
  const w = pageWidthMm - 2 * PAGE_MARGIN_MM;
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, TITLE_BAR_H_MM);

  doc.setFont("Inter", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(`${schematicName} — ${rack.label}`, x + 2, y + 5);

  doc.setFont("Inter", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  const meta = [
    `${rack.heightU}U`,
    `${rack.depthMm}mm depth`,
    titleBlock?.designer ? `Designer: ${titleBlock.designer}` : null,
    titleBlock?.date ? `Date: ${titleBlock.date}` : null,
  ].filter(Boolean).join("  ·  ");
  doc.text(meta, x + 2, y + 10);

  doc.text(`Page ${pageNum} of ${totalPages}`, x + w - 2, y + 5, { align: "right" });
  if (titleBlock?.revision) doc.text(`Rev ${titleBlock.revision}`, x + w - 2, y + 10, { align: "right" });
  doc.setTextColor(0);
}

// ─── Front / rear elevation ───

export function drawElevation(
  doc: jsPDF,
  rack: RackData,
  placements: RackDevicePlacement[],
  accessories: RackAccessory[],
  deviceDataMap: Map<string, DeviceData>,
  face: "front" | "rear",
  centerXMm: number,
  topYMm: number,
  maxHeightMm: number,
) {
  const is2Post = rack.rackType === "open-2post";
  // Skip rear of 2-post
  const empty = face === "rear" && is2Post;

  const labelTitle = face === "front" ? "Front" : "Rear";
  doc.setFont("Inter", "bold");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text(labelTitle, centerXMm, topYMm - 2, { align: "center" });

  // Rack frame: scale to fit maxHeightMm; rack heightU * scale = drawHeight
  const drawHeightMm = maxHeightMm;
  const uHeightMm = drawHeightMm / rack.heightU;
  const RACK_WIDTH_MM = 60; // arbitrary visual width per face
  const railWMm = RACK_WIDTH_MM * 0.04;

  const x = centerXMm - RACK_WIDTH_MM / 2;
  const y = topYMm;

  // Frame fill
  setFillHex(doc, undefined, [245, 245, 245]);
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.4);
  doc.rect(x, y, RACK_WIDTH_MM, drawHeightMm, "FD");

  if (empty) {
    doc.setFont("Inter", "normal");
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text("(no rear face on 2-post)", centerXMm, y + drawHeightMm / 2, { align: "center" });
    return;
  }

  // Side rails
  setFillHex(doc, undefined, [212, 212, 212]);
  doc.rect(x, y, railWMm, drawHeightMm, "F");
  doc.rect(x + RACK_WIDTH_MM - railWMm, y, railWMm, drawHeightMm, "F");

  // U gridlines
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.1);
  for (let i = 1; i < rack.heightU; i++) {
    const ly = y + i * uHeightMm;
    doc.line(x, ly, x + RACK_WIDTH_MM, ly);
  }
  // U numbers
  doc.setFont("Inter", "normal");
  doc.setFontSize(4);
  doc.setTextColor(150, 150, 150);
  for (let i = 0; i < rack.heightU; i++) {
    const uNum = rack.heightU - i;
    doc.text(`${uNum}`, x - 1.5, y + i * uHeightMm + uHeightMm / 2 + 1, { align: "right" });
  }

  // Accessories on this face
  for (const a of accessories) {
    if (a.rackId !== rack.id || a.face !== face) continue;
    const ay = y + (rack.heightU - (a.uPosition + a.heightU - 1)) * uHeightMm;
    const ah = a.heightU * uHeightMm;
    const fill: Record<string, [number, number, number]> = {
      "blank-panel": [136, 136, 136], "vent-panel": [170, 170, 170], "shelf": [160, 133, 91],
      "drawer": [138, 122, 90], "cable-manager": [102, 102, 102], "fan-unit": [85, 107, 122],
    };
    doc.setFillColor(...(fill[a.type] ?? [136, 136, 136]));
    doc.setDrawColor(80, 80, 80);
    doc.rect(x + railWMm, ay, RACK_WIDTH_MM - 2 * railWMm, ah - 0.2, "FD");
    doc.setFont("Inter", "normal");
    doc.setFontSize(Math.min(6, ah * 1.5));
    doc.setTextColor(255, 255, 255);
    doc.text(a.label ?? RACK_ACCESSORY_LABELS[a.type], x + RACK_WIDTH_MM / 2, ay + ah / 2 + 1, { align: "center" });
  }

  // Devices on this face (skip shelf-mounted — drawn separately on the shelf)
  for (const p of placements) {
    if (p.rackId !== rack.id || p.face !== face || p.mountedOnShelfId) continue;
    const dd = deviceDataMap.get(p.deviceNodeId);
    if (!dd) continue;
    const heightU = inferRackHeightU(dd);
    const dy = y + (rack.heightU - (p.uPosition + heightU - 1)) * uHeightMm;
    const dh = heightU * uHeightMm - 0.2;
    const dx = x + railWMm;
    const dw = RACK_WIDTH_MM - 2 * railWMm;
    setFillHex(doc, dd.headerColor ?? dd.color, [74, 144, 217]);
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.2);
    doc.rect(dx, dy, dw, dh, "FD");
    doc.setFont("Inter", "bold");
    const fs = Math.min(7, dh * 1.6);
    doc.setFontSize(fs);
    doc.setTextColor(255, 255, 255);
    const maxChars = Math.floor(dw / (fs * 0.18));
    const lbl = dd.label.length > maxChars ? dd.label.slice(0, Math.max(1, maxChars - 1)) + "…" : dd.label;
    doc.text(lbl, x + RACK_WIDTH_MM / 2, dy + dh / 2 + fs * 0.3, { align: "center" });
  }

  // Shelf occupants on this face — draw as small rects on the shelf surface
  for (const a of accessories) {
    if (a.rackId !== rack.id || a.face !== face || a.type !== "shelf") continue;
    const occupants = placements.filter((p) => p.mountedOnShelfId === a.id);
    if (occupants.length === 0) continue;
    const ay = y + (rack.heightU - (a.uPosition + a.heightU - 1)) * uHeightMm;
    const ah = a.heightU * uHeightMm;
    const innerW = RACK_WIDTH_MM - 2 * railWMm;
    const padding = 0.3;
    let cursorX = x + railWMm + padding;
    for (const occ of occupants) {
      const dd = deviceDataMap.get(occ.deviceNodeId);
      if (!dd) continue;
      const wFrac = Math.min(1, (dd.widthMm ?? 482) / 482); // 482mm = standard 19" inner mount
      const ow = wFrac * (innerW - padding * 2);
      const oy = ay + padding;
      const oh = ah - padding * 2;
      setFillHex(doc, dd.headerColor ?? dd.color, [74, 144, 217]);
      doc.setDrawColor(40, 40, 40);
      doc.rect(cursorX, oy, ow, oh, "FD");
      cursorX += ow + 0.3;
    }
  }
}

// ─── Side view ───

export function drawSideView(
  doc: jsPDF,
  rack: RackData,
  placements: RackDevicePlacement[],
  accessories: RackAccessory[],
  deviceDataMap: Map<string, DeviceData>,
  centerXMm: number,
  topYMm: number,
  maxHeightMm: number,
) {
  doc.setFont("Inter", "bold");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text("Side", centerXMm, topYMm - 2, { align: "center" });

  const is2Post = rack.rackType === "open-2post";
  const sideWMm = 50;
  const drawHeightMm = maxHeightMm;
  const uHeightMm = drawHeightMm / rack.heightU;
  const depthScale = sideWMm / rack.depthMm;

  const x = centerXMm - sideWMm / 2;
  const y = topYMm;

  setFillHex(doc, undefined, [250, 250, 250]);
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.3);
  doc.rect(x, y, sideWMm, drawHeightMm, "FD");

  // Rails
  doc.setDrawColor(170, 170, 170);
  doc.setLineDashPattern([0.6, 0.4], 0);
  doc.line(x + 1, y, x + 1, y + drawHeightMm);
  if (!is2Post) doc.line(x + sideWMm - 1, y, x + sideWMm - 1, y + drawHeightMm);
  doc.setLineDashPattern([], 0);

  doc.setFont("Inter", "normal");
  doc.setFontSize(5);
  doc.setTextColor(140, 140, 140);
  doc.text("F", x + 1, y - 0.5, { align: "center" });
  if (!is2Post) doc.text("R", x + sideWMm - 1, y - 0.5, { align: "center" });

  // Shelves first
  for (const a of accessories) {
    if (a.rackId !== rack.id || a.type !== "shelf") continue;
    const ay = y + (rack.heightU - (a.uPosition + a.heightU - 1)) * uHeightMm;
    const ah = a.heightU * uHeightMm;
    const sd = shelfDepthMm(a, rack) * depthScale;
    const sx = (is2Post || a.face === "front") ? x + 1 : x + sideWMm - 1 - sd;
    setFillHex(doc, undefined, [160, 133, 91]);
    doc.rect(sx, ay + ah - 0.5, sd, 0.5, "F");
  }

  // Devices
  for (const p of placements) {
    if (p.rackId !== rack.id) continue;
    const dd = deviceDataMap.get(p.deviceNodeId);
    if (!dd) continue;
    if (p.mountedOnShelfId) {
      const shelf = accessories.find((a) => a.id === p.mountedOnShelfId);
      if (!shelf) continue;
      const ay = y + (rack.heightU - (shelf.uPosition + shelf.heightU - 1)) * uHeightMm;
      const ah = shelf.heightU * uHeightMm;
      const dDepth = (dd.depthMm ?? shelfDepthMm(shelf, rack)) * depthScale;
      const dx = (is2Post || shelf.face === "front") ? x + 1 : x + sideWMm - 1 - dDepth;
      const dh = Math.max(0.6, ah - 0.6);
      const dy = ay + ah - 0.5 - dh;
      setFillHex(doc, dd.headerColor ?? dd.color, [74, 144, 217]);
      doc.setDrawColor(40, 40, 40);
      doc.rect(dx, dy, dDepth, dh, "FD");
      continue;
    }
    const heightU = inferRackHeightU(dd);
    const dy = y + (rack.heightU - (p.uPosition + heightU - 1)) * uHeightMm;
    const dh = heightU * uHeightMm - 0.1;
    const deviceDepthMm = dd.depthMm ?? rack.depthMm * 0.6;
    const dDepth = deviceDepthMm * depthScale;
    const dx = (is2Post || p.face === "front") ? x + 1 : x + sideWMm - 1 - dDepth;
    setFillHex(doc, dd.headerColor ?? dd.color, [74, 144, 217]);
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.2);
    doc.rect(dx, dy, dDepth, dh, "FD");
  }

  // Depth conflicts overlay
  const conflicts = getRackDepthConflicts(rack, placements, deviceDataMap);
  for (const c of conflicts) {
    const a = placements.find((p) => p.id === c.aId);
    const b = placements.find((p) => p.id === c.bId);
    if (!a || !b) continue;
    const ad = deviceDataMap.get(a.deviceNodeId);
    const bd = deviceDataMap.get(b.deviceNodeId);
    if (!ad?.depthMm || !bd?.depthMm) continue;
    const yTop = y + (rack.heightU - c.uOverlapEnd) * uHeightMm;
    const yBot = y + (rack.heightU - c.uOverlapStart + 1) * uHeightMm;
    const frontEnd = x + 1 + ad.depthMm * depthScale;
    const rearStart = x + sideWMm - 1 - bd.depthMm * depthScale;
    const ox = Math.min(frontEnd, rearStart);
    const ow = Math.max(0, Math.max(frontEnd, rearStart) - ox);
    doc.setFillColor(239, 68, 68);
    // jsPDF doesn't support alpha on fillColor directly without GState; use a stippled border instead
    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(0.4);
    doc.setLineDashPattern([0.6, 0.4], 0);
    doc.rect(ox, yTop, ow, yBot - yTop);
    doc.setLineDashPattern([], 0);
    doc.setFont("Inter", "bold");
    doc.setFontSize(5);
    doc.setTextColor(127, 29, 29);
    doc.text(`+${Math.round(c.depthOverhangMm)}mm`, ox + ow / 2, (yTop + yBot) / 2, { align: "center" });
  }

  doc.setTextColor(0);
}

// ─── Stats footer ───

export function drawStatsFooter(
  doc: jsPDF,
  rack: RackData,
  placements: RackDevicePlacement[],
  accessories: RackAccessory[],
  deviceDataMap: Map<string, DeviceData>,
  pageWidthMm: number,
  yMm: number,
) {
  const stats = computeRackStats(rack, placements, accessories, deviceDataMap);
  const line = formatStatsLine(stats);
  doc.setFont("Inter", "bold");
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text(line, pageWidthMm / 2, yMm, { align: "center" });

  if (stats.unknownDepthCount > 0 || stats.unknownWeightCount > 0 || stats.unknownPowerCount > 0) {
    const caveat = [
      stats.unknownDepthCount > 0 ? `${stats.unknownDepthCount} unknown depth` : null,
      stats.unknownWeightCount > 0 ? `${stats.unknownWeightCount} unknown weight` : null,
      stats.unknownPowerCount > 0 ? `${stats.unknownPowerCount} unknown power` : null,
    ].filter(Boolean).join(" · ");
    doc.setFont("Inter", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(caveat, pageWidthMm / 2, yMm + 4, { align: "center" });
  }
  doc.setTextColor(0);
}

// ─── Main export ───

export interface RackPdfOptions {
  pages: SchematicPage[];
  nodes: SchematicNode[];
  schematicName: string;
  titleBlock?: TitleBlock;
  paperSize?: PaperSize;
  /** When set, restrict the export to these page IDs (otherwise all rack pages) */
  pageIds?: string[];
}

export async function exportRackPdf(opts: RackPdfOptions): Promise<void> {
  const paper: PaperSize = opts.paperSize ?? "letter";
  const { widthMm, heightMm } = getPageDimensions(paper, "landscape");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: paper });
  await loadInterFont(doc);

  const deviceDataMap = new Map<string, DeviceData>();
  for (const n of opts.nodes) if (n.type === "device") deviceDataMap.set(n.id, n.data as DeviceData);

  const rackPages: { page: RackElevationPage; rack: RackData }[] = [];
  for (const page of opts.pages) {
    if (page.type !== "rack-elevation") continue;
    if (opts.pageIds && !opts.pageIds.includes(page.id)) continue;
    for (const r of page.racks) rackPages.push({ page, rack: r });
  }

  if (rackPages.length === 0) {
    doc.setFont("Inter", "normal");
    doc.setFontSize(11);
    doc.text("No racks to export.", widthMm / 2, heightMm / 2, { align: "center" });
    doc.save(`${opts.schematicName} - Racks.pdf`.replace(/[^a-zA-Z0-9-_ .]/g, ""));
    return;
  }

  rackPages.forEach(({ page, rack }, idx) => {
    if (idx > 0) doc.addPage();
    const total = rackPages.length;
    drawTitleBar(doc, widthMm, opts.titleBlock, rack, opts.schematicName, idx + 1, total);

    const contentTopY = PAGE_MARGIN_MM + TITLE_BAR_H_MM + 6;
    const statsY = heightMm - PAGE_MARGIN_MM - 6;
    const drawableH = statsY - contentTopY - 8; // reserve for face labels & padding

    // Layout: top row = front + rear elevations; bottom row = side view
    // Heights split: top = 60%, bottom = 40%
    const topRowH = drawableH * 0.6;
    const bottomRowH = drawableH * 0.4;

    const halfW = (widthMm - 2 * PAGE_MARGIN_MM) / 2;
    const frontCx = PAGE_MARGIN_MM + halfW * 0.5;
    const rearCx = PAGE_MARGIN_MM + halfW + halfW * 0.5;

    drawElevation(doc, rack, page.placements, page.accessories, deviceDataMap, "front", frontCx, contentTopY + 4, topRowH);
    drawElevation(doc, rack, page.placements, page.accessories, deviceDataMap, "rear", rearCx, contentTopY + 4, topRowH);

    const sideTop = contentTopY + topRowH + 12;
    drawSideView(doc, rack, page.placements, page.accessories, deviceDataMap, widthMm / 2, sideTop, bottomRowH - 4);

    drawStatsFooter(doc, rack, page.placements, page.accessories, deviceDataMap, widthMm, statsY);
  });

  const safeName = opts.schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "Untitled";
  doc.save(`${safeName} - Racks.pdf`);
}

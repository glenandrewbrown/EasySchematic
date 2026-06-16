/**
 * Cable bill-of-materials PDF. Mirrors the jsPDF approach of reportPdf.ts but is
 * self-contained (no report layout / title-block plumbing): a titled table of
 * grouped cable runs plus a max-run warnings section. Renders client-side and
 * triggers a download via jsPDF's save().
 */

import { jsPDF } from "jspdf";
import type { CableBomRow } from "./cableBom";
import type { RunLengthWarning } from "./cableBomBuild";

const MARGIN_MM = 14;
const LINE_MM = 6;
const FOOTER_RESERVE_MM = 16;

/** Column x-anchors (mm). Numeric columns are right-aligned to their anchor. */
const COL = {
  signal: MARGIN_MM,
  cable: MARGIN_MM + 46,
  lengthRight: MARGIN_MM + 142,
  qtyRight: MARGIN_MM + 162,
  totalRight: MARGIN_MM + 182,
};

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "Schematic";
}

/**
 * Render and download a cable BOM PDF.
 *
 * @param rows      Grouped BOM rows (from buildCableBom).
 * @param warnings  Runs exceeding their cable's max length (from runLengthWarnings).
 * @param schematicName  Used in the title and download filename.
 */
export function renderCableBomPdf(
  rows: readonly CableBomRow[],
  warnings: readonly RunLengthWarning[],
  schematicName: string,
): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageHeight = doc.internal.pageSize.getHeight();
  const bottomLimit = pageHeight - FOOTER_RESERVE_MM;
  let y = MARGIN_MM + 4;

  const newPageIfNeeded = (): void => {
    if (y > bottomLimit) {
      doc.addPage();
      y = MARGIN_MM + 4;
    }
  };

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(`Cable Bill of Materials — ${schematicName}`, MARGIN_MM, y);
  y += LINE_MM + 1;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleDateString()}`, MARGIN_MM, y);
  doc.setTextColor(0);
  y += LINE_MM + 2;

  // Warnings section
  if (warnings.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(180, 40, 40);
    doc.text(
      `${warnings.length} run${warnings.length === 1 ? "" : "s"} exceed recommended cable length`,
      MARGIN_MM,
      y,
    );
    y += LINE_MM;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    for (const w of warnings) {
      newPageIfNeeded();
      doc.text(
        `• ${w.from} → ${w.to} (${w.cableType}): ${w.lengthM.toFixed(1)} m of ${w.maxRunM} m max`,
        MARGIN_MM + 2,
        y,
      );
      y += LINE_MM - 1;
    }
    doc.setTextColor(0);
    y += 3;
  }

  // Table header
  newPageIfNeeded();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("Signal", COL.signal, y);
  doc.text("Cable Type", COL.cable, y);
  doc.text("Length (m)", COL.lengthRight, y, { align: "right" });
  doc.text("Qty", COL.qtyRight, y, { align: "right" });
  doc.text("Total (m)", COL.totalRight, y, { align: "right" });
  y += 1.5;
  doc.setDrawColor(200);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_MM, y, MARGIN_MM + 182, y);
  y += LINE_MM - 1;

  // Table rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (const r of rows) {
    newPageIfNeeded();
    doc.text(r.signalType, COL.signal, y, { maxWidth: 44 });
    doc.text(r.cableType ?? "—", COL.cable, y, { maxWidth: 92 });
    doc.text(r.lengthM != null ? r.lengthM.toFixed(1) : "—", COL.lengthRight, y, { align: "right" });
    doc.text(String(r.quantity), COL.qtyRight, y, { align: "right" });
    doc.text(r.totalLengthM != null ? r.totalLengthM.toFixed(1) : "—", COL.totalRight, y, { align: "right" });
    y += LINE_MM;
  }

  if (rows.length === 0) {
    doc.setTextColor(120);
    doc.text("No cable runs to report.", MARGIN_MM, y);
    doc.setTextColor(0);
  }

  doc.save(`${sanitizeFilename(schematicName)} - Cable BOM.pdf`);
}

import { Printer } from "lucide-react";
import { useSchematicStore } from "../store";
import type { PrintSheetPage, RackElevationPage } from "../types";
import { getPaperSize } from "../printConfig";
import { autoFillSheetForRack } from "../printSheetAutoFill";
import { runPrintSheetExport } from "../printSheetExport";

interface Props {
  page: PrintSheetPage;
}

/** Short paper name for the header summary, e.g. "iso-a3" → "A3", "letter" → "Letter". */
function shortPaperName(page: PrintSheetPage): string {
  if (page.paperId === "custom") return "Custom";
  const paper = getPaperSize(page.paperId, page.customWidthIn, page.customHeightIn);
  // ISO labels are already "A3" etc; strip a leading "iso-" defensively.
  return paper.label.replace(/^iso-/i, "");
}

/**
 * Print Sheet header (design comp §"Print Sheet"). A 50px navy bar with the
 * page title, a mono summary derived from the real paper/orientation, plus
 * Auto-Fill / Add View / Clear (existing functionality) and the wired-up
 * Export PDF button.
 */
export default function PrintSheetToolbar({ page }: Props) {
  const addViewport = useSchematicStore((s) => s.addViewport);
  const removeViewport = useSchematicStore((s) => s.removeViewport);
  const pages = useSchematicStore((s) => s.pages);
  const elevationPages = pages.filter((p): p is RackElevationPage => p.type === "rack-elevation");

  // Sheet index display (e.g. "Sheet 2 of 3").
  const printSheetPages = pages.filter((p): p is PrintSheetPage => p.type === "print-sheet");
  const sheetIndex = printSheetPages.findIndex((p) => p.id === page.id) + 1;
  const sheetCount = printSheetPages.length;

  // Mono header summary, e.g. "A3 LANDSCAPE · 1:50".
  const summary = `${shortPaperName(page)} ${page.orientation.toUpperCase()} · 1:50`;

  const handleAutoFill = (elevPageId: string, rackId: string) => {
    const elevPage = elevationPages.find((p) => p.id === elevPageId);
    const rack = elevPage?.racks.find((r) => r.id === rackId);
    if (!elevPage || !rack) return;
    const viewports = autoFillSheetForRack(page, rack, elevPage);
    for (const vp of viewports) addViewport(page.id, vp);
  };

  return (
    <div
      className="flex items-center gap-3 px-4 bg-[var(--color-surface)] border-b border-[var(--ui-border)]"
      style={{ height: 50, flex: "none" }}
      data-print-hide
    >
      <span className="font-semibold text-[var(--color-text-heading)]" style={{ fontSize: 13 }}>
        Print Sheet
      </span>
      <span className="text-[var(--color-text-muted)]" style={{ fontFamily: "var(--font-mono)", fontSize: 9 }}>
        {summary}
      </span>

      <div className="ml-auto flex items-center gap-2">
        {/* Auto-fill from rack (existing functionality) */}
        {elevationPages.length > 0 && (
          <select
            className="ui-input"
            style={{ height: 30 }}
            defaultValue=""
            title="Auto-fill the sheet from a rack"
            onChange={(e) => {
              const [pageId, rackId] = e.target.value.split("|");
              if (pageId && rackId) handleAutoFill(pageId, rackId);
              e.target.value = "";
            }}
          >
            <option value="">Auto-Fill from…</option>
            {elevationPages.flatMap((ep) =>
              ep.racks.map((r) => (
                <option key={`${ep.id}|${r.id}`} value={`${ep.id}|${r.id}`}>
                  {ep.label} / {r.label}
                </option>
              ))
            )}
          </select>
        )}

        {/* Add a single view (existing functionality) */}
        {elevationPages.length > 0 && (
          <select
            className="ui-input"
            style={{ height: 30 }}
            defaultValue=""
            title="Add a single rack view"
            onChange={(e) => {
              const [kind, pageId, rackId] = e.target.value.split("|");
              if (!kind || !pageId || !rackId) return;
              addViewport(page.id, {
                kind: kind as "rack-front" | "rack-rear" | "rack-side",
                rackRefPageId: pageId,
                rackRefId: rackId,
                positionMm: { x: 20, y: 20 },
                sizeMm: { w: 60, h: 80 },
                showLabel: true,
              });
              e.target.value = "";
            }}
          >
            <option value="">Add view…</option>
            {elevationPages.flatMap((ep) =>
              ep.racks.flatMap((r) => [
                <option key={`front|${ep.id}|${r.id}`} value={`rack-front|${ep.id}|${r.id}`}>{r.label} · Front</option>,
                <option key={`rear|${ep.id}|${r.id}`} value={`rack-rear|${ep.id}|${r.id}`}>{r.label} · Rear</option>,
                <option key={`side|${ep.id}|${r.id}`} value={`rack-side|${ep.id}|${r.id}`}>{r.label} · Side</option>,
              ])
            )}
          </select>
        )}

        {/* Sheet count */}
        {sheetCount > 1 && (
          <span className="text-[var(--color-text-muted)]" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
            Sheet {sheetIndex} of {sheetCount}
          </span>
        )}

        {/* Clear all (existing functionality) */}
        {page.viewports.length > 0 && (
          <button
            className="ui-btn ui-btn-ghost"
            style={{ height: 30 }}
            onClick={() => { for (const vp of page.viewports) removeViewport(page.id, vp.id); }}
          >
            Clear
          </button>
        )}

        {/* Page setup — opens the same paper controls already in the sidebar; this
            is the comp's affordance. It focuses the sidebar's paper group. */}
        <button
          className="ui-btn ui-btn-ghost"
          style={{ height: 30 }}
          onClick={() => {
            const el = document.getElementById("print-sheet-paper-group");
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          Page setup
        </button>

        {/* Export PDF — same handler as File → Export → Export Print Sheets */}
        <button
          className="ui-btn ui-btn-primary inline-flex items-center gap-1.5"
          style={{ height: 30 }}
          onClick={() => { void runPrintSheetExport(); }}
        >
          <Printer size={13} strokeWidth={1.8} />
          Export PDF
        </button>
      </div>
    </div>
  );
}

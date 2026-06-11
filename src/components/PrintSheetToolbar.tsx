import { useSchematicStore } from "../store";
import type { PrintSheetPage, RackElevationPage } from "../types";
import { PAPER_SIZES } from "../printConfig";
import { autoFillSheetForRack } from "../printSheetAutoFill";
import { runPrintSheetExport } from "../printSheetExport";

interface Props {
  page: PrintSheetPage;
}

export default function PrintSheetToolbar({ page }: Props) {
  const setPrintSheetPaper = useSchematicStore((s) => s.setPrintSheetPaper);
  const addViewport = useSchematicStore((s) => s.addViewport);
  const removeViewport = useSchematicStore((s) => s.removeViewport);
  const pages = useSchematicStore((s) => s.pages);
  const elevationPages = pages.filter((p): p is RackElevationPage => p.type === "rack-elevation");

  // Sheet index display (e.g. "Sheet 2 of 3").
  const printSheetPages = pages.filter((p): p is PrintSheetPage => p.type === "print-sheet");
  const sheetIndex = printSheetPages.findIndex((p) => p.id === page.id) + 1;
  const sheetCount = printSheetPages.length;

  const isCustomPaper = page.paperId === "custom";

  const handleAutoFill = (elevPageId: string, rackId: string) => {
    const elevPage = elevationPages.find((p) => p.id === elevPageId);
    const rack = elevPage?.racks.find((r) => r.id === rackId);
    if (!elevPage || !rack) return;
    const viewports = autoFillSheetForRack(page, rack, elevPage);
    for (const vp of viewports) addViewport(page.id, vp);
  };

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-[var(--color-surface)] border-b border-[var(--ui-border)] text-xs" data-print-hide>
      {/* Paper size */}
      <label className="text-[var(--color-text-muted)] uppercase tracking-wider" style={{ fontSize: 9 }}>Paper</label>
      <select
        className="ui-input"
        value={page.paperId}
        onChange={(e) => setPrintSheetPaper(page.id, e.target.value, page.orientation, page.customWidthIn, page.customHeightIn)}
      >
        {PAPER_SIZES.map((ps) => <option key={ps.id} value={ps.id}>{ps.label}</option>)}
        <option value="custom">Custom</option>
      </select>

      {/* Custom paper dimensions */}
      {isCustomPaper && (
        <>
          <input
            type="number"
            min={1}
            max={200}
            step={0.01}
            value={page.customWidthIn ?? 24}
            onChange={(e) => setPrintSheetPaper(page.id, "custom", page.orientation, Number(e.target.value), page.customHeightIn ?? 36)}
            className="w-16 ui-input"
            title="Width (in)"
          />
          <span className="text-neutral-400">×</span>
          <input
            type="number"
            min={1}
            max={200}
            step={0.01}
            value={page.customHeightIn ?? 36}
            onChange={(e) => setPrintSheetPaper(page.id, "custom", page.orientation, page.customWidthIn ?? 24, Number(e.target.value))}
            className="w-16 ui-input"
            title="Height (in)"
          />
          <span className="text-[var(--color-text-muted)]" style={{ fontSize: 9 }}>in</span>
        </>
      )}

      {/* Orientation */}
      <button
        className={`px-2 py-0.5 rounded border text-xs transition-colors ${page.orientation === "landscape" ? "bg-[var(--color-accent-soft)] border-[var(--color-accent)] text-[var(--color-accent)]" : "ui-btn ui-btn-ghost"}`}
        onClick={() => setPrintSheetPaper(page.id, page.paperId, page.orientation === "landscape" ? "portrait" : "landscape")}
      >
        {page.orientation === "landscape" ? "↔ Landscape" : "↕ Portrait"}
      </button>

      {/* Title block toggle */}
      <label className="flex items-center gap-1 cursor-pointer">
        <input
          type="checkbox"
          checked={page.showTitleBlock}
          onChange={(e) => {
            const updatedPage = { ...page, showTitleBlock: e.target.checked };
            useSchematicStore.setState((state) => ({
              pages: state.pages.map((p) => p.id === page.id ? updatedPage : p),
            }));
          }}
        />
        <span className="text-[var(--color-text)]">Title Block</span>
      </label>

      <div className="border-l border-[var(--ui-border)] h-4" />

      {/* Auto-fill from rack */}
      {elevationPages.length > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-[var(--color-text-muted)]">Auto-Fill from:</span>
          <select
            className="ui-input"
            defaultValue=""
            onChange={(e) => {
              const [pageId, rackId] = e.target.value.split("|");
              if (pageId && rackId) handleAutoFill(pageId, rackId);
              e.target.value = "";
            }}
          >
            <option value="">— Pick rack —</option>
            {elevationPages.flatMap((ep) =>
              ep.racks.map((r) => (
                <option key={`${ep.id}|${r.id}`} value={`${ep.id}|${r.id}`}>
                  {ep.label} / {r.label}
                </option>
              ))
            )}
          </select>
        </div>
      )}

      {/* Add viewport manually */}
      {elevationPages.length > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-[var(--color-text-muted)]">Add View:</span>
          <select
            className="ui-input"
            defaultValue=""
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
            <option value="">— Pick view —</option>
            {elevationPages.flatMap((ep) =>
              ep.racks.flatMap((r) => [
                <option key={`front|${ep.id}|${r.id}`} value={`rack-front|${ep.id}|${r.id}`}>{r.label} · Front</option>,
                <option key={`rear|${ep.id}|${r.id}`} value={`rack-rear|${ep.id}|${r.id}`}>{r.label} · Rear</option>,
                <option key={`side|${ep.id}|${r.id}`} value={`rack-side|${ep.id}|${r.id}`}>{r.label} · Side</option>,
              ])
            )}
          </select>
        </div>
      )}

      <div className="flex-1" />

      {/* Sheet count */}
      {sheetCount > 1 && (
        <span className="text-[var(--color-text-muted)]" style={{ fontFamily: "monospace", fontSize: 11 }}>
          Sheet {sheetIndex} of {sheetCount}
        </span>
      )}

      {/* Clear all */}
      {page.viewports.length > 0 && (
        <button
          className="ui-btn ui-btn-danger"
          onClick={() => { for (const vp of page.viewports) removeViewport(page.id, vp.id); }}
        >
          Clear All
        </button>
      )}

      {/* Export PDF — same handler as File → Export → Export Print Sheets */}
      <button
        className="ui-btn ui-btn-primary"
        onClick={() => { void runPrintSheetExport(); }}
      >
        Export PDF
      </button>
    </div>
  );
}

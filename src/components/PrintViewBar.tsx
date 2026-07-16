import { memo, useCallback, useState, useRef, useEffect, useMemo } from "react";
import { useReactFlow } from "@xyflow/react";
import { useSchematicStore } from "../store";
import { PAPER_SIZES, getPaperSize } from "../printConfig";
import { computePageGrid } from "../printPageGrid";
import { exportPdf } from "../pdfExport";
import { collectColorKeyEntries } from "../colorKeyLayout";

function PrintViewBar() {
  const rfInstance = useReactFlow();

  const printPaperId = useSchematicStore((s) => s.printPaperId);
  const printOrientation = useSchematicStore((s) => s.printOrientation);
  const printScale = useSchematicStore((s) => s.printScale);
  const printCustomWidthIn = useSchematicStore((s) => s.printCustomWidthIn);
  const printCustomHeightIn = useSchematicStore((s) => s.printCustomHeightIn);
  const titleBlock = useSchematicStore((s) => s.titleBlock);
  const titleBlockLayout = useSchematicStore((s) => s.titleBlockLayout);
  // Subscribe to node positions so page count updates when nodes move
  useSchematicStore((s) =>
    s.nodes.map((n) => `${n.id}:${Math.round(n.position.x)},${Math.round(n.position.y)},${n.measured?.width ?? 0},${n.measured?.height ?? 0}`).join("|"),
  );
  const setPrintPaperId = useSchematicStore((s) => s.setPrintPaperId);
  const setPrintOrientation = useSchematicStore((s) => s.setPrintOrientation);
  const setPrintScale = useSchematicStore((s) => s.setPrintScale);
  const setPrintCustomWidthIn = useSchematicStore((s) => s.setPrintCustomWidthIn);
  const setPrintCustomHeightIn = useSchematicStore((s) => s.setPrintCustomHeightIn);
  const printOriginOffsetX = useSchematicStore((s) => s.printOriginOffsetX);
  const printOriginOffsetY = useSchematicStore((s) => s.printOriginOffsetY);
  const setPrintOriginOffset = useSchematicStore((s) => s.setPrintOriginOffset);
  const colorKeyEnabled = useSchematicStore((s) => s.colorKeyEnabled);
  const colorKeyCorner = useSchematicStore((s) => s.colorKeyCorner);
  const colorKeyColumns = useSchematicStore((s) => s.colorKeyColumns);
  const colorKeyPage = useSchematicStore((s) => s.colorKeyPage);
  const colorKeyOverrides = useSchematicStore((s) => s.colorKeyOverrides);
  const signalColors = useSchematicStore((s) => s.signalColors);
  const signalLineStyles = useSchematicStore((s) => s.signalLineStyles);
  const storeEdges = useSchematicStore((s) => s.edges);
  const setColorKeyEnabled = useSchematicStore((s) => s.setColorKeyEnabled);
  const setColorKeyCorner = useSchematicStore((s) => s.setColorKeyCorner);
  const setColorKeyColumns = useSchematicStore((s) => s.setColorKeyColumns);
  const setColorKeyPage = useSchematicStore((s) => s.setColorKeyPage);
  const setColorKeyOverrides = useSchematicStore((s) => s.setColorKeyOverrides);

  const [ckPopoverOpen, setCkPopoverOpen] = useState(false);
  const ckPopoverRef = useRef<HTMLDivElement>(null);
  const ckButtonRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!ckPopoverOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        ckPopoverRef.current && !ckPopoverRef.current.contains(e.target as Node) &&
        ckButtonRef.current && !ckButtonRef.current.contains(e.target as Node)
      ) {
        setCkPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ckPopoverOpen]);

  // Compute auto-detected entries for the checklist
  const autoEntries = useMemo(
    () => collectColorKeyEntries(storeEdges, signalColors, signalLineStyles, undefined),
    [storeEdges, signalColors, signalLineStyles],
  );

  const paperSize = getPaperSize(printPaperId, printCustomWidthIn, printCustomHeightIn);
  const nodes = rfInstance.getNodes();
  const pages = computePageGrid(paperSize, printOrientation, printScale, nodes, titleBlockLayout.heightIn, printOriginOffsetX, printOriginOffsetY);

  const handleExportPdf = useCallback(async () => {
    await exportPdf(rfInstance, paperSize, printOrientation, printScale, titleBlock, titleBlockLayout);
  }, [rfInstance, paperSize, printOrientation, printScale, titleBlock, titleBlockLayout]);

  // Group paper sizes by category
  const categories = new Map<string, typeof PAPER_SIZES>();
  for (const ps of PAPER_SIZES) {
    const group = categories.get(ps.category) ?? [];
    group.push(ps);
    categories.set(ps.category, group);
  }

  return (
    <div className="h-10 bg-[var(--color-surface)] border-b border-[var(--ui-border)] flex items-center px-3 gap-3 shrink-0" data-print-hide>
      {/* Paper size */}
      <label className="flex items-center gap-1.5 text-xs text-[var(--color-text)]">
        Paper
        <select
          className="text-xs bg-[var(--color-surface-raised)] border border-[var(--ui-border)] rounded px-1.5 py-0.5 text-[var(--color-text-heading)]"
          value={printPaperId}
          onChange={(e) => setPrintPaperId(e.target.value)}
        >
          {[...categories.entries()].map(([category, sizes]) => (
            <optgroup key={category} label={category}>
              {sizes.map((ps) => (
                <option key={ps.id} value={ps.id}>
                  {ps.label} ({ps.widthIn}&times;{ps.heightIn}&quot;)
                </option>
              ))}
            </optgroup>
          ))}
          <optgroup label="Custom">
            <option value="custom">Custom</option>
          </optgroup>
        </select>
      </label>

      {/* Custom dimensions */}
      {printPaperId === "custom" && (
        <div className="flex items-center gap-1 text-xs text-[var(--color-text)]">
          <input
            type="number"
            min={1}
            max={200}
            step={0.01}
            value={printCustomWidthIn}
            onChange={(e) => setPrintCustomWidthIn(Number(e.target.value))}
            className="w-14 text-xs bg-[var(--color-surface-raised)] border border-[var(--ui-border)] rounded px-1 py-0.5 text-[var(--color-text-heading)] text-center"
          />
          <span>&times;</span>
          <input
            type="number"
            min={1}
            max={200}
            step={0.01}
            value={printCustomHeightIn}
            onChange={(e) => setPrintCustomHeightIn(Number(e.target.value))}
            className="w-14 text-xs bg-[var(--color-surface-raised)] border border-[var(--ui-border)] rounded px-1 py-0.5 text-[var(--color-text-heading)] text-center"
          />
          <span>&quot;</span>
        </div>
      )}

      {/* Orientation */}
      <div className="flex items-center gap-1 text-xs">
        <button
          className={`px-2 py-0.5 rounded border text-xs cursor-pointer ${
            printOrientation === "landscape"
              ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] border-[var(--color-accent)]"
              : "bg-white text-[var(--color-text)] border-[var(--ui-border)] hover:bg-[var(--color-surface-hover)]"
          }`}
          onClick={() => setPrintOrientation("landscape")}
        >
          Landscape
        </button>
        <button
          className={`px-2 py-0.5 rounded border text-xs cursor-pointer ${
            printOrientation === "portrait"
              ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] border-[var(--color-accent)]"
              : "bg-white text-[var(--color-text)] border-[var(--ui-border)] hover:bg-[var(--color-surface-hover)]"
          }`}
          onClick={() => setPrintOrientation("portrait")}
        >
          Portrait
        </button>
      </div>

      {/* Scale */}
      <label className="flex items-center gap-1.5 text-xs text-[var(--color-text)]">
        Scale
        <input
          type="range"
          min={0.25}
          max={2}
          step={0.05}
          value={printScale}
          onChange={(e) => setPrintScale(Number(e.target.value))}
          className="w-20 h-1"
          style={{ accentColor: "var(--color-accent)" }}
        />
        <span className="text-xs text-[var(--color-text-heading)] w-8 text-right font-mono">
          {Math.round(printScale * 100)}%
        </span>
      </label>

      {/* Page offset */}
      <label className="flex items-center gap-1 text-xs text-[var(--color-text)]">
        Offset
        <input
          type="number"
          step={20}
          value={printOriginOffsetX}
          onChange={(e) => setPrintOriginOffset(Number(e.target.value), printOriginOffsetY)}
          className="w-14 text-xs bg-[var(--color-surface-raised)] border border-[var(--ui-border)] rounded px-1 py-0.5 text-[var(--color-text-heading)] text-center"
        />
        <input
          type="number"
          step={20}
          value={printOriginOffsetY}
          onChange={(e) => setPrintOriginOffset(printOriginOffsetX, Number(e.target.value))}
          className="w-14 text-xs bg-[var(--color-surface-raised)] border border-[var(--ui-border)] rounded px-1 py-0.5 text-[var(--color-text-heading)] text-center"
        />
        {(printOriginOffsetX !== 0 || printOriginOffsetY !== 0) && (
          <button
            className="text-xs text-[var(--color-accent)] hover:underline cursor-pointer"
            onClick={() => setPrintOriginOffset(0, 0)}
          >
            Reset
          </button>
        )}
      </label>

      {/* Page count */}
      <span className="text-xs text-[var(--color-text-muted)]">
        {pages.length} page{pages.length !== 1 ? "s" : ""}
      </span>

      {/* Color Key */}
      <div className="relative" ref={ckButtonRef}>
        <div className="flex items-center gap-0.5">
          <button
            className={`px-2 py-0.5 rounded-l border text-xs cursor-pointer ${
              colorKeyEnabled
                ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] border-[var(--color-accent)]"
                : "bg-[var(--color-surface-raised)] text-[var(--color-text)] border-[var(--ui-border)] hover:bg-[var(--color-surface-hover)]"
            }`}
            onClick={() => setColorKeyEnabled(!colorKeyEnabled)}
            title="Toggle signal color key"
          >
            Color Key
          </button>
          <button
            className={`px-1 py-0.5 rounded-r border-t border-b border-r text-xs cursor-pointer ${
              colorKeyEnabled
                ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] border-[var(--color-accent)] hover:opacity-90"
                : "bg-[var(--color-surface-raised)] text-[var(--color-text)] border-[var(--ui-border)] hover:bg-[var(--color-surface-hover)]"
            }`}
            onClick={() => setCkPopoverOpen(!ckPopoverOpen)}
            title="Color key settings"
          >
            <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor"><path d="M0 0l4 5 4-5z" /></svg>
          </button>
        </div>

        {ckPopoverOpen && (
          <div
            ref={ckPopoverRef}
            className="absolute top-full left-0 mt-1 bg-[var(--color-surface-raised)] border border-[var(--ui-border)] rounded-lg shadow-[var(--ui-shadow-menu)] p-3 z-50 w-56"
          >
            {/* Corner picker */}
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Corner</div>
            <div className="grid grid-cols-2 gap-1 mb-2">
              {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((c) => (
                <button
                  key={c}
                  className={`px-2 py-0.5 text-[10px] rounded border cursor-pointer ${
                    colorKeyCorner === c
                      ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] border-[var(--color-accent)]"
                      : "bg-white text-[var(--color-text)] border-[var(--ui-border)] hover:bg-[var(--color-surface-hover)]"
                  }`}
                  onClick={() => setColorKeyCorner(c)}
                >
                  {c.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ")}
                </button>
              ))}
            </div>

            {/* Columns */}
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Columns</div>
            <div className="flex gap-1 mb-2">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  className={`w-7 py-0.5 text-[10px] rounded border cursor-pointer ${
                    colorKeyColumns === n
                      ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] border-[var(--color-accent)]"
                      : "bg-white text-[var(--color-text)] border-[var(--ui-border)] hover:bg-[var(--color-surface-hover)]"
                  }`}
                  onClick={() => setColorKeyColumns(n)}
                >
                  {n}
                </button>
              ))}
            </div>

            {/* Show on page */}
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Show On</div>
            <select
              className="text-xs bg-[var(--color-surface-raised)] border border-[var(--ui-border)] rounded px-1.5 py-0.5 text-[var(--color-text-heading)] w-full mb-2"
              value={colorKeyPage}
              onChange={(e) => setColorKeyPage(e.target.value as "first" | "last" | "all")}
            >
              <option value="first">First page</option>
              <option value="last">Last page</option>
              <option value="all">All pages</option>
            </select>

            {/* Signal type overrides */}
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Signal Types</div>
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {autoEntries.map(({ signalType, label, color }) => {
                const isHidden = colorKeyOverrides?.[signalType] === false;
                return (
                  <label key={signalType} className="flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!isHidden}
                      onChange={() => {
                        const next = { ...colorKeyOverrides };
                        if (isHidden) {
                          delete next[signalType];
                        } else {
                          next[signalType] = false;
                        }
                        setColorKeyOverrides(Object.keys(next).length > 0 ? next : undefined);
                      }}
                      className="w-3 h-3 cursor-pointer"
                      style={{ accentColor: "var(--color-accent)" }}
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: color }}
                    />
                    <span className="text-xs text-[var(--color-text)] truncate">{label}</span>
                  </label>
                );
              })}
              {autoEntries.length === 0 && (
                <div className="text-xs text-[var(--color-text-muted)] italic px-1">No connected signals</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Export PDF */}
      <button
        className="ui-btn ui-btn-primary"
        onClick={handleExportPdf}
      >
        Export PDF
      </button>

    </div>
  );
}

export default memo(PrintViewBar);

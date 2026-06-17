import { Check } from "lucide-react";
import { useSchematicStore } from "../store";
import type { PrintSheetPage, RackElevationPage } from "../types";

const LBL = "uppercase";
const lblStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  letterSpacing: "0.13em",
  color: "var(--color-text-muted)",
};

/** A two-or-three-way segmented control matching the design comp. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="flex gap-0.5 p-[3px] rounded-lg border border-[var(--ui-border)] bg-[var(--color-bg)]"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 text-center rounded-md transition-colors ${
              active
                ? "bg-[var(--color-surface-raised)] border border-[var(--ui-border-strong)] text-[var(--color-text-heading)] font-medium"
                : "border border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
            style={{ fontSize: 11, padding: "6px 0" }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** A checkbox row matching the design comp's Include list. */
function CheckRow({
  checked,
  label,
  disabled,
  onToggle,
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onToggle?: () => void;
}) {
  return (
    <label
      className={`flex items-center gap-2.5 ${disabled ? "cursor-default" : "cursor-pointer"}`}
      style={{ fontSize: 12, color: disabled ? "var(--color-text-muted)" : "var(--color-text)" }}
      onClick={(e) => {
        if (disabled || !onToggle) return;
        e.preventDefault();
        onToggle();
      }}
    >
      <span
        className="flex items-center justify-center shrink-0 rounded"
        style={{
          width: 17,
          height: 17,
          background: checked ? "var(--color-accent)" : "var(--color-bg)",
          border: checked ? "none" : "1px solid var(--ui-border-strong)",
        }}
      >
        {checked && <Check size={11} strokeWidth={3} color="#ffffff" />}
      </span>
      {label}
    </label>
  );
}

interface Props {
  page: PrintSheetPage;
}

/**
 * Print Sheet options panel (design comp §"Print Sheet"). A 226px navy rail
 * with grouped controls — Paper, Orientation, Include, Scale — wired to the
 * existing print-sheet store state, followed by the existing "Drag to Sheet"
 * rack list.
 */
export default function PrintSheetSidebar({ page }: Props) {
  const pages = useSchematicStore((s) => s.pages);
  const activePage = useSchematicStore((s) => s.activePage);
  const addViewport = useSchematicStore((s) => s.addViewport);
  const setPrintSheetPaper = useSchematicStore((s) => s.setPrintSheetPaper);

  const elevationPages = pages.filter((p): p is RackElevationPage => p.type === "rack-elevation");

  // Map the comp's A3/A2/A1 segmented control to the ISO paper ids. If the page
  // uses some other paper size, fall back to the "Other" select so no existing
  // option is lost.
  const PAPER_OPTIONS = [
    { value: "iso-a3", label: "A3" },
    { value: "iso-a2", label: "A2" },
    { value: "iso-a1", label: "A1" },
  ] as const;
  const isCompPaper = PAPER_OPTIONS.some((p) => p.value === page.paperId);

  const setShowTitleBlock = (checked: boolean) => {
    useSchematicStore.setState((state) => ({
      pages: state.pages.map((p) => (p.id === page.id ? { ...p, showTitleBlock: checked } : p)),
    }));
  };

  const handleDragStart = (
    e: React.DragEvent,
    pageId: string,
    rackId: string,
    kind: "rack-front" | "rack-rear" | "rack-side",
  ) => {
    e.dataTransfer.setData("application/x-print-viewport", JSON.stringify({ pageId, rackId, kind }));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <aside
      className="flex flex-col gap-[18px] overflow-auto border-r border-[var(--ui-border)] bg-[var(--color-surface)]"
      style={{ width: 226, flex: "none", padding: "16px 14px" }}
      data-print-hide
    >
      {/* Paper */}
      <div id="print-sheet-paper-group">
        <div className={LBL} style={{ ...lblStyle, marginBottom: 10 }}>Paper</div>
        <Segmented
          value={isCompPaper ? page.paperId : "iso-a3"}
          options={[...PAPER_OPTIONS]}
          onChange={(v) => setPrintSheetPaper(page.id, v, page.orientation, page.customWidthIn, page.customHeightIn)}
        />
        {!isCompPaper && (
          <div className="mt-2 text-[var(--color-text-muted)]" style={{ fontSize: 10 }}>
            Current: {page.paperId === "custom" ? "Custom" : page.paperId}
          </div>
        )}
      </div>

      {/* Orientation */}
      <div>
        <div className={LBL} style={{ ...lblStyle, marginBottom: 10 }}>Orientation</div>
        <Segmented
          value={page.orientation}
          options={[
            { value: "landscape", label: "Landscape" },
            { value: "portrait", label: "Portrait" },
          ]}
          onChange={(v) => setPrintSheetPaper(page.id, page.paperId, v, page.customWidthIn, page.customHeightIn)}
        />
      </div>

      {/* Include */}
      <div>
        <div className={LBL} style={{ ...lblStyle, marginBottom: 10 }}>Include</div>
        <div className="flex flex-col gap-2">
          <CheckRow
            checked={page.showTitleBlock}
            label="Title block"
            onToggle={() => setShowTitleBlock(!page.showTitleBlock)}
          />
          {/* Cable schedule / Legend render as part of the sheet itself; shown
              here for parity with the comp. Revision history is not yet a
              data-backed option. */}
          <CheckRow checked label="Cable schedule" disabled />
          <CheckRow checked label="Legend" disabled />
          <CheckRow checked={false} label="Revision history" disabled />
        </div>
      </div>

      {/* Scale */}
      <div>
        <div className={LBL} style={{ ...lblStyle, marginBottom: 10 }}>Scale</div>
        <div
          className="flex items-center rounded-lg border border-[var(--ui-border)] bg-[var(--color-bg)]"
          style={{ height: 32, padding: "0 11px", fontSize: 12, color: "var(--color-text-heading)" }}
        >
          <span style={{ fontFamily: "var(--font-mono)" }}>1 : 50</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ marginLeft: "auto", color: "var(--color-text-muted)" }}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Drag to Sheet — existing rack-view source list */}
      {elevationPages.length > 0 && (
        <div>
          <div className={LBL} style={{ ...lblStyle, marginBottom: 10 }}>Drag to Sheet</div>
          <div className="flex flex-col" style={{ fontSize: 12 }}>
            {elevationPages.map((ep) => (
              <div key={ep.id} className="mb-2">
                <div className="text-[var(--color-text)] font-medium truncate py-0.5" title={ep.label}>
                  {ep.label}
                </div>
                {ep.racks.map((rack) => (
                  <div key={rack.id} className="ml-2 mb-1">
                    <div className="text-[var(--color-text-muted)] truncate py-0.5" title={rack.label} style={{ fontSize: 10 }}>
                      {rack.label} ({rack.heightU}U)
                    </div>
                    {(["rack-front", "rack-rear", "rack-side"] as const).map((kind) => (
                      <div
                        key={kind}
                        className="ml-2 px-2 py-0.5 rounded cursor-grab text-[var(--color-text)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)] border border-transparent hover:border-[var(--color-accent-soft)] transition-colors"
                        draggable
                        onDragStart={(e) => handleDragStart(e, ep.id, rack.id, kind)}
                        onClick={() => {
                          if (!activePage) return;
                          addViewport(activePage, {
                            kind,
                            rackRefPageId: ep.id,
                            rackRefId: rack.id,
                            positionMm: { x: 20, y: 20 },
                            sizeMm: { w: 60, h: 80 },
                            showLabel: true,
                          });
                        }}
                      >
                        {kind === "rack-front" ? "Front" : kind === "rack-rear" ? "Rear" : "Side"}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useSchematicStore, UI_SCALE_STEPS } from "../store";
import { severityWord, healthyWord } from "../plainLanguage";
import { validateSchematic, countIssues } from "../validation";
import { exportImage } from "../exportUtils";
import { exportDxf } from "../dxfExport";
import { exportPdf } from "../pdfExport";
import { computeCableSchedule, exportCableScheduleCsv } from "../cableSchedule";
import { getPaperSize } from "../printConfig";
import { useTheme } from "../hooks/useTheme";
import MenuBar from "./MenuBar";
import UserMenuButton from "./UserMenuButton";

/**
 * The single 46px unified top bar (design HANDOFF §3) — replaces the legacy triple
 * stack (MenuBar + Toolbar + PageTabs). Layout:
 *   logo · filename · ⌘K launcher · ≡   |   centered persona pill   |   theme · issues · Export · avatar
 *
 * The File/Edit/… menus + all their dialogs + window-event handlers are preserved by
 * embedding <MenuBar variant="menu" /> (the compact ≡). The persona pill drives the
 * canvas view (schematic / layout→"Plan" / schedule) and rack pages.
 */

const fire = (name: string) => window.dispatchEvent(new CustomEvent(name));

/**
 * Close an anchored popover on Escape or a click outside its anchor — the same
 * pattern UserMenuButton uses. `mousedown` (not `click`) so the popover is gone
 * before the outside target reacts to the press.
 */
function useDismissOnOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

type Persona = "schematic" | "plan" | "schedule" | "rack";

type ExportFormat = "png" | "svg" | "pdf" | "dxf" | "csv";

/** One-click formats, in the design's order. Each maps to an existing exporter. */
const EXPORT_FORMATS: { key: ExportFormat; label: string; meta: string; icon: string }[] = [
  { key: "png", label: "PNG image", meta: "Raster snapshot of this view", icon: "M3 5h18v14H3zM8.5 10.5l3 3 2.5-2.5 4 4" },
  { key: "svg", label: "SVG vector", meta: "Scalable drawing", icon: "M4 4h16v16H4zM4 14l5-5 4 4 3-3 4 4" },
  { key: "pdf", label: "PDF print sheet", meta: "Titled sheet at the print scale", icon: "M6 2h9l5 5v15H6zM15 2v5h5" },
  { key: "dxf", label: "DXF (CAD)", meta: "Drawing for AutoCAD", icon: "M4 20L20 4M4 4h6v6M14 14h6v6" },
  { key: "csv", label: "CSV schedule", meta: "Cable schedule data", icon: "M4 4h16v16H4zM4 9h16M9 9v11" },
];

const PERSONAS: { key: Persona; label: string; icon: React.ReactNode }[] = [
  {
    key: "schematic",
    label: "Schematic",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="7" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
        <rect x="14" y="15" width="7" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6.5 9v3a2 2 0 0 0 2 2h9" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    key: "plan",
    label: "Plan",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 9h6V3M21 14h-7v7" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    key: "schedule",
    label: "Schedule",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 9h18M9 9v11M3 14h18" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
  {
    key: "rack",
    label: "Rack",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="3" width="14" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 7h8M8 11h8M8 15h8" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
];

export default function EditorTopBar() {
  const { isDark, toggle } = useTheme();
  const schematicName = useSchematicStore((s) => s.schematicName);
  const setSchematicName = useSchematicStore((s) => s.setSchematicName);
  const canvasViewMode = useSchematicStore((s) => s.canvasViewMode);
  const setCanvasViewMode = useSchematicStore((s) => s.setCanvasViewMode);
  const activePage = useSchematicStore((s) => s.activePage);
  const pages = useSchematicStore((s) => s.pages);
  const setActivePage = useSchematicStore((s) => s.setActivePage);
  const addRackPage = useSchematicStore((s) => s.addRackPage);
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const detailLevel = useSchematicStore((s) => s.detailLevel);
  const uiScale = useSchematicStore((s) => s.uiScale);
  const setUiScale = useSchematicStore((s) => s.setUiScale);
  const reduceMotion = useSchematicStore((s) => s.reduceMotion);
  const showWarnings = useSchematicStore((s) => s.showWarnings);
  const rfInstance = useReactFlow();

  // Warnings are opt-in (View ▸ Show warnings). When off, only errors surface in the pill;
  // a warning-only document reads as "Clean" and the pill stays quiet.
  const rawIssues = useMemo(() => countIssues(validateSchematic(nodes, edges)), [nodes, edges]);
  const issues = showWarnings ? rawIssues : { ...rawIssues, warnings: 0 };

  // ── Health pill wording ───────────────────────────────────────────────────
  // The dot's meaning is always spelled out: the count line states the tally and
  // the tag chip carries the plain/technical severity word.
  const { errors, warnings } = issues;
  const healthTone =
    errors > 0 ? "var(--color-error)" : warnings > 0 ? "var(--color-warning)" : "var(--color-success)";
  const healthLabel =
    errors > 0
      ? `${errors} ${errors === 1 ? "error" : "errors"}${warnings > 0 ? ` · ${warnings} ${warnings === 1 ? "warning" : "warnings"}` : ""}`
      : warnings > 0
        ? `${warnings} ${warnings === 1 ? "warning" : "warnings"}`
        : healthyWord(detailLevel);
  const healthTag =
    errors > 0
      ? severityWord("error", detailLevel)
      : warnings > 0
        ? severityWord("warning", detailLevel)
        : healthyWord(detailLevel);

  // ── Popovers ──────────────────────────────────────────────────────────────
  const [scaleOpen, setScaleOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const closeScale = useCallback(() => setScaleOpen(false), []);
  const closeExport = useCallback(() => setExportOpen(false), []);
  const scaleRef = useDismissOnOutside(scaleOpen, closeScale);
  const exportRef = useDismissOnOutside(exportOpen, closeExport);

  // Phone (<768px) overflow menu — theme, export, help, account (board 1a).
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);
  const mobileMenuRef = useDismissOnOutside(mobileMenuOpen, closeMobileMenu);

  // The .chrome-menu entry animation is CSS-gated on prefers-reduced-motion; the
  // in-app preference has to be applied here as well.
  const popMotion = reduceMotion ? { animation: "none" } : undefined;

  const runExport = (format: ExportFormat) => {
    setExportOpen(false);
    const s = useSchematicStore.getState();
    if (format === "png") {
      void exportImage(rfInstance, { format: "png", pixelRatio: 4 });
    } else if (format === "svg") {
      void exportImage(rfInstance, { format: "svg" });
    } else if (format === "pdf") {
      const paper = getPaperSize(s.printPaperId, s.printCustomWidthIn, s.printCustomHeightIn);
      void exportPdf(rfInstance, paper, s.printOrientation, s.printScale, s.titleBlock, s.titleBlockLayout);
    } else if (format === "dxf") {
      exportDxf(rfInstance);
    } else {
      const rows = computeCableSchedule(nodes, edges, s.cableNamingScheme, {
        roomDistances: s.roomDistances,
        distanceSettings: s.distanceSettings,
      });
      exportCableScheduleCsv(rows, s.schematicName);
    }
  };

  const isSchematicPage = !activePage || activePage === "schematic";
  const activePgType = useMemo(() => {
    if (isSchematicPage) return null;
    return pages.find((p) => p.id === activePage)?.type ?? null;
  }, [isSchematicPage, pages, activePage]);

  const persona: Persona = activePgType?.startsWith("rack")
    ? "rack"
    : !isSchematicPage
      ? "schematic"
      : canvasViewMode === "layout"
        ? "plan"
        : canvasViewMode === "schedule"
          ? "schedule"
          : "schematic";

  const pageLabel = activePgType?.startsWith("rack")
    ? (pages.find((p) => p.id === activePage)?.label ?? "Rack")
    : activePgType === "print-sheet"
      ? "Print Sheet"
      : persona === "plan"
        ? "Plan"
        : persona === "schedule"
          ? "Schedule"
          : "Schematic";

  const goPersona = (p: Persona) => {
    if (p === "rack") {
      const rack = pages.find((pg) => pg.type?.startsWith("rack"));
      setActivePage(rack ? rack.id : addRackPage("Rack Page 1"));
      return;
    }
    if (!isSchematicPage) setActivePage("schematic");
    setCanvasViewMode(p === "plan" ? "layout" : p === "schedule" ? "schedule" : "schematic");
  };

  // ── Filename rename ───────────────────────────────────────────────────────
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(schematicName);
  const commitName = () => {
    const next = nameValue.trim();
    if (next) setSchematicName(next);
    else setNameValue(schematicName);
    setEditingName(false);
  };

  const iconBtn =
    "w-7 h-7 flex items-center justify-center rounded-md border border-[var(--ui-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer";

  return (
    <div data-print-hide className="shrink-0 z-40">
      {/* ── Desktop unified bar ──────────────────────────────────────────── */}
      <header className="relative hidden md:flex items-center h-[46px] px-3 gap-3 bg-[var(--color-surface)] border-b border-[var(--ui-border)] select-none">
        {/* Left cluster */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="relative w-[26px] h-[26px] rounded-md bg-[var(--color-surface-raised)] border border-[var(--ui-border)] flex items-center justify-center shrink-0">
            <span className="absolute left-0 top-[5px] bottom-[5px] w-[2.5px] rounded bg-[var(--color-accent)]" />
            <img src="/favicon.svg" className="w-3.5 h-3.5" alt="" />
          </span>
          <span className="text-[13px] font-semibold text-[var(--color-text-heading)] tracking-tight shrink-0">
            EasySchematic
          </span>
          <span className="w-px h-[18px] bg-[var(--ui-border)]" />

          {/* ≡ File/Edit/… menus + all dialogs + handlers (preserved) */}
          <MenuBar variant="menu" />

          {/* Breadcrumb: project name (editable) / current page · saved dot */}
          <span className="hidden xl:flex items-center gap-1.5 min-w-0">
            {editingName ? (
              <input
                className="bg-transparent text-[var(--color-text-heading)] text-xs font-medium outline-none border-b border-[var(--color-accent)] max-w-[160px]"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitName();
                  if (e.key === "Escape") {
                    setNameValue(schematicName);
                    setEditingName(false);
                  }
                }}
                autoFocus
              />
            ) : (
              <span
                className="text-xs font-medium text-[var(--color-text)] hover:text-[var(--color-accent)] cursor-pointer whitespace-nowrap"
                title="Double-click to rename"
                onDoubleClick={() => {
                  setNameValue(schematicName);
                  setEditingName(true);
                }}
              >
                {schematicName}
              </span>
            )}
            <span className="text-[11px] text-[var(--color-text-muted)]">/</span>
            <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">{pageLabel}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" title="Saved" />
          </span>

          {/* ⌘K launcher */}
          <button
            onClick={() => fire("easyschematic:open-command-palette")}
            title="Search or run a command (⌘K)"
            className="ml-1 flex items-center gap-2 h-7 px-2.5 rounded-md bg-[var(--color-bg)] border border-[var(--ui-border)] text-[var(--color-text-muted)] hover:border-[var(--ui-border-strong)] transition-colors cursor-pointer shrink min-w-0 lg:min-w-[190px]"
            style={{ fontSize: "11.5px" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="shrink-0">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
              <path d="M21 21l-4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span className="hidden lg:inline truncate">Search or run a command</span>
            <span
              className="ml-auto hidden lg:inline px-1.5 py-px rounded border border-[var(--ui-border)]"
              style={{ fontFamily: "var(--font-mono)", fontSize: "9.5px" }}
            >
              ⌘K
            </span>
          </button>
        </div>

        {/* Center: persona switcher — in normal flow (never overlaps), icon-only when cramped */}
        <div className="flex items-center gap-0.5 p-[3px] rounded-lg bg-[var(--color-bg)] border border-[var(--ui-border)] shrink-0">
          {PERSONAS.map((p) => {
            const active = persona === p.key;
            return (
              <button
                key={p.key}
                onClick={() => goPersona(p.key)}
                title={p.label}
                className={`relative flex items-center gap-1.5 h-7 px-2.5 lg:px-3 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer ${
                  active
                    ? "text-[var(--color-text-heading)]"
                    : "text-[var(--color-text)] hover:text-[var(--color-text-heading)]"
                }`}
                style={
                  active
                    ? {
                        background: "var(--color-surface-raised)",
                        border: "1px solid var(--ui-border-strong)",
                        boxShadow: "inset 0 -2px 0 var(--color-accent)",
                      }
                    : undefined
                }
              >
                {p.icon}
                <span className="hidden lg:inline">{p.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          {/* Health pill — only shown when there is an error, or when the user has opted into
              warnings (View ▸ Show warnings). With warnings off and no errors, the entire
              validation pill (including the "all good" state) is hidden — no validation chrome. */}
          {(showWarnings || errors > 0) && (
          <button
            onClick={() => fire("easyschematic:show-validate")}
            title="Document health — click to view validation issues"
            className="flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-md border transition-colors cursor-pointer"
            style={{
              background:
                errors > 0 ? "color-mix(in srgb, var(--color-error) 10%, transparent)" : "var(--color-bg)",
              borderColor: errors > 0 || warnings > 0 ? healthTone : "var(--ui-border)",
            }}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: healthTone }} />
            <span className="flex flex-col items-start leading-none">
              <span className="text-[11.5px] font-semibold text-[var(--color-text-heading)] whitespace-nowrap">
                {healthLabel}
              </span>
              <span
                className="hidden lg:block mt-0.5 text-[var(--color-text-muted)] uppercase"
                style={{ fontFamily: "var(--font-mono)", fontSize: "8.5px", letterSpacing: "0.12em" }}
              >
                Validation
              </span>
            </span>
            {/* Square tag dot vs the round status dot — severity is never colour-only */}
            <span
              className="hidden xl:flex items-center gap-1 h-5 px-1.5 rounded-[5px]"
              style={{ background: `color-mix(in srgb, ${healthTone} 16%, transparent)` }}
            >
              <span className="w-1.5 h-1.5 rounded-[2px]" style={{ background: healthTone }} />
              <span
                className="uppercase font-bold whitespace-nowrap"
                style={{ fontFamily: "var(--font-mono)", fontSize: "8.5px", letterSpacing: "0.12em", color: healthTone }}
              >
                {healthTag}
              </span>
            </span>
          </button>
          )}

          {/* Interface scale */}
          <div ref={scaleRef} className="relative">
            <button
              onClick={() => setScaleOpen((o) => !o)}
              title="Interface scale"
              aria-haspopup="menu"
              aria-expanded={scaleOpen}
              className="flex items-center gap-1.5 h-7 px-2 rounded-md border border-[var(--ui-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                  d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 600 }}>
                {Math.round(uiScale * 100)}%
              </span>
            </button>
            {scaleOpen && (
              <div
                className="chrome-menu absolute right-0 top-9 z-50 w-[122px] flex flex-col gap-0.5"
                style={{ transformOrigin: "top right", ...popMotion }}
                role="menu"
                aria-label="Interface scale"
              >
                <span
                  aria-hidden="true"
                  className="px-1.5 pt-1 pb-0.5 text-[var(--color-text-muted)] uppercase"
                  style={{ fontFamily: "var(--font-mono)", fontSize: "8.5px", letterSpacing: "0.12em" }}
                >
                  Interface scale
                </span>
                {UI_SCALE_STEPS.map((step) => {
                  const active = Math.abs(step - uiScale) < 0.001;
                  return (
                    <button
                      key={step}
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => {
                        setUiScale(step);
                        setScaleOpen(false);
                      }}
                      className="flex items-center justify-between h-7 px-2 rounded-md hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
                      style={{
                        background: active ? "var(--color-accent-soft)" : "transparent",
                        color: active ? "var(--color-accent)" : "var(--color-text)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        fontWeight: 600,
                      }}
                    >
                      {Math.round(step * 100)}%
                      {active && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M5 12l4 4L19 7"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button onClick={toggle} title={isDark ? "Switch to light mode" : "Switch to dark mode"} className={iconBtn}>
            {isDark ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M20 14.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 14.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </button>

          {/* Export — one-click formats, with Reports… for the full dialog */}
          <div ref={exportRef} className="relative">
            <button
              onClick={() => setExportOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              className="ui-btn ui-btn-primary h-7 !px-3"
              style={{ fontSize: "11.5px" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 16V4M8 8l4-4 4 4M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Export
            </button>
            {exportOpen && (
              <div
                className="chrome-menu absolute right-0 top-9 z-50 w-[226px]"
                style={{ transformOrigin: "top right", ...popMotion }}
                role="menu"
                aria-label="Export document"
              >
                <span
                  aria-hidden="true"
                  className="block px-2 pt-1.5 pb-1.5 text-[var(--color-text-muted)] uppercase"
                  style={{ fontFamily: "var(--font-mono)", fontSize: "8.5px", letterSpacing: "0.12em" }}
                >
                  Export document
                </span>
                {EXPORT_FORMATS.map((f) => (
                  <button
                    key={f.key}
                    role="menuitem"
                    onClick={() => runExport(f.key)}
                    className="flex items-center gap-2.5 w-full h-9 px-2 rounded-lg text-left hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
                  >
                    <span className="flex items-center justify-center w-[26px] h-[26px] rounded-[7px] bg-[var(--color-bg)] border border-[var(--ui-border)] text-[var(--color-accent)] shrink-0">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                        <path d={f.icon} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="text-[11.5px] font-semibold text-[var(--color-text-heading)]">{f.label}</span>
                      <span className="text-[9px] text-[var(--color-text-muted)]">{f.meta}</span>
                    </span>
                  </button>
                ))}
                <button
                  role="menuitem"
                  onClick={() => {
                    setExportOpen(false);
                    fire("easyschematic:open-reports");
                  }}
                  className="flex items-center gap-2.5 w-full h-9 px-2 mt-1 pt-1 border-t border-[var(--ui-border)] rounded-lg text-left hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
                >
                  <span className="flex items-center justify-center w-[26px] h-[26px] rounded-[7px] bg-[var(--color-bg)] border border-[var(--ui-border)] text-[var(--color-accent)] shrink-0">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M4 5h16M4 12h16M4 19h10"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="flex flex-col min-w-0 flex-1">
                    <span className="text-[11.5px] font-semibold text-[var(--color-text-heading)]">Reports…</span>
                    <span className="text-[9px] text-[var(--color-text-muted)]">Power, thermal, network &amp; schedules</span>
                  </span>
                </button>
              </div>
            )}
          </div>

          <UserMenuButton />
        </div>
      </header>

      {/* ── Phone bar (<768px, tier C / board 1a): logo · doc name + saved dot ·
             ⌘K search · ⋯ overflow (theme, export, log in, help). 48px tall. ── */}
      <header className="flex md:hidden items-center h-12 px-3 gap-2 bg-[var(--color-surface)] border-b border-[var(--ui-border)]">
        <img src="/favicon.svg" className="w-5 h-5 shrink-0" alt="" />
        <span className="text-sm font-semibold text-[var(--color-text-heading)] min-w-0 flex-1 truncate">{schematicName}</span>
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] shrink-0" title="Saved" aria-label="Saved" />
        <button
          onClick={() => fire("easyschematic:open-command-palette")}
          aria-label="Search or run a command"
          className="w-9 h-9 flex items-center justify-center rounded-md text-[var(--color-text-muted)] active:bg-[var(--color-surface-hover)]"
          style={{ touchAction: "manipulation" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
            <path d="M21 21l-4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <div ref={mobileMenuRef} className="relative">
          <button
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={mobileMenuOpen}
            aria-label="More"
            className="w-9 h-9 flex items-center justify-center rounded-md text-[var(--color-text-muted)] active:bg-[var(--color-surface-hover)]"
            style={{ touchAction: "manipulation" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
            </svg>
          </button>
          {mobileMenuOpen && (
            <div
              className="chrome-menu absolute right-0 top-11 z-50 w-[214px] flex flex-col gap-0.5"
              style={{ transformOrigin: "top right", ...popMotion }}
              role="menu"
              aria-label="More"
            >
              <button
                role="menuitem"
                onClick={() => { setMobileMenuOpen(false); fire("easyschematic:open-menu"); }}
                className="flex items-center gap-2.5 w-full h-11 px-2.5 rounded-lg text-left text-[13px] text-[var(--color-text)] active:bg-[var(--color-surface-hover)]"
                style={{ touchAction: "manipulation" }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
                Menu — File, Edit, View…
              </button>
              <div className="my-0.5 h-px bg-[var(--ui-border)]" />
              <button
                role="menuitem"
                onClick={() => { toggle(); }}
                className="flex items-center gap-2.5 w-full h-11 px-2.5 rounded-lg text-left text-[13px] text-[var(--color-text)] active:bg-[var(--color-surface-hover)]"
                style={{ touchAction: "manipulation" }}
              >
                {isDark ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 14.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                )}
                {isDark ? "Light mode" : "Dark mode"}
              </button>
              <button
                role="menuitem"
                onClick={() => { setMobileMenuOpen(false); runExport("pdf"); }}
                className="flex items-center gap-2.5 w-full h-11 px-2.5 rounded-lg text-left text-[13px] text-[var(--color-text)] active:bg-[var(--color-surface-hover)]"
                style={{ touchAction: "manipulation" }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 16V4M8 8l4-4 4 4M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Export PDF
              </button>
              <button
                role="menuitem"
                onClick={() => { setMobileMenuOpen(false); fire("easyschematic:open-reports"); }}
                className="flex items-center gap-2.5 w-full h-11 px-2.5 rounded-lg text-left text-[13px] text-[var(--color-text)] active:bg-[var(--color-surface-hover)]"
                style={{ touchAction: "manipulation" }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 5h16M4 12h16M4 19h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Reports &amp; exports…
              </button>
              <button
                role="menuitem"
                onClick={() => { setMobileMenuOpen(false); window.open("https://docs.easyschematic.live", "_blank", "noopener,noreferrer"); }}
                className="flex items-center gap-2.5 w-full h-11 px-2.5 rounded-lg text-left text-[13px] text-[var(--color-text)] active:bg-[var(--color-surface-hover)]"
                style={{ touchAction: "manipulation" }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7M12 16.5v.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                Help &amp; docs
              </button>
              <div className="my-0.5 h-px bg-[var(--ui-border)]" />
              <div className="px-1 py-0.5">
                <UserMenuButton />
              </div>
            </div>
          )}
        </div>
      </header>
    </div>
  );
}

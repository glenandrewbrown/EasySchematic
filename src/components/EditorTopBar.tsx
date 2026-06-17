import { useMemo, useState } from "react";
import { useSchematicStore } from "../store";
import { validateSchematic, countIssues } from "../validation";
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

type Persona = "schematic" | "plan" | "schedule" | "rack";

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

  const issues = useMemo(() => countIssues(validateSchematic(nodes, edges)), [nodes, edges]);

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
        <div className="flex items-center gap-2.5 min-w-0">
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
            className="ml-1 flex items-center gap-2 h-7 px-2.5 rounded-md bg-[var(--color-bg)] border border-[var(--ui-border)] text-[var(--color-text-muted)] hover:border-[var(--ui-border-strong)] transition-colors cursor-pointer min-w-[150px] lg:min-w-[190px]"
            style={{ fontSize: "11.5px" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
              <path d="M21 21l-4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span>Search or run a command</span>
            <span
              className="ml-auto px-1.5 py-px rounded border border-[var(--ui-border)]"
              style={{ fontFamily: "var(--font-mono)", fontSize: "9.5px" }}
            >
              ⌘K
            </span>
          </button>
        </div>

        {/* Center: persona switcher */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-0.5 p-[3px] rounded-lg bg-[var(--color-bg)] border border-[var(--ui-border)]">
          {PERSONAS.map((p) => {
            const active = persona === p.key;
            return (
              <button
                key={p.key}
                onClick={() => goPersona(p.key)}
                className={`relative flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer ${
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
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right cluster */}
        <div className="ml-auto flex items-center gap-2">
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

          <button
            onClick={() => fire("easyschematic:show-validate")}
            title="Validation issues"
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-[var(--ui-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
            style={{ fontSize: "11.5px" }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background:
                  issues.errors > 0
                    ? "var(--color-error)"
                    : issues.total > 0
                      ? "var(--color-warning)"
                      : "var(--color-success)",
              }}
            />
            <span style={{ fontFamily: "var(--font-mono)" }}>{issues.total}</span>
            <span>issues</span>
          </button>

          <button
            onClick={() => fire("easyschematic:open-reports")}
            className="flex items-center gap-1.5 h-7 px-3 rounded-md text-white font-medium transition-colors cursor-pointer"
            style={{ background: "var(--color-accent)", fontSize: "11.5px" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M12 16V4M8 8l4-4 4 4M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Export
          </button>

          <UserMenuButton />
        </div>
      </header>

      {/* ── Mobile minimal bar (desktop-first app; full menus live on desktop) ── */}
      <header className="flex md:hidden items-center h-12 px-3 gap-2 bg-[var(--color-surface)] border-b border-[var(--ui-border)]">
        <img src="/favicon.svg" className="w-5 h-5" alt="" />
        <span className="text-sm font-semibold text-[var(--color-text-heading)] flex-1 truncate">{schematicName}</span>
        <button
          onClick={() => fire("easyschematic:open-command-palette")}
          aria-label="Search or run a command"
          className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
            <path d="M21 21l-4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </header>
    </div>
  );
}

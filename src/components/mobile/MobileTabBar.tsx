import { useMemo } from "react";
import { useSchematicStore } from "../../store";

/**
 * Phone workspace navigation (round-3 §R2 tier C / board 1a). The desktop persona
 * pill relocates to a thumb-reach bottom tab bar: four icon+label tabs
 * (Schematic / Plan / Schedule / Rack). Active tab = accent glyph over a
 * --color-accent-soft pill. The container pads its bottom with the safe-area inset
 * so it clears the home indicator on notched phones.
 *
 * Switching mirrors EditorTopBar.goPersona exactly, so nothing is feature-gated —
 * every workspace stays reachable at phone width.
 */

type Persona = "schematic" | "plan" | "schedule" | "rack";

interface TabDef {
  key: Persona;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  {
    key: "schematic",
    label: "Schematic",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="7" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
        <rect x="14" y="15" width="7" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M6.5 9v3a2 2 0 0 0 2 2h9" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    key: "plan",
    label: "Plan",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3 9h6V3M21 14h-7v7" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    key: "schedule",
    label: "Schedule",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3 9h18M9 9v11M3 14h18" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    key: "rack",
    label: "Rack",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="3" width="14" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 7h8M8 11h8M8 15h8" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
];

export default function MobileTabBar() {
  const canvasViewMode = useSchematicStore((s) => s.canvasViewMode);
  const setCanvasViewMode = useSchematicStore((s) => s.setCanvasViewMode);
  const activePage = useSchematicStore((s) => s.activePage);
  const pages = useSchematicStore((s) => s.pages);
  const setActivePage = useSchematicStore((s) => s.setActivePage);
  const addRackPage = useSchematicStore((s) => s.addRackPage);

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

  const goPersona = (p: Persona) => {
    if (p === "rack") {
      const rack = pages.find((pg) => pg.type?.startsWith("rack"));
      setActivePage(rack ? rack.id : addRackPage("Rack Page 1"));
      return;
    }
    if (!isSchematicPage) setActivePage("schematic");
    setCanvasViewMode(p === "plan" ? "layout" : p === "schedule" ? "schedule" : "schematic");
  };

  return (
    <nav
      data-print-hide
      aria-label="Workspace"
      className="shrink-0 z-40 flex items-stretch justify-around gap-1 px-1.5 pt-1.5 bg-[var(--color-surface)] border-t border-[var(--ui-border)]"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6px)" }}
    >
      {TABS.map((t) => {
        const active = persona === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => goPersona(t.key)}
            aria-current={active ? "page" : undefined}
            className="relative flex flex-1 flex-col items-center justify-center gap-1 min-h-[52px] rounded-[10px] transition-colors"
            style={{
              touchAction: "manipulation",
              background: active ? "var(--color-accent-soft)" : "transparent",
              color: active ? "var(--color-accent)" : "var(--color-text-muted)",
            }}
          >
            {t.icon}
            <span className="text-[10px] font-semibold leading-none">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

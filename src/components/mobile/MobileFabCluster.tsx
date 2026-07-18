import { useState } from "react";
import {
  MousePointer2,
  Box,
  Square,
  Cable,
  StickyNote,
  Armchair,
  SquareDashed,
  Hand,
  Plus,
  Ruler,
  X,
  type LucideIcon,
} from "lucide-react";
import { TOOL_DEFS, type ToolId } from "../../toolMode";
import { useSchematicStore } from "../../store";

/**
 * Phone tool switcher (round-3 §R2 tier C / board 1a): a floating FAB cluster at
 * bottom-left. The 52px accent primary FAB opens quick-add; the tool button above
 * it shows the current tool and, on tap, expands the full tool stack upward. Tapping
 * a tool selects it and collapses the stack.
 *
 * Expansion is TAP-to-toggle (not long-press) — the simpler and more reliable touch
 * affordance, and it keeps the whole stack reachable without a hidden gesture. Tools
 * come straight from TOOL_DEFS (layout-only tools appear only in the Plan view), so
 * nothing is lost versus the desktop rail.
 */

const ICON: Record<ToolId, LucideIcon> = {
  select: MousePointer2,
  device: Box,
  room: Square,
  connect: Cable,
  note: StickyNote,
  measure: Ruler,
  object: Armchair,
  zone: SquareDashed,
  pan: Hand,
};

interface MobileFabClusterProps {
  /** Open the quick/bulk-add spotlight (wired by App to viewport centre). */
  onQuickAdd: () => void;
}

export default function MobileFabCluster({ onQuickAdd }: MobileFabClusterProps) {
  const activeTool = useSchematicStore((s) => s.activeTool);
  const setActiveTool = useSchematicStore((s) => s.setActiveTool);
  const canvasViewMode = useSchematicStore((s) => s.canvasViewMode);
  const [expanded, setExpanded] = useState(false);

  const tools = TOOL_DEFS.filter((t) => !t.layoutOnly || canvasViewMode === "layout");
  const CurrentIcon = ICON[activeTool];

  const pickTool = (id: ToolId) => {
    setActiveTool(id);
    setExpanded(false);
  };

  return (
    <div
      data-print-hide
      className="pointer-events-auto absolute left-3 z-30 flex flex-col items-center gap-2 select-none"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
    >
      {/* Expanded tool stack (opens upward, above the current-tool button) */}
      {expanded && (
        <div
          className="flex flex-col items-stretch gap-1 p-1 rounded-[14px] bg-[var(--color-surface)] border border-[var(--ui-border)]"
          style={{ boxShadow: "var(--ui-shadow-toolbar)" }}
          role="menu"
          aria-label="Tools"
        >
          {tools.map((tool) => {
            const Icon = ICON[tool.id];
            const active = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                aria-label={tool.label}
                onClick={() => pickTool(tool.id)}
                className="flex items-center gap-2 h-11 pl-2.5 pr-3 rounded-[10px] transition-colors"
                style={{
                  touchAction: "manipulation",
                  background: active ? "var(--color-accent-soft)" : "transparent",
                  color: active ? "var(--color-accent)" : "var(--color-text)",
                }}
              >
                <Icon className="w-5 h-5" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                <span className="text-[12px] font-semibold">{tool.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Current-tool button — tap to expand/collapse the stack */}
      <button
        type="button"
        aria-label={expanded ? "Close tools" : `Tools — current: ${activeTool}`}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="w-12 h-12 flex items-center justify-center rounded-full bg-[var(--color-surface)] border border-[var(--ui-border)] text-[var(--color-text)] transition-transform active:scale-95"
        style={{ boxShadow: "var(--ui-shadow-toolbar)", touchAction: "manipulation" }}
      >
        {expanded ? <X className="w-5 h-5" strokeWidth={2} aria-hidden /> : <CurrentIcon className="w-5 h-5" strokeWidth={2} aria-hidden />}
      </button>

      {/* Primary Add FAB (52px accent) — quick/bulk add spotlight */}
      <button
        type="button"
        aria-label="Quick add device"
        onClick={onQuickAdd}
        className="w-[52px] h-[52px] flex items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-on-accent)] transition-transform active:scale-95"
        style={{
          boxShadow: "0 8px 22px -6px color-mix(in srgb, var(--color-accent) 60%, transparent)",
          touchAction: "manipulation",
        }}
      >
        <Plus className="w-7 h-7" strokeWidth={2.4} aria-hidden />
      </button>
    </div>
  );
}

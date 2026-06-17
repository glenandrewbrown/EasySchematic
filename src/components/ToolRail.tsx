import { Fragment } from "react";
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
  type LucideIcon,
} from "lucide-react";
import { TOOL_DEFS, type ToolId } from "../toolMode";
import { useSchematicStore } from "../store";

/**
 * Slim left vertical tool rail (Figma / OmniGraffle style) — the primary canvas
 * tool switcher. Renders one labelled button per entry in the shared
 * {@link TOOL_DEFS} model, highlights the active tool, and switches tools on click.
 *
 * Each button shows a real lucide icon plus a small text label (so the rail is never
 * cryptic), a strong active state (accent fill + left indicator bar + press feedback),
 * and an instant hover tooltip carrying the tool's hotkey. A pinned "Add" button at
 * the top opens the quick/bulk-add spotlight so the fastest add workflow is one
 * obvious click rather than a hidden double-click. State comes from the store
 * (`activeTool` / `setActiveTool`); the rail owns no local state.
 */

/** One lucide icon component per tool id, drawn at 18px in the rail. */
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

/** Navigation tools (move/pan the canvas) — grouped above the creation tools by a divider. */
const NAV_TOOLS = new Set<ToolId>(["select", "pan"]);

interface ToolRailProps {
  /** Open the quick/bulk-add spotlight (wired by App to viewport centre). */
  onQuickAdd?: () => void;
  /** Render as a floating, icon-only rounded pill (design §3) rather than a docked rail. */
  floating?: boolean;
}

export default function ToolRail({ onQuickAdd, floating = false }: ToolRailProps) {
  const activeTool = useSchematicStore((s) => s.activeTool);
  const setActiveTool = useSchematicStore((s) => s.setActiveTool);
  const canvasViewMode = useSchematicStore((s) => s.canvasViewMode);
  // Layout-only tools (Object/Zone) appear only in the to-scale Layout view.
  const tools = TOOL_DEFS.filter((t) => !t.layoutOnly || canvasViewMode === "layout");
  // Index of the first creation tool — used to draw one divider between the
  // navigation group (Select, Pan) and the creation group. -1 when no creation
  // tools are present, so no divider is rendered.
  const firstCreationIndex = tools.findIndex((t) => !NAV_TOOLS.has(t.id));

  return (
    <div
      className={
        floating
          ? "flex flex-col items-stretch gap-0.5 p-1 rounded-[11px] bg-[var(--color-surface)] border border-[var(--ui-border)] select-none"
          : "flex flex-col items-stretch gap-0.5 w-16 h-full py-2 px-1.5 bg-[var(--color-surface-raised)] border-r border-[var(--ui-border)] shrink-0 select-none"
      }
      style={floating ? { boxShadow: "var(--ui-shadow-toolbar)" } : undefined}
      data-print-hide
      role="toolbar"
      aria-label="Tools"
    >
      {onQuickAdd && (
        <>
          <button
            type="button"
            onClick={onQuickAdd}
            title="Quick add — devices, bulk, paste a list (double-click canvas)"
            className={`group relative flex flex-col items-center justify-center gap-0.5 rounded-lg cursor-pointer
              bg-[var(--color-accent)] text-white shadow-sm
              hover:brightness-110 active:scale-[0.94] transition-[transform,filter] duration-100 ${
              floating ? "w-9 h-9" : "h-12"
            }`}
          >
            <Plus className="w-[18px] h-[18px]" strokeWidth={2.25} aria-hidden />
            {!floating && (
              <span
                className="text-[9px] font-semibold leading-none uppercase"
                style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.12em" }}
              >
                Add
              </span>
            )}
            <Tooltip>Quick add · double-click canvas</Tooltip>
          </button>
          <div className="h-px my-1 mx-1 bg-[var(--ui-border)]" />
        </>
      )}

      {tools.map((tool, i) => {
        const isActive = activeTool === tool.id;
        const IconCmp = ICON[tool.id];
        return (
          <Fragment key={tool.id}>
            {/* Divider between the navigation group and the creation group. */}
            {i === firstCreationIndex && firstCreationIndex > 0 && (
              <div className="h-px my-1 mx-1 bg-[var(--ui-border)]" />
            )}
          <button
            type="button"
            onClick={() => setActiveTool(tool.id)}
            aria-pressed={isActive}
            aria-label={tool.label}
            className={`group relative flex flex-col items-center justify-center gap-0.5 rounded-lg cursor-pointer
              active:scale-[0.94] transition-[transform,background-color,color] duration-100 ${
              floating ? "w-9 h-9" : "h-12"
            } ${
              isActive
                ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-semibold"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
            }`}
          >
            {/* Left indicator bar — only on the active tool (docked rail only). */}
            {!floating && (
              <span
                className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[var(--color-accent)] transition-opacity ${
                  isActive ? "opacity-100" : "opacity-0"
                }`}
                aria-hidden
              />
            )}
            <IconCmp className="w-[18px] h-[18px]" strokeWidth={isActive ? 2.25 : 1.75} aria-hidden />
            {!floating && (
              <span
                className={`text-[9px] leading-none uppercase ${isActive ? "font-semibold" : "font-medium"}`}
                style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.12em" }}
              >
                {tool.label}
              </span>
            )}
            <Tooltip>
              {tool.title}
              {tool.hotkey && <kbd className="ml-1.5 font-mono opacity-70">{tool.hotkey}</kbd>}
            </Tooltip>
          </button>
          </Fragment>
        );
      })}
    </div>
  );
}

/** Instant (no-delay) hover tooltip anchored to the right of a rail button. */
function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50
        whitespace-nowrap rounded-md px-2 py-1 text-[11px] leading-none
        bg-[var(--color-text-heading)] text-[var(--color-surface-raised)] shadow-[var(--ui-shadow-menu)]
        opacity-0 translate-x-[-4px] group-hover:opacity-100 group-hover:translate-x-0
        transition-[opacity,transform] duration-100"
    >
      {children}
    </span>
  );
}

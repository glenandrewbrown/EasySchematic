import type { ReactNode } from "react";
import { TOOL_DEFS, type ToolId } from "../toolMode";
import { useSchematicStore } from "../store";

/**
 * Slim left vertical tool rail (Figma / OmniGraffle style) — the primary canvas
 * tool switcher. Renders one button per entry in the shared {@link TOOL_DEFS}
 * model, highlights the active tool, and switches tools on click.
 *
 * Visual language mirrors the top {@link Toolbar} exactly: an `ICON` map of inline
 * `viewBox="0 0 16 16"` stroke glyphs rendered through a shared `Icon` wrapper, and
 * the same active (`bg-[var(--color-accent)] text-white`) vs muted
 * (`hover:bg-[var(--color-surface-hover)]`) button styling. Custom SVG only — no
 * icon library. State comes from the store (`activeTool` / `setActiveTool`); the
 * rail owns no local state.
 */

/** One inline SVG glyph per tool id, drawn in Toolbar's stroke style at 15px. */
const ICON: Record<ToolId, ReactNode> = {
  // Arrow / cursor pointer.
  select: <path d="M3.5 2.6 12 7.4 8 8.4l2 4-1.6.7-2-4-2.9 2.6z" />,
  // Rectangular device / chip box with a couple of port ticks.
  device: (
    <>
      <rect x="3" y="4" width="10" height="8" rx="1" />
      <path d="M3 7h-1M3 9.5h-1M14 7h-1M14 9.5h-1" />
    </>
  ),
  // Floor-plan rectangle (room outline) with a doorway gap.
  room: (
    <>
      <path d="M2.6 3.4h10.8v9.2H2.6z" />
      <path d="M2.6 8.6V7" />
    </>
  ),
  // Two small nodes joined by a line (link / plug).
  connect: (
    <>
      <circle cx="4" cy="12" r="1.6" />
      <circle cx="12" cy="4" r="1.6" />
      <path d="M5.2 10.8 10.8 5.2" />
    </>
  ),
  // Sticky note square with a folded corner and text lines.
  note: (
    <>
      <path d="M3 2.6h7L13 5.6v7.8H3z" />
      <path d="M10 2.6v3h3" />
      <path d="M5 8h4.5M5 10.4h3" />
    </>
  ),
  // Hand (pan).
  pan: <path d="M5 8V4.6a1 1 0 0 1 2 0V7m0-.4a1 1 0 0 1 2 0V7m0-.2a1 1 0 0 1 2 0V8m0-.2a1 1 0 0 1 1.6 0v3.2a3 3 0 0 1-3 3H8.5a3 3 0 0 1-2.4-1.2L3.6 9.5a1 1 0 0 1 1.4-1.4z" />,
  // Furniture / room object (top-down seat).
  object: (
    <>
      <rect x="3.5" y="5" width="9" height="7" rx="1" />
      <path d="M3.5 8.6h9" />
    </>
  ),
  // Colour zone (dashed region).
  zone: <rect x="2.8" y="2.8" width="10.4" height="10.4" rx="1.5" strokeDasharray="2 1.8" />,
};

/** Shared svg wrapper — identical stroke conventions to Toolbar's `Icon`. */
function Icon({ id }: { id: ToolId }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="w-[15px] h-[15px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICON[id]}
    </svg>
  );
}

export default function ToolRail() {
  const activeTool = useSchematicStore((s) => s.activeTool);
  const setActiveTool = useSchematicStore((s) => s.setActiveTool);
  const canvasViewMode = useSchematicStore((s) => s.canvasViewMode);
  // Layout-only tools (Object/Zone) appear only in the to-scale Layout view.
  const tools = TOOL_DEFS.filter((t) => !t.layoutOnly || canvasViewMode === "layout");

  return (
    <div
      className="flex flex-col items-center gap-1 w-12 h-full py-2 bg-[var(--color-surface-raised)] border-r border-[var(--ui-border)] shrink-0 select-none"
      data-print-hide
      role="toolbar"
      aria-label="Tools"
    >
      {tools.map((tool) => {
        const isActive = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => setActiveTool(tool.id)}
            aria-pressed={isActive}
            aria-label={tool.label}
            title={tool.title}
            className={`flex items-center justify-center w-9 h-9 rounded-md transition-colors duration-150 cursor-pointer ${
              isActive
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
            }`}
          >
            <Icon id={tool.id} />
          </button>
        );
      })}
    </div>
  );
}

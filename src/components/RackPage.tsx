import { useSchematicStore } from "../store";
import RackRenderer from "./RackRenderer";
import RackSidebar from "./RackSidebar";

export default function RackPage() {
  const activePage = useSchematicStore((s) => s.activePage);
  const pages = useSchematicStore((s) => s.pages);

  const page = pages.find((p) => p.id === activePage);
  if (!page || page.type !== "rack-elevation") return null;

  return (
    <div className="relative flex-1 overflow-hidden">
      {/* Rack renderer fills the open area to the right of the floating Insert card
          (design §2) — inset on desktop so the elevation isn't occluded by the card. */}
      <div className="absolute inset-0 md:left-[296px]">
        <RackRenderer page={page} />
      </div>
      {/* Floating overlay — pointer-events pass through to the canvas except on the panel. */}
      <div className="absolute inset-0 pointer-events-none z-20 hidden md:block" data-print-hide data-mobile-hide>
        <div
          className="absolute left-3 top-3 bottom-3 w-[266px] pointer-events-auto rounded-[11px] overflow-hidden border border-[var(--ui-border)]"
          style={{ boxShadow: "var(--ui-shadow-menu)" }}
        >
          <RackSidebar page={page} />
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useSchematicStore } from "../store";
import { validateSchematic, countIssues } from "../validation";
import Inspector from "./Inspector";
import LayersPanel from "./LayersPanel";
import ValidationPanel from "./ValidationPanel";
import ViewOptionsPanel from "./ViewOptionsPanel";
import ShowInfoPanel from "./ShowInfoPanel";
import SignalColorPanel from "./SignalColorPanel";

/**
 * Single consolidated right rail (replaces the old 5-panels-side-by-side row).
 * One panel shows at a time, picked by a tab: Inspect (contextual properties),
 * Layers (tree), Validate (AV design-rule issues), View (display/title-block/colour
 * settings — relocated here from their own toggle strips so the right edge stays clean).
 */

type Tab = "inspect" | "layers" | "validate" | "view";
const STORAGE_KEY = "easyschematic-rightrail-tab";

function TabButton({
  id,
  label,
  active,
  onSelect,
  badge,
  badgeTone,
}: {
  id: Tab;
  label: string;
  active: Tab;
  onSelect: (t: Tab) => void;
  badge?: number;
  badgeTone?: "error" | "warning";
}) {
  const selected = active === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => onSelect(id)}
      className={`relative flex-1 px-1.5 py-2 text-[11px] font-medium transition-colors cursor-pointer ${
        selected
          ? "text-[var(--color-accent)] border-b-2 border-[var(--color-accent)] -mb-px"
          : "text-[var(--color-text-muted)] border-b-2 border-transparent hover:text-[var(--color-text)]"
      }`}
    >
      {label}
      {badge != null && badge > 0 && (
        <span
          className={`ml-1 inline-flex items-center justify-center min-w-[15px] h-[15px] px-1 rounded-full text-[9px] font-bold text-white align-middle ${
            badgeTone === "error" ? "bg-red-500" : "bg-amber-500"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

export default function RightRail() {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const issues = useMemo(() => validateSchematic(nodes, edges), [nodes, edges]);
  const counts = countIssues(issues);

  const [tab, setTabState] = useState<Tab>(
    () => ((localStorage.getItem(STORAGE_KEY) as Tab | null) ?? "inspect"),
  );
  const setTab = (t: Tab) => {
    setTabState(t);
    localStorage.setItem(STORAGE_KEY, t);
  };

  // The top-bar validation badge dispatches this to jump straight to the Validate tab.
  useEffect(() => {
    const onShow = () => {
      setTabState("validate");
      localStorage.setItem(STORAGE_KEY, "validate");
    };
    window.addEventListener("easyschematic:show-validate", onShow);
    return () => window.removeEventListener("easyschematic:show-validate", onShow);
  }, []);

  return (
    <div className="w-72 bg-[var(--color-surface)] border-l border-[var(--color-border)] flex flex-col h-full overflow-hidden">
      <div className="flex items-stretch border-b border-[var(--ui-border)] shrink-0" role="tablist" aria-label="Right panel">
        <TabButton id="inspect" label="Inspect" active={tab} onSelect={setTab} />
        <TabButton id="layers" label="Layers" active={tab} onSelect={setTab} />
        <TabButton
          id="validate"
          label="Validate"
          active={tab}
          onSelect={setTab}
          badge={counts.total}
          badgeTone={counts.errors > 0 ? "error" : "warning"}
        />
        <TabButton id="view" label="View" active={tab} onSelect={setTab} />
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === "inspect" && <Inspector embedded />}
        {tab === "layers" && <LayersPanel embedded />}
        {tab === "validate" && <ValidationPanel issues={issues} />}
        {tab === "view" && (
          <div className="h-full overflow-y-auto">
            <div className="h-[320px] border-b border-[var(--ui-border)]">
              <ViewOptionsPanel mobile onClose={() => setTab("inspect")} />
            </div>
            <div className="h-[280px] border-b border-[var(--ui-border)]">
              <ShowInfoPanel mobile onClose={() => setTab("inspect")} />
            </div>
            <div className="h-[320px]">
              <SignalColorPanel mobile onClose={() => setTab("inspect")} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

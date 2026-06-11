import { useState } from "react";
import { useSchematicStore } from "../store";
import { DEFAULT_LAYER_ID } from "../types";

function EyeIcon({ off }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
      {off && <line x1="2" y1="14" x2="14" y2="2" />}
    </svg>
  );
}

function PadlockIcon({ open }: { open?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d={open ? "M5 7V5a3 3 0 0 1 5.8-1" : "M5 7V5a3 3 0 0 1 6 0v2"} />
    </svg>
  );
}

/** Photoshop-style layers: show/hide and lock content groups, move selection between layers. */
export default function LayersPanel() {
  const layers = useSchematicStore((s) => s.layers);
  const addLayer = useSchematicStore((s) => s.addLayer);
  const renameLayer = useSchematicStore((s) => s.renameLayer);
  const removeLayer = useSchematicStore((s) => s.removeLayer);
  const toggleLayerVisible = useSchematicStore((s) => s.toggleLayerVisible);
  const toggleLayerLocked = useSchematicStore((s) => s.toggleLayerLocked);
  const assignSelectionToLayer = useSchematicStore((s) => s.assignSelectionToLayer);
  const hasSelection = useSchematicStore(
    (s) => s.nodes.some((n) => n.selected) || s.edges.some((e) => e.selected),
  );
  const countsDigest = useSchematicStore((s) => {
    const counts = new Map<string, number>();
    const bump = (lid: string | undefined) => {
      const key = lid ?? DEFAULT_LAYER_ID;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    };
    for (const n of s.nodes) {
      if (n.type === "waypoint" || n.type === "stub-label") continue;
      bump((n.data as { layerId?: string }).layerId);
    }
    for (const e of s.edges) bump(e.data?.layerId);
    return [...counts.entries()].map(([k, v]) => `${k}:${v}`).join("|");
  });
  const counts = new Map(
    countsDigest
      ? countsDigest.split("|").map((kv) => {
          const i = kv.lastIndexOf(":");
          return [kv.slice(0, i), Number(kv.slice(i + 1))] as [string, number];
        })
      : [],
  );

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("easyschematic-layers-collapsed") === "1",
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const setCollapsedPersist = (v: boolean) => {
    setCollapsed(v);
    localStorage.setItem("easyschematic-layers-collapsed", v ? "1" : "0");
  };

  if (collapsed) {
    return (
      <div className="w-8 bg-[var(--color-surface)] border-l border-[var(--color-border)] flex flex-col items-center h-full" data-print-hide>
        <button
          onClick={() => setCollapsedPersist(false)}
          className="py-3 cursor-pointer hover:bg-[var(--color-surface-hover)] w-full flex justify-center transition-colors"
          title="Show layers"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M10 3l-5 5 5 5" />
          </svg>
        </button>
        <div
          className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mt-2 select-none"
          style={{ writingMode: "vertical-rl" }}
        >
          Layers
        </div>
      </div>
    );
  }

  return (
    <div className="w-52 bg-[var(--color-surface)] border-l border-[var(--color-border)] flex flex-col h-full overflow-hidden" data-print-hide>
      <div className="px-3 py-2 border-b border-[var(--ui-border)] flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[var(--color-text-heading)] uppercase tracking-wider">
          Layers
        </h2>
        <button
          onClick={() => setCollapsedPersist(true)}
          className="cursor-pointer hover:bg-[var(--color-surface-hover)] rounded p-0.5 transition-colors"
          title="Collapse"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M6 3l5 5-5 5" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {layers.map((layer) => (
          <div
            key={layer.id}
            className={`flex items-center gap-1 px-1.5 py-1.5 rounded-md group hover:bg-[var(--color-surface-hover)] ${
              !layer.visible ? "opacity-50" : ""
            }`}
          >
            <button
              onClick={() => toggleLayerVisible(layer.id)}
              className={`cursor-pointer shrink-0 ${layer.visible ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}
              title={layer.visible ? "Hide layer" : "Show layer"}
            >
              <EyeIcon off={!layer.visible} />
            </button>
            <button
              onClick={() => toggleLayerLocked(layer.id)}
              className={`cursor-pointer shrink-0 ${layer.locked ? "text-amber-500" : "text-[var(--color-text-muted)] opacity-40 group-hover:opacity-100"}`}
              title={layer.locked ? "Unlock layer" : "Lock layer"}
            >
              <PadlockIcon open={!layer.locked} />
            </button>
            {editingId === layer.id ? (
              <input
                className="ui-input flex-1 min-w-0 !py-0.5 !px-1.5 text-xs"
                value={editValue}
                autoFocus
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => {
                  if (editValue.trim()) renameLayer(layer.id, editValue.trim());
                  setEditingId(null);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") {
                    if (editValue.trim()) renameLayer(layer.id, editValue.trim());
                    setEditingId(null);
                  }
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
            ) : (
              <span
                className="flex-1 min-w-0 truncate text-xs text-[var(--color-text-heading)] cursor-text select-none"
                onDoubleClick={() => {
                  setEditingId(layer.id);
                  setEditValue(layer.name);
                }}
                title="Double-click to rename"
              >
                {layer.name}
              </span>
            )}
            <span className="text-[10px] tabular-nums text-[var(--color-text-muted)] shrink-0">
              {counts.get(layer.id) ?? 0}
            </span>
            {hasSelection && (
              <button
                onClick={() => assignSelectionToLayer(layer.id)}
                className="cursor-pointer shrink-0 text-[var(--color-accent)] opacity-0 group-hover:opacity-100 transition-opacity"
                title="Move selection to this layer"
              >
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
              </button>
            )}
            {layer.id !== DEFAULT_LAYER_ID && (
              <button
                onClick={() => removeLayer(layer.id)}
                className="cursor-pointer shrink-0 text-red-400/70 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete layer (contents move to Base)"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="p-1.5 border-t border-[var(--ui-border)]">
        <button
          className="ui-btn ui-btn-ghost w-full justify-start text-xs"
          onClick={() => addLayer(`Layer ${layers.length}`)}
        >
          + New Layer
        </button>
        {hasSelection && (
          <p className="text-[10px] text-[var(--color-text-muted)] px-1.5 pb-1">
            Hover a layer and click → to move the selection there.
          </p>
        )}
      </div>
    </div>
  );
}

import { useMemo, useState, type ReactElement } from "react";
import { useSchematicStore } from "../store";
import { DEFAULT_LAYER_ID } from "../types";
import { buildLayerTree, type LayerTreeNode } from "../layerTree";
import LayerColorPicker from "./LayerColorPicker";

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

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

/** All node ids beneath a tree entry (the entry itself when it's a node,
 *  including any room-nested descendants). */
function collectNodeIds(node: LayerTreeNode): string[] {
  if (node.kind === "node") {
    return [node.id, ...(node.roomChildren ?? []).flatMap(collectNodeIds)];
  }
  return node.children.flatMap(collectNodeIds);
}

/** Photoshop-style Layers/Groups tree: show/hide/lock/solo layers, groups, and
 *  individual devices, plus move the selection between layers. */
export default function LayersPanel({ embedded = false }: { embedded?: boolean } = {}) {
  const layers = useSchematicStore((s) => s.layers);
  const nodes = useSchematicStore((s) => s.nodes);
  const addLayer = useSchematicStore((s) => s.addLayer);
  const renameLayer = useSchematicStore((s) => s.renameLayer);
  const removeLayer = useSchematicStore((s) => s.removeLayer);
  const toggleLayerVisible = useSchematicStore((s) => s.toggleLayerVisible);
  const toggleLayerLocked = useSchematicStore((s) => s.toggleLayerLocked);
  const setLayerColor = useSchematicStore((s) => s.setLayerColor);
  const assignSelectionToLayer = useSchematicStore((s) => s.assignSelectionToLayer);
  const hiddenNodeIds = useSchematicStore((s) => s.hiddenNodeIds);
  const lockedNodeIds = useSchematicStore((s) => s.lockedNodeIds);
  const soloLayerId = useSchematicStore((s) => s.soloLayerId);
  const toggleNodeHidden = useSchematicStore((s) => s.toggleNodeHidden);
  const toggleNodeLocked = useSchematicStore((s) => s.toggleNodeLocked);
  const setNodesHidden = useSchematicStore((s) => s.setNodesHidden);
  const setNodesLocked = useSchematicStore((s) => s.setNodesLocked);
  const setSoloLayer = useSchematicStore((s) => s.setSoloLayer);
  const reorderNodeZ = useSchematicStore((s) => s.reorderNodeZ);
  const hasSelection = useSchematicStore(
    (s) => s.nodes.some((n) => n.selected) || s.edges.some((e) => e.selected),
  );

  // Narrow the SchematicNode union down to the minimal shape buildLayerTree reads
  // (its InputNode.data is stricter than the node data union, e.g. StubLabelData).
  const tree = useMemo(
    () =>
      buildLayerTree({
        nodes: nodes.map((n) => {
          const d = n.data as Record<string, unknown>;
          return {
            id: n.id,
            type: n.type,
            parentId: (n as { parentId?: string }).parentId,
            data: {
              layerId: typeof d.layerId === "string" ? d.layerId : undefined,
              groupId: typeof d.groupId === "string" ? d.groupId : undefined,
              label: typeof d.label === "string" ? d.label : undefined,
              widthM: typeof d.widthM === "number" ? d.widthM : undefined,
              depthM: typeof d.depthM === "number" ? d.depthM : undefined,
            },
          };
        }),
        layers,
      }),
    [nodes, layers],
  );
  const hiddenSet = useMemo(() => new Set(hiddenNodeIds), [hiddenNodeIds]);
  const lockedSet = useMemo(() => new Set(lockedNodeIds), [lockedNodeIds]);
  // node id → parentId, for restricting z-order drags to same-parent siblings.
  const parentById = useMemo(
    () => new Map(nodes.map((n) => [n.id, (n as { parentId?: string }).parentId])),
    [nodes],
  );

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("easyschematic-layers-collapsed") === "1",
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // Layer id whose colour picker popover is currently open (null = none).
  const [colorPickerLayerId, setColorPickerLayerId] = useState<string | null>(null);
  // Drag-to-reorder (z-order) state for node rows.
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; place: "before" | "after" } | null>(null);
  // Layer header currently a valid drop target for a device-row drag (reassign layer), or null.
  const [dropLayerId, setDropLayerId] = useState<string | null>(null);

  const setCollapsedPersist = (v: boolean) => {
    setCollapsed(v);
    localStorage.setItem("easyschematic-layers-collapsed", v ? "1" : "0");
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectNodes = (ids: Set<string>) =>
    useSchematicStore.setState((s) => ({
      nodes: s.nodes.map((n) => ({ ...n, selected: ids.has(n.id) })),
      edges: s.edges.map((e) => ({ ...e, selected: false })),
    }));

  const allIn = (ids: string[], set: Set<string>) => ids.length > 0 && ids.every((id) => set.has(id));

  if (!embedded && collapsed) {
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
          className="text-[10px] uppercase text-[var(--color-text-muted)] mt-2 select-none"
          style={{ writingMode: "vertical-rl", fontFamily: "var(--font-mono)", letterSpacing: "0.14em" }}
        >
          Layers
        </div>
      </div>
    );
  }

  // Render a group or node child row (recursive for group members).
  const renderChild = (node: LayerTreeNode, depth: number): ReactElement => {
    const pad = 8 + depth * 12;
    if (node.kind === "group") {
      const memberIds = collectNodeIds(node);
      const gHidden = allIn(memberIds, hiddenSet);
      const gLocked = allIn(memberIds, lockedSet);
      const isOpen = expanded.has(node.id);
      return (
        <div key={node.id}>
          <div
            className={`flex items-center gap-1 pr-1.5 py-1 rounded-md group hover:bg-[var(--color-surface-hover)] ${gHidden ? "opacity-50" : ""}`}
            style={{ paddingLeft: pad }}
          >
            <button onClick={() => toggleExpand(node.id)} className="cursor-pointer shrink-0 text-[var(--color-text-muted)]" title={isOpen ? "Collapse" : "Expand"}>
              <Chevron open={isOpen} />
            </button>
            <button
              onClick={() => setNodesHidden(memberIds, !gHidden)}
              className={`cursor-pointer shrink-0 ${gHidden ? "text-[var(--color-text-muted)]" : "text-[var(--color-text)]"}`}
              title={gHidden ? "Show group" : "Hide group"}
            >
              <EyeIcon off={gHidden} />
            </button>
            <button
              onClick={() => setNodesLocked(memberIds, !gLocked)}
              className={`cursor-pointer shrink-0 ${gLocked ? "text-[var(--color-warning)]" : "text-[var(--color-text-muted)] opacity-40 group-hover:opacity-100"}`}
              title={gLocked ? "Unlock group" : "Lock group"}
            >
              <PadlockIcon open={!gLocked} />
            </button>
            <span
              className="flex-1 min-w-0 truncate text-xs text-[var(--color-text)] cursor-pointer select-none"
              onClick={() => selectNodes(new Set(memberIds))}
              title="Select group members"
            >
              {node.label}
            </span>
          </div>
          {isOpen && node.children.map((c) => renderChild(c, depth + 1))}
        </div>
      );
    }
    // kind === "node" — a room node with children becomes a collapsible branch.
    const roomChildren = node.roomChildren ?? [];
    const isRoomBranch = node.nodeType === "room" && roomChildren.length > 0;
    const isOpen = expanded.has(node.id);
    const nHidden = hiddenSet.has(node.id);
    const nLocked = lockedSet.has(node.id);
    const isDropTarget = dropTarget?.id === node.id;
    return (
      <div key={node.id}>
        <div
          data-node-id={node.id}
          draggable
          onDragStart={(e) => {
            setDragNodeId(node.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            setDragNodeId(null);
            setDropTarget(null);
            setDropLayerId(null);
          }}
          onDragOver={(e) => {
            const valid =
              dragNodeId != null &&
              dragNodeId !== node.id &&
              parentById.get(dragNodeId) === parentById.get(node.id);
            if (!valid) return;
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            const place = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
            if (dropTarget?.id !== node.id || dropTarget.place !== place) {
              setDropTarget({ id: node.id, place });
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (
              dragNodeId &&
              dragNodeId !== node.id &&
              parentById.get(dragNodeId) === parentById.get(node.id)
            ) {
              const rect = e.currentTarget.getBoundingClientRect();
              const place = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
              reorderNodeZ(dragNodeId, node.id, place);
            }
            setDragNodeId(null);
            setDropTarget(null);
          }}
          className={`flex items-center gap-1 pr-1.5 py-1 rounded-md group hover:bg-[var(--color-surface-hover)] cursor-grab ${nHidden ? "opacity-50" : ""} ${dragNodeId === node.id ? "opacity-40" : ""}`}
          style={{
            paddingLeft: isRoomBranch ? pad : pad + 14,
            ...(isDropTarget
              ? {
                  boxShadow:
                    dropTarget?.place === "before"
                      ? "inset 0 2px 0 0 var(--color-accent)"
                      : "inset 0 -2px 0 0 var(--color-accent)",
                }
              : {}),
          }}
        >
          {isRoomBranch && (
            <button
              onClick={() => toggleExpand(node.id)}
              className="cursor-pointer shrink-0 text-[var(--color-text-muted)]"
              title={isOpen ? "Collapse" : "Expand"}
            >
              <Chevron open={isOpen} />
            </button>
          )}
          <button
            onClick={() => toggleNodeHidden(node.id)}
            className={`cursor-pointer shrink-0 ${nHidden ? "text-[var(--color-text-muted)]" : "text-[var(--color-text)]"}`}
            title={nHidden ? "Show" : "Hide"}
          >
            <EyeIcon off={nHidden} />
          </button>
          <button
            onClick={() => toggleNodeLocked(node.id)}
            className={`cursor-pointer shrink-0 ${nLocked ? "text-[var(--color-warning)]" : "text-[var(--color-text-muted)] opacity-40 group-hover:opacity-100"}`}
            title={nLocked ? "Unlock" : "Lock"}
          >
            <PadlockIcon open={!nLocked} />
          </button>
          <span
            className="flex-1 min-w-0 truncate cursor-pointer select-none"
            onClick={() => selectNodes(new Set([node.id]))}
            title={node.nodeType ? `Select ${node.nodeType}` : "Select"}
          >
            <span className="block truncate text-xs text-[var(--color-text-muted)]">
              {node.label}
            </span>
            {node.secondaryText && (
              <span className="block truncate text-[9px] text-[var(--color-text-muted)]">
                {node.secondaryText}
              </span>
            )}
          </span>
        </div>
        {isRoomBranch &&
          isOpen &&
          roomChildren.map((c) => renderChild(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className={`${embedded ? "" : "w-56 bg-[var(--color-surface)] border-l border-[var(--color-border)] "}flex flex-col h-full overflow-hidden`} data-print-hide>
      {!embedded && (
        <div className="px-3 py-2 border-b border-[var(--ui-border)] flex items-center justify-between">
          <h2
            className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase"
            style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.12em" }}
          >
            Layers &amp; Groups
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
      )}

      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {tree.map((layer) => {
          const layerNodeIds = collectNodeIds(layer);
          const isOpen = expanded.has(layer.id);
          const isSolo = soloLayerId === layer.id;
          return (
            <div key={layer.id}>
              <div
                onDragOver={(e) => {
                  // A locked layer is never a valid drop target — no preventDefault,
                  // no indicator, so the browser shows its native "not allowed" cursor.
                  if (dragNodeId == null || layer.locked) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dropLayerId !== layer.id) setDropLayerId(layer.id);
                }}
                onDragLeave={() => setDropLayerId((id) => (id === layer.id ? null : id))}
                onDrop={(e) => {
                  e.preventDefault();
                  const dragged = dragNodeId;
                  setDragNodeId(null);
                  setDropTarget(null);
                  setDropLayerId(null);
                  if (dragged == null || layer.locked) return;
                  // Selection-aware: dragging a row that's part of the current
                  // selection reassigns the whole selection, not just that row.
                  const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id);
                  const idsToMove = selectedIds.includes(dragged) ? selectedIds : [dragged];
                  selectNodes(new Set(idsToMove));
                  assignSelectionToLayer(layer.id);
                }}
                className={`flex items-center gap-1 px-1.5 py-1.5 rounded-md group hover:bg-[var(--color-surface-hover)] ${!layer.visible ? "opacity-50" : ""}`}
                style={
                  dropLayerId === layer.id
                    ? { boxShadow: "inset 0 0 0 2px var(--color-accent)" }
                    : undefined
                }
              >
                <button
                  onClick={() => toggleExpand(layer.id)}
                  className={`cursor-pointer shrink-0 ${layer.children.length === 0 ? "opacity-20 pointer-events-none" : "text-[var(--color-text-muted)]"}`}
                  title={isOpen ? "Collapse" : "Expand"}
                >
                  <Chevron open={isOpen} />
                </button>
                <button
                  onClick={() => toggleLayerVisible(layer.id)}
                  className={`cursor-pointer shrink-0 ${layer.visible ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}
                  title={layer.visible ? "Hide layer" : "Show layer"}
                >
                  <EyeIcon off={!layer.visible} />
                </button>
                <button
                  onClick={() => toggleLayerLocked(layer.id)}
                  className={`cursor-pointer shrink-0 ${layer.locked ? "text-[var(--color-warning)]" : "text-[var(--color-text-muted)] opacity-40 group-hover:opacity-100"}`}
                  title={layer.locked ? "Unlock layer" : "Lock layer"}
                >
                  <PadlockIcon open={!layer.locked} />
                </button>
                <button
                  onClick={() => setSoloLayer(layer.id)}
                  className={`cursor-pointer shrink-0 text-[10px] font-bold w-3.5 text-center ${isSolo ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)] opacity-40 group-hover:opacity-100"}`}
                  title={isSolo ? "Exit solo" : "Solo this layer"}
                >
                  S
                </button>
                <span className="relative shrink-0 flex items-center">
                  <button
                    onClick={() =>
                      setColorPickerLayerId((id) => (id === layer.id ? null : layer.id))
                    }
                    className="cursor-pointer w-2.5 h-2.5 rounded-full border hover:border-[var(--color-text)] transition-colors"
                    style={
                      layer.color
                        ? { background: layer.color, borderColor: layer.color }
                        : { borderColor: "var(--color-text-muted)" }
                    }
                    title={layer.color ? "Change layer colour" : "Set layer colour"}
                    aria-label="Layer colour"
                  />
                  {colorPickerLayerId === layer.id && (
                    <LayerColorPicker
                      value={layer.color}
                      onSelect={(color) => {
                        setLayerColor(layer.id, color);
                        setColorPickerLayerId(null);
                      }}
                      onClear={() => {
                        setLayerColor(layer.id, undefined);
                        setColorPickerLayerId(null);
                      }}
                      onClose={() => setColorPickerLayerId(null)}
                    />
                  )}
                </span>
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
                    className="flex-1 min-w-0 cursor-text select-none"
                    onDoubleClick={() => {
                      setEditingId(layer.id);
                      setEditValue(layer.label);
                    }}
                    title="Double-click to rename"
                  >
                    <span className="block truncate text-xs text-[var(--color-text-heading)]">
                      {layer.label}
                    </span>
                    {layer.secondaryText && (
                      <span className="block truncate text-[9px] text-[var(--color-text-muted)]">
                        {layer.secondaryText}
                      </span>
                    )}
                  </span>
                )}
                <span className="text-[10px] tabular-nums text-[var(--color-text-muted)] shrink-0" style={{ fontFamily: "var(--font-mono)" }}>
                  {layerNodeIds.length}
                </span>
                {dropLayerId === layer.id && (
                  <span
                    className="text-[9px] px-1 py-0.5 rounded border border-[var(--color-accent)] text-[var(--color-accent)] shrink-0"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Move here
                  </span>
                )}
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
                    className="cursor-pointer shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-error)] opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete layer (contents move to Base)"
                  >
                    ✕
                  </button>
                )}
              </div>
              {isOpen && layer.children.map((c) => renderChild(c, 1))}
            </div>
          );
        })}
      </div>

      <div className="p-1.5 border-t border-[var(--ui-border)]">
        <button
          className="ui-btn ui-btn-ghost w-full justify-start text-xs"
          onClick={() => addLayer(`Layer ${layers.length}`)}
        >
          + New Layer
        </button>
        {soloLayerId && (
          <button
            className="ui-btn ui-btn-ghost w-full justify-start text-xs text-[var(--color-accent)]"
            onClick={() => setSoloLayer(null)}
          >
            Exit solo
          </button>
        )}
        {hasSelection && (
          <p className="text-[10px] text-[var(--color-text-muted)] px-1.5 pb-1">
            Hover a layer and click → to move the selection there.
          </p>
        )}
      </div>
    </div>
  );
}

import { useEffect, useCallback } from "react";
import { useSchematicStore } from "../store";
import type { RoomData } from "../types";
import { useContextMenuPosition } from "../hooks/useContextMenuPosition";

export default function RoomContextMenu() {
  const menu = useSchematicStore((s) => s.roomContextMenu);
  const { ref: menuRef, pos: menuPos } = useContextMenuPosition(
    menu?.screenX ?? 0,
    menu?.screenY ?? 0,
  );

  // Close on click anywhere or Escape
  useEffect(() => {
    if (!menu) return;
    const close = () => useSchematicStore.setState({ roomContextMenu: null });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const timer = setTimeout(() => {
      document.addEventListener("click", close);
      document.addEventListener("contextmenu", close);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", close);
      document.removeEventListener("contextmenu", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const editProperties = useCallback(() => {
    if (!menu) return;
    useSchematicStore.getState().setEditingNodeId(menu.nodeId);
    useSchematicStore.setState({ roomContextMenu: null });
  }, [menu]);

  const toggleLock = useCallback(() => {
    if (!menu) return;
    useSchematicStore.getState().toggleRoomLock(menu.nodeId);
    useSchematicStore.setState({ roomContextMenu: null });
  }, [menu]);

  const toggleEquipmentRack = useCallback(() => {
    if (!menu) return;
    useSchematicStore.getState().toggleEquipmentRack(menu.nodeId);
    useSchematicStore.setState({ roomContextMenu: null });
  }, [menu]);

  const deleteRoom = useCallback(() => {
    if (!menu) return;
    useSchematicStore.setState({ roomContextMenu: null });
    useSchematicStore.getState().deleteNode(menu.nodeId);
  }, [menu]);

  const deleteRoomAndContents = useCallback(() => {
    if (!menu) return;
    useSchematicStore.setState({ roomContextMenu: null });
    useSchematicStore.getState().deleteNodeAndChildren(menu.nodeId);
  }, [menu]);

  if (!menu) return null;

  const node = useSchematicStore.getState().nodes.find((n) => n.id === menu.nodeId);
  const roomData = node?.data as RoomData | undefined;
  const isLocked = !!roomData?.locked;
  const isEquipmentRack = !!roomData?.isEquipmentRack;

  return (
    <div
      ref={menuRef}
      className="chrome-menu fixed z-50 min-w-[160px]"
      style={{
        left: menuPos.x,
        top: menuPos.y,
        maxHeight: menuPos.maxHeight,
        overflowY: menuPos.maxHeight ? "auto" : undefined,
        visibility: menuPos.ready ? "visible" : "hidden",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <MenuItem label="Edit Properties..." onClick={editProperties} />
      <MenuItem
        label="Edit Shape"
        onClick={() => {
          if (!menu) return;
          useSchematicStore.getState().setEditingRoomShape(menu.nodeId);
          useSchematicStore.setState({ roomContextMenu: null });
        }}
      />
      {!!roomData?.shape && (
        <MenuItem
          label="Reset to Rectangle"
          onClick={() => {
            if (!menu) return;
            useSchematicStore.getState().updateRoomShape(menu.nodeId, undefined, true);
            useSchematicStore.setState({ roomContextMenu: null, editingRoomShapeId: null });
          }}
        />
      )}
      <MenuItem label={isLocked ? "Unlock Room" : "Lock Room"} onClick={toggleLock} />
      <MenuItem
        label={isEquipmentRack ? "Remove Equipment Rack" : "Mark as Equipment Rack"}
        onClick={toggleEquipmentRack}
      />
      {(() => {
        const all = useSchematicStore.getState().nodes;
        const selectedCount = all.filter((n) => n.selected).length;
        const thisGroupId = (roomData as { groupId?: string } | undefined)?.groupId;
        if (selectedCount < 2 && !thisGroupId) return null;
        return (
          <>
            <div className="h-px bg-[var(--ui-border)] my-1" />
            {selectedCount >= 2 && (
              <MenuItem
                label={`Group Selection (${selectedCount})  ⌘G`}
                onClick={() => {
                  useSchematicStore.getState().groupSelection();
                  useSchematicStore.setState({ roomContextMenu: null });
                }}
              />
            )}
            {thisGroupId && (
              <MenuItem
                label="Ungroup  ⇧⌘G"
                onClick={() => {
                  const st = useSchematicStore.getState();
                  useSchematicStore.setState({
                    nodes: st.nodes.map((n) => ({
                      ...n,
                      selected: (n.data as { groupId?: string }).groupId === thisGroupId,
                    })),
                  });
                  useSchematicStore.getState().ungroupSelection();
                  useSchematicStore.setState({ roomContextMenu: null });
                }}
              />
            )}
          </>
        );
      })()}
      <div className="h-px bg-[var(--ui-border)] my-1" />
      <MenuItem label="Delete Room" onClick={deleteRoom} danger />
      <MenuItem label="Delete Room & Contents" onClick={deleteRoomAndContents} danger />
    </div>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      className={`w-full text-left px-2.5 py-1.5 text-xs cursor-pointer rounded-md transition-colors ${
        danger
          ? "text-red-600 dark:text-red-400 hover:bg-red-500/10"
          : "text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

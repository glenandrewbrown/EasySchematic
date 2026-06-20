import { useCallback, useEffect, useMemo } from "react";
import { useSchematicStore } from "../store";
import type { DeviceData, DeviceTemplate, RackElevationPage } from "../types";
import { useContextMenuPosition } from "../hooks/useContextMenuPosition";
import MenuSubmenu from "./MenuSubmenu";
import { inferRackHeightU } from "../rackUtils";
import { rotateBy } from "../planView";

export default function DeviceContextMenu() {
  const menu = useSchematicStore((s) => s.deviceContextMenu);
  const allPages = useSchematicStore((s) => s.pages);
  const pages = useMemo(() => allPages.filter((p): p is RackElevationPage => p.type === "rack-elevation"), [allPages]);
  const setActivePage = useSchematicStore((s) => s.setActivePage);
  const nodes = useSchematicStore((s) => s.nodes);
  const canvasViewMode = useSchematicStore((s) => s.canvasViewMode);
  const { ref: menuRef, pos: menuPos } = useContextMenuPosition(
    menu?.screenX ?? 0,
    menu?.screenY ?? 0,
  );

  useEffect(() => {
    if (!menu) return;
    const close = () => useSchematicStore.setState({ deviceContextMenu: null });
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
    useSchematicStore.setState({ deviceContextMenu: null });
  }, [menu]);

  const swapDevice = useCallback(() => {
    if (!menu) return;
    useSchematicStore.setState({
      deviceSwapTarget: { nodeId: menu.nodeId },
      deviceContextMenu: null,
    });
  }, [menu]);

  const deleteDevice = useCallback(() => {
    if (!menu) return;
    useSchematicStore.setState({ deviceContextMenu: null });
    useSchematicStore.getState().deleteNode(menu.nodeId);
  }, [menu]);

  if (!menu) return null;

  const { nodeId } = menu;
  const node = nodes.find((n) => n.id === nodeId);
  const deviceData = node?.type === "device" ? (node.data as DeviceData) : null;

  // Plan-view orientation. rotateBy(value, 0) wraps any stored rotation into [0, 360)
  // for display, and -rotationDeg is the exact delta that resets it back to 0.
  const rotationDeg = deviceData ? rotateBy(deviceData.rotationDeg, 0) : 0;
  const rotate = (deltaDeg: number) => {
    useSchematicStore.getState().rotateDevice(nodeId, deltaDeg);
    useSchematicStore.setState({ deviceContextMenu: null });
  };

  const placement = pages
    .flatMap((p) => p.placements.map((pl) => ({ page: p, placement: pl })))
    .find((x) => x.placement.deviceNodeId === nodeId);

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
      <MenuItem label="Swap Device..." onClick={swapDevice} />
      <MenuSubmenu label="Move to Layer">
        {useSchematicStore.getState().layers.map((layer) => (
          <MenuItem
            key={layer.id}
            label={layer.name}
            onClick={() => {
              const st = useSchematicStore.getState();
              useSchematicStore.setState({
                nodes: st.nodes.map((n) => ({ ...n, selected: n.id === nodeId })),
                edges: st.edges.map((e) => ({ ...e, selected: false })),
              });
              useSchematicStore.getState().assignSelectionToLayer(layer.id);
              useSchematicStore.setState({ deviceContextMenu: null });
            }}
          />
        ))}
      </MenuSubmenu>
      {(() => {
        const st = useSchematicStore.getState();
        const hostCandidates = st.nodes.filter(
          (n) =>
            n.type === "device" &&
            n.id !== nodeId &&
            /comput|laptop|server|workstation|\bmac\b|\bpc\b/i.test(
              `${(n.data as { deviceType?: string }).deviceType ?? ""} ${(n.data as { label?: string }).label ?? ""}`,
            ),
        );
        const currentHost = deviceData?.hostDeviceId;
        if (currentHost) {
          return (
            <MenuItem
              label="Detach from Host"
              onClick={() => {
                useSchematicStore.getState().setDeviceHost(nodeId, undefined);
                useSchematicStore.setState({ deviceContextMenu: null });
              }}
            />
          );
        }
        if (hostCandidates.length === 0) return null;
        return (
          <MenuSubmenu label="Run Inside (Software)">
            {hostCandidates.slice(0, 20).map((host) => (
              <MenuItem
                key={host.id}
                label={(host.data as { label?: string }).label ?? host.id}
                onClick={() => {
                  useSchematicStore.getState().setDeviceHost(nodeId, host.id);
                  useSchematicStore.setState({ deviceContextMenu: null });
                }}
              />
            ))}
          </MenuSubmenu>
        );
      })()}

      {deviceData && canvasViewMode === "layout" && (
        <>
          <div className="h-px bg-[var(--ui-border)] my-1" />
          <MenuSubmenu label={`Rotate  (${rotationDeg}°)`}>
            <MenuItem label="Rotate 90° ↻" onClick={() => rotate(90)} />
            <MenuItem label="Rotate 90° ↺" onClick={() => rotate(-90)} />
            <MenuItem label="Rotate 180°" onClick={() => rotate(180)} />
            {rotationDeg !== 0 && (
              <MenuItem label="Reset to 0°" onClick={() => rotate(-rotationDeg)} />
            )}
          </MenuSubmenu>
        </>
      )}

      {deviceData && (
        <>
          <div className="h-px bg-[var(--ui-border)] my-1" />
          {placement ? (
            <MenuItem
              label={`Show in Rack (${placement.page.label})`}
              onClick={() => {
                setActivePage(placement.page.id);
                useSchematicStore.setState({ deviceContextMenu: null });
              }}
            />
          ) : pages.length > 0 ? (
            <>
              <div className="px-2.5 py-1 text-[var(--color-text-muted)] text-[10px] uppercase tracking-wider">
                Place in Rack
              </div>
              {pages.map((page) =>
                page.racks.map((rack) => (
                  <MenuItem
                    key={`${page.id}-${rack.id}`}
                    label={`${rack.label} (${rack.heightU}U)`}
                    indent
                    onClick={() => {
                      const state = useSchematicStore.getState();
                      const heightU = inferRackHeightU(deviceData);
                      for (let u = 1; u <= rack.heightU - heightU + 1; u++) {
                        if (state.isRackSlotAvailable(page.id, rack.id, u, heightU, "front")) {
                          state.addRackPlacement(page.id, {
                            rackId: rack.id,
                            deviceNodeId: nodeId,
                            uPosition: u,
                            face: "front",
                          });
                          state.addToast(`Placed ${deviceData.label} in ${rack.label} at U${u}`, "success");
                          useSchematicStore.setState({ deviceContextMenu: null });
                          return;
                        }
                      }
                      state.addToast(`No space in ${rack.label} for ${heightU}U device`, "error");
                      useSchematicStore.setState({ deviceContextMenu: null });
                    }}
                  />
                ))
              )}
            </>
          ) : null}
        </>
      )}

      {(() => {
        const selectedCount = nodes.filter((n) => n.selected).length;
        const thisGroupId = (deviceData as { groupId?: string } | null)?.groupId;
        if (selectedCount < 2 && !thisGroupId) return null;
        return (
          <>
            <div className="h-px bg-[var(--ui-border)] my-1" />
            {selectedCount >= 2 && (
              <MenuItem
                label={`Group Selection (${selectedCount})  ⌘G`}
                onClick={() => {
                  useSchematicStore.getState().groupSelection();
                  useSchematicStore.setState({ deviceContextMenu: null });
                }}
              />
            )}
            {thisGroupId && (
              <MenuItem
                label="Ungroup  ⇧⌘G"
                onClick={() => {
                  const st = useSchematicStore.getState();
                  // Select the whole group, then ungroup it as a unit.
                  useSchematicStore.setState({
                    nodes: st.nodes.map((n) => ({
                      ...n,
                      selected: (n.data as { groupId?: string }).groupId === thisGroupId,
                    })),
                  });
                  useSchematicStore.getState().ungroupSelection();
                  useSchematicStore.setState({ deviceContextMenu: null });
                }}
              />
            )}
          </>
        );
      })()}

      {deviceData && (() => {
        const template: DeviceTemplate = {
          id: deviceData.templateId as string | undefined,
          label: deviceData.label,
          deviceType: deviceData.deviceType,
          ports: deviceData.ports,
          color: deviceData.color,
          shortName: deviceData.shortName,
          manufacturer: deviceData.manufacturer as string | undefined,
          modelNumber: deviceData.modelNumber as string | undefined,
        };
        return (
          <>
            <div className="h-px bg-[var(--ui-border)] my-1" />
            <MenuItem
              label="Add to Owned Inventory"
              onClick={() => {
                useSchematicStore.getState().addOwnedGear(template, 1);
                useSchematicStore.setState({ deviceContextMenu: null });
              }}
            />
          </>
        );
      })()}
      <div className="h-px bg-[var(--ui-border)] my-1" />
      <MenuItem label="Delete Device" onClick={deleteDevice} danger />
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  danger,
  indent,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  indent?: boolean;
}) {
  return (
    <button
      className={`w-full text-left py-1.5 text-xs cursor-pointer rounded-md transition-colors ${indent ? "px-5" : "px-2.5"} ${
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

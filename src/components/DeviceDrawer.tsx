import { useSchematicStore } from "../store";
import InsertPanel from "./InsertPanel";

/**
 * Drawer chrome around the rebuilt "Insert" panel content. The parent (App.tsx) owns
 * when the drawer is mounted/open — it renders this whenever the Device tool is active
 * or the drawer is pinned. This component fills its container with a normal full-height
 * flex column (the lead's floating wrapper owns positioning/width) and delegates the
 * panel's internal structure to <InsertPanel/>.
 *
 * Collapse: the panel header's chevron leaves the Device tool and unpins the drawer,
 * which causes App.tsx to stop rendering it (the same effect as closing the panel).
 */
export default function DeviceDrawer() {
  const setActiveTool = useSchematicStore((s) => s.setActiveTool);
  const setPinned = useSchematicStore((s) => s.setDeviceDrawerPinned);

  const handleCollapse = () => {
    setPinned(false);
    setActiveTool("select");
  };

  return (
    <div
      className="ui-drawer-in flex flex-col h-full min-w-0 border-r border-[var(--ui-border)] bg-[var(--color-surface-raised)]"
      data-print-hide
    >
      <InsertPanel onCollapse={handleCollapse} />
    </div>
  );
}

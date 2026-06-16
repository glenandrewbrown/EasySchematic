import { useSchematicStore } from "../store";
import DeviceLibrary from "./DeviceLibrary";

/**
 * Drawer chrome around the existing always-open device library. As the left panel
 * becomes a tool-rail + Device drawer, this supplies the header strip (title + pin
 * toggle) and renders <DeviceLibrary/> below it. The parent (App.tsx) owns when the
 * drawer is mounted/open; this component only renders the chrome + library and owns
 * the pin toggle.
 *
 * Pin semantics: pinned=true keeps the drawer open when switching tools; pinned=false
 * lets the App auto-close it when leaving the Device tool. The toggle just reflects and
 * flips `deviceDrawerPinned`.
 */

/** Pushpin glyph — outline when unpinned, accent-filled when pinned. */
function PinIcon({ pinned }: { pinned: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="w-[15px] h-[15px]"
      fill={pinned ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 2.5h4l-.6 4 2.1 2.1H4.5L6.6 6.5z" />
      <path d="M8 8.6V13" />
    </svg>
  );
}

/** Density glyph — stacked lines; tighter when compact. */
function DensityIcon({ compact }: { compact: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="w-[15px] h-[15px]" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden>
      {compact ? (
        <>
          <line x1="3" y1="4" x2="13" y2="4" />
          <line x1="3" y1="6.5" x2="13" y2="6.5" />
          <line x1="3" y1="9" x2="13" y2="9" />
          <line x1="3" y1="11.5" x2="13" y2="11.5" />
        </>
      ) : (
        <>
          <line x1="3" y1="4.5" x2="13" y2="4.5" />
          <line x1="3" y1="8" x2="13" y2="8" />
          <line x1="3" y1="11.5" x2="13" y2="11.5" />
        </>
      )}
    </svg>
  );
}

/** Device library drawer: header strip with density + pin toggles, scrollable library below. */
export default function DeviceDrawer() {
  const pinned = useSchematicStore((s) => s.deviceDrawerPinned);
  const setPinned = useSchematicStore((s) => s.setDeviceDrawerPinned);
  const density = useSchematicStore((s) => s.libraryDensity);
  const setDensity = useSchematicStore((s) => s.setLibraryDensity);

  const pinTitle = pinned
    ? "Unpin device library (auto-close after placing)"
    : "Pin device library open";
  const compact = density === "compact";
  const densityTitle = compact ? "Comfortable rows" : "Compact rows";

  return (
    <div
      className="ui-drawer-in flex flex-col h-full min-w-0 border-r border-[var(--ui-border)] bg-[var(--color-surface-raised)]"
      data-print-hide
    >
      <div className="flex items-center gap-2 px-3 py-2 shrink-0 border-b border-[var(--ui-border)]">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-heading)]">
          Devices
        </h2>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setDensity(compact ? "comfortable" : "compact")}
          aria-pressed={compact}
          aria-label={densityTitle}
          title={densityTitle}
          className="flex items-center justify-center w-7 h-7 rounded-md transition-colors duration-150 cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
        >
          <DensityIcon compact={compact} />
        </button>
        <button
          type="button"
          onClick={() => setPinned(!pinned)}
          aria-pressed={pinned}
          aria-label={pinTitle}
          title={pinTitle}
          className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors duration-150 cursor-pointer ${
            pinned
              ? "text-[var(--color-accent)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
          }`}
        >
          <PinIcon pinned={pinned} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <DeviceLibrary />
      </div>
    </div>
  );
}

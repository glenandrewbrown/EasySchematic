import { useMemo, useState } from "react";
import { useSchematicStore } from "../store";
import {
  FURNITURE_CATALOG,
  type FurnitureCatalogEntry,
  type FurnitureCategory,
} from "../furnitureCatalog";
import SymbolPickerDialog from "./SymbolPickerDialog";
import type { SymbolCategory, SymbolLibraryEntry } from "../symbolLibrary";

/** Default footprint (width, depth in metres) for a library symbol placed as an object. */
const LIB_SIZE_BY_CAT: Record<SymbolCategory, [number, number]> = {
  furniture: [1, 1],
  audio: [0.5, 0.5],
  video: [0.4, 0.3],
  lighting: [0.3, 0.3],
  network: [0.5, 0.4],
  compute: [0.4, 0.4],
  power: [0.4, 0.3],
  generic: [1, 1],
};

/** Build a placement entry from a library symbol; the chosen SVG (registered as an asset)
 *  drives the look via svgAssetId, so the catalog `svg` is left empty. */
function librarySymbolToEntry(symbol: SymbolLibraryEntry): FurnitureCatalogEntry {
  const [w, d] = LIB_SIZE_BY_CAT[symbol.category];
  return {
    id: `lib-${symbol.category}-${symbol.id}`,
    label: symbol.name,
    category: "miscellaneous",
    defaultWidthM: w,
    defaultDepthM: d,
    defaultColor: "#9ca3af",
    svg: "",
  };
}

/**
 * Left drawer for the to-scale Layout view: a palette of placeable furniture /
 * room objects (FURNITURE_CATALOG) grouped by category. Mirrors DeviceDrawer's
 * chrome (width, header strip, surface styling).
 *
 * Clicking a card arms placement via `setPendingObjectPlacement(entry)`; the
 * Layout canvas-click handler (owned by App.tsx) then drops the object where the
 * user clicks. The currently pending entry is highlighted; clicking it again
 * clears the pending placement.
 */

/** Human-readable section headings, in display order. */
const CATEGORY_LABELS: Record<FurnitureCategory, string> = {
  tables: "Tables",
  seating: "Seating",
  "av-furniture": "AV Furniture",
  lighting: "Lighting",
  staging: "Staging",
  miscellaneous: "Miscellaneous",
};

/** Category render order (groups with no entries are skipped). */
const CATEGORY_ORDER: readonly FurnitureCategory[] = [
  "tables",
  "seating",
  "av-furniture",
  "lighting",
  "staging",
  "miscellaneous",
];

/** One catalog entry rendered as a clickable card: glyph + label + default size. */
interface ObjectCardProps {
  entry: FurnitureCatalogEntry;
  pending: boolean;
  onPick: (entry: FurnitureCatalogEntry) => void;
}

function ObjectCard({ entry, pending, onPick }: ObjectCardProps) {
  return (
    <button
      type="button"
      onClick={() => onPick(entry)}
      aria-pressed={pending}
      title={`Place ${entry.label} (${entry.defaultWidthM} × ${entry.defaultDepthM} m)`}
      className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left transition-colors duration-150 cursor-pointer border ${
        pending
          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
          : "border-transparent hover:bg-[var(--color-surface-hover)]"
      }`}
    >
      <span
        className="shrink-0 flex items-center justify-center w-8 h-8 rounded border border-[var(--ui-border)]"
        style={{ color: entry.defaultColor }}
      >
        <svg
          viewBox="0 0 24 24"
          width={20}
          height={20}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          // Catalog svg is hardcoded, app-authored inner markup (no user input) —
          // same trusted source as src/symbols.
          dangerouslySetInnerHTML={{ __html: entry.svg }}
        />
      </span>
      <span className="flex flex-col min-w-0">
        <span className="text-xs font-medium text-[var(--color-text-heading)] truncate">
          {entry.label}
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums">
          {entry.defaultWidthM} × {entry.defaultDepthM} m
        </span>
      </span>
    </button>
  );
}

/** Object palette drawer: header strip + grouped, clickable furniture catalog. */
export default function ObjectDrawer() {
  const pendingObjectPlacement = useSchematicStore((s) => s.pendingObjectPlacement);
  const setPendingObjectPlacement = useSchematicStore((s) => s.setPendingObjectPlacement);

  // Group the (static) catalog once. Toggling a pending card clears it; picking a
  // different card swaps the armed placement.
  const grouped = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      entries: FURNITURE_CATALOG.filter((entry) => entry.category === category),
    })).filter((group) => group.entries.length > 0);
  }, []);

  const addSvgAsset = useSchematicStore((s) => s.addSvgAsset);
  const [libOpen, setLibOpen] = useState(false);

  const handlePick = (entry: FurnitureCatalogEntry) => {
    setPendingObjectPlacement(pendingObjectPlacement?.entry.id === entry.id ? null : { entry });
  };

  const handleLibraryPick = (symbol: SymbolLibraryEntry) => {
    const assetId = addSvgAsset(symbol.svg);
    setPendingObjectPlacement({ entry: librarySymbolToEntry(symbol), svgAssetId: assetId });
    setLibOpen(false);
  };

  return (
    <div
      className="ui-drawer-in flex flex-col h-full min-w-0 border-r border-[var(--ui-border)] bg-[var(--color-surface-raised)]"
      data-print-hide
    >
      <div className="flex items-center gap-2 px-3 py-2 shrink-0 border-b border-[var(--ui-border)]">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-heading)]">
          Objects
        </h2>
        <div className="flex-1" />
        {pendingObjectPlacement ? (
          <span className="text-[10px] text-[var(--color-accent)] font-medium truncate">
            Click canvas to place
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setLibOpen(true)}
            className="text-[10px] font-medium text-[var(--color-accent)] hover:underline cursor-pointer"
            title="Place a furniture / AV / network symbol from the library"
          >
            ＋ Library
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 flex flex-col gap-3">
        {grouped.map((group) => (
          <div key={group.category} className="flex flex-col gap-0.5">
            <h3 className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              {CATEGORY_LABELS[group.category]}
            </h3>
            {group.entries.map((entry) => (
              <ObjectCard
                key={entry.id}
                entry={entry}
                pending={pendingObjectPlacement?.entry.id === entry.id}
                onPick={handlePick}
              />
            ))}
          </div>
        ))}
      </div>

      {libOpen && (
        <SymbolPickerDialog
          title="Place from symbol library"
          onPick={handleLibraryPick}
          onClose={() => setLibOpen(false)}
        />
      )}
    </div>
  );
}

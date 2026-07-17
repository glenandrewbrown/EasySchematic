/**
 * Curated, license-clean SVG symbol library (generic / audio / network / furniture).
 *
 * The glyphs are bundled at build time into `symbolLibrary.generated.ts` (run
 * `node scripts/generate-symbol-library.mjs` to regenerate from
 * `Design_Handoff/svg-library/`). Each `svg` is a full, sanitiser-safe `<svg>` element
 * with a viewBox and `fill="currentColor"`, so it renders + tints exactly like a custom
 * upload: assigning one to a device/object simply registers it via `addSvgAsset()` and
 * points the node's `layoutSvgAssetId` / `svgAssetId` at the result.
 *
 * Attribution for the CC-BY sources is required — see {@link SYMBOL_LIBRARY_ATTRIBUTION}.
 */

import { SYMBOL_LIBRARY } from "./symbolLibrary.generated";

/** Top-level grouping for the symbol picker. */
export type SymbolCategory =
  | "generic"
  | "audio"
  | "video"
  | "lighting"
  | "network"
  | "compute"
  | "power"
  | "furniture";

/** One bundled symbol: metadata + a full, sanitiser-safe `<svg>` string. */
export interface SymbolLibraryEntry {
  /** Stable kebab-case id (unique within its category). */
  id: string;
  /** Human-readable display name. */
  name: string;
  category: SymbolCategory;
  /** Finer grouping within the category (e.g. "loudspeaker", "table"). */
  subcategory: string;
  /** Search keywords. */
  tags: readonly string[];
  /** Full `<svg …>` markup, viewBox-only, `fill="currentColor"`. */
  svg: string;
}

export { SYMBOL_LIBRARY };

/** Category tabs in display order. */
export const SYMBOL_CATEGORIES: readonly SymbolCategory[] = [
  "generic",
  "audio",
  "video",
  "lighting",
  "network",
  "compute",
  "power",
  "furniture",
];

/** Human labels for the category tabs. */
export const SYMBOL_CATEGORY_LABELS: Record<SymbolCategory, string> = {
  generic: "Shapes",
  audio: "Audio",
  video: "Video",
  lighting: "Lighting",
  network: "Network",
  compute: "Compute",
  power: "Power",
  furniture: "Furniture",
};

/**
 * Filter the library by category (or "all") and a free-text query matched against the
 * name, id, subcategory and tags. Returns the full set when both are empty.
 */
export function searchSymbolLibrary(
  query: string,
  category: SymbolCategory | "all",
): SymbolLibraryEntry[] {
  const q = query.trim().toLowerCase();
  return SYMBOL_LIBRARY.filter((s) => {
    if (category !== "all" && s.category !== category) return false;
    if (!q) return true;
    if (s.name.toLowerCase().includes(q)) return true;
    if (s.id.includes(q)) return true;
    if (s.subcategory.toLowerCase().includes(q)) return true;
    return s.tags.some((t) => t.toLowerCase().includes(q));
  });
}

/** Count of symbols per category, for tab badges. */
export function symbolCountByCategory(): Record<SymbolCategory | "all", number> {
  const counts: Record<SymbolCategory | "all", number> = {
    all: SYMBOL_LIBRARY.length,
    generic: 0,
    audio: 0,
    video: 0,
    lighting: 0,
    network: 0,
    compute: 0,
    power: 0,
    furniture: 0,
  };
  for (const s of SYMBOL_LIBRARY) counts[s.category] += 1;
  return counts;
}

/**
 * Required + courtesy attribution for the bundled artwork. The CC-BY entries
 * (Font Awesome, game-icons.net) legally require credit; the rest are credited as
 * good practice. Surfaced in the symbol picker's footer.
 */
export const SYMBOL_LIBRARY_ATTRIBUTION =
  "Symbols: Tabler Icons (MIT), Lucide (ISC), Bootstrap Icons (MIT), " +
  "Material Symbols (Apache-2.0, © Google), Font Awesome Free (CC BY 4.0, © Fonticons), " +
  "game-icons.net (CC BY 3.0, © Delapouite).";

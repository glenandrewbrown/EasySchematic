/**
 * Furniture / room-object catalog for the to-scale Layout view.
 *
 * Each entry pairs a real-world default footprint (metres) with an
 * app-authored, top-down inline SVG glyph. The SVG is inner markup designed
 * for a `0 0 24 24` viewBox using `stroke="currentColor"` and `fill="none"`
 * (matching `src/symbols/index.ts`), so it renders as a clean line drawing in
 * any colour and needs no sanitization.
 *
 * Catalog ids are stored on `ObjectData.catalogId` (see `src/types.ts`).
 *
 * String constants are framework-agnostic and work in the vitest node
 * environment without Vite `?raw` import magic.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Top-level grouping for furniture / room objects in the Layout picker. */
export type FurnitureCategory =
  | "seating"
  | "tables"
  | "staging"
  | "lighting"
  | "av-furniture"
  | "miscellaneous";

/** A single placeable furniture / room object. */
export interface FurnitureCatalogEntry {
  /** Stable kebab-case id (also stored on ObjectData.catalogId). */
  id: string;
  /** UI display name. */
  label: string;
  category: FurnitureCategory;
  /** Default real-world footprint in metres. */
  defaultWidthM: number;
  defaultDepthM: number;
  /** Default fill colour (CSS, token-friendly muted tone). */
  defaultColor: string;
  /** Inner SVG markup drawn top-down in a 24×24 viewBox (app-authored, no sanitization needed). */
  svg: string;
}

// ---------------------------------------------------------------------------
// Muted default colour tokens
// Calm, low-saturation tones grouped loosely by category so a freshly placed
// object reads correctly before the user recolours it.
// ---------------------------------------------------------------------------

const COLOR_SEATING = "#94a3b8"; // slate-400
const COLOR_TABLE = "#a8a29e"; // stone-400
const COLOR_STAGING = "#a78bfa"; // violet-400
const COLOR_LIGHTING = "#fcd34d"; // amber-300
const COLOR_AV = "#64748b"; // slate-500
const COLOR_MISC = "#9ca3af"; // gray-400

// ---------------------------------------------------------------------------
// SVG inner markup constants
// 24×24 viewBox, stroke="currentColor", fill="none", stroke-width ~1.6
// Top-down (plan) views: simple rects / circles / lines.
// ---------------------------------------------------------------------------

/** Rectangular table — plain top with a centre seam to read as a surface. */
const SVG_RECT_TABLE =
  '<rect x="2" y="7" width="20" height="10" rx="1.5" stroke-width="1.8"/>' +
  '<line x1="12" y1="7" x2="12" y2="17" stroke-width="1" stroke-dasharray="2 2"/>';

/** Round table — circular top with a small centre mark. */
const SVG_ROUND_TABLE =
  '<circle cx="12" cy="12" r="9" stroke-width="1.8"/>' +
  '<circle cx="12" cy="12" r="1.2" stroke-width="1.4"/>';

/** Conference table — long boardroom top with seat positions along each side. */
const SVG_CONFERENCE_TABLE =
  '<rect x="2" y="8" width="20" height="8" rx="3" stroke-width="1.8"/>' +
  '<line x1="7" y1="4" x2="7" y2="6.5" stroke-width="1.4" stroke-linecap="round"/>' +
  '<line x1="12" y1="4" x2="12" y2="6.5" stroke-width="1.4" stroke-linecap="round"/>' +
  '<line x1="17" y1="4" x2="17" y2="6.5" stroke-width="1.4" stroke-linecap="round"/>' +
  '<line x1="7" y1="17.5" x2="7" y2="20" stroke-width="1.4" stroke-linecap="round"/>' +
  '<line x1="12" y1="17.5" x2="12" y2="20" stroke-width="1.4" stroke-linecap="round"/>' +
  '<line x1="17" y1="17.5" x2="17" y2="20" stroke-width="1.4" stroke-linecap="round"/>';

/** Two-seat sofa — outer body with back rail and a centre seat division. */
const SVG_SOFA_2SEAT =
  '<rect x="2" y="6" width="20" height="12" rx="3" stroke-width="1.8"/>' +
  '<line x1="2" y1="10" x2="22" y2="10" stroke-width="1.4"/>' +
  '<line x1="12" y1="10" x2="12" y2="18" stroke-width="1.4"/>';

/** Armchair — single seat with back rail and two arms. */
const SVG_ARMCHAIR =
  '<rect x="4" y="5" width="16" height="14" rx="3" stroke-width="1.8"/>' +
  '<line x1="4" y1="9" x2="20" y2="9" stroke-width="1.4"/>' +
  '<line x1="8" y1="9" x2="8" y2="19" stroke-width="1.4"/>' +
  '<line x1="16" y1="9" x2="16" y2="19" stroke-width="1.4"/>';

/** Stacking chair — small square seat with a back edge. */
const SVG_STACKING_CHAIR =
  '<rect x="5" y="5" width="14" height="14" rx="2" stroke-width="1.8"/>' +
  '<line x1="5" y1="8.5" x2="19" y2="8.5" stroke-width="1.4"/>';

/** Bar stool — round seat with a centre post mark. */
const SVG_BAR_STOOL =
  '<circle cx="12" cy="12" r="8" stroke-width="1.8"/>' +
  '<circle cx="12" cy="12" r="1.6" stroke-width="1.4"/>';

/** Lectern — angled reading surface seen from above. */
const SVG_LECTERN =
  '<path d="M5 16 L8 6 H16 L19 16 Z" stroke-width="1.8" stroke-linejoin="round"/>' +
  '<line x1="8" y1="11" x2="16" y2="11" stroke-width="1.2"/>';

/** Projection screen — wide thin bar (the screen viewed edge-on / from above). */
const SVG_PROJECTION_SCREEN =
  '<rect x="2" y="10" width="20" height="4" rx="1" stroke-width="1.8"/>' +
  '<line x1="4" y1="14" x2="4" y2="17" stroke-width="1.4" stroke-linecap="round"/>' +
  '<line x1="20" y1="14" x2="20" y2="17" stroke-width="1.4" stroke-linecap="round"/>';

/** Display stand — small plinth with a screen footprint on top. */
const SVG_DISPLAY_STAND =
  '<rect x="4" y="4" width="16" height="16" rx="2" stroke-width="1.8"/>' +
  '<rect x="7" y="9" width="10" height="6" rx="1" stroke-width="1.4"/>';

/** Floor lamp — round base with a radial spread to imply light. */
const SVG_FLOOR_LAMP =
  '<circle cx="12" cy="12" r="4" stroke-width="1.8"/>' +
  '<path d="M12 4 V6 M12 18 V20 M4 12 H6 M18 12 H20" stroke-width="1.4" stroke-linecap="round"/>' +
  '<path d="M6.3 6.3 L7.7 7.7 M17.7 6.3 L16.3 7.7 M6.3 17.7 L7.7 16.3 M17.7 17.7 L16.3 16.3" stroke-width="1.2" stroke-linecap="round"/>';

/** Ceiling fixture — square housing with a recessed luminaire. */
const SVG_CEILING_FIXTURE =
  '<rect x="4" y="4" width="16" height="16" rx="2" stroke-width="1.8"/>' +
  '<circle cx="12" cy="12" r="4.5" stroke-width="1.4"/>' +
  '<line x1="12" y1="4" x2="12" y2="20" stroke-width="0.8" stroke-dasharray="2 2"/>' +
  '<line x1="4" y1="12" x2="20" y2="12" stroke-width="0.8" stroke-dasharray="2 2"/>';

/** Rack enclosure — tall cabinet footprint with mounting rails. */
const SVG_RACK_ENCLOSURE =
  '<rect x="6" y="2" width="12" height="20" rx="1" stroke-width="1.8"/>' +
  '<line x1="8.5" y1="2" x2="8.5" y2="22" stroke-width="1.2"/>' +
  '<line x1="15.5" y1="2" x2="15.5" y2="22" stroke-width="1.2"/>';

/** Grand piano — body curve with the keyboard edge on the straight side. */
const SVG_PIANO =
  '<path d="M5 4 H13 C19 4 21 9 21 13 C21 18 17 20 12 20 H5 Z" stroke-width="1.8" stroke-linejoin="round"/>' +
  '<line x1="5" y1="8" x2="13" y2="8" stroke-width="1.4"/>';

/** Drum riser — square platform with a chamfered corner to imply a deck. */
const SVG_DRUM_RISER =
  '<rect x="3" y="3" width="18" height="18" rx="1" stroke-width="1.8"/>' +
  '<rect x="7" y="7" width="10" height="10" rx="1" stroke-width="1.2" stroke-dasharray="2 2"/>';

/** Pipe and drape — support line with hung fabric folds. */
const SVG_PIPE_AND_DRAPE =
  '<line x1="2" y1="8" x2="22" y2="8" stroke-width="1.8" stroke-linecap="round"/>' +
  '<path d="M4 8 Q5 13 4 18 M8 8 Q9 13 8 18 M12 8 Q13 13 12 18 M16 8 Q17 13 16 18 M20 8 Q21 13 20 18" stroke-width="1.2" stroke-linecap="round"/>';

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/** All built-in Layout-view furniture / room objects. */
export const FURNITURE_CATALOG: readonly FurnitureCatalogEntry[] = [
  // --- Tables ---
  {
    id: "rectangular-table",
    label: "Rectangular Table",
    category: "tables",
    defaultWidthM: 1.8,
    defaultDepthM: 0.8,
    defaultColor: COLOR_TABLE,
    svg: SVG_RECT_TABLE,
  },
  {
    id: "round-table",
    label: "Round Table",
    category: "tables",
    defaultWidthM: 1.2,
    defaultDepthM: 1.2,
    defaultColor: COLOR_TABLE,
    svg: SVG_ROUND_TABLE,
  },
  {
    id: "conference-table",
    label: "Conference Table",
    category: "tables",
    defaultWidthM: 3.0,
    defaultDepthM: 1.2,
    defaultColor: COLOR_TABLE,
    svg: SVG_CONFERENCE_TABLE,
  },
  // --- Seating ---
  {
    id: "sofa-2seat",
    label: "Two-Seat Sofa",
    category: "seating",
    defaultWidthM: 1.6,
    defaultDepthM: 0.9,
    defaultColor: COLOR_SEATING,
    svg: SVG_SOFA_2SEAT,
  },
  {
    id: "armchair",
    label: "Armchair",
    category: "seating",
    defaultWidthM: 0.8,
    defaultDepthM: 0.8,
    defaultColor: COLOR_SEATING,
    svg: SVG_ARMCHAIR,
  },
  {
    id: "stacking-chair",
    label: "Stacking Chair",
    category: "seating",
    defaultWidthM: 0.5,
    defaultDepthM: 0.5,
    defaultColor: COLOR_SEATING,
    svg: SVG_STACKING_CHAIR,
  },
  {
    id: "bar-stool",
    label: "Bar Stool",
    category: "seating",
    defaultWidthM: 0.4,
    defaultDepthM: 0.4,
    defaultColor: COLOR_SEATING,
    svg: SVG_BAR_STOOL,
  },
  // --- AV furniture ---
  {
    id: "lectern",
    label: "Lectern",
    category: "av-furniture",
    defaultWidthM: 0.6,
    defaultDepthM: 0.5,
    defaultColor: COLOR_AV,
    svg: SVG_LECTERN,
  },
  {
    id: "projection-screen",
    label: "Projection Screen",
    category: "av-furniture",
    defaultWidthM: 3.0,
    defaultDepthM: 0.2,
    defaultColor: COLOR_AV,
    svg: SVG_PROJECTION_SCREEN,
  },
  {
    id: "display-stand",
    label: "Display Stand",
    category: "av-furniture",
    defaultWidthM: 0.6,
    defaultDepthM: 0.6,
    defaultColor: COLOR_AV,
    svg: SVG_DISPLAY_STAND,
  },
  {
    id: "rack-enclosure",
    label: "Rack Enclosure",
    category: "av-furniture",
    defaultWidthM: 0.6,
    defaultDepthM: 0.9,
    defaultColor: COLOR_AV,
    svg: SVG_RACK_ENCLOSURE,
  },
  // --- Lighting ---
  {
    id: "floor-lamp",
    label: "Floor Lamp",
    category: "lighting",
    defaultWidthM: 0.4,
    defaultDepthM: 0.4,
    defaultColor: COLOR_LIGHTING,
    svg: SVG_FLOOR_LAMP,
  },
  {
    id: "ceiling-fixture",
    label: "Ceiling Fixture",
    category: "lighting",
    defaultWidthM: 0.6,
    defaultDepthM: 0.6,
    defaultColor: COLOR_LIGHTING,
    svg: SVG_CEILING_FIXTURE,
  },
  // --- Staging ---
  {
    id: "piano",
    label: "Grand Piano",
    category: "staging",
    defaultWidthM: 1.5,
    defaultDepthM: 1.4,
    defaultColor: COLOR_STAGING,
    svg: SVG_PIANO,
  },
  {
    id: "drum-riser",
    label: "Drum Riser",
    category: "staging",
    defaultWidthM: 2.0,
    defaultDepthM: 2.0,
    defaultColor: COLOR_STAGING,
    svg: SVG_DRUM_RISER,
  },
  {
    id: "pipe-and-drape",
    label: "Pipe and Drape",
    category: "miscellaneous",
    defaultWidthM: 3.0,
    defaultDepthM: 0.1,
    defaultColor: COLOR_MISC,
    svg: SVG_PIPE_AND_DRAPE,
  },
];

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/** Lookup helper. Returns the matching entry, or `undefined` when not found. */
export function furnitureById(id: string): FurnitureCatalogEntry | undefined {
  return FURNITURE_CATALOG.find((entry) => entry.id === id);
}

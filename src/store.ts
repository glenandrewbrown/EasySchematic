import { create } from "zustand";
import { DEFAULT_DETAIL_LEVEL, type DetailLevel } from "./plainLanguage";
import type { LengthUnitMode } from "./lengthFormat";
import {
  applyNodeChanges,
  applyEdgeChanges,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection,
} from "@xyflow/react";
import type {
  DeviceNode,
  DeviceData,
  SchematicNode,
  ConnectionEdge,
  ConnectionData,
  DeviceTemplate,
  OwnedGearItem,
  OwnedCableItem,
  OwnedInventoryItem,
  SchematicLayer,
  Port,
  SchematicFile,
  SchematicPage,
  RackElevationPage,
  PrintSheetPage,
  PrintViewport,
  RackData,
  RackDevicePlacement,
  RackAccessory,
  TitleBlock,
  TitleBlockLayout,
  TemplatePreset,
  InstalledSlot,
  SlotDefinition,
  CustomTemplateGroup,
  CustomTemplateMeta,
  BundleMeta,
  DeviceChannel,
  DeviceConnector,
  NormallingMode,
} from "./types";
import type { ReactFlowInstance } from "@xyflow/react";
import type { SignalType, ScrollConfig, LineStyle, LabelCaseMode, DistanceSettings, PanMode, StubLabelPageMode, ProjectStatus, CanvasViewMode, GearUnit, FieldSuggestions, GridSettings, TransportContainer, TransportItem, TransportPhase, ObjectData, ZoneData } from "./types";
import { addUnit, updateUnit, removeUnit, assignUnit, unassignUnit, clearAssignmentsForNode } from "./gearInventory";
import { inventoryKeyFromTemplate, inventoryKeyFromDeviceData } from "./inventoryKey";
import { setItemChecked as setContainerItemCheckedPure } from "./logistics";
import type { FurnitureCatalogEntry } from "./furnitureCatalog";
import { sanitizeSvg } from "./svgSanitizer";
import { DEFAULT_TOOL, type ToolId } from "./toolMode";
import { defaultStubPlacement, healStubPortAlignment } from "./stubPlacement";
import { getPortAbsolutePositions } from "./snapUtils";
import { DEFAULT_LAYER_ID, DEFAULT_SCROLL_CONFIG, DEFAULT_LABEL_CASE, DEFAULT_DISTANCE_SETTINGS, DEFAULT_PAN_MODE, DEFAULT_STUB_LABEL_SHOW_PORT, DEFAULT_STUB_LABEL_SHOW_ROOM, DEFAULT_STUB_LABEL_PAGE_MODE, DEFAULT_CANVAS_VIEW_MODE, parseCanvasViewMode, DEFAULT_GRID_SETTINGS } from "./types";
import { pairKey } from "./roomDistance";
import { DEFAULT_RECT_SHAPE } from "./roomShape";
import { withGroupId, withoutGroupId, groupIdOf } from "./grouping";
import { rotateBy, normalizeRotationDeg } from "./planView";
import { reorderNodesByZ } from "./nodeOrder";
import type { Orientation } from "./printConfig";
import { computeAlignment, resolveAlignmentOverlaps, type AlignOperation } from "./alignUtils";
import { CURRENT_SCHEMA_VERSION, STUB_LABEL_Z_INDEX, migrateSchematic } from "./migrations";
import { healStaleWaypoints } from "./waypointHealing";
import { newBundleId, gcBundles, reconcileBundleJunctions, bundleJunctionsFor, splitMemberWaypoints } from "./bundles";
import { computeBundleTrunk, type BundleEndpoint } from "./routing/bundleRoute";
import { buildHandleSnapshot } from "./routing/handleSnapshot";
import { requestRoutes, setRoutingResultHandler, type RoutingResult } from "./routing/routingClient";
import { reconcileWaypointNodes, syncEdgesFromWaypointNodes, spliceWaypointsForRemovedNodes } from "./waypointSync";
import { orthogonalize, extractSegments, segmentsCross, type RoutedEdge, type CrossingPoint } from "./edgeRouter";
import { simplifyWaypoints, waypointsToSvgPath, waypointsToSvgPathWithHops } from "./pathfinding";
import { areConnectorsCompatible, needsAdapter, findAdaptersForConnectorBridge, findAdaptersForSignalBridge, NETWORK_SIGNAL_TYPES, BARE_WIRE_CONNECTORS, areSignalsCompatibleViaConnector, areSignalPairsCompatible, effectiveSignalType } from "./connectorTypes";
import { inferRackHeightU, inferRackForm, shelfFootprintMm, shelfInnerWidthMm } from "./rackUtils";
import { DEVICE_TEMPLATES } from "./deviceLibrary";
import { createDefaultLayout } from "./titleBlockLayout";
import { sanitizeNoteHtml } from "./sanitizeHtml";
import { getTemplateById } from "./templateApi";
import { DEFAULT_BRIDGE_PORT } from "./mcp/protocol";
import { syncDeviceWithTemplate, type SyncResult } from "./templateSync";
import { chooseNewHandleSuffix, type SwapPlan, type NewPortRef } from "./deviceSwap";
import { getSignalColorOverrides, applySignalColors, loadSignalColors, saveSignalColors } from "./signalColors";
import { computeCableSchedule } from "./cableSchedule";
import { autoFillSheetForRack } from "./printSheetAutoFill";
import { allocateEdgeId, maxEdgeCounterFromIds, newLinkedConnectionId, uniquifyEdgeIds } from "./idUtils";

/** Fix UTF-8 → Windows-1252 double-encoding in string values (e.g. → becomes â†').
 *  Applied on import so old/corrupted saves display correctly. */
function repairMojibake(obj: unknown): unknown {
  if (typeof obj === "string") {
    return obj
      .replace(/\u00e2\u2020\u2019/g, "\u2192")  // â†' → →
      .replace(/\u00e2\u2020\u2018/g, "\u2191")  // â†' → ↑
      .replace(/\u00e2\u2020\u201c/g, "\u2193")  // â†" → ↓
      .replace(/\u00e2\u2020\u201d/g, "\u2194");  // â†" → ↔
  }
  if (Array.isArray(obj)) return obj.map(repairMojibake);
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = repairMojibake(v);
    return out;
  }
  return obj;
}

/** Dominant colour axis for connections (the "Colour by" switch). */
export type ColorBy = "signal" | "layer" | "none";

/** How a layer's colour paints its member devices on the canvas.
 *  "band" = a 3px bar across the node's top edge; "tint" = a wash across the node header.
 *  Either way the header also carries a text layer chip, so colour is never the only cue. */
export type LayerColorMode = "band" | "tint";

/** Which connections show their on-canvas cable-ID label. */
export type CableIdLabelScope = "selected" | "all";

/** How much of a device is drawn. Ordered least → most detail; `nodeCompact` sets the
 *  baseline and a per-device entry in `nodeView` overrides it. */
export type NodeViewTier = "tile" | "compact" | "default" | "detailed";

/** Interface scale steps offered in the top bar (fractions of the base UI size). */
export const UI_SCALE_STEPS = [0.5, 0.75, 1, 1.25, 1.5] as const;

/** Clamp an arbitrary number into the supported interface-scale range. */
export function clampUiScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(1.5, Math.max(0.5, scale));
}

/** Row density for the left library drawer. */
export type LibraryDensity = "comfortable" | "compact";

/** Resolve the rendered stroke color for a connection. Direct-attach always wins as gray;
 *  otherwise per-connection `color` override beats the signal-type CSS variable. */
function resolveEdgeStroke(data: ConnectionData | undefined): string {
  if (!data) return "var(--color-custom)";
  if (data.directAttach) return "#9ca3af";
  if (data.color) return data.color;
  return `var(--color-${data.signalType ?? "custom"})`;
}

/** Re-sanitize every custom SVG asset on load — saved files can be shared or hand-edited,
 *  so we never trust persisted markup before it is injected via dangerouslySetInnerHTML. */
function sanitizeSvgAssets(assets: Record<string, string> | undefined): Record<string, string> {
  if (!assets) return {};
  const out: Record<string, string> = {};
  for (const [id, svg] of Object.entries(assets)) {
    const clean = sanitizeSvg(String(svg));
    if (clean) out[id] = clean;
  }
  return out;
}

const STORAGE_KEY = "easyschematic-autosave";
const TEMPLATES_KEY = "easyschematic-custom-templates";
const TEMPLATE_META_KEY = "easyschematic-custom-template-meta";
const CATEGORY_ORDER_KEY = "easyschematic-category-order";
const CANVAS_VIEW_MODE_KEY = "easyschematic-canvas-view-mode";
const NODE_COMPACT_KEY = "easyschematic-node-compact";
const LIVE_SIGNAL_KEY = "easyschematic-live-signal";
const LAYER_COLOR_MODE_KEY = "easyschematic-layer-color-mode";
const DETAIL_LEVEL_KEY = "easyschematic-detail-level";
const LENGTH_UNIT_MODE_KEY = "easyschematic-length-unit-mode";
const BUNDLE_VIEW_KEY = "easyschematic-bundle-view";
const CABLE_ID_LABEL_SCOPE_KEY = "easyschematic-cable-id-label-scope";
const REDUCE_MOTION_KEY = "easyschematic-reduce-motion";
const UI_SCALE_KEY = "easyschematic-ui-scale";
const SHOW_ARTWORK_KEY = "easyschematic-show-artwork";

/** Read a persisted string UI pref, falling back unless the stored value is a known option. */
function readEnumPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  const stored = localStorage.getItem(key);
  return allowed.includes(stored as T) ? (stored as T) : fallback;
}

/** Write a string UI pref. Guards SSR/test envs with no localStorage. */
function writePref(key: string, value: string): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
}

/** Read a persisted boolean UI pref. Guards SSR/test envs with no localStorage. */
function readBoolPref(key: string, fallback: boolean): boolean {
  if (typeof localStorage === "undefined") return fallback;
  const stored = localStorage.getItem(key);
  return stored === null ? fallback : stored === "true";
}

/** Read the persisted canvas view mode (session/UI pref). Guards SSR/test envs with no localStorage. */
function readInitialCanvasViewMode(): CanvasViewMode {
  if (typeof localStorage === "undefined") return DEFAULT_CANVAS_VIEW_MODE;
  const stored = localStorage.getItem(CANVAS_VIEW_MODE_KEY);
  // Legacy value "plan" was renamed to "layout" — migrate the stored pref once on read.
  if (stored === "plan") {
    localStorage.setItem(CANVAS_VIEW_MODE_KEY, "layout");
    return "layout";
  }
  return parseCanvasViewMode(stored);
}

const COVERAGE_VISIBLE_KEY = "easyschematic-coverage-visible";

/** Read the persisted "show coverage" plan-view pref. Guards SSR/test envs with no localStorage. */
function readInitialCoverageVisible(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(COVERAGE_VISIBLE_KEY) === "1";
}

const CREATE_ADD_TO_OWNED_KEY = "easyschematic-create-add-to-owned";

/** Interface-font preference (board 5g) — persisted as JSON under the consolidated
 *  "easyschematic.ui.v1" key. Swaps --font-ui only; --font-mono always stays Plex Mono. */
export type UiFont = "jost" | "plex-sans" | "public-sans" | "system";
const UI_PREFS_KEY = "easyschematic.ui.v1";
const UI_FONTS: readonly UiFont[] = ["jost", "plex-sans", "public-sans", "system"];

function readInitialUiFont(): UiFont {
  if (typeof localStorage === "undefined") return "jost";
  try {
    const parsed = JSON.parse(localStorage.getItem(UI_PREFS_KEY) ?? "{}") as { font?: string };
    return UI_FONTS.includes(parsed.font as UiFont) ? (parsed.font as UiFont) : "jost";
  } catch {
    return "jost";
  }
}

/** Stamp the choice on <html>; theme.css maps data-ui-font → --font-ui. Jost = no attribute. */
function applyUiFont(font: UiFont): void {
  if (typeof document === "undefined") return;
  if (font === "jost") document.documentElement.removeAttribute("data-ui-font");
  else document.documentElement.setAttribute("data-ui-font", font);
}

function persistUiFont(font: UiFont): void {
  if (typeof localStorage === "undefined") return;
  let prefs: Record<string, unknown> = {};
  try {
    prefs = JSON.parse(localStorage.getItem(UI_PREFS_KEY) ?? "{}") as Record<string, unknown>;
  } catch {
    prefs = {};
  }
  localStorage.setItem(UI_PREFS_KEY, JSON.stringify({ ...prefs, font }));
}

const _initUiFont = readInitialUiFont();
applyUiFont(_initUiFont);

const DEVICE_DRAWER_PINNED_KEY = "easyschematic-device-drawer-pinned";

/** Read the persisted device-library pin state. Pin-open is the DEFAULT — the drawer must
 *  not auto-collapse between placements (the #1 reviewer-flagged self-inflicted risk). */
function readInitialDeviceDrawerPinned(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(DEVICE_DRAWER_PINNED_KEY) !== "0";
}

const LIBRARY_DENSITY_KEY = "easyschematic-library-density";

/** Read the persisted library row density. "comfortable" (multi-line) is the default. */
function readInitialLibraryDensity(): LibraryDensity {
  if (typeof localStorage === "undefined") return "comfortable";
  return localStorage.getItem(LIBRARY_DENSITY_KEY) === "compact" ? "compact" : "comfortable";
}

const MINIMAP_VISIBLE_KEY = "easyschematic-minimap-visible";
const SHOW_WARNINGS_KEY = "easyschematic-show-warnings";
const MCP_ENABLED_KEY = "easyschematic-mcp-enabled";
const MCP_TOKEN_KEY = "easyschematic-mcp-token";
const MCP_PORT_KEY = "easyschematic-mcp-port";

/** Read the persisted minimap visibility pref (per-user UI; not part of the file). Default visible.
 *  Both lines shipped a minimap toggle against different storage keys; this fork key is the
 *  surviving one, so upstream's View ▸ Minimap and the View-options toggle drive one field. */
function readInitialMiniMapVisible(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(MINIMAP_VISIBLE_KEY) !== "0";
}

/** Read the persisted "show validation warnings" pref. Default OFF — warnings are opt-in
 *  so the chrome (top-bar pill, canvas dots, Issues badge) stays quiet until the user asks
 *  to see them. Errors are never gated by this; only warning-severity issues are hidden. */
function readInitialShowWarnings(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(SHOW_WARNINGS_KEY) === "1";
}

/** MCP bridge (Beta) editor preferences — persisted to localStorage, not the
 *  schematic file. Off by default; the bridge only connects once enabled. */
function loadMcpEnabled(): boolean {
  try {
    return localStorage.getItem(MCP_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}
function loadMcpToken(): string {
  try {
    return localStorage.getItem(MCP_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}
function loadMcpPort(): number {
  try {
    const raw = Number(localStorage.getItem(MCP_PORT_KEY));
    return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_BRIDGE_PORT;
  } catch {
    return DEFAULT_BRIDGE_PORT;
  }
}

export const CATEGORY_ORDER_DEFAULT: string[] = [
  "Sources",
  "Peripherals",
  "Switching",
  "Processing",
  "Distribution",
  "Displays",
  "Projection",
  "Recording",
  "Mixing Consoles",
  "Powered Mixers",
  "Audio",
  "Audio I/O",
  "Microphones",
  "Speakers",
  "Amplifiers",
  "Networking",
  "Codecs",
  "KVM / Extenders",
  "Wireless",
  "LED Video",
  "Media Servers",
  "Lighting",
  "Control",
  "Audio Expansion",
  "Expansion Cards",
  "Storage",
  "Storage Media",
  "Infrastructure",
  "Intercom",
  "Monitoring",
  "Cloud Services",
  "Cable Accessories",
];

/** Migrate legacy scrollBehavior to ScrollConfig, or use provided scrollConfig */
function resolveScrollConfig(data: { scrollBehavior?: string; scrollConfig?: Partial<ScrollConfig> }): ScrollConfig {
  if (data.scrollConfig) return { ...DEFAULT_SCROLL_CONFIG, ...data.scrollConfig };
  if (data.scrollBehavior === "pan") return { ...DEFAULT_SCROLL_CONFIG, scroll: "pan-y", shiftScroll: "pan-x", ctrlScroll: "zoom" };
  return { ...DEFAULT_SCROLL_CONFIG };
}

/** True if the scroll config matches the default (omit from JSON when saving) */
function isDefaultScrollConfig(c: ScrollConfig): boolean {
  return c.scroll === DEFAULT_SCROLL_CONFIG.scroll
    && c.shiftScroll === DEFAULT_SCROLL_CONFIG.shiftScroll
    && c.ctrlScroll === DEFAULT_SCROLL_CONFIG.ctrlScroll
    && c.zoomSpeed === DEFAULT_SCROLL_CONFIG.zoomSpeed
    && c.panSpeed === DEFAULT_SCROLL_CONFIG.panSpeed
    && c.trackpadEnabled === DEFAULT_SCROLL_CONFIG.trackpadEnabled;
}

/** Coerce a persisted labelCase value to a known mode. Anything unrecognized falls back to default. */
function resolveLabelCase(v: unknown): LabelCaseMode {
  return v === "uppercase" || v === "lowercase" || v === "capitalize" || v === "as-typed"
    ? v
    : DEFAULT_LABEL_CASE;
}

/** Guard: don't persist empty state before initial load completes */
let hydrated = false;

// Re-exported from gridConstants so existing `import { GRID_SIZE } from "./store"`
// call sites keep working. Utility modules that the store also depends on (e.g.
// snapUtils) must import directly from "./gridConstants" — pulling it through
// the store causes a TDZ error on first load because of the cycle.
export { GRID_SIZE } from "./gridConstants";
import { GRID_SIZE } from "./gridConstants";

/** How many recently-used templates to remember for quick re-add. */
const RECENT_TEMPLATES_CAP = 12;

/** Snap all node positions to the grid. Mutates the array in place.
 *  Stub labels are skipped — they store sub-grid Y to center the box on a
 *  port row (box height ≈13–14px, half of which would round away). Snapping
 *  them shifted the label down a few px on every load. */
/** Conservatively drop manual waypoints stranded by device/room moves in a loaded
 *  file (they detour the edge or route it through a device). Silent — logs a
 *  support-triage line if anything healed, mirroring the [waypoint-orphan] probe. */
/** Member-endpoint Y resolver for bundle junction placement: the live routed waypoints'
 *  first/last points are the exact pins. Returns null per end when the edge isn't routed
 *  (reconcile falls back to device-box centerY). */
function routedEndpointY(routedEdges: Record<string, RoutedEdge>) {
  return (edge: ConnectionEdge, end: "source" | "target"): number | null => {
    const wps = routedEdges[edge.id]?.waypoints;
    if (!wps || wps.length < 2) return null;
    return end === "source" ? wps[0].y : wps[wps.length - 1].y;
  };
}

function applyWaypointHeal(nodes: SchematicNode[], edges: ConnectionEdge[]): ConnectionEdge[] {
  const { edges: healedEdges, healed } = healStaleWaypoints(nodes, edges);
  if (healed.length > 0) {
    console.info("[waypoint-heal]", healed.length, "connection(s) re-routed (stale manual waypoints)");
  }
  return healedEdges;
}

function snapNodesToGrid(nodes: SchematicNode[]): SchematicNode[] {
  for (const n of nodes) {
    // Stub labels are healed against their REAL partner port at routing time
    // (healStubPortAlignment in recomputeRoutes) — DOM-measured ports can sit a few px
    // off the model grid, so snapping the stub to the abstract grid here would BREAK
    // colinearity with such ports (kink at the label). Leave their stored Y alone.
    if (n.type === "stub-label") continue;
    n.position.x = Math.round(n.position.x / GRID_SIZE) * GRID_SIZE;
    n.position.y = Math.round(n.position.y / GRID_SIZE) * GRID_SIZE;
  }
  return nodes;
}

/** Apply interaction flags on rooms based on lock state. Mutates in place.
 *  Ensures flags are always consistent, even for old save files that may
 *  be missing className/selectable/draggable. */
function applyRoomLockState(nodes: SchematicNode[]): void {
  for (const n of nodes) {
    if (n.type === "room") {
      const locked = (n.data as import("./types").RoomData).locked;
      if (locked) {
        n.draggable = false;
        n.selectable = false;
        n.className = "locked";
      } else {
        n.draggable = undefined;
        n.selectable = true;
        n.className = undefined;
      }
    }
  }
}

export interface Toast {
  id: string;
  message: string;
  type: "error" | "success" | "info";
}

interface Clipboard {
  nodes: SchematicNode[];
  edges: ConnectionEdge[];
  /** Height of the copied selection's bounding box, used for paste offset */
  boundsHeight: number;
}

/** One open project tab. The active document's live content lives in the main store
 *  fields; `snapshot` is authoritative only for INACTIVE documents (refreshed whenever
 *  that document is switched away from). Session-only — never part of SchematicFile. */
export interface ProjectDocument {
  id: string;
  name: string;
  snapshot: SchematicFile;
}

interface SchematicState {
  nodes: SchematicNode[];
  edges: ConnectionEdge[];
  schematicName: string;
  /** Bumped when a new schematic is wholesale-loaded (import, share link, demo, autosave hydrate). Canvas refits its viewport when this changes. */
  loadSeq: number;
  editingNodeId: string | null;
  creatingNodeId: string | null;
  /** When set, the full-screen Device Details page is open for this device node id.
   *  UI-only flag (session state); the page component reads/edits the live device. */
  deviceDetailsPageId: string | null;
  /** Open the Device Details page for a device node. */
  openDeviceDetailsPage: (id: string) => void;
  /** Close the Device Details page. */
  closeDeviceDetailsPage: () => void;
  /** When set, the full-screen routing matrix is open for this device node id.
   *  UI-only flag (session state); the matrix reads/edits the live device's
   *  channels/connectors + internal-route Connections. */
  routingMatrixDeviceId: string | null;
  /** Open the routing matrix for a device node. */
  openRoutingMatrix: (id: string) => void;
  /** Close the routing matrix. */
  closeRoutingMatrix: () => void;
  customTemplates: DeviceTemplate[];
  ownedGear: OwnedGearItem[];
  ownedCables: OwnedCableItem[];
  ownedInventory: OwnedInventoryItem[];
  showOwnedGearPane: boolean;
  libraryActiveTab: "devices" | "owned";
  /** Context for a "+ Create "{query}"" creator session opened from search (quick-add or
   *  paste list). Carries the requested quantity and the quick-add anchor; placeOnSave=false
   *  means the creator only mints the template (paste-list rows place later via "Place all"). */
  pendingQuickCreate: { qty: number; anchor: { x: number; y: number } | null; placeOnSave: boolean } | null;
  /** Creator footer "Also add to My Devices" — persisted UI pref, default ON. */
  createAddToOwned: boolean;
  /** Interface font (board 5g) — swaps --font-ui only; persisted in easyschematic.ui.v1. */
  uiFont: UiFont;
  setUiFont: (font: UiFont) => void;
  /** Per-DOCUMENT custom colours picked via the ＋ chip on colour swatch rows (boards 1b/5c).
   *  Serialized in the schematic file; newest first, capped at 8. */
  recentCustomColors: string[];
  pushRecentCustomColor: (hex: string) => void;

  // React Flow handlers
  onNodesChange: OnNodesChange<SchematicNode>;
  onEdgesChange: OnEdgesChange<ConnectionEdge>;
  onConnect: OnConnect;

  // Actions
  addDevice: (template: DeviceTemplate, position: { x: number; y: number }) => void;
  /** Place many devices in a single undo entry (bulk / rapid add). */
  addDevices: (items: { template: DeviceTemplate; position: { x: number; y: number } }[]) => void;
  removeSelected: () => void;
  deleteNode: (nodeId: string) => void;
  deleteNodeAndChildren: (nodeId: string) => void;
  copySelected: () => void;
  pasteClipboard: () => void;
  alignSelectedNodes: (op: AlignOperation) => void;
  isValidConnection: (connection: Connection) => boolean;
  updateDeviceLabel: (nodeId: string, label: string) => void;
  batchUpdateDeviceLabels: (changes: { nodeId: string; label: string }[]) => void;
  updateDeviceShortName: (nodeId: string, shortName: string) => void;
  batchUpdateDeviceShortNames: (changes: { nodeId: string; shortName: string }[]) => void;
  updateDevice: (nodeId: string, data: DeviceData) => void;
  /** Patch device data without clearing baseLabel (for spreadsheet edits). */
  patchDeviceData: (nodeId: string, patch: Partial<DeviceData>) => void;
  /** Merge two paired ports into a single passthrough port and re-anchor their edges atomically. */
  convertPortsToPassthrough: (nodeId: string, inputPortId: string, outputPortId: string, newPort: import("./types").Port) => void;
  /** Merge every input/output port pair on a device into passthrough ports in one atomic undo step. */
  convertAllPairsToPassthrough: (
    nodeId: string,
    conversions: Array<{ inputPortId: string; outputPortId: string; newPort: import("./types").Port }>,
  ) => void;
  /** Reconcile a placed device against the latest version of its source template. */
  syncDeviceFromTemplate: (nodeId: string) => SyncResult | null;
  /** Replace a device in place with a different template, remapping connections per the plan. */
  swapDevice: (nodeId: string, plan: SwapPlan) => void;
  /** UI state: when set, the Swap Device dialog is open targeting this node. */
  deviceSwapTarget: { nodeId: string } | null;
  /** Swap or remove a card in a modular slot. Pass null cardTemplateId to empty the slot. */
  swapCard: (nodeId: string, slotId: string, cardTemplateId: string | null) => void;
  /** Add a new empty expansion slot to a device. */
  addSlot: (nodeId: string, slot: { label: string; slotFamily: string }) => void;
  addSlots: (nodeId: string, slots: { label: string; slotFamily: string }[]) => void;
  /** Update label / slotFamily on an existing installed slot. */
  updateSlot: (nodeId: string, slotId: string, patch: { label?: string; slotFamily?: string; hidden?: boolean }) => void;
  /** Remove a slot, its ports, descendant slots, and any edges connected to their ports. */
  removeSlot: (nodeId: string, slotId: string) => void;
  setEditingNodeId: (id: string | null) => void;
  setCreatingNodeId: (id: string | null) => void;
  createAndEditDevice: (template: DeviceTemplate, position: { x: number; y: number }) => void;
  addRoom: (label: string, position: { x: number; y: number }) => void;
  updateRoomLabel: (nodeId: string, label: string) => void;
  updateRoom: (nodeId: string, data: import("./types").RoomData) => void;
  updateAnnotation: (nodeId: string, data: Partial<import("./types").AnnotationData>) => void;
  toggleRoomLock: (nodeId: string) => void;
  toggleEquipmentRack: (nodeId: string) => void;
  addNote: (position: { x: number; y: number }) => void;
  addDimension: (position: { x: number; y: number }) => void;
  updateDimension: (
    id: string,
    patch: { position?: { x: number; y: number }; dx?: number; dy?: number },
    recordUndo?: boolean,
  ) => void;
  updateNoteHtml: (nodeId: string, html: string) => void;
  reparentNode: (nodeId: string, absolutePosition: { x: number; y: number }, options?: { skipUndo?: boolean }) => void;
  /** Re-evaluate room membership for every non-room node. Used after a room is
   *  created, resized, or moved so devices get parented/unparented to match
   *  the new layout. */
  reparentAllDevices: (options?: { skipUndo?: boolean }) => void;
  /** Called when a room's NodeResizer finishes. Snapshots undo and reconciles
   *  device membership against the new bounds. */
  onRoomResizeEnd: (nodeId: string) => void;

  // Undo/Redo
  pushSnapshot: () => void;
  setPendingUndoSnapshot: () => void;
  clearPendingUndoSnapshot: () => void;
  flushPendingSnapshot: () => void;
  beginLiveControlBatch: () => void;
  commitLiveControlBatch: () => void;
  cancelLiveControlBatch: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  undoSize: number;
  redoSize: number;

  // Selection
  selectAll: () => void;
  /** Select exactly the given edge ids (deselecting all other edges and all nodes). */
  selectEdges: (ids: string[]) => void;

  // Custom templates
  addCustomTemplate: (template: DeviceTemplate) => void;
  updateCustomTemplate: (id: string, template: DeviceTemplate) => void;
  removeCustomTemplate: (deviceType: string) => void;
  clearAllCustomTemplates: () => void;
  addOwnedGear: (template: DeviceTemplate, quantity?: number) => void;
  setOwnedGear: (items: OwnedGearItem[]) => void;
  updateOwnedGearQuantity: (templateKey: string, quantity: number) => void;
  removeOwnedGear: (templateKey: string) => void;
  setShowOwnedGearPane: (show: boolean) => void;
  setLibraryActiveTab: (tab: "devices" | "owned") => void;
  setPendingQuickCreate: (ctx: { qty: number; anchor: { x: number; y: number } | null; placeOnSave: boolean } | null) => void;
  setCreateAddToOwned: (on: boolean) => void;
  /** Bulk-sync every distinct device on the canvas into the owned-gear list, deduped by
   *  inventory key. Existing owned quantities are raised to at least the canvas count
   *  (never lowered, never duplicated — re-running is idempotent). Returns how many
   *  distinct devices were added or raised. */
  syncProjectDevicesToOwned: () => number;
  /** Left-library row density — session/UI pref, persisted to localStorage. */
  libraryDensity: LibraryDensity;
  setLibraryDensity: (density: LibraryDensity) => void;

  // Owned cable inventory + per-connection assignment (cable fit)
  addOwnedCable: (item: Omit<OwnedCableItem, "id">) => void;
  addOwnedInventoryItem: (item: Omit<OwnedInventoryItem, "id">) => void;
  updateOwnedInventoryItem: (id: string, patch: Partial<Omit<OwnedInventoryItem, "id">>) => void;
  removeOwnedInventoryItem: (id: string) => void;
  updateOwnedCable: (id: string, patch: Partial<Omit<OwnedCableItem, "id">>) => void;
  removeOwnedCable: (id: string) => void;
  setEdgeAssignedCables: (edgeId: string, cableIds: string[]) => void;
  /** Edge id currently open in the Assign Cables dialog, or null. */
  cableAssignEdgeId: string | null;
  setCableAssignEdgeId: (edgeId: string | null) => void;
  /** True while the Cable Inventory dialog is open. */
  showCableInventory: boolean;
  setShowCableInventory: (show: boolean) => void;

  // Canvas view mode (schematic signal-flow vs to-scale plan) — session/UI pref, not persisted to file
  canvasViewMode: CanvasViewMode;
  setCanvasViewMode: (mode: CanvasViewMode) => void;
  /** Compact device-node density on the canvas (header + I/O chip, no port grid) —
   *  session/UI pref, not persisted to file. */
  nodeCompact: boolean;
  setNodeCompact: (compact: boolean) => void;
  /** "Live signal" motion — animated signal packets + flowing dashes on connections,
   *  connected-port glow. Default off; reduced-motion aware. Session/UI pref. */
  liveSignal: boolean;
  setLiveSignal: (on: boolean) => void;
  /** Dominant colour axis for connections — session/UI pref, not persisted to file.
   *  "signal" = signal-family colour (default); "layer" = the connection's layer colour;
   *  "none" = neutral grey (signal recedes for a clean structural read). */
  colorBy: ColorBy;
  setColorBy: (axis: ColorBy) => void;
  /** How a layer's colour renders on its member devices — session/UI pref, not persisted to
   *  file. Paired with a text layer chip on the node header so colour is never the only cue. */
  layerColorMode: LayerColorMode;
  setLayerColorMode: (mode: LayerColorMode) => void;
  /** Draw bundled runs (connections sharing a ConnectionData.bundleId) as one trunk —
   *  session/UI pref, not persisted to file. A drawing treatment only: each member keeps its
   *  own colour and its own schedule row whether the trunk is shown or not. */
  bundleView: boolean;
  setBundleView: (on: boolean) => void;
  /** Wording level for signal names, port detail and status words — session/UI pref.
   *  Plain hides jargon; it never hides data (colours, counts, lengths, IDs are identical). */
  detailLevel: DetailLevel;
  setDetailLevel: (level: DetailLevel) => void;
  /** How lengths render everywhere (inspector, inventory, run labels, schedule, BOM).
   *  A view pref, not document data — the same file reads metric to one designer and
   *  imperial to the next. `DistanceSettings.unit` still owns the document's own maths. */
  lengthUnitMode: LengthUnitMode;
  setLengthUnitMode: (mode: LengthUnitMode) => void;
  /** Which connections show their cable-ID label: only the selected one, or all of them. */
  cableIdLabelScope: CableIdLabelScope;
  setCableIdLabelScope: (scope: CableIdLabelScope) => void;
  /** Pause all canvas motion from inside the app, on top of the OS `prefers-reduced-motion`.
   *  Either source pausing is enough — the app setting can only ADD calm, never remove it. */
  reduceMotion: boolean;
  setReduceMotion: (on: boolean) => void;
  /** Whole-interface scale (0.5–1.5). An accessibility/density control, independent of canvas
   *  zoom: canvas zoom scales the drawing, this scales the chrome around it. */
  uiScale: number;
  setUiScale: (scale: number) => void;
  /** Show each device's artwork/symbol glyph on the canvas — session/UI pref. */
  showArtwork: boolean;
  setShowArtwork: (on: boolean) => void;
  /** Per-device colour override, keyed by node id. Falls back to the signal-derived class
   *  colour when a device has no entry. Session/UI pref, not persisted to file. */
  nodeColors: Record<string, string>;
  /** Set (or, with `null`, clear) the colour override on every listed device at once. */
  setNodeColor: (ids: readonly string[], color: string | null) => void;
  /** Per-device detail tier, keyed by node id. Overrides the global `nodeCompact` baseline. */
  nodeView: Record<string, NodeViewTier>;
  /** Set (or, with `null`, reset to the baseline) the tier on every listed device at once. */
  setNodeView: (ids: readonly string[], tier: NodeViewTier | null) => void;
  /** Show loudspeaker coverage wedges in plan view — session/UI pref, not persisted to file. */
  coverageVisible: boolean;
  setCoverageVisible: (visible: boolean) => void;

  /** Guided venue-setup coach panel open state — ephemeral session UI, not persisted to file. */
  guidedSetupOpen: boolean;
  setGuidedSetupOpen: (open: boolean) => void;

  /** Per-item Layers/Groups overrides — ephemeral session view state, NOT persisted to file.
   *  Hidden/locked node ids cascade to children + group members (via resolveNodeVisibility);
   *  soloLayerId shows only that layer's subtree. */
  hiddenNodeIds: string[];
  lockedNodeIds: string[];
  soloLayerId: string | null;
  toggleNodeHidden: (id: string) => void;
  toggleNodeLocked: (id: string) => void;
  setNodesHidden: (ids: string[], hidden: boolean) => void;
  setNodesLocked: (ids: string[], locked: boolean) => void;
  /** Solo a layer (pass the same id again, or null, to clear). */
  setSoloLayer: (layerId: string | null) => void;

  // Floor-plan room shapes
  /** Room whose floor-plan outline is being vertex-edited, or null. */
  editingRoomShapeId: string | null;
  setEditingRoomShape: (id: string | null) => void;
  /** Replace a room's normalized outline. Pass undefined to reset to rectangle. */
  updateRoomShape: (id: string, shape: { x: number; y: number }[] | undefined, recordUndo?: boolean) => void;

  // Venue-CAD / Figma redesign state (schema v43)
  /** Per-unit gear inventory (Phase 4). */
  gearUnits: GearUnit[];
  /** Sanitized custom SVG graphics keyed by id (Phase 6). */
  svgAssets: Record<string, string>;
  /** Document-level tag suggestion pool (Phase 3). */
  tagSuggestions: string[];
  /** Per-field autocomplete suggestion pools (Phase 3). */
  fieldSuggestions: FieldSuggestions;
  /** Validation issue ids the user has dismissed (Phase 1). */
  dismissedIssueIds: string[];
  /** Grid scale + snap settings (Phase 1). */
  gridSettings: GridSettings;
  /** Transport containers (Phase 7). */
  containers: TransportContainer[];
  /** Minimap visibility (per-user; localStorage-backed; not in SchematicFile). */
  showMiniMap: boolean;
  setShowMiniMap: (visible: boolean) => void;
  /** Show validation *warnings* across the app (top-bar pill, canvas dots, Issues badge,
   *  validation panel). Per-user; localStorage-backed; default OFF (warnings are opt-in).
   *  Errors are never gated by this — only warning-severity issues are hidden. */
  showWarnings: boolean;
  setShowWarnings: (visible: boolean) => void;
  /** Merge a patch into the grid settings (persists to file; not undoable). */
  setGridSettings: (patch: Partial<GridSettings>) => void;
  /** Dismiss / restore a validation issue by stable id (persists to file; not undoable). */
  dismissIssue: (id: string) => void;
  undismissIssue: (id: string) => void;
  clearDismissedIssues: () => void;
  /** Merge committed device field values into the persisted suggestion pools (for comboboxes). */
  recordSuggestions: (patch: { tags?: string[]; manufacturer?: string; category?: string; deviceType?: string }) => void;

  // Per-unit gear inventory (Phase 4) — hosted in the Schedule view's Inventory tab
  addGearUnit: (unit: Omit<GearUnit, "id">) => void;
  updateGearUnit: (id: string, patch: Partial<GearUnit>) => void;
  removeGearUnit: (id: string) => void;
  assignGearUnit: (unitId: string, nodeId: string) => void;
  unassignGearUnit: (unitId: string) => void;
  // Custom SVG assets (Phase 6) — addSvgAsset returns the generated asset id
  addSvgAsset: (svg: string) => string;
  removeSvgAsset: (id: string) => void;
  /** Node targeted by the custom-SVG import dialog (device or object), or null. */
  svgImportTargetNodeId: string | null;
  setSvgImportTarget: (nodeId: string | null) => void;
  /** Apply an imported SVG asset to a device (layoutSvgAssetId) or object (svgAssetId). */
  setNodeSvgAsset: (nodeId: string, assetId: string) => void;
  // Layout objects (furniture) + colour zones (Phase 5)
  pendingObjectPlacement: { entry: FurnitureCatalogEntry; svgAssetId?: string } | null;
  setPendingObjectPlacement: (value: { entry: FurnitureCatalogEntry; svgAssetId?: string } | null) => void;
  addObject: (position: { x: number; y: number }, entry: FurnitureCatalogEntry, svgAssetId?: string) => void;
  addZone: (position: { x: number; y: number }, size?: { width: number; height: number }) => void;
  updateObjectData: (id: string, patch: Partial<ObjectData>) => void;
  updateZoneData: (id: string, patch: Partial<ZoneData>) => void;
  // Transport / logistics containers (Phase 7) — hosted in the Schedule view's Logistics tab
  addContainer: (name: string) => void;
  removeContainer: (id: string) => void;
  renameContainer: (id: string, name: string) => void;
  setContainerColor: (id: string, color: string | undefined) => void;
  addItemToContainer: (id: string, item: TransportItem) => void;
  removeItemFromContainer: (id: string, itemKey: string) => void;
  setContainerItemChecked: (id: string, phase: TransportPhase, itemKey: string, checked: boolean) => void;
  clearContainerPhase: (id: string, phase: TransportPhase) => void;

  // Layers (Photoshop-style show/hide/lock)
  layers: SchematicLayer[];
  addLayer: (name: string) => void;
  renameLayer: (id: string, name: string) => void;
  removeLayer: (id: string) => void;
  toggleLayerVisible: (id: string) => void;
  toggleLayerLocked: (id: string) => void;
  /** Set or clear a layer's colour swatch (persists; not undoable). */
  setLayerColor: (id: string, color: string | undefined) => void;
  /** Nest a layer under a parent (or pass null to make it a root). Cycle-guarded:
   *  a layer can never be parented to itself or any of its own descendants. */
  setLayerParent: (layerId: string, parentId: string | null) => void;
  /** True when the layer OR any ancestor is hidden (cascading effective visibility). */
  isLayerEffectivelyHidden: (layerId: string) => boolean;
  /** True when the layer OR any ancestor is locked (cascading effective lock). */
  isLayerEffectivelyLocked: (layerId: string) => boolean;
  /** Move all currently-selected nodes and edges onto a layer. */
  assignSelectionToLayer: (layerId: string) => void;
  /** Group all selected nodes under a new shared groupId (needs 2+ selected). */
  groupSelection: () => void;
  /** Remove group membership from all selected nodes. */
  ungroupSelection: () => void;
  /** Link (or unlink with undefined) a software device to its host computer. */
  setDeviceHost: (deviceId: string, hostId: string | undefined) => void;
  /** Rotate a device's plan-view orientation by a relative delta (deg). Undoable. */
  rotateDevice: (deviceId: string, deltaDeg: number) => void;
  /** Set a device's absolute plan-view rotation/aim (deg). Pass recordUndo=false for
   *  transient drag updates (no undo entry, no autosave); bracket the drag with
   *  pushSnapshot() + saveToLocalStorage() to record one undo step and persist once. */
  setDeviceRotation: (deviceId: string, deg: number, recordUndo?: boolean) => void;
  /** Reorder a node's paint order (z-order) to before/after a same-parent sibling
   *  in the nodes array. No-op across different parents (preserves the parent-before-child
   *  invariant). Undoable + autosaved. */
  reorderNodeZ: (draggedId: string, targetId: string, place: "before" | "after") => void;

  // Custom template organization (#62)
  customTemplateGroups: CustomTemplateGroup[];
  customTemplateOrder: string[];
  customTemplateGroupAssignments: Record<string, string>;
  reorderCustomTemplate: (deviceType: string, targetIndex: number) => void;
  moveCustomTemplateToGroup: (deviceType: string, groupId: string | null) => void;
  addCustomTemplateGroup: (label: string) => string;
  removeCustomTemplateGroup: (groupId: string) => void;
  renameCustomTemplateGroup: (groupId: string, label: string) => void;
  reorderCustomTemplateGroup: (groupId: string, newIndex: number) => void;
  toggleCustomGroupCollapsed: (groupId: string) => void;

  // Category order (#62)
  categoryOrder: string[] | null;  // null = use default CATEGORY_ORDER
  reorderCategory: (category: string, targetIndex: number) => void;
  resetCategoryOrder: () => void;

  // Edge data
  patchEdgeData: (edgeId: string, patch: Partial<import("./types").ConnectionData>) => void;
  batchPatchEdgeData: (changes: { edgeId: string; patch: Partial<import("./types").ConnectionData> }[]) => void;

  // Stub conversion (real React Flow nodes for the labels)
  convertEdgeToStubs: (edgeId: string) => void;
  collapseStubsForEdge: (edgeId: string) => void;

  // Manual edge routing
  setManualWaypoints: (edgeId: string, waypoints: { x: number; y: number }[]) => void;
  clearManualWaypoints: (edgeId: string) => void;
  /** Strip manual waypoints from EVERY connection so the whole schematic re-auto-routes
   *  from scratch. Undoable. Useful for vetting auto-route without resetting edges one by one. */
  clearAllManualWaypoints: () => void;
  deviceContextMenu: { nodeId: string; screenX: number; screenY: number } | null;
  setDeviceContextMenu: (menu: { nodeId: string; screenX: number; screenY: number } | null) => void;
  edgeContextMenu: { edgeId: string; screenX: number; screenY: number; flowX: number; flowY: number } | null;
  roomContextMenu: { nodeId: string; screenX: number; screenY: number } | null;
  stubLabelContextMenu: { nodeId: string; screenX: number; screenY: number } | null;
  portContextMenu: { nodeId: string; portId: string; screenX: number; screenY: number } | null;

  // Centralized edge routing
  routedEdges: Record<string, RoutedEdge>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  routingDebugData: any;
  recomputeRoutes: (rfInstance: ReactFlowInstance) => void;
  computeSimpleRoutes: (rfInstance: ReactFlowInstance) => void;

  // Auto-route toggle
  autoRoute: boolean;
  toggleAutoRoute: () => void;
  /** Transient stash of per-edge waypoint state captured when toggling auto-route ON.
   *  Consumed (and cleared) when toggling back OFF so edges revert to their pre-toggle appearance.
   *  null = had no waypoints (L-shape), object = had waypoints. Not persisted/exported. */
  _edgeWaypointStash: Record<string, { manualWaypoints: { x: number; y: number }[]; autoRouteWaypoints?: boolean } | null> | null;
  /** When true, the auto-route-off confirmation dialog is shown */
  autoRouteConfirmPending: boolean;
  /** Complete the pending toggle-off with the user's choice (true = keep A* routes, false = restore previous) */
  confirmAutoRouteOff: (preserve: boolean) => void;
  /** Cancel the pending toggle-off (dismiss dialog, auto-route stays ON) */
  cancelAutoRouteOff: () => void;

  // Edge interaction hitbox width (pixels)
  edgeHitboxSize: number;
  setEdgeHitboxSize: (size: number) => void;

  // Debug
  debugEdges: boolean;
  debugShowLabels: boolean;
  debugShowObstacles: boolean;
  debugShowPenalties: boolean;
  debugShowWaypoints: boolean;
  debugShowGrid: boolean;
  toggleDebugEdges: () => void;
  routingParamVersion: number;
  bumpRoutingParams: () => void;

  // Resize snap guides (shown while resizing rooms)
  resizeGuides: import("./snapUtils").GuideLine[];
  setResizeGuides: (guides: import("./snapUtils").GuideLine[]) => void;

  // Demo state — true when the demo schematic was auto-loaded for first-time visitors
  isDemo: boolean;

  // Drag state — edges freeze during drag and recalculate on drop
  isDragging: boolean;
  isRouting: boolean;
  overlapNodeId: string | null;

  // Print view (printView toggle is ephemeral; paper/orientation/scale are persisted)
  printView: boolean;
  printPaperId: string;
  printOrientation: Orientation;
  printScale: number;
  printCustomWidthIn: number;
  printCustomHeightIn: number;
  printOriginOffsetX: number;
  printOriginOffsetY: number;
  // Color key / signal legend for print view
  colorKeyEnabled: boolean;
  colorKeyCorner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  colorKeyColumns: number;
  colorKeyPage: "first" | "last" | "all";
  colorKeyOverrides: Partial<Record<SignalType, boolean>> | undefined;
  cableCosts: Record<string, number> | undefined;
  setCableCost: (key: string, cost: number | undefined) => void;
  // Connection bundles — groups of ≥2 connections sharing one physical trunk (membership on edge.data.bundleId)
  bundles: Record<string, BundleMeta>;
  createBundle: (edgeIds: string[]) => void;
  dissolveBundle: (bundleId: string) => void;
  addToBundle: (bundleId: string, edgeIds: string[]) => void;
  removeFromBundle: (edgeIds: string[]) => void;
  setBundleMeta: (bundleId: string, patch: Partial<BundleMeta>) => void;
  setBundleTrunkWaypoints: (bundleId: string, trunkWaypoints: { x: number; y: number }[]) => void;
  // Room distance + cable-length estimation (#146)
  roomDistances: Record<string, number> | undefined;
  distanceSettings: DistanceSettings | undefined;
  setRoomDistance: (roomIdA: string, roomIdB: string, distance: number | undefined) => void;
  clearRoomDistance: (roomIdA: string, roomIdB: string) => void;
  setDistanceSettings: (partial: Partial<DistanceSettings>) => void;
  setColorKeyEnabled: (v: boolean) => void;
  setColorKeyCorner: (c: "top-left" | "top-right" | "bottom-left" | "bottom-right") => void;
  setColorKeyColumns: (n: number) => void;
  setColorKeyPage: (p: "first" | "last" | "all") => void;
  setColorKeyOverrides: (o: Partial<Record<SignalType, boolean>> | undefined) => void;
  setPrintView: (v: boolean) => void;
  setPrintPaperId: (id: string) => void;
  setPrintOrientation: (o: Orientation) => void;
  setPrintScale: (s: number) => void;
  setPrintCustomWidthIn: (w: number) => void;
  setPrintCustomHeightIn: (h: number) => void;
  setPrintOriginOffset: (x: number, y: number) => void;

  // Title block
  titleBlock: TitleBlock;
  setTitleBlock: (tb: TitleBlock) => void;
  titleBlockLayout: TitleBlockLayout;
  setTitleBlockLayout: (layout: TitleBlockLayout) => void;

  // Signal colors & line styles
  signalColors: Partial<Record<SignalType, string>> | undefined;
  setSignalColors: (colors: Record<SignalType, string>) => void;
  signalLineStyles: Partial<Record<SignalType, LineStyle>> | undefined;
  setSignalLineStyles: (styles: Partial<Record<SignalType, LineStyle>>) => void;

  // Report layouts (pack list PDF settings, etc.)
  reportLayouts: Record<string, unknown>;
  setReportLayout: (key: string, layout: unknown) => void;
  reportHiddenColumns: Record<string, string[]>;
  setReportHiddenColumns: (tableId: string, columnIds: string[]) => void;
  globalReportHeaderLayout: TitleBlockLayout | null;
  globalReportFooterLayout: TitleBlockLayout | null;
  setGlobalReportHeaderLayout: (layout: TitleBlockLayout) => void;
  setGlobalReportFooterLayout: (layout: TitleBlockLayout) => void;

  // View options
  hiddenSignalTypes: string;
  hiddenPinSignalTypes: string;
  hideUnconnectedPorts: boolean;
  templateHiddenSignals: Record<string, SignalType[]>;
  toggleSignalTypeVisibility: (type: SignalType) => void;
  togglePinSignalTypeVisibility: (type: SignalType) => void;
  setHideUnconnectedPorts: (hide: boolean) => void;
  showPortCounts: boolean;
  setShowPortCounts: (show: boolean) => void;
  setTemplateHiddenSignals: (templateId: string, hidden: SignalType[]) => void;
  showAllSignalTypes: () => void;

  // Template presets
  templatePresets: Record<string, TemplatePreset>;
  setTemplatePreset: (templateId: string, preset: TemplatePreset | null) => void;

  // Favorite templates
  favoriteTemplates: string[];
  toggleFavoriteTemplate: (templateKey: string) => void;

  // Recently-used templates (most-recent-first, capped) for quick re-add
  recentTemplates: string[];
  pushRecentTemplate: (templateKey: string) => void;

  // Scroll behavior (#19)
  scrollConfig: ScrollConfig;
  setScrollConfig: (v: ScrollConfig) => void;

  // Cable naming scheme (#1)
  cableNamingScheme: "sequential" | "type-prefix";
  setCableNamingScheme: (v: "sequential" | "type-prefix") => void;

  // Label case preference — purely a display-time transform; data is never mutated.
  labelCase: LabelCaseMode;
  setLabelCase: (mode: LabelCaseMode) => void;

  // Left-drag canvas behavior: select box (default) or pan viewport.
  panMode: PanMode;
  setPanMode: (mode: PanMode) => void;

  // Active canvas tool (left tool rail) + device-library drawer pin state.
  activeTool: ToolId;
  setActiveTool: (tool: ToolId) => void;
  /** Bumped to request the quick/bulk-add spotlight open at viewport centre. */
  quickAddNonce: number;
  requestQuickAdd: () => void;
  deviceDrawerPinned: boolean;
  setDeviceDrawerPinned: (pinned: boolean) => void;

  // ISO 4217 currency code for cost display in reports (#158).
  currency: string;
  setCurrency: (code: string) => void;

  // Project lifecycle status (#P2-007). undefined = treated as Active.
  status: ProjectStatus | undefined;
  setProjectStatus: (status: ProjectStatus | undefined) => void;

  // Incompatible connection dialog (#6)
  pendingIncompatibleConnection: {
    connection: Connection;
    sourcePort: Port;
    targetPort: Port;
    reason: "signal-mismatch" | "connector-mismatch";
  } | null;
  dismissIncompatibleDialog: () => void;
  /** Set (or, with `null`, clear) the multicore/snake bundle on the listed connections.
   *  Bundling is presentation + grouping only: every member stays its own Connection with its
   *  own colour, cable ID and schedule row — a 6-run snake is still six cables to pull. */
  bundleConnections: (edgeIds: readonly string[], bundleId: string | null) => void;
  /** Bundle the currently-selected connections into one trunk. No-op below two connections. */
  bundleSelectedConnections: () => void;
  /** Remove the selected connections from their bundle. */
  unbundleSelectedConnections: () => void;
  forceIncompatibleConnection: () => void;
  insertAdapterBetween: (template: DeviceTemplate) => void;

  // Adapter-create flow (IncompatibleConnectionDialog "+ Create adapter")
  /** The incompatible connection an in-progress custom adapter is being built to bridge.
   *  Non-null while the DeviceEditor is open in adapter-create mode. */
  adapterCreationRequest: {
    connection: Connection;
    sourcePort: Port;
    targetPort: Port;
    reason: "signal-mismatch" | "connector-mismatch";
  } | null;
  /** Close the incompatible dialog and open the DeviceEditor prefilled as a two-port
   *  adapter (input = source signal/connector, output = target signal/connector). On save
   *  the editor calls `completeAdapterCreation`; on cancel it calls `cancelAdapterCreation`. */
  beginAdapterCreation: (pending: {
    connection: Connection;
    sourcePort: Port;
    targetPort: Port;
    reason: "signal-mismatch" | "connector-mismatch";
  }) => void;
  /** Finish adapter-create: place the user-defined adapter template between the two ports
   *  (reuses `insertAdapterBetween`) and clear the request. */
  completeAdapterCreation: (template: DeviceTemplate) => void;
  /** Abandon adapter-create without inserting anything. */
  cancelAdapterCreation: () => void;

  // Internal wiring (intra-device port routing, DeviceData.internalLinks)
  /** Add an intra-device internal link (endpoints are port LABELS). Idempotent. */
  addInternalLink: (deviceId: string, link: { from: string; to: string }) => void;
  /** Remove the intra-device internal link matching from/to (endpoints are port LABELS). */
  removeInternalLink: (deviceId: string, link: { from: string; to: string }) => void;

  // ── Channel ⇄ connector model (R2-3/4/5) ──────────────────────────────────
  // Logical channels + physical/bus connectors + patchbay points on DeviceData,
  // and internal routes as same-device Connections. All immutable + undoable.
  /** Append a logical channel (caller supplies a stable device-local id). Idempotent by id. */
  addDeviceChannel: (deviceId: string, channel: DeviceChannel) => void;
  /** Patch a channel's fields (id is immutable). No-op if the channel is absent. */
  updateDeviceChannel: (deviceId: string, channelId: string, patch: Partial<Omit<DeviceChannel, "id">>) => void;
  /** Remove a channel and drop it from every connector's `carries`. */
  removeDeviceChannel: (deviceId: string, channelId: string) => void;
  /** Append a connector — role "physical" (a jack) or "bus" (a virtual bus). Idempotent by id. */
  addDeviceConnector: (deviceId: string, connector: DeviceConnector) => void;
  /** Patch a connector's fields (id is immutable). No-op if absent. */
  updateDeviceConnector: (deviceId: string, connectorId: string, patch: Partial<Omit<DeviceConnector, "id">>) => void;
  /** Remove a connector. Does not delete the channels it carried (they may be on others). */
  removeDeviceConnector: (deviceId: string, connectorId: string) => void;
  /** Create an internal route (same-device Connection, internal:true) between two of the
   *  device's own channels/buses (endpoint ids = channelId or bus connectorId). Idempotent. */
  addInternalRoute: (deviceId: string, fromId: string, toId: string) => void;
  /** Delete the internal route matching from/to on this device. */
  removeInternalRoute: (deviceId: string, fromId: string, toId: string) => void;
  /** Internal routes (same-device internal Connections) on a device, source→sink. */
  listInternalRoutes: (deviceId: string) => ConnectionEdge[];
  /** Virtual buses (connectors with role "bus") on a device. */
  listDeviceBuses: (deviceId: string) => DeviceConnector[];
  /** Set a patchbay point's normalling mode. No-op if the device has no such point. */
  setPatchPointMode: (deviceId: string, pointId: string, mode: NormallingMode) => void;
  /** Devices whose internal-routing lane is expanded on the canvas (C6). Session/UI
   *  state — never serialized into the SchematicFile; collapsed by default. */
  expandedRoutingDeviceIds: string[];
  /** Toggle a device's internal-routing lane open/closed on the canvas (immutable). */
  toggleDeviceRoutingExpanded: (deviceId: string) => void;

  // Multi-document project tabs (session/live state — never serialized into SchematicFile)
  /** Open project tabs. The ACTIVE doc's live content is the main store; each entry's
   *  `snapshot` is authoritative only for INACTIVE docs (refreshed on switch-away). */
  documents: ProjectDocument[];
  /** Id of the currently-live document within `documents`. */
  activeDocumentId: string;
  /** Create a new blank document, snapshot the current one, and switch to the new tab. */
  newDocument: (name?: string) => void;
  /** Snapshot the live document into its tab, then hydrate the target document. No-op if
   *  the target is already active or unknown. */
  switchDocument: (id: string) => void;
  /** Rename a document tab (updates the live schematic name too when it's the active doc). */
  renameDocument: (id: string, name: string) => void;
  /** Close a tab. Blocks closing the last document; switches to a neighbour if the active
   *  document is closed. */
  closeDocument: (id: string) => void;
  /** Tab metadata for rendering the tab bar (active doc's name reflects live state). */
  listDocuments: () => { id: string; name: string }[];

  // Adapter visibility (#adapter-overhaul)
  hideAdapters: boolean;
  setHideAdapters: (hide: boolean) => void;
  /** Set of node IDs for adapters that should be visually hidden */
  hiddenAdapterNodeIds: Set<string>;
  /** Set of edge IDs that are the "hidden half" of a virtual edge pair (no route, invisible) */
  hiddenVirtualEdgeIds: Set<string>;
  /** Map from edge ID to gradient colors for virtual edges bridging different signal types */
  virtualEdgeGradients: Record<string, { sourceColor: string; targetColor: string }>;

  // Line jumps (#18)
  showLineJumps: boolean;
  setShowLineJumps: (show: boolean) => void;


  /** MCP bridge (Beta): lets Claude read/edit the schematic live via the local
   *  MCP server. Persisted editor prefs; status is ephemeral, set by the bridge. */
  mcpBridgeEnabled: boolean;
  mcpBridgeToken: string;
  mcpBridgePort: number;
  mcpBridgeStatus: "off" | "connecting" | "connected" | "error";
  mcpBridgeStatusDetail?: string;
  setMcpBridgeEnabled: (enabled: boolean) => void;
  setMcpBridgeToken: (token: string) => void;
  setMcpBridgePort: (port: number) => void;

  /** Rack: show connector-level face-plate detail (default off; advanced) */
  showFacePlateDetail: boolean;
  setShowFacePlateDetail: (show: boolean) => void;

  // Connection labels (#5, #61)
  /** @deprecated Use showCableIdLabels instead */
  showConnectionLabels: boolean;
  setShowConnectionLabels: (show: boolean) => void;
  showCableIdLabels: boolean;
  setShowCableIdLabels: (show: boolean) => void;
  showCustomLabels: boolean;
  setShowCustomLabels: (show: boolean) => void;
  cableIdGap: number;
  setCableIdGap: (gap: number) => void;
  cableIdMidOffset: number;
  setCableIdMidOffset: (offset: number) => void;
  cableIdLabelMode: "endpoint" | "midpoint";
  setCableIdLabelMode: (mode: "endpoint" | "midpoint") => void;
  stubLabelShowPort: boolean;
  setStubLabelShowPort: (show: boolean) => void;
  stubLabelShowRoom: boolean;
  setStubLabelShowRoom: (show: boolean) => void;
  stubLabelPageMode: StubLabelPageMode;
  setStubLabelPageMode: (mode: StubLabelPageMode) => void;
  useShortNames: boolean;
  setUseShortNames: (use: boolean) => void;
  wrapDeviceLabels: boolean;
  setWrapDeviceLabels: (wrap: boolean) => void;
  patchStubLabelData: (nodeId: string, patch: Partial<import("./types").StubLabelData>) => void;
  cableIdMap: Record<string, string>;
  recomputeCableIds: () => void;

  // Template import/export (#12/#26)
  exportCustomTemplates: () => DeviceTemplate[];
  importCustomTemplates: (templates: DeviceTemplate[]) => void;

  // Cloud storage
  cloudSchematicId: string | null;
  cloudSavedAt: string | null;
  setCloudSchematicId: (id: string | null) => void;
  setCloudSavedAt: (ts: string | null) => void;

  // Rack builder pages
  pages: SchematicPage[];
  /** "schematic" for the main signal flow, or a page ID for rack elevation pages */
  activePage: string;
  setActivePage: (pageId: string) => void;
  addRackPage: (label: string) => string;
  removeRackPage: (pageId: string) => void;
  renameRackPage: (pageId: string, label: string) => void;
  addRack: (pageId: string, rack: Omit<RackData, "id">) => string;
  removeRack: (pageId: string, rackId: string) => void;
  updateRack: (pageId: string, rackId: string, patch: Partial<RackData>) => void;
  addRackPlacement: (pageId: string, placement: Omit<RackDevicePlacement, "id">) => string;
  /** Drop a device into a rack, routing to direct/half/shelf-mount based on its physical
   *  dimensions (see `inferRackForm`). Returns the resulting placement id, or null on
   *  rejection (oversize device). For half-rack form, `preferredHalfRackSide` honors the
   *  cursor's intent at drop time and only flips if that side is occupied. */
  addPlacementSmart: (
    pageId: string,
    rackId: string,
    deviceNodeId: string,
    uPosition: number,
    face: "front" | "rear",
    preferredHalfRackSide?: "left" | "right",
  ) => { ok: true; placementId: string; shelfId?: string } | { ok: false; reason: "oversize" | "no-page" | "no-device" };
  removeRackPlacement: (pageId: string, placementId: string) => void;
  updateRackPlacement: (pageId: string, placementId: string, patch: Partial<RackDevicePlacement>) => void;
  addRackAccessory: (pageId: string, accessory: Omit<RackAccessory, "id">) => string;
  updateRackAccessory: (pageId: string, accessoryId: string, patch: Partial<RackAccessory>) => void;
  removeRackAccessory: (pageId: string, accessoryId: string) => void;
  /** Remove a shelf with its mounted devices, returning them to the unracked pool. */
  removeRackAccessoryWithOccupants: (pageId: string, accessoryId: string) => void;
  /** Mount a device on a shelf accessory (face/uPosition inherited from the shelf). */
  addShelfMountedDevice: (pageId: string, shelfId: string, deviceNodeId: string) => string | null;
  /** Check if a U range is available in a rack for placement */
  isRackSlotAvailable: (pageId: string, rackId: string, uPosition: number, heightU: number, face: "front" | "rear", halfRackSide?: "left" | "right", excludePlacementId?: string, excludeAccessoryId?: string) => boolean;
  /** Link a schematic room to a rack-builder rack (and update both sides atomically). */
  linkRoomToRack: (roomId: string, pageId: string, rackId: string) => void;
  /** Remove the link between a room and its rack. */
  unlinkRoom: (roomId: string) => void;
  // Print sheet page CRUD
  addPrintSheetPage: (label?: string) => string;
  removePrintSheetPage: (pageId: string) => void;
  renamePrintSheetPage: (pageId: string, label: string) => void;
  duplicateRackPage: (pageId: string) => string;
  duplicatePrintSheetPage: (pageId: string) => string;
  addViewport: (pageId: string, viewport: Omit<PrintViewport, "id">) => string;
  updateViewport: (pageId: string, viewportId: string, patch: Partial<PrintViewport>) => void;
  removeViewport: (pageId: string, viewportId: string) => void;
  setPrintSheetPaper: (pageId: string, paperId: string, orientation: "landscape" | "portrait", customWidthIn?: number, customHeightIn?: number) => void;
  /** Move a rack (and all its placements + accessories) from one rack-elevation page to another. */
  moveRackToPage: (srcPageId: string, rackId: string, dstPageId: string) => void;

  // Local file handle (File System Access API — Chromium only, not persisted)
  fileHandle: FileSystemFileHandle | null;
  setFileHandle: (handle: FileSystemFileHandle | null) => void;

  // Online / offline state
  isOnline: boolean;
  setIsOnline: (online: boolean) => void;

  // Toasts
  toasts: Toast[];
  addToast: (message: string, type: Toast["type"], durationMs?: number) => void;
  removeToast: (id: string) => void;

  // Persistence
  saveToLocalStorage: () => void;
  loadFromLocalStorage: () => boolean;
  exportToJSON: () => SchematicFile;
  importFromJSON: (data: SchematicFile) => void;
  importCsvData: (newNodes: SchematicNode[], newEdges: ConnectionEdge[]) => void;
  newSchematic: (templateData?: SchematicFile) => void;
  setSchematicName: (name: string) => void;
}

let nodeIdCounter = 0;
function nextNodeId(): string {
  return `device-${++nodeIdCounter}`;
}

let edgeIdCounter = 0;
function nextEdgeId(existingEdges: Iterable<Pick<ConnectionEdge, "id">> = []): string {
  const usedIds = Array.from(existingEdges, (edge) => edge.id);
  const allocated = allocateEdgeId(usedIds, edgeIdCounter);
  edgeIdCounter = allocated.counter;
  return allocated.id;
}

function ensureUniqueEdgeIds(edges: ConnectionEdge[]): ConnectionEdge[] {
  const result = uniquifyEdgeIds(edges, edgeIdCounter);
  edgeIdCounter = result.counter;
  return result.edges as ConnectionEdge[];
}

let roomIdCounter = 0;
function nextRoomId(): string {
  return `room-${++roomIdCounter}`;
}

let noteIdCounter = 0;
function nextNoteId(): string {
  return `note-${++noteIdCounter}`;
}

let rackPageIdCounter = 0;
function nextRackPageId(): string {
  return `rackpage-${++rackPageIdCounter}`;
}

let rackIdCounter = 0;
function nextRackId(): string {
  return `rack-${++rackIdCounter}`;
}

let placementIdCounter = 0;
function nextPlacementId(): string {
  return `rp-${++placementIdCounter}`;
}

let accessoryIdCounter = 0;
function nextAccessoryId(): string {
  return `ra-${++accessoryIdCounter}`;
}

let printSheetIdCounter = 0;
function nextPrintSheetId(): string {
  return `printsheet-${++printSheetIdCounter}`;
}

let viewportIdCounter = 0;
function nextViewportId(): string {
  return `viewport-${++viewportIdCounter}`;
}

/** Apply fn to the rack-elevation page with the given id; leave other pages untouched. */
function mapElevationPage(pages: SchematicPage[], pageId: string, fn: (p: RackElevationPage) => RackElevationPage): SchematicPage[] {
  return pages.map((p) => (p.id === pageId && p.type === "rack-elevation") ? fn(p) : p);
}

/** Sync rack-related counters from pages data. */
function syncRackCounters(pages: SchematicPage[]) {
  for (const page of pages) {
    const pm = page.id.match(/^rackpage-(\d+)$/);
    if (pm) rackPageIdCounter = Math.max(rackPageIdCounter, Number(pm[1]));
    if (page.type === "print-sheet") {
      // Arrays default to [] — an older/partial page missing these would throw
      // "not iterable" here, AFTER importFromJSON already loaded the schematic,
      // surfacing to callers as a false "Invalid schematic file." (#176)
      for (const vp of page.viewports ?? []) {
        const vm = vp.id.match(/^viewport-(\d+)$/);
        if (vm) viewportIdCounter = Math.max(viewportIdCounter, Number(vm[1]));
        const sm = page.id.match(/^printsheet-(\d+)$/);
        if (sm) printSheetIdCounter = Math.max(printSheetIdCounter, Number(sm[1]));
      }
      continue;
    }
    for (const rack of page.racks ?? []) {
      const rm = rack.id.match(/^rack-(\d+)$/);
      if (rm) rackIdCounter = Math.max(rackIdCounter, Number(rm[1]));
    }
    for (const p of page.placements ?? []) {
      const pm2 = p.id.match(/^rp-(\d+)$/);
      if (pm2) placementIdCounter = Math.max(placementIdCounter, Number(pm2[1]));
    }
    for (const a of page.accessories ?? []) {
      const am = a.id.match(/^ra-(\d+)$/);
      if (am) accessoryIdCounter = Math.max(accessoryIdCounter, Number(am[1]));
    }
  }
}

/** Sync counters so new IDs never collide with existing ones. */
function syncCounters(nodes: SchematicNode[], edges: ConnectionEdge[]) {
  for (const n of nodes) {
    const dm = n.id.match(/^device-(\d+)$/);
    if (dm) nodeIdCounter = Math.max(nodeIdCounter, Number(dm[1]));
    const rm = n.id.match(/^room-(\d+)$/);
    if (rm) roomIdCounter = Math.max(roomIdCounter, Number(rm[1]));
    const nm = n.id.match(/^note-(\d+)$/);
    if (nm) noteIdCounter = Math.max(noteIdCounter, Number(nm[1]));
  }
  for (const e of edges) {
    edgeIdCounter = maxEdgeCounterFromIds([e.id], edgeIdCounter);
  }
}

let clipboard: Clipboard | null = null;
const PASTE_GAP = 20;

// Undo/redo history
interface Snapshot {
  nodes: SchematicNode[];
  edges: ConnectionEdge[];
  pages: SchematicPage[];
  bundles: Record<string, BundleMeta>;
  autoRoute?: boolean;
}
const MAX_HISTORY = 50;
const undoStack: Snapshot[] = [];
const redoStack: Snapshot[] = [];

/** If set, the next pushUndo call uses this instead of the passed snapshot. */
let pendingUndoSnapshot: Snapshot | null = null;
let liveControlBatchSnapshot: Snapshot | null = null;
let liveControlBatchDepth = 0;

/** Edge ID being reconnected — excluded from isValidConnection duplicate checks. */
let _reconnectingEdgeId: string | null = null;
export function setReconnectingEdgeId(id: string | null) {
  _reconnectingEdgeId = id;
}

function pushUndo(partial: { nodes: SchematicNode[]; edges: ConnectionEdge[]; autoRoute?: boolean }) {
  const liveState = useSchematicStore?.getState?.();
  const pages = liveState?.pages ?? [];
  const bundles = liveState?.bundles ?? {};
  const snapshot: Snapshot = { ...partial, pages, bundles };
  if (liveControlBatchDepth > 0) {
    liveControlBatchSnapshot ??= structuredClone(pendingUndoSnapshot ?? snapshot);
    pendingUndoSnapshot = null;
    return;
  }
  undoStack.push(structuredClone(pendingUndoSnapshot ?? snapshot));
  pendingUndoSnapshot = null;
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0; // clear redo on new action
  // Sync reactive counters so undo/redo buttons stay in sync
  useSchematicStore.setState({ undoSize: undoStack.length, redoSize: 0 });
}

// ── Async routing (Web Worker) plumbing ──────────────────────────────────
// recomputeRoutes posts a seq-tagged request to the routing worker and stashes the main-thread-only
// context (virtual-edge remap + adapter visibility) here; applyRoutingResult consumes it when the
// matching result returns. Coalescing in routingClient means only the newest request actually runs,
// so we discard any result whose seq isn't the latest we posted.
let routeSeq = 0;
let routingHandlerRegistered = false;
interface RouteApplyCtx {
  seq: number;
  virtualEdgeSources: Map<string, { primaryEdgeId: string; secondaryEdgeId: string; adapterNodeId: string }>;
  hiddenAdapterNodeIds: Set<string>;
  hiddenVirtualEdgeIds: Set<string>;
  virtualEdgeGradients: Record<string, { sourceColor: string; targetColor: string }>;
}
let pendingRouteCtx: RouteApplyCtx | null = null;

function applyRoutingResult(r: RoutingResult): void {
  // Discard stale/superseded results — only the latest posted seq's context is live.
  if (!pendingRouteCtx || r.seq !== pendingRouteCtx.seq) return;
  const ctx = pendingRouteCtx;
  const state = useSchematicStore.getState();
  // Auto-route was switched off after this request was posted — the simple (L-shape) routes are
  // already in place; drop the stale A* result rather than clobbering them.
  if (!state.autoRoute) {
    useSchematicStore.setState({ isRouting: false });
    return;
  }
  const results = r.routes;

  // Re-publish the debug artifacts (the worker computed them in its own globalThis).
  (globalThis as Record<string, unknown>).__routingReport = r.routingReport ?? undefined;

  // Map virtual edge routes (hidden adapters) back to their primary real edge IDs.
  for (const [virtualId, mapping] of ctx.virtualEdgeSources) {
    const route = results[virtualId];
    if (route) {
      results[mapping.primaryEdgeId] = { ...route, edgeId: mapping.primaryEdgeId };
      delete results[virtualId];
    }
  }

  if (r.overBudget) {
    state.addToast("Auto-routing disabled — schematic is too large for real-time routing", "info");
  }

  // Normalize edge zIndex: boost line-jump-hop edges to 1, everyone else 0.
  const hopEdgeIds = new Set<string>();
  if (state.showLineJumps) {
    for (const [edgeId, routed] of Object.entries(results)) {
      if (routed.crossingPoints && routed.crossingPoints.length > 0) hopEdgeIds.add(edgeId);
    }
  }
  const updatedEdges = state.edges.map((e) =>
    hopEdgeIds.has(e.id) ? { ...e, zIndex: 1 } : { ...e, zIndex: 0 },
  );

  useSchematicStore.setState({
    routedEdges: results,
    routingDebugData: r.routingDebug ?? null,
    edges: updatedEdges,
    hiddenAdapterNodeIds: ctx.hiddenAdapterNodeIds,
    hiddenVirtualEdgeIds: ctx.hiddenVirtualEdgeIds,
    virtualEdgeGradients: ctx.virtualEdgeGradients,
    isRouting: false,
    ...(r.overBudget ? { autoRoute: false } : {}),
  });
}

function clonePorts(ports: Port[]): Port[] {
  const prefix = `p${Date.now()}`;
  return ports.map((p, i) => {
    const clone: Port = { ...p, id: `${prefix}-${i}` };
    // Deep clone nested objects
    if (p.capabilities) clone.capabilities = { ...p.capabilities };
    if (p.networkConfig) clone.networkConfig = { ...p.networkConfig };
    if (p.activeConfig) clone.activeConfig = { ...p.activeConfig };
    return clone;
  });
}

/** Clone ports for a card installed in a slot, namespacing IDs and setting section. */
function cloneCardPorts(ports: Port[], slotId: string, slotLabel: string): Port[] {
  const prefix = `slot-${slotId}-${Date.now()}`;
  return ports.map((p, i) => {
    const clone: Port = { ...p, id: `${prefix}-${i}`, section: slotLabel };
    if (p.capabilities) clone.capabilities = { ...p.capabilities };
    if (p.networkConfig) clone.networkConfig = { ...p.networkConfig };
    if (p.activeConfig) clone.activeConfig = { ...p.activeConfig };
    return clone;
  });
}

/**
 * Recursively process template slots, including sub-slots on expansion cards.
 * Returns a flat list of InstalledSlots (with parentSlotId for nesting) and
 * all ports from installed cards.
 */
function processTemplateSlots(
  templateSlots: SlotDefinition[],
  parentSlotId?: string,
  parentLabel?: string,
): { installedSlots: InstalledSlot[]; ports: Port[] } {
  const installedSlots: InstalledSlot[] = [];
  const ports: Port[] = [];

  for (const slotDef of templateSlots) {
    const fullSlotId = parentSlotId ? `${parentSlotId}/${slotDef.id}` : slotDef.id;
    const displayLabel = parentLabel ? `${parentLabel} > ${slotDef.label}` : slotDef.label;
    const cardTpl = slotDef.defaultCardId ? getTemplateById(slotDef.defaultCardId) : undefined;

    if (cardTpl) {
      const cardPorts = cloneCardPorts(cardTpl.ports, fullSlotId, displayLabel);
      ports.push(...cardPorts);

      const slot: InstalledSlot = {
        slotId: fullSlotId,
        label: slotDef.label,
        slotFamily: slotDef.slotFamily,
        ...(parentSlotId ? { parentSlotId } : {}),
        ...(slotDef.hideWhenEmpty ? { hideWhenEmpty: true } : {}),
        cardTemplateId: cardTpl.id,
        cardLabel: cardTpl.label,
        cardManufacturer: cardTpl.manufacturer,
        cardModelNumber: cardTpl.modelNumber,
        cardUnitCost: cardTpl.unitCost,
        portIds: cardPorts.map((p) => p.id),
      };
      installedSlots.push(slot);

      // Recurse into card's sub-slots (e.g. SFP cages on a network module)
      if (cardTpl.slots && cardTpl.slots.length > 0) {
        const nested = processTemplateSlots(cardTpl.slots, fullSlotId, displayLabel);
        installedSlots.push(...nested.installedSlots);
        ports.push(...nested.ports);
      }
    } else {
      installedSlots.push({
        slotId: fullSlotId,
        label: slotDef.label,
        slotFamily: slotDef.slotFamily,
        ...(parentSlotId ? { parentSlotId } : {}),
        ...(slotDef.hideWhenEmpty ? { hideWhenEmpty: true } : {}),
        portIds: [],
      });
    }
  }

  return { installedSlots, ports };
}

/** Auto-number devices that share a baseLabel. Returns a new array if anything changed. */
function renumberNodes(nodes: SchematicNode[]): SchematicNode[] {
  // Group by baseLabel (only device nodes have this)
  const groups = new Map<string, SchematicNode[]>();
  for (const n of nodes) {
    if (n.type !== "device") continue;
    const baseLabel = (n.data as DeviceData).baseLabel;
    if (!baseLabel) continue;
    const group = groups.get(baseLabel) ?? [];
    group.push(n);
    groups.set(baseLabel, group);
  }

  // Build id→newLabel map
  const labelUpdates = new Map<string, string>();
  for (const [base, group] of groups) {
    if (group.length === 1) {
      // Only one — use base name with no number
      if (group[0].data.label !== base) {
        labelUpdates.set(group[0].id, base);
      }
    } else {
      // Multiple — number them in order of position (top-left first)
      group.sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
      group.forEach((n, i) => {
        const numbered = `${base} ${i + 1}`;
        if (n.data.label !== numbered) {
          labelUpdates.set(n.id, numbered);
        }
      });
    }
  }

  if (labelUpdates.size === 0) return nodes;
  return nodes.map((n) => {
    const newLabel = labelUpdates.get(n.id);
    return newLabel ? { ...n, data: { ...n.data, label: newLabel } } as SchematicNode : n;
  });
}

/**
 * Build a fresh DeviceNode for a template at a position, applying any project
 * preset for that template. Pure aside from nextNodeId() — shared by addDevice
 * (single) and addDevices (batch) so placement stays identical across both paths.
 */
function createDeviceNode(
  template: DeviceTemplate,
  position: { x: number; y: number },
  templatePresets: Record<string, TemplatePreset>,
): DeviceNode {
  const preset = template.id ? templatePresets[template.id] : undefined;

  let ports: Port[];
  let hiddenPorts: string[] | undefined;
  let color = template.color;

  if (preset) {
    // Clone preset ports, then map preset hiddenPorts through old→new ID mapping
    const cloned = clonePorts(preset.ports);
    const idMap = new Map<string, string>();
    preset.ports.forEach((p, i) => {
      idMap.set(p.id, cloned[i].id);
      // Preserve templatePortId across the preset → placement clone.
      if (p.templatePortId) cloned[i].templatePortId = p.templatePortId;
    });
    ports = cloned;
    hiddenPorts = preset.hiddenPorts?.map((id) => idMap.get(id) ?? id).filter((id) => cloned.some((p) => p.id === id));
    color = preset.color ?? template.color;
  } else {
    ports = clonePorts(template.ports);
    // Stamp templatePortId so sync can reconcile even if port IDs drift.
    ports.forEach((p, i) => { p.templatePortId = template.ports[i].id; });
  }

  // Initialize expansion slots from template (recursively handles sub-slots)
  let installedSlots: InstalledSlot[] | undefined;
  if (template.slots && template.slots.length > 0) {
    const result = processTemplateSlots(template.slots);
    installedSlots = result.installedSlots;
    ports = [...ports, ...result.ports];
  }

  return {
    id: nextNodeId(),
    type: "device",
    position,
    data: {
      label: template.label,
      deviceType: template.deviceType,
      ports,
      color,
      baseLabel: template.label,
      model: template.label,
      ...(template.shortName ? { shortName: template.shortName } : {}),
      ...(template.id ? { templateId: template.id } : {}),
      ...(template.version ? { templateVersion: template.version } : {}),
      ...(template.manufacturer ? { manufacturer: template.manufacturer } : {}),
      ...(template.modelNumber ? { modelNumber: template.modelNumber } : {}),
      ...(template.referenceUrl ? { referenceUrl: template.referenceUrl } : {}),
      ...(template.category ? { category: template.category } : {}),
      ...(template.artworkAssetId ? { artworkAssetId: template.artworkAssetId } : {}),
      ...(template.powerDrawW != null ? { powerDrawW: template.powerDrawW } : {}),
      ...(template.powerCapacityW != null ? { powerCapacityW: template.powerCapacityW } : {}),
      ...(template.voltage ? { voltage: template.voltage } : {}),
      ...(template.poeBudgetW != null ? { poeBudgetW: template.poeBudgetW } : {}),
      ...(template.poeDrawW != null ? { poeDrawW: template.poeDrawW } : {}),
      ...(template.unitCost != null ? { unitCost: template.unitCost } : {}),
      ...(template.thermalBtuh != null ? { thermalBtuh: template.thermalBtuh } : {}),
      ...(template.searchTerms?.length ? { searchTerms: [...template.searchTerms] } : {}),
      ...(template.heightMm != null ? { heightMm: template.heightMm } : {}),
      ...(template.widthMm != null ? { widthMm: template.widthMm } : {}),
      ...(template.depthMm != null ? { depthMm: template.depthMm } : {}),
      ...(template.weightKg != null ? { weightKg: template.weightKg } : {}),
      ...(template.hostname ? { hostname: template.hostname } : {}),
      ...(hiddenPorts && hiddenPorts.length > 0 ? { hiddenPorts } : {}),
      ...(template.isVenueProvided ? { isVenueProvided: true } : {}),
      ...(template.deviceType === "cable-accessory" ? { isCableAccessory: true } : {}),
      ...(template.deviceType === "cable-accessory" &&
        template.ports.some((p) => p.isMulticable && p.connectorType === "none")
        ? { integratedWithCable: true }
        : {}),
      ...(installedSlots && installedSlots.length > 0 ? { slots: installedSlots } : {}),
      // Aux data: carry template's rows, or seed a default {{deviceType}} header row so
      // new placements match the unified aux-data model from schema v27.
      ...(template.auxiliaryData?.length
        ? { auxiliaryData: template.auxiliaryData.map((r) => ({ ...r })) }
        : { auxiliaryData: [{ text: "{{deviceType}}", position: "header" as const }] }),
      // Channel ⇄ connector model (R2): deep-copy so the placed instance owns its
      // own channel/connector/patchbay records (ids stay stable — they're device-local).
      ...(template.channels?.length
        ? { channels: template.channels.map((c) => ({ ...c })) }
        : {}),
      ...(template.connectors?.length
        ? { connectors: template.connectors.map((c) => ({ ...c, carries: [...c.carries] })) }
        : {}),
      ...(template.patchbay?.points.length
        ? { patchbay: { points: template.patchbay.points.map((p) => ({ ...p })) } }
        : {}),
    },
  };
}

/** Ensure parent nodes appear before their children in the array (topological sort). */
function sortNodesParentFirst(nodes: SchematicNode[]): SchematicNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const result: SchematicNode[] = [];
  const visited = new Set<string>();

  function visit(n: SchematicNode) {
    if (visited.has(n.id)) return;
    if (n.parentId && nodeMap.has(n.parentId)) visit(nodeMap.get(n.parentId)!);
    visited.add(n.id);
    result.push(n);
  }

  // Visit rooms first so all rooms precede non-room nodes
  for (const n of nodes) if (n.type === "room") visit(n);
  for (const n of nodes) if (n.type !== "room") visit(n);
  return result;
}

/** Walk parent chain to compute a node's absolute canvas position. */
function getAbsolutePosition(
  nodeId: string,
  nodeMap: Map<string, SchematicNode>,
): { x: number; y: number } {
  const n = nodeMap.get(nodeId);
  if (!n) return { x: 0, y: 0 };
  if (!n.parentId) return n.position;
  const p = getAbsolutePosition(n.parentId, nodeMap);
  return { x: n.position.x + p.x, y: n.position.y + p.y };
}

/** True if ancestorId is an ancestor of childId (prevents circular nesting). */
function isAncestorOf(
  ancestorId: string,
  childId: string,
  nodeMap: Map<string, SchematicNode>,
): boolean {
  let cur = nodeMap.get(childId);
  while (cur?.parentId) {
    if (cur.parentId === ancestorId) return true;
    cur = nodeMap.get(cur.parentId);
  }
  return false;
}

/** Find the smallest-area room whose bounds enclose (centerX, centerY). Skips
 *  self and any descendant (for rooms being reparented). Returns undefined if
 *  no room contains the point. */
function findBestEnclosingRoom(
  candidateId: string,
  candidateIsRoom: boolean,
  centerX: number,
  centerY: number,
  nodes: SchematicNode[],
  nodeMap: Map<string, SchematicNode>,
): SchematicNode | undefined {
  let best: SchematicNode | undefined;
  let bestArea = Infinity;
  for (const n of nodes) {
    if (n.type !== "room") continue;
    if (n.id === candidateId) continue;
    if (candidateIsRoom && isAncestorOf(candidateId, n.id, nodeMap)) continue;
    const rw = n.measured?.width ?? (n.style?.width as number) ?? (n.width as number) ?? 400;
    const rh = n.measured?.height ?? (n.style?.height as number) ?? (n.height as number) ?? 300;
    const absPos = getAbsolutePosition(n.id, nodeMap);
    if (
      centerX >= absPos.x && centerX <= absPos.x + rw &&
      centerY >= absPos.y && centerY <= absPos.y + rh
    ) {
      const area = rw * rh;
      if (area < bestArea) {
        best = n;
        bestArea = area;
      }
    }
  }
  return best;
}

function getPortFromHandle(
  nodes: SchematicNode[],
  nodeId: string,
  handleId: string | null,
): Port | undefined {
  if (!handleId) return undefined;
  const node = nodes.find((n) => n.id === nodeId);
  if (!node || node.type !== "device") return undefined;
  const ports = (node.data as DeviceData).ports;
  // Direct match first
  const direct = ports.find((p) => p.id === handleId);
  if (direct) return direct;
  // Bidirectional handles: "{portId}-in" / "{portId}-out"
  // Passthrough handles:   "{portId}-rear" / "{portId}-front"
  const baseId = handleId.replace(/-(in|out|rear|front)$/, "");
  return ports.find((p) => p.id === baseId);
}

function removeOrphanedEdges(nodes: SchematicNode[], edges: ConnectionEdge[]): ConnectionEdge[] {
  return edges.filter((e) => {
    const srcNode = nodes.find((n) => n.id === e.source);
    const tgtNode = nodes.find((n) => n.id === e.target);
    if (!srcNode || !tgtNode) return false;
    if (srcNode.type === "device" && !getPortFromHandle(nodes, e.source, e.sourceHandle ?? null)) return false;
    if (tgtNode.type === "device" && !getPortFromHandle(nodes, e.target, e.targetHandle ?? null)) return false;
    return true;
  });
}

/** Unique key for custom template management (order, groups, deletion). */
function templateKey(t: DeviceTemplate): string {
  return t.id ?? t.deviceType;
}

function loadCustomTemplates(): DeviceTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (!raw) return [];
    const templates = JSON.parse(raw) as DeviceTemplate[];
    // Migrate legacy custom templates: move unique key from deviceType to id
    for (const t of templates) {
      if (!t.id && t.deviceType.startsWith("custom-")) {
        t.id = t.deviceType;
      }
    }
    return templates;
  } catch {
    return [];
  }
}

function saveCustomTemplates(templates: DeviceTemplate[]) {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
  } catch {
    // silently fail
  }
}

function loadCustomTemplateMeta(templates: DeviceTemplate[]): CustomTemplateMeta {
  try {
    const raw = localStorage.getItem(TEMPLATE_META_KEY);
    if (raw) return JSON.parse(raw) as CustomTemplateMeta;
  } catch { /* fall through */ }
  // First load: initialize from current template order
  return { groups: [], order: templates.map((t) => templateKey(t)), groupAssignments: {} };
}

function saveCustomTemplateMeta(meta: CustomTemplateMeta) {
  try {
    localStorage.setItem(TEMPLATE_META_KEY, JSON.stringify(meta));
  } catch {
    // silently fail
  }
}

function loadCategoryOrder(): string[] | null {
  try {
    const raw = localStorage.getItem(CATEGORY_ORDER_KEY);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch { return null; }
}

function saveCategoryOrder(order: string[] | null) {
  try {
    if (order) localStorage.setItem(CATEGORY_ORDER_KEY, JSON.stringify(order));
    else localStorage.removeItem(CATEGORY_ORDER_KEY);
  } catch { /* silently fail */ }
}

const _initCustomTemplates = loadCustomTemplates();
const _initCustomMeta = loadCustomTemplateMeta(_initCustomTemplates);

// ── Nested-layer pure helpers (schema v50) ───────────────────────────────────

/** Walk a layer's ancestry via parentId. Returns true if any layer along the chain
 *  (including the layer itself) satisfies `pred`. Guarded against parentId cycles. */
function layerChainSatisfies(
  layers: readonly SchematicLayer[],
  layerId: string,
  pred: (layer: SchematicLayer) => boolean,
): boolean {
  const byId = new Map(layers.map((l) => [l.id, l]));
  const seen = new Set<string>();
  let current = byId.get(layerId);
  while (current && !seen.has(current.id)) {
    if (pred(current)) return true;
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return false;
}

/** True when the layer OR any ancestor is not visible. */
export function isLayerEffectivelyHiddenIn(
  layers: readonly SchematicLayer[],
  layerId: string,
): boolean {
  return layerChainSatisfies(layers, layerId, (l) => !l.visible);
}

/** True when the layer OR any ancestor is locked. */
export function isLayerEffectivelyLockedIn(
  layers: readonly SchematicLayer[],
  layerId: string,
): boolean {
  return layerChainSatisfies(layers, layerId, (l) => l.locked);
}

/** True when re-parenting `layerId` under `parentId` would create a cycle — i.e. the
 *  proposed parent is the layer itself or one of its current descendants. */
function wouldCreateLayerCycle(
  layers: readonly SchematicLayer[],
  layerId: string,
  parentId: string,
): boolean {
  if (layerId === parentId) return true;
  // Walk UP from the proposed parent; if we reach layerId, parentId is a descendant.
  return layerChainSatisfies(layers, parentId, (l) => l.id === layerId);
}

/** A blank SchematicFile at the current schema version — the seed content for a new
 *  project tab (all other fields fill in via importFromJSON's defaults). */
function createBlankSchematicFile(name: string): SchematicFile {
  return {
    version: CURRENT_SCHEMA_VERSION,
    name,
    nodes: [],
    edges: [],
    layers: [{ id: DEFAULT_LAYER_ID, name: "Base", visible: true, locked: false }],
  };
}

export const useSchematicStore = create<SchematicState>((set, get) => ({
  nodes: [],
  edges: [],
  schematicName: "Untitled Schematic",
  loadSeq: 0,
  editingNodeId: null,
  creatingNodeId: null,
  deviceDetailsPageId: null,
  routingMatrixDeviceId: null,
  adapterCreationRequest: null,
  documents: [],
  activeDocumentId: "",
  customTemplates: _initCustomTemplates,
  ownedGear: [],
  ownedCables: [],
  ownedInventory: [],
  gearUnits: [],
  svgAssets: {},
  tagSuggestions: [],
  fieldSuggestions: {},
  dismissedIssueIds: [],
  gridSettings: DEFAULT_GRID_SETTINGS,
  containers: [],
  showMiniMap: readInitialMiniMapVisible(),
  showWarnings: readInitialShowWarnings(),
  layers: [{ id: DEFAULT_LAYER_ID, name: "Base", visible: true, locked: false }],
  recentCustomColors: [],
  showOwnedGearPane: false,
  libraryActiveTab: "devices",
  pendingQuickCreate: null,
  createAddToOwned: readBoolPref(CREATE_ADD_TO_OWNED_KEY, true),
  uiFont: _initUiFont,
  setUiFont: (font) => {
    persistUiFont(font);
    applyUiFont(font);
    set({ uiFont: font });
  },
  pushRecentCustomColor: (hex) => {
    const norm = hex.toLowerCase();
    const next = [norm, ...get().recentCustomColors.filter((c) => c.toLowerCase() !== norm)].slice(0, 8);
    set({ recentCustomColors: next });
    get().saveToLocalStorage();
  },
  customTemplateGroups: _initCustomMeta.groups,
  customTemplateOrder: _initCustomMeta.order,
  customTemplateGroupAssignments: _initCustomMeta.groupAssignments,
  categoryOrder: loadCategoryOrder(),
  routedEdges: {},
  routingDebugData: null,
  deviceContextMenu: null,
  setDeviceContextMenu: (menu) => set({ deviceContextMenu: menu }),
  deviceSwapTarget: null,
  edgeContextMenu: null,
  roomContextMenu: null,
  stubLabelContextMenu: null,
  portContextMenu: null,
  autoRoute: true,
  _edgeWaypointStash: null,
  autoRouteConfirmPending: false,
  edgeHitboxSize: 10,
  panMode: DEFAULT_PAN_MODE,
  debugEdges: false,
  debugShowLabels: true,
  debugShowObstacles: true,
  debugShowPenalties: true,
  debugShowWaypoints: true,
  debugShowGrid: true,
  routingParamVersion: 0,
  resizeGuides: [],
  isDemo: false,
  isDragging: false,
  isRouting: false,
  overlapNodeId: null,
  undoSize: 0,
  redoSize: 0,
  printView: false,
  printPaperId: "arch-d",
  printOrientation: "landscape" as Orientation,
  printScale: 1.0,
  printCustomWidthIn: 24,
  printCustomHeightIn: 36,
  printOriginOffsetX: 0,
  printOriginOffsetY: 0,
  colorKeyEnabled: false,
  colorKeyCorner: "bottom-left" as "top-left" | "top-right" | "bottom-left" | "bottom-right",
  colorKeyColumns: 1,
  colorKeyPage: "all" as "first" | "last" | "all",
  colorKeyOverrides: undefined,
  cableCosts: undefined,
  bundles: {},
  roomDistances: undefined,
  distanceSettings: undefined,
  titleBlock: { showName: "", venue: "", designer: "", engineer: "", date: "", drawingTitle: "", company: "", revision: "", logo: "", customFields: [] },
  titleBlockLayout: createDefaultLayout(),
  signalColors: undefined,
  signalLineStyles: undefined,
  reportLayouts: {},
  reportHiddenColumns: {},
  globalReportHeaderLayout: null,
  globalReportFooterLayout: null,
  hiddenSignalTypes: "",
  hiddenPinSignalTypes: "",
  hideUnconnectedPorts: false,
  showPortCounts: false,
  templateHiddenSignals: {},
  templatePresets: {},
  favoriteTemplates: [],
  recentTemplates: [],
  scrollConfig: { ...DEFAULT_SCROLL_CONFIG },
  cableNamingScheme: "type-prefix" as "sequential" | "type-prefix",
  labelCase: DEFAULT_LABEL_CASE,
  currency: "USD",
  status: undefined,
  showLineJumps: true,
  mcpBridgeEnabled: loadMcpEnabled(),
  mcpBridgeToken: loadMcpToken(),
  mcpBridgePort: loadMcpPort(),
  mcpBridgeStatus: "off",
  mcpBridgeStatusDetail: undefined,
  showFacePlateDetail: false,
  showConnectionLabels: true,
  showCableIdLabels: true,
  showCustomLabels: true,
  cableIdGap: 4,
  cableIdMidOffset: 0,
  cableIdLabelMode: "endpoint" as "endpoint" | "midpoint",
  stubLabelShowPort: DEFAULT_STUB_LABEL_SHOW_PORT,
  stubLabelShowRoom: DEFAULT_STUB_LABEL_SHOW_ROOM,
  stubLabelPageMode: DEFAULT_STUB_LABEL_PAGE_MODE,
  useShortNames: false,
  wrapDeviceLabels: false,
  cableIdMap: {},
  cloudSchematicId: null,
  cloudSavedAt: null,
  fileHandle: null,
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  pendingIncompatibleConnection: null,
  hideAdapters: false,
  hiddenAdapterNodeIds: new Set(),
  hiddenVirtualEdgeIds: new Set(),
  virtualEdgeGradients: {},
  pages: [],
  activePage: "schematic",

  setHideAdapters: (hide) => {
    const state = get();
    // Update node styles so React Flow re-measures hidden/shown adapters
    const updatedNodes = state.nodes.map((n) => {
      if (n.type !== "device") return n;
      const data = n.data as DeviceData;
      if (data.deviceType !== "adapter") return n;
      const visibility = data.adapterVisibility ?? "default";
      if (visibility === "force-show" || visibility === "force-hide") return n;
      // This adapter follows the global toggle — update its style to force RF re-measure
      return hide
        ? { ...n, style: { ...n.style, width: 1, height: 1, opacity: 0, pointerEvents: "none" as const } }
        : { ...n, style: { ...n.style, width: undefined, height: undefined, opacity: undefined, pointerEvents: undefined } };
    });
    set({ hideAdapters: hide, nodes: updatedNodes });
    get().saveToLocalStorage();
  },

  onNodesChange: (changes) => {
    const updated = applyNodeChanges(changes, get().nodes) as SchematicNode[];
    // Keep room zIndex pinned low (React Flow may reset it)
    const normalized = updated.map((n) => {
      if (n.type !== "room") return n;
      const locked = (n.data as import("./types").RoomData).locked;
      return {
        ...n,
        zIndex: -1,
        selectable: !locked,
        className: locked ? "locked" : undefined,
      };
    });
    // Mirror waypoint node positions back to canonical edge.data.manualWaypoints
    // so the router and persistence see drag/multi-select-drag results.
    const hasPositionChange = changes.some((c) => c.type === "position");
    const oldEdges = get().edges;
    const newEdges = hasPositionChange
      ? syncEdgesFromWaypointNodes(oldEdges, normalized)
      : oldEdges;
    set({ nodes: normalized, ...(newEdges !== oldEdges ? { edges: newEdges } : {}) });
    get().saveToLocalStorage();
  },

  onEdgesChange: (changes) => {
    const hasRemove = changes.some((c) => c.type === "remove");
    if (hasRemove) {
      const state = get();
      pushUndo({ nodes: state.nodes, edges: state.edges });
    }
    const newEdges = applyEdgeChanges(changes, get().edges) as ConnectionEdge[];
    if (hasRemove) {
      // Removed edges may have had waypoint nodes — reconcile them away.
      set({ edges: newEdges, nodes: reconcileWaypointNodes(get().nodes, newEdges) });
    } else {
      set({ edges: newEdges });
    }
    get().saveToLocalStorage();
  },

  onConnect: (connection) => {
    const state = get();
    if (!state.isValidConnection(connection)) {
      // Check if the failure is specifically a signal-type mismatch
      const srcPort = getPortFromHandle(state.nodes, connection.source, connection.sourceHandle);
      const tgtPort = getPortFromHandle(state.nodes, connection.target, connection.targetHandle);
      if (srcPort && tgtPort) {
        const canSource = srcPort.direction === "output" || srcPort.direction === "bidirectional";
        const canTarget = tgtPort.direction === "input" || tgtPort.direction === "bidirectional";
        const networkBypass = NETWORK_SIGNAL_TYPES.has(srcPort.signalType) && NETWORK_SIGNAL_TYPES.has(tgtPort.signalType);
        if ((canSource && canTarget || networkBypass) && srcPort.signalType !== tgtPort.signalType && !areSignalPairsCompatible(srcPort.signalType, tgtPort.signalType)) {
          // Auto-insert if exactly one adapter matches
          const allTemplates = [...DEVICE_TEMPLATES, ...state.customTemplates];
          const adapterMatches = findAdaptersForSignalBridge(srcPort.signalType, tgtPort.signalType, allTemplates);
          if (adapterMatches.length === 1) {
            set({ pendingIncompatibleConnection: { connection, sourcePort: srcPort, targetPort: tgtPort, reason: "signal-mismatch" } });
            get().insertAdapterBetween(adapterMatches[0]);
            return;
          }
          set({ pendingIncompatibleConnection: { connection, sourcePort: srcPort, targetPort: tgtPort, reason: "signal-mismatch" } });
        }
      }
      return;
    }

    const sourcePort = getPortFromHandle(
      state.nodes,
      connection.source,
      connection.sourceHandle,
    );
    const targetPort = getPortFromHandle(
      state.nodes,
      connection.target,
      connection.targetHandle,
    );

    // Check if connector types are mismatched (any mismatch, not just CONNECTOR_ACCEPTS pairs)
    const connectorsDiffer = sourcePort && targetPort &&
      sourcePort.connectorType && targetPort.connectorType &&
      sourcePort.connectorType !== targetPort.connectorType &&
      !areConnectorsCompatible(sourcePort.connectorType, targetPort.connectorType);

    if (connectorsDiffer) {
      const allTemplates = [...DEVICE_TEMPLATES, ...state.customTemplates];
      const adapterMatches = findAdaptersForConnectorBridge(
        sourcePort.connectorType!,
        targetPort.connectorType!,
        sourcePort.signalType,
        allTemplates,
      );

      if (adapterMatches.length === 1) {
        // Auto-insert the single matching adapter (insertAdapterBetween handles its own undo)
        set({ pendingIncompatibleConnection: { connection, sourcePort, targetPort, reason: "connector-mismatch" } });
        get().insertAdapterBetween(adapterMatches[0]);
        return;
      } else {
        // Zero or multiple matches — show dialog for user to choose (or connect anyway)
        set({ pendingIncompatibleConnection: { connection, sourcePort, targetPort, reason: "connector-mismatch" } });
        return;
      }
    }

    // Also handle CONNECTOR_ACCEPTS adapter pairs (compatible but needs adapter cable)
    if (sourcePort && targetPort && needsAdapter(sourcePort.connectorType, targetPort.connectorType)) {
      const allTemplates = [...DEVICE_TEMPLATES, ...state.customTemplates];
      const adapterMatches = findAdaptersForConnectorBridge(
        sourcePort.connectorType!,
        targetPort.connectorType!,
        sourcePort.signalType,
        allTemplates,
      );

      if (adapterMatches.length === 1) {
        set({ pendingIncompatibleConnection: { connection, sourcePort, targetPort, reason: "connector-mismatch" } });
        get().insertAdapterBetween(adapterMatches[0]);
        return;
      } else {
        set({ pendingIncompatibleConnection: { connection, sourcePort, targetPort, reason: "connector-mismatch" } });
        return;
      }
    }

    pushUndo({ nodes: state.nodes, edges: state.edges });

    const connectorMismatch = !areConnectorsCompatible(
      sourcePort?.connectorType,
      targetPort?.connectorType,
    );

    // Check if either port is direct-attach (adapter plugs directly into device)
    const isDirectAttach = sourcePort?.directAttach || targetPort?.directAttach;

    const newEdgeData: ConnectionData = {
      signalType: sourcePort?.signalType ?? "custom",
      ...(connectorMismatch ? { connectorMismatch: true } : {}),
      ...(isDirectAttach ? { directAttach: true } : {}),
    };
    const existingEdges = ensureUniqueEdgeIds(state.edges);
    const newEdge: ConnectionEdge = {
      id: nextEdgeId(existingEdges),
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
      data: newEdgeData,
      style: {
        stroke: resolveEdgeStroke(newEdgeData),
        strokeWidth: isDirectAttach ? 1 : 2,
      },
    };

    set({
      nodes: existingEdges === state.edges ? state.nodes : reconcileWaypointNodes(state.nodes, existingEdges),
      edges: [...existingEdges, newEdge],
    });
    get().saveToLocalStorage();
  },

  addDevice: (template, position) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const newNode = createDeviceNode(template, position, state.templatePresets);
    set({ nodes: renumberNodes([...get().nodes, newNode]) });
    get().pushRecentTemplate(template.id ?? template.deviceType);
    get().saveToLocalStorage();
  },

  addDevices: (items) => {
    if (items.length === 0) return;
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const newNodes = items.map((item) => createDeviceNode(item.template, item.position, state.templatePresets));
    set({ nodes: renumberNodes([...get().nodes, ...newNodes]) });
    // Record recents most-recent-last so the final order matches placement order.
    for (const item of items) {
      get().pushRecentTemplate(item.template.id ?? item.template.deviceType);
    }
    get().saveToLocalStorage();
  },

  bundleConnections: (edgeIds, bundleId) => {
    if (edgeIds.length === 0) return;
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const targets = new Set(edgeIds);
    set({
      edges: state.edges.map((e) =>
        targets.has(e.id) ? { ...e, data: { ...e.data!, bundleId: bundleId ?? undefined } } : e,
      ),
    });
    get().saveToLocalStorage();
  },

  bundleSelectedConnections: () => {
    const state = get();
    const selected = state.edges.filter((e) => e.selected);
    // One connection is not a multicore. Bundling a single run would draw a trunk around it and
    // claim a snake that does not exist, so the action is a no-op below two.
    if (selected.length < 2) return;
    // Reuse a bundle already present in the selection, so adding runs to an existing snake
    // extends it instead of splitting it in two.
    const existing = selected.find((e) => e.data?.bundleId)?.data?.bundleId;
    const id = existing ?? `bundle-${crypto.randomUUID().slice(0, 8)}`;
    get().bundleConnections(selected.map((e) => e.id), id);
  },

  unbundleSelectedConnections: () => {
    const selected = get().edges.filter((e) => e.selected && e.data?.bundleId);
    if (selected.length === 0) return;
    get().bundleConnections(selected.map((e) => e.id), null);
  },

  removeSelected: () => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const selectedNodeIds = new Set(
      state.nodes.filter((n) => n.selected).map((n) => n.id),
    );
    const selectedEdgeIds = new Set(
      state.edges.filter((e) => e.selected).map((e) => e.id),
    );

    // Un-parent children of deleted rooms
    const deletedRoomIds = new Set(
      state.nodes
        .filter((n) => n.type === "room" && selectedNodeIds.has(n.id))
        .map((n) => n.id),
    );

    // Capture selected waypoint nodes — their indices will be spliced out of the
    // owning edge's manualWaypoints below before reconciliation re-spawns the rest.
    const selectedWaypoints = state.nodes.filter(
      (n) => n.type === "waypoint" && n.selected,
    ) as import("./types").WaypointNode[];

    // Build a map for absolute position resolution (needed for multi-level nesting)
    const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));
    function computeAbsolutePos(nId: string): { x: number; y: number } {
      const n = nodeMap.get(nId);
      if (!n) return { x: 0, y: 0 };
      if (!n.parentId) return n.position;
      const p = computeAbsolutePos(n.parentId);
      return { x: n.position.x + p.x, y: n.position.y + p.y };
    }

    // Also remove edges connected to deleted nodes (excluding waypoint nodes —
    // a waypoint's source/target relationship doesn't exist; they're floating).
    const deletedConnectingNodes = new Set(
      [...selectedNodeIds].filter((id) => {
        const n = nodeMap.get(id);
        return n && n.type !== "waypoint";
      }),
    );
    const survivingEdges = state.edges.filter(
      (e) =>
        !selectedEdgeIds.has(e.id) &&
        !deletedConnectingNodes.has(e.source) &&
        !deletedConnectingNodes.has(e.target),
    );

    // Splice manualWaypoints entries for each selected waypoint node so their
    // indices vanish from the canonical store. Waypoints belonging to deleted
    // edges are dropped wholesale by reconcileWaypointNodes below.
    const edgesAfterSplice = spliceWaypointsForRemovedNodes(survivingEdges, selectedWaypoints);

    const remainingNodes = state.nodes
      .filter((n) => !n.selected)
      .map((n) => {
        if (n.parentId && deletedRoomIds.has(n.parentId)) {
          // Convert to absolute position — walk the full parent chain
          return {
            ...n,
            parentId: undefined,
            extent: undefined,
            position: computeAbsolutePos(n.id),
          };
        }
        return n;
      });

    // Cascade-remove rack placements for deleted devices; clear room links for deleted rooms
    const pages = state.pages.length > 0 && selectedNodeIds.size > 0
      ? state.pages.map((page): SchematicPage => {
          if (page.type !== "rack-elevation") return page;
          return {
            ...page,
            placements: page.placements.filter((p) => !selectedNodeIds.has(p.deviceNodeId)),
            racks: page.racks.map((r) =>
              r.linkedRoomId && deletedRoomIds.has(r.linkedRoomId)
                ? { ...r, linkedRoomId: undefined }
                : r
            ),
          };
        })
      : state.pages;

    // Notify user if rack placements were removed
    if (pages !== state.pages) {
      const elevPages = (ps: SchematicPage[]) => ps.filter((p): p is RackElevationPage => p.type === "rack-elevation");
      const removedCount = elevPages(state.pages).reduce((sum, p) => sum + p.placements.length, 0) -
        elevPages(pages).reduce((sum, p) => sum + p.placements.length, 0);
      if (removedCount > 0) {
        get().addToast(`Removed ${removedCount} rack placement${removedCount > 1 ? "s" : ""} for deleted device${selectedNodeIds.size > 1 ? "s" : ""}`, "info");
      }
    }

    // After deleting nodes/edges, waypoint node ids may be stale (indices shifted
    // or owning edges removed). Reconcile against the new canonical edges.
    const reconciledNodes = reconcileWaypointNodes(remainingNodes, edgesAfterSplice);

    // Purge any pairwise distances referencing a deleted room (#146).
    let nextDistances = state.roomDistances;
    if (state.roomDistances && deletedRoomIds.size > 0) {
      const filtered: Record<string, number> = {};
      for (const [key, value] of Object.entries(state.roomDistances)) {
        const [a, b] = key.split("|");
        if (!deletedRoomIds.has(a) && !deletedRoomIds.has(b)) {
          filtered[key] = value;
        }
      }
      nextDistances = Object.keys(filtered).length > 0 ? filtered : undefined;
    }

    // Clear any gear-unit assignments that pointed at a deleted device.
    let nextGearUnits = state.gearUnits;
    if (nextGearUnits.length > 0 && selectedNodeIds.size > 0) {
      for (const nid of selectedNodeIds) nextGearUnits = clearAssignmentsForNode(nextGearUnits, nid);
    }

    // Deleting members may drop a bundle below 2 — GC dangling membership + empty bundles.
    const gc = gcBundles(edgesAfterSplice, state.bundles);
    // Drop junction anchors orphaned by a dissolved bundle (and re-heal a live bundle whose
    // anchor was itself in the deleted selection).
    const healedNodes = reconcileBundleJunctions(reconciledNodes, gc.edges);

    set({
      nodes: renumberNodes(healedNodes),
      edges: gc.edges,
      bundles: gc.bundles,
      pages,
      ...(nextDistances !== state.roomDistances ? { roomDistances: nextDistances } : {}),
      ...(nextGearUnits !== state.gearUnits ? { gearUnits: nextGearUnits } : {}),
    });
    get().saveToLocalStorage();
  },

  deleteNode: (nodeId: string) => {
    // Select only this node, deselect everything else, then removeSelected
    set({
      nodes: get().nodes.map((n) => ({ ...n, selected: n.id === nodeId })),
      edges: get().edges.map((e) => ({ ...e, selected: false })),
    });
    get().removeSelected();
  },

  deleteNodeAndChildren: (nodeId: string) => {
    // Collect all descendants recursively (handles nested subrooms)
    const nodes = get().nodes;
    const toDelete = new Set<string>([nodeId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of nodes) {
        if (!toDelete.has(n.id) && n.parentId && toDelete.has(n.parentId)) {
          toDelete.add(n.id);
          changed = true;
        }
      }
    }
    set({
      nodes: nodes.map((n) => ({ ...n, selected: toDelete.has(n.id) })),
      edges: get().edges.map((e) => ({ ...e, selected: false })),
    });
    get().removeSelected();
  },

  copySelected: () => {
    const state = get();
    // Waypoint nodes are derived from edge.data.manualWaypoints, and bundle-junction
    // anchors are healed from bundle membership. Excluding both here keeps the clipboard
    // small and lets paste re-spawn them fresh (with re-keyed ids / the remapped bundle)
    // via reconcileWaypointNodes / reconcileBundleJunctions.
    const selectedNodes = state.nodes.filter(
      (n) => n.selected && n.type !== "waypoint" && n.type !== "bundle-junction",
    );
    if (selectedNodes.length === 0) return;

    const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
    const connectedEdges = state.edges.filter(
      (e) => selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target),
    );

    // Compute bounding box height of selection
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of selectedNodes) {
      const h = n.measured?.height ?? 48;
      minY = Math.min(minY, n.position.y);
      maxY = Math.max(maxY, n.position.y + h);
    }

    clipboard = {
      nodes: selectedNodes.map((n) => structuredClone(n)),
      edges: connectedEdges.map((e) => structuredClone(e)),
      boundsHeight: maxY - minY,
    };
  },

  pasteClipboard: () => {
    if (!clipboard || clipboard.nodes.length === 0) return;
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });

    // Build old ID → new ID mapping for nodes and ports
    const nodeIdMap = new Map<string, string>();
    const portIdMap = new Map<string, string>();
    // Stubbed connections are identified by a shared linkedConnectionId across
    // their stub-leg edges and stub-label nodes. Re-key it per pasted connection
    // so the copy is independent of the original — otherwise collapsing one stub
    // would delete both, and labels would resolve through the wrong partner.
    const linkIdMap = new Map<string, string>();
    const remapLink = (oldLink: string): string => {
      let v = linkIdMap.get(oldLink);
      if (!v) {
        v = newLinkedConnectionId();
        linkIdMap.set(oldLink, v);
      }
      return v;
    };
    // Bundles are likewise re-keyed per paste so the copy is an independent bundle.
    const bundleIdMap = new Map<string, string>();
    const remapBundle = (oldId: string): string => {
      let v = bundleIdMap.get(oldId);
      if (!v) {
        v = newBundleId();
        bundleIdMap.set(oldId, v);
      }
      return v;
    };

    const yOffset = clipboard.boundsHeight + PASTE_GAP;

    const newNodes: SchematicNode[] = clipboard.nodes.map((n) => {
      const newId = n.type === "room" ? nextRoomId() : nextNodeId();
      nodeIdMap.set(n.id, newId);
      if (n.type === "device") {
        const deviceData = n.data as DeviceData;
        const newPorts = clonePorts(deviceData.ports);
        deviceData.ports.forEach((oldPort: Port, i: number) => {
          portIdMap.set(oldPort.id, newPorts[i].id);
        });
        const remappedHidden = deviceData.hiddenPorts?.length
          ? deviceData.hiddenPorts
              .map((id) => portIdMap.get(id) ?? id)
              .filter((id) => newPorts.some((p) => p.id === id))
          : undefined;
        return {
          ...n,
          id: newId,
          position: { x: n.position.x, y: n.position.y + yOffset },
          selected: true,
          data: {
            ...deviceData,
            ports: newPorts,
            hiddenPorts: remappedHidden && remappedHidden.length > 0 ? remappedHidden : undefined,
          },
        } as DeviceNode;
      }
      if (n.type === "stub-label") {
        const sd = n.data as import("./types").StubLabelData;
        return {
          ...n,
          id: newId,
          position: { x: n.position.x, y: n.position.y + yOffset },
          selected: true,
          data: { ...sd, linkedConnectionId: remapLink(sd.linkedConnectionId) },
        };
      }
      return {
        ...n,
        id: newId,
        position: { x: n.position.x, y: n.position.y + yOffset },
        selected: true,
      };
    });

    const existingEdges = ensureUniqueEdgeIds(state.edges);
    const newEdges: ConnectionEdge[] = [];
    for (const e of clipboard.edges) {
      let data = e.data;
      if (data?.linkedConnectionId) data = { ...data, linkedConnectionId: remapLink(data.linkedConnectionId) };
      if (data?.bundleId) data = { ...data, bundleId: remapBundle(data.bundleId) };
      // A pasted connection is a NEW physical cable — it must get its own cable ID,
      // not inherit the original's (IDs are permanent and label-printable).
      if (data?.cableId) {
        const { cableId: _omitCableId, ...rest } = data;
        data = rest;
      }
      newEdges.push({
        ...e,
        id: nextEdgeId([...existingEdges, ...newEdges]),
        source: nodeIdMap.get(e.source) ?? e.source,
        target: nodeIdMap.get(e.target) ?? e.target,
        sourceHandle: e.sourceHandle ? (portIdMap.get(e.sourceHandle) ?? e.sourceHandle) : e.sourceHandle,
        targetHandle: e.targetHandle ? (portIdMap.get(e.targetHandle) ?? e.targetHandle) : e.targetHandle,
        data,
      });
    }

    // Deselect existing nodes/edges, add pasted ones as selected
    const mergedNodes = [
      ...state.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
      ...newNodes,
    ];
    const mergedEdges = [
      ...existingEdges.map((e) => (e.selected ? { ...e, selected: false } : e)),
      ...newEdges,
    ];
    // Clone BundleMeta for each remapped bundle, then GC any pasted bundle that ended up
    // with <2 members (e.g. only some members were copied) — dropping both the empty
    // bundle and the now-dangling bundleId on its lone pasted edge.
    let finalEdges = mergedEdges;
    let finalBundles = state.bundles;
    if (bundleIdMap.size > 0) {
      const cloned: Record<string, BundleMeta> = { ...state.bundles };
      for (const [oldId, newId] of bundleIdMap) {
        cloned[newId] = { ...(state.bundles[oldId] ?? {}), id: newId };
      }
      const gc = gcBundles(mergedEdges, cloned);
      finalEdges = gc.edges;
      finalBundles = gc.bundles;
    }
    // Pasted edges may carry manualWaypoints; spawn fresh waypoint nodes for them. Pasted
    // bundles (remapped ids) get fresh break-in/out anchors via reconcileBundleJunctions.
    set({
      nodes: renumberNodes(reconcileBundleJunctions(reconcileWaypointNodes(mergedNodes, finalEdges), finalEdges)),
      edges: finalEdges,
      ...(finalBundles !== state.bundles ? { bundles: finalBundles } : {}),
    });

    // Update clipboard positions so repeated paste keeps offsetting
    clipboard = {
      nodes: clipboard.nodes.map((n) => ({
        ...n,
        position: { x: n.position.x, y: n.position.y + yOffset },
      })),
      edges: clipboard.edges,
      boundsHeight: clipboard.boundsHeight,
    };

    get().saveToLocalStorage();
  },

  alignSelectedNodes: (op) => {
    const state = get();
    const selected = state.nodes.filter((n) => n.selected);

    // Convert to absolute coordinates so alignment works across rooms.
    // Walk the full parent chain — nodes may live inside a rack inside a room.
    const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));
    const parentOffsets = new Map<string, { dx: number; dy: number }>();
    const absSelected = selected.map((n) => {
      let dx = 0;
      let dy = 0;
      let pid: string | undefined = n.parentId;
      while (pid) {
        const parent = nodeMap.get(pid);
        if (!parent) break;
        dx += parent.position.x;
        dy += parent.position.y;
        pid = parent.parentId;
      }
      parentOffsets.set(n.id, { dx, dy });
      if (dx === 0 && dy === 0) return n;
      return { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } };
    });

    const raw = computeAlignment(absSelected, op);
    if (raw.size === 0) return;
    const resolved = resolveAlignmentOverlaps(absSelected, raw, op);
    if (resolved.size === 0) return;

    // Convert back to parent-relative coordinates
    const updates = new Map<string, { x: number; y: number }>();
    for (const [id, pos] of resolved) {
      const off = parentOffsets.get(id)!;
      updates.set(id, { x: pos.x - off.dx, y: pos.y - off.dy });
    }

    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) => {
        const pos = updates.get(n.id);
        return pos ? { ...n, position: pos } : n;
      }),
    });
    get().saveToLocalStorage();
  },

  isValidConnection: (connection) => {
    const state = get();
    const sourcePort = getPortFromHandle(
      state.nodes,
      connection.source,
      connection.sourceHandle,
    );
    const targetPort = getPortFromHandle(
      state.nodes,
      connection.target,
      connection.targetHandle,
    );

    if (!sourcePort || !targetPort) return false;

    // ── Passthrough port handling ────────────────────────────────────────
    const srcIsPassthrough = sourcePort.direction === "passthrough";
    const tgtIsPassthrough = targetPort.direction === "passthrough";

    if (srcIsPassthrough || tgtIsPassthrough) {
      // Detect which face of each passthrough port this connection uses
      const srcSide = connection.sourceHandle?.endsWith("-rear") ? "rear"
        : connection.sourceHandle?.endsWith("-front") ? "front"
        : undefined;
      const tgtSide = connection.targetHandle?.endsWith("-rear") ? "rear"
        : connection.targetHandle?.endsWith("-front") ? "front"
        : undefined;

      // Block same-device connections unless both handles are "-front" on a patch-panel
      // (that's a patch cable connecting two front-face jacks on the same panel)
      if (connection.source === connection.target) {
        const srcNode = state.nodes.find((n) => n.id === connection.source);
        const isFrontToFront = srcSide === "front" && tgtSide === "front";
        const isPatchPanel = (srcNode as DeviceNode | undefined)?.data?.deviceType === "patch-panel";
        if (!isFrontToFront || !isPatchPanel) return false;
      }

      // Resolve the effective connector type for each side
      const srcConnector = srcIsPassthrough
        ? (srcSide === "rear" ? sourcePort.rearConnectorType : srcSide === "front" ? sourcePort.frontConnectorType : sourcePort.connectorType)
        : sourcePort.connectorType;
      const tgtConnector = tgtIsPassthrough
        ? (tgtSide === "rear" ? targetPort.rearConnectorType : tgtSide === "front" ? targetPort.frontConnectorType : targetPort.connectorType)
        : targetPort.connectorType;

      // Connector compatibility (bare-wire always passes)
      if (!areConnectorsCompatible(srcConnector ?? sourcePort.connectorType, tgtConnector ?? targetPort.connectorType)) return false;

      // Signal-type check: if either port inherits its signal from edges we can't know it
      // at connection time, so we accept anything. Otherwise use effectiveSignalType.
      const srcSignal = effectiveSignalType(sourcePort, connection.source, state.edges, srcIsPassthrough ? srcSide : undefined);
      const tgtSignal = effectiveSignalType(targetPort, connection.target, state.edges, tgtIsPassthrough ? tgtSide : undefined);
      const srcInherits = sourcePort.inheritsSignal && srcSignal === sourcePort.signalType;
      const tgtInherits = targetPort.inheritsSignal && tgtSignal === targetPort.signalType;
      if (!srcInherits && !tgtInherits && srcSignal !== tgtSignal) {
        const netBypass = NETWORK_SIGNAL_TYPES.has(srcSignal) && NETWORK_SIGNAL_TYPES.has(tgtSignal);
        const bareBypass = BARE_WIRE_CONNECTORS.has(srcConnector ?? "none" as never) ||
          BARE_WIRE_CONNECTORS.has(tgtConnector ?? "none" as never);
        const pairBypass = areSignalPairsCompatible(srcSignal, tgtSignal);
        if (!netBypass && !bareBypass && !pairBypass) return false;
      }

      // Duplicate-handle guard (same as non-passthrough below)
      if (!sourcePort.multiConnect) {
        const dup = state.edges.some(
          (e) => e.id !== _reconnectingEdgeId && e.source === connection.source && e.sourceHandle === connection.sourceHandle,
        );
        if (dup) return false;
      }
      if (!targetPort.multiConnect) {
        const dup = state.edges.some(
          (e) => e.id !== _reconnectingEdgeId && e.target === connection.target && e.targetHandle === connection.targetHandle,
        );
        if (dup) return false;
      }

      return true;
    }
    // ── End passthrough handling ─────────────────────────────────────────

    // Network signal types (ethernet, dante, etc.) can connect in any direction
    const networkBypass = NETWORK_SIGNAL_TYPES.has(sourcePort.signalType) && NETWORK_SIGNAL_TYPES.has(targetPort.signalType);
    // Bare-wire connectors (phoenix/terminal-block) bypass signal type checks — if you're
    // screwing bare wire into screw terminals, you presumably know what signal you're carrying
    const bareWireBypass = !!sourcePort.connectorType && !!targetPort.connectorType &&
      BARE_WIRE_CONNECTORS.has(sourcePort.connectorType) && BARE_WIRE_CONNECTORS.has(targetPort.connectorType);
    const signalBypass = areSignalsCompatibleViaConnector(
      sourcePort.signalType, sourcePort.connectorType,
      targetPort.signalType, targetPort.connectorType,
    ) || areSignalPairsCompatible(sourcePort.signalType, targetPort.signalType);
    if (!networkBypass && !bareWireBypass) {
      const canSource = sourcePort.direction === "output" || sourcePort.direction === "bidirectional";
      const canTarget = targetPort.direction === "input" || targetPort.direction === "bidirectional";
      if (!canSource || !canTarget) return false;
    }
    if (sourcePort.signalType !== targetPort.signalType && !networkBypass && !bareWireBypass && !signalBypass) return false;

    // Multicable ports can only connect to other multicable ports
    const srcIsMulticable = sourcePort.isMulticable ?? false;
    const tgtIsMulticable = targetPort.isMulticable ?? false;
    if (srcIsMulticable !== tgtIsMulticable) return false;

    // Don't allow multiple connections to the same handle, unless the port is multi-connect
    if (!targetPort.multiConnect) {
      const duplicateTarget = state.edges.some(
        (e) =>
          e.id !== _reconnectingEdgeId &&
          e.target === connection.target &&
          e.targetHandle === connection.targetHandle,
      );
      if (duplicateTarget) return false;
    }

    if (!sourcePort.multiConnect) {
      const duplicateSource = state.edges.some(
        (e) =>
          e.id !== _reconnectingEdgeId &&
          e.source === connection.source &&
          e.sourceHandle === connection.sourceHandle,
      );
      if (duplicateSource) return false;
    }

    // For bidirectional ports, block the opposite side if one side is already connected
    if (sourcePort.direction === "bidirectional" && connection.sourceHandle) {
      const baseId = connection.sourceHandle.replace(/-(in|out|rear|front)$/, "");
      const otherHandle = connection.sourceHandle.endsWith("-out")
        ? `${baseId}-in`
        : `${baseId}-out`;
      const otherConnected = state.edges.some(
        (e) =>
          (e.source === connection.source && e.sourceHandle === otherHandle) ||
          (e.target === connection.source && e.targetHandle === otherHandle),
      );
      if (otherConnected) return false;
    }
    if (targetPort.direction === "bidirectional" && connection.targetHandle) {
      const baseId = connection.targetHandle.replace(/-(in|out|rear|front)$/, "");
      const otherHandle = connection.targetHandle.endsWith("-in")
        ? `${baseId}-out`
        : `${baseId}-in`;
      const otherConnected = state.edges.some(
        (e) =>
          (e.source === connection.target && e.sourceHandle === otherHandle) ||
          (e.target === connection.target && e.targetHandle === otherHandle),
      );
      if (otherConnected) return false;
    }

    return true;
  },

  updateDeviceLabel: (nodeId, label) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: renumberNodes(state.nodes.map((n) => {
        if (n.id !== nodeId || n.type !== "device") return n;
        return { ...n, data: { ...n.data, label, baseLabel: undefined } } as DeviceNode;
      })),
    });
    get().saveToLocalStorage();
  },

  batchUpdateDeviceLabels: (changes) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const changeMap = new Map(changes.map((c) => [c.nodeId, c.label]));
    set({
      nodes: renumberNodes(state.nodes.map((n) => {
        if (n.type !== "device") return n;
        const label = changeMap.get(n.id);
        if (label === undefined) return n;
        return { ...n, data: { ...n.data, label, baseLabel: undefined } } as DeviceNode;
      })),
    });
    get().saveToLocalStorage();
  },

  updateDeviceShortName: (nodeId, shortName) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const trimmed = shortName.trim();
    set({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId || n.type !== "device") return n;
        const next = { ...n.data } as DeviceData;
        if (trimmed) next.shortName = trimmed;
        else delete next.shortName;
        return { ...n, data: next } as DeviceNode;
      }),
    });
    get().saveToLocalStorage();
  },

  batchUpdateDeviceShortNames: (changes) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const changeMap = new Map(changes.map((c) => [c.nodeId, c.shortName.trim()]));
    set({
      nodes: state.nodes.map((n) => {
        if (n.type !== "device") return n;
        const v = changeMap.get(n.id);
        if (v === undefined) return n;
        const next = { ...n.data } as DeviceData;
        if (v) next.shortName = v;
        else delete next.shortName;
        return { ...n, data: next } as DeviceNode;
      }),
    });
    get().saveToLocalStorage();
  },

  updateDevice: (nodeId, data) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });

    // Diff old vs new ports to find removed port IDs
    const oldNode = state.nodes.find((n) => n.id === nodeId && n.type === "device");
    const oldPortIds = oldNode
      ? new Set((oldNode.data as DeviceData).ports.map((p) => p.id))
      : new Set<string>();
    const newPortIds = new Set(data.ports.map((p) => p.id));
    const removedPortIds = new Set([...oldPortIds].filter((id) => !newPortIds.has(id)));

    // Remove edges connected to removed ports FIRST so React Flow doesn't
    // reassign them to other handles when the node DOM updates
    if (removedPortIds.size > 0) {
      set({
        edges: state.edges.filter((e) => {
          const srcHandle = e.sourceHandle ?? "";
          const tgtHandle = e.targetHandle ?? "";
          if (e.source === nodeId && removedPortIds.has(srcHandle.replace(/-(in|out|rear|front)$/, ""))) return false;
          if (e.target === nodeId && removedPortIds.has(tgtHandle.replace(/-(in|out|rear|front)$/, ""))) return false;
          return true;
        }),
      });
    }

    set({
      nodes: renumberNodes(get().nodes.map((n) => {
        if (n.id !== nodeId || n.type !== "device") return n;
        return { ...n, data: { ...data, baseLabel: undefined } } as DeviceNode;
      })),
    });

    // Sync directAttach flag on connected edges when port DA changes
    const newPortMap = new Map(data.ports.map((p) => [p.id, p]));
    const currentEdges = get().edges;
    let edgesChanged = false;
    const syncedEdges = currentEdges.map((e) => {
      // Check if this edge connects to the updated device
      let portOnThisDevice: Port | undefined;
      if (e.source === nodeId) {
        const portId = e.sourceHandle?.replace(/-(in|out|rear|front)$/, "") ?? "";
        portOnThisDevice = newPortMap.get(portId);
      } else if (e.target === nodeId) {
        const portId = e.targetHandle?.replace(/-(in|out|rear|front)$/, "") ?? "";
        portOnThisDevice = newPortMap.get(portId);
      }
      if (!portOnThisDevice) return e;

      const shouldBeDA = portOnThisDevice.directAttach ?? false;
      const currentlyDA = e.data?.directAttach ?? false;
      if (shouldBeDA === currentlyDA) return e;

      edgesChanged = true;
      const nextData = {
        ...e.data!,
        directAttach: shouldBeDA || undefined,
      };
      return {
        ...e,
        data: nextData,
        style: {
          ...e.style,
          stroke: resolveEdgeStroke(nextData),
          strokeWidth: shouldBeDA ? 1 : 2,
        },
      };
    });
    if (edgesChanged) {
      set({ edges: syncedEdges });
    }

    get().saveToLocalStorage();
  },

  patchDeviceData: (nodeId, patch) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId || n.type !== "device") return n;
        return { ...n, data: { ...n.data, ...patch } } as DeviceNode;
      }),
    });
    get().saveToLocalStorage();
  },

  convertPortsToPassthrough: (nodeId, inputPortId, outputPortId, newPort) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const removedIds = new Set([inputPortId, outputPortId]);
    const newNodes = state.nodes.map((n) => {
      if (n.id !== nodeId || n.type !== "device") return n;
      const data = n.data as DeviceData;
      const insertAt = data.ports.findIndex((p) => removedIds.has(p.id));
      const newPorts = [
        ...data.ports.slice(0, insertAt).filter((p) => !removedIds.has(p.id)),
        newPort,
        ...data.ports.slice(insertAt).filter((p) => !removedIds.has(p.id)),
      ];
      return { ...n, data: { ...data, ports: newPorts } } as DeviceNode;
    });

    const newPortId = newPort.id;
    const newEdges = state.edges.map((e) => {
      if (e.source === nodeId && (e.sourceHandle === inputPortId || e.sourceHandle === `${inputPortId}-out`)) {
        return { ...e, sourceHandle: `${newPortId}-rear` };
      }
      if (e.target === nodeId && (e.targetHandle === inputPortId || e.targetHandle === `${inputPortId}-in`)) {
        return { ...e, targetHandle: `${newPortId}-rear` };
      }
      if (e.source === nodeId && (e.sourceHandle === outputPortId || e.sourceHandle === `${outputPortId}-out`)) {
        return { ...e, sourceHandle: `${newPortId}-front` };
      }
      if (e.target === nodeId && (e.targetHandle === outputPortId || e.targetHandle === `${outputPortId}-in`)) {
        return { ...e, targetHandle: `${newPortId}-front` };
      }
      return e;
    });

    set({ nodes: newNodes, edges: newEdges });
    get().saveToLocalStorage();
  },

  convertAllPairsToPassthrough: (nodeId, conversions) => {
    if (conversions.length === 0) return;
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const inputToNew = new Map<string, string>();
    const outputToNew = new Map<string, string>();
    const newPortById = new Map<string, import("./types").Port>();
    for (const c of conversions) {
      inputToNew.set(c.inputPortId, c.newPort.id);
      outputToNew.set(c.outputPortId, c.newPort.id);
      newPortById.set(c.newPort.id, c.newPort);
    }

    const newNodes = state.nodes.map((n) => {
      if (n.id !== nodeId || n.type !== "device") return n;
      const data = n.data as DeviceData;
      const newPorts: import("./types").Port[] = [];
      for (const p of data.ports) {
        if (inputToNew.has(p.id)) {
          const replacement = newPortById.get(inputToNew.get(p.id)!);
          if (replacement) newPorts.push(replacement);
        } else if (outputToNew.has(p.id)) {
          // skip — its pair's input port already emitted the replacement
        } else {
          newPorts.push(p);
        }
      }
      return { ...n, data: { ...data, ports: newPorts } } as DeviceNode;
    });

    const newEdges = state.edges.map((e) => {
      if (e.source === nodeId && e.sourceHandle) {
        const bare = e.sourceHandle.replace(/-(in|out)$/, "");
        const rearId = inputToNew.get(bare);
        if (rearId) return { ...e, sourceHandle: `${rearId}-rear` };
        const frontId = outputToNew.get(bare);
        if (frontId) return { ...e, sourceHandle: `${frontId}-front` };
      }
      if (e.target === nodeId && e.targetHandle) {
        const bare = e.targetHandle.replace(/-(in|out)$/, "");
        const rearId = inputToNew.get(bare);
        if (rearId) return { ...e, targetHandle: `${rearId}-rear` };
        const frontId = outputToNew.get(bare);
        if (frontId) return { ...e, targetHandle: `${frontId}-front` };
      }
      return e;
    });

    set({ nodes: newNodes, edges: newEdges });
    get().saveToLocalStorage();
  },

  syncDeviceFromTemplate: (nodeId) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === nodeId && n.type === "device") as DeviceNode | undefined;
    if (!node?.data.templateId) return null;
    const template = getTemplateById(node.data.templateId, state.customTemplates);
    if (!template || template.version == null) return null;

    const result = syncDeviceWithTemplate(node.data, template, nodeId, state.edges);

    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) =>
        n.id === nodeId && n.type === "device"
          ? ({ ...n, data: result.updatedData } as DeviceNode)
          : n,
      ),
    });
    get().saveToLocalStorage();
    return result;
  },

  swapDevice: (nodeId, plan) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === nodeId && n.type === "device") as DeviceNode | undefined;
    if (!node) {
      set({ deviceSwapTarget: null });
      return;
    }

    pushUndo({ nodes: state.nodes, edges: state.edges });

    const oldData = node.data;
    const newTemplate = plan.newTemplate;
    const customTemplates = state.customTemplates;

    // 1. Build base ports — clone with fresh IDs and stamp templatePortId.
    const basePorts = clonePorts(newTemplate.ports);
    basePorts.forEach((p, i) => { p.templatePortId = newTemplate.ports[i].id; });
    const baseByTemplateId = new Map<string, Port>();
    newTemplate.ports.forEach((tp, i) => { baseByTemplateId.set(tp.id, basePorts[i]); });

    // 2. Build slots respecting plan.installedCards (only enabled cards installed).
    //    Walk slot defs depth-first; empty/unmatched slots get their template defaults.
    const installedSlots: InstalledSlot[] = [];
    const cardPorts: Port[] = [];
    const cardByRef = new Map<string, Map<string, Port>>(); // slotId → (cardTemplatePortId → clonedPort)

    const walkSlotDefs = (slotDefs: SlotDefinition[], parentPath: string | undefined, parentLabel: string | undefined) => {
      for (const sd of slotDefs) {
        const fullId = parentPath ? `${parentPath}/${sd.id}` : sd.id;
        const fullLabel = parentLabel ? `${parentLabel} > ${sd.label}` : sd.label;
        const planned = plan.installedCards.find((c) => c.slotId === fullId && c.enabled);
        const cardTplId = planned ? planned.cardTemplateId : sd.defaultCardId;
        const cardTpl = cardTplId ? getTemplateById(cardTplId, customTemplates) : undefined;

        if (cardTpl) {
          const cloned = cloneCardPorts(cardTpl.ports, fullId, fullLabel);
          cloned.forEach((p, i) => { p.templatePortId = cardTpl.ports[i].id; });
          cardPorts.push(...cloned);
          const refMap = new Map<string, Port>();
          cardTpl.ports.forEach((cp, i) => refMap.set(cp.id, cloned[i]));
          cardByRef.set(fullId, refMap);

          installedSlots.push({
            slotId: fullId,
            label: sd.label,
            slotFamily: sd.slotFamily,
            ...(parentPath ? { parentSlotId: parentPath } : {}),
            ...(sd.hideWhenEmpty ? { hideWhenEmpty: true } : {}),
            cardTemplateId: cardTpl.id,
            cardLabel: cardTpl.label,
            cardManufacturer: cardTpl.manufacturer,
            cardModelNumber: cardTpl.modelNumber,
            cardUnitCost: cardTpl.unitCost,
            portIds: cloned.map((p) => p.id),
          });
          if (cardTpl.slots && cardTpl.slots.length > 0) {
            walkSlotDefs(cardTpl.slots, fullId, fullLabel);
          }
        } else {
          installedSlots.push({
            slotId: fullId,
            label: sd.label,
            slotFamily: sd.slotFamily,
            ...(parentPath ? { parentSlotId: parentPath } : {}),
            ...(sd.hideWhenEmpty ? { hideWhenEmpty: true } : {}),
            portIds: [],
          });
        }
      }
    };
    if (newTemplate.slots && newTemplate.slots.length > 0) {
      walkSlotDefs(newTemplate.slots, undefined, undefined);
    }

    const newPorts: Port[] = [...basePorts, ...cardPorts];

    // 3. Resolve NewPortRef → final Port.
    const resolveRef = (ref: NewPortRef): Port | undefined => {
      if (ref.kind === "base") return baseByTemplateId.get(ref.templatePortId);
      return cardByRef.get(ref.slotId)?.get(ref.cardTemplatePortId);
    };

    // 4. Per-port preservation: carry user customizations (label, flipped, network config,
    //    notes, etc.) from old port onto its remapped new port. mergePort-style.
    const mergedNewPortIds = new Set<string>();
    for (const m of plan.mappings) {
      if (!m.newPortRef) continue;
      const target = resolveRef(m.newPortRef);
      if (!target) continue;
      if (mergedNewPortIds.has(target.id)) continue;
      mergedNewPortIds.add(target.id);
      const op = m.oldPort;
      if (op.label) target.label = op.label;
      if (op.flipped) target.flipped = op.flipped;
      if (op.notes) target.notes = op.notes;
      if (op.activeConfig) target.activeConfig = { ...op.activeConfig };
      if (op.linkSpeed) target.linkSpeed = op.linkSpeed;
      if (op.gender) target.gender = op.gender;
      if (op.poeDrawW != null) target.poeDrawW = op.poeDrawW;
      if (op.networkConfig && NETWORK_SIGNAL_TYPES.has(target.signalType)) {
        target.networkConfig = { ...op.networkConfig };
      }
    }

    // 5. Build new DeviceData. Take factual fields from template; preserve a small set
    //    of instance-level customizations from the old device.
    const userRenamed = !oldData.baseLabel; // baseLabel cleared on user rename
    const preservedLabel = userRenamed ? oldData.label : newTemplate.label;
    const newData: DeviceData = {
      label: preservedLabel,
      deviceType: newTemplate.deviceType,
      ports: newPorts,
      ...(newTemplate.color ? { color: newTemplate.color } : {}),
      ...(userRenamed ? {} : { baseLabel: newTemplate.label }),
      model: newTemplate.label,
      ...(newTemplate.shortName ? { shortName: newTemplate.shortName } : {}),
      ...(newTemplate.id ? { templateId: newTemplate.id } : {}),
      ...(newTemplate.version ? { templateVersion: newTemplate.version } : {}),
      ...(newTemplate.manufacturer ? { manufacturer: newTemplate.manufacturer } : {}),
      ...(newTemplate.modelNumber ? { modelNumber: newTemplate.modelNumber } : {}),
      ...(newTemplate.referenceUrl ? { referenceUrl: newTemplate.referenceUrl } : {}),
      ...(newTemplate.category ? { category: newTemplate.category } : {}),
      ...(newTemplate.powerDrawW != null ? { powerDrawW: newTemplate.powerDrawW } : {}),
      ...(newTemplate.powerCapacityW != null ? { powerCapacityW: newTemplate.powerCapacityW } : {}),
      ...(newTemplate.voltage ? { voltage: newTemplate.voltage } : {}),
      ...(newTemplate.poeBudgetW != null ? { poeBudgetW: newTemplate.poeBudgetW } : {}),
      ...(newTemplate.poeDrawW != null ? { poeDrawW: newTemplate.poeDrawW } : {}),
      ...(newTemplate.unitCost != null ? { unitCost: newTemplate.unitCost } : {}),
      ...(newTemplate.thermalBtuh != null ? { thermalBtuh: newTemplate.thermalBtuh } : {}),
      ...(newTemplate.searchTerms?.length ? { searchTerms: [...newTemplate.searchTerms] } : {}),
      ...(newTemplate.heightMm != null ? { heightMm: newTemplate.heightMm } : {}),
      ...(newTemplate.widthMm != null ? { widthMm: newTemplate.widthMm } : {}),
      ...(newTemplate.depthMm != null ? { depthMm: newTemplate.depthMm } : {}),
      ...(newTemplate.weightKg != null ? { weightKg: newTemplate.weightKg } : {}),
      ...(newTemplate.isVenueProvided ? { isVenueProvided: true } : {}),
      ...(newTemplate.deviceType === "cable-accessory" ? { isCableAccessory: true } : {}),
      ...(installedSlots.length > 0 ? { slots: installedSlots } : {}),
      ...(newTemplate.auxiliaryData?.length
        ? { auxiliaryData: newTemplate.auxiliaryData.map((r) => ({ ...r })) }
        : { auxiliaryData: [{ text: "{{deviceType}}", position: "header" as const }] }),
      // Preserved instance fields:
      ...(oldData.hostname ? { hostname: oldData.hostname } : (newTemplate.hostname ? { hostname: newTemplate.hostname } : {})),
      ...(oldData.useShortName !== undefined ? { useShortName: oldData.useShortName } : {}),
      ...(oldData.wrapLabel !== undefined ? { wrapLabel: oldData.wrapLabel } : {}),
    };

    // 6. Remap edges. For each mapping with a target, compute the new handle. Otherwise drop.
    const droppedEdgeIds = new Set<string>();
    const linkedIdsToDrop = new Set<string>();
    const edgeHandleUpdates = new Map<string, { sourceHandle?: string; targetHandle?: string }>();
    let remappedCount = 0;

    const markDropped = (edges: ConnectionEdge[]) => {
      for (const e of edges) {
        droppedEdgeIds.add(e.id);
        if (e.data?.linkedConnectionId) linkedIdsToDrop.add(e.data.linkedConnectionId);
      }
    };

    for (const m of plan.mappings) {
      if (!m.newPortRef) {
        markDropped(m.edges);
        continue;
      }
      const target = resolveRef(m.newPortRef);
      if (!target) {
        markDropped(m.edges);
        continue;
      }
      const newSuffix = chooseNewHandleSuffix(m.oldHandleSuffix, target.direction);
      if (newSuffix === null) {
        markDropped(m.edges);
        continue;
      }
      const newHandle = target.id + newSuffix;
      for (const e of m.edges) {
        const upd = edgeHandleUpdates.get(e.id) ?? {};
        if (m.oldEndpoint === "source") upd.sourceHandle = newHandle;
        else upd.targetHandle = newHandle;
        edgeHandleUpdates.set(e.id, upd);
        remappedCount++;
      }
    }

    // 7. Cascade drops to stub-leg partners and stub-label nodes.
    if (linkedIdsToDrop.size > 0) {
      for (const e of state.edges) {
        if (e.data?.linkedConnectionId && linkedIdsToDrop.has(e.data.linkedConnectionId)) {
          droppedEdgeIds.add(e.id);
        }
      }
    }

    // 8. Assemble new edges + node array.
    const newEdges: ConnectionEdge[] = [];
    for (const e of state.edges) {
      if (droppedEdgeIds.has(e.id)) continue;
      const upd = edgeHandleUpdates.get(e.id);
      newEdges.push(upd ? { ...e, ...upd } : e);
    }

    let newNodes: SchematicNode[] = state.nodes.map((n) => {
      if (n.id !== nodeId) return n;
      return { ...n, data: newData } as DeviceNode;
    });
    if (linkedIdsToDrop.size > 0) {
      newNodes = newNodes.filter((n) => {
        if (n.type !== "stub-label") return true;
        const sd = n.data as import("./types").StubLabelData;
        return !linkedIdsToDrop.has(sd.linkedConnectionId);
      });
    }

    set({
      nodes: renumberNodes(newNodes),
      edges: newEdges,
      deviceSwapTarget: null,
    });

    const droppedCount = [...droppedEdgeIds].filter((id) => state.edges.some((e) => e.id === id)).length;
    const installedCount = plan.installedCards.filter((c) => c.enabled).length;
    let toast = `Swapped to ${newTemplate.label}: ${remappedCount} connection${remappedCount !== 1 ? "s" : ""} remapped`;
    if (droppedCount > 0) toast += `, ${droppedCount} dropped`;
    if (installedCount > 0) toast += `; ${installedCount} card${installedCount !== 1 ? "s" : ""} installed`;
    get().addToast(toast, "success");
    get().saveToLocalStorage();
  },

  swapCard: (nodeId, slotId, cardTemplateId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const nodeIdx = state.nodes.findIndex((n) => n.id === nodeId && n.type === "device");
    if (nodeIdx === -1) return;
    const node = state.nodes[nodeIdx] as DeviceNode;
    const data = node.data;
    const slots = data.slots ?? [];
    const slotIdx = slots.findIndex((s) => s.slotId === slotId);
    if (slotIdx === -1) return;

    const oldSlot = slots[slotIdx];

    // Collect ALL port IDs from this slot and any descendant slots. Match on whole
    // path segments (slotId itself, or slotId + "/..."), not a raw prefix — otherwise
    // a sibling whose id merely starts with this one (e.g. "slot1" vs "slot10", or
    // nested "slot-1/sub" vs "slot-1/sub2") would be wrongly swept in and its card/
    // ports/edges dropped.
    const descendantSlots = slots.filter(
      (s) => s.parentSlotId && (s.parentSlotId === slotId || s.parentSlotId.startsWith(`${slotId}/`)),
    );
    const allOldPortIds = new Set([
      ...oldSlot.portIds,
      ...descendantSlots.flatMap((s) => s.portIds),
    ]);
    const descendantSlotIds = new Set(descendantSlots.map((s) => s.slotId));

    // Remove old card's ports (including descendant ports)
    let newPorts = data.ports.filter((p) => !allOldPortIds.has(p.id));

    // Remove edges connected to old card's ports
    const newEdges = allOldPortIds.size > 0
      ? state.edges.filter((e) => {
          const srcHandle = e.sourceHandle ?? "";
          const tgtHandle = e.targetHandle ?? "";
          if (e.source === nodeId && allOldPortIds.has(srcHandle)) return false;
          if (e.target === nodeId && allOldPortIds.has(tgtHandle)) return false;
          if (e.source === nodeId && allOldPortIds.has(srcHandle.replace(/-(in|out|rear|front)$/, ""))) return false;
          if (e.target === nodeId && allOldPortIds.has(tgtHandle.replace(/-(in|out|rear|front)$/, ""))) return false;
          return true;
        })
      : state.edges;

    // Remove descendant slots from the array
    let newSlots = slots.filter((s) => !descendantSlotIds.has(s.slotId));

    // Build new slot (with recursive sub-slot processing)
    let newSlot: InstalledSlot;
    let childSlots: InstalledSlot[] = [];
    if (cardTemplateId) {
      const cardTpl = getTemplateById(cardTemplateId, state.customTemplates);
      if (!cardTpl) return;

      // Determine display label for port sections
      const parentLabel = oldSlot.parentSlotId
        ? slots.find((s) => s.slotId === oldSlot.parentSlotId)?.label
        : undefined;
      const displayLabel = parentLabel ? `${parentLabel} > ${oldSlot.label}` : oldSlot.label;

      const cardPorts = cloneCardPorts(cardTpl.ports, slotId, displayLabel);
      newPorts = [...newPorts, ...cardPorts];
      newSlot = {
        slotId,
        label: oldSlot.label,
        slotFamily: oldSlot.slotFamily,
        ...(oldSlot.parentSlotId ? { parentSlotId: oldSlot.parentSlotId } : {}),
        ...(oldSlot.hideWhenEmpty ? { hideWhenEmpty: true } : {}),
        cardTemplateId: cardTpl.id,
        cardLabel: cardTpl.label,
        cardManufacturer: cardTpl.manufacturer,
        cardModelNumber: cardTpl.modelNumber,
        cardUnitCost: cardTpl.unitCost,
        portIds: cardPorts.map((p) => p.id),
      };

      // Process new card's sub-slots recursively
      if (cardTpl.slots && cardTpl.slots.length > 0) {
        const nested = processTemplateSlots(cardTpl.slots, slotId, displayLabel);
        childSlots = nested.installedSlots;
        newPorts = [...newPorts, ...nested.ports];
      }
    } else {
      newSlot = {
        slotId,
        label: oldSlot.label,
        slotFamily: oldSlot.slotFamily,
        ...(oldSlot.parentSlotId ? { parentSlotId: oldSlot.parentSlotId } : {}),
        ...(oldSlot.hideWhenEmpty ? { hideWhenEmpty: true } : {}),
        portIds: [],
      };
    }

    newSlots = newSlots.map((s) => (s.slotId === slotId ? newSlot : s));
    // Insert child slots right after the parent slot
    if (childSlots.length > 0) {
      const parentIdx = newSlots.findIndex((s) => s.slotId === slotId);
      newSlots.splice(parentIdx + 1, 0, ...childSlots);
    }

    const newNode = {
      ...node,
      data: { ...data, ports: newPorts, slots: newSlots },
    } as DeviceNode;

    const newNodes = state.nodes.map((n, i) => (i === nodeIdx ? newNode : n));
    set({ nodes: newNodes, edges: newEdges });
    get().saveToLocalStorage();
  },

  addSlot: (nodeId, { label, slotFamily }) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const nodeIdx = state.nodes.findIndex((n) => n.id === nodeId && n.type === "device");
    if (nodeIdx === -1) return;
    const node = state.nodes[nodeIdx] as DeviceNode;
    const data = node.data;
    const slots = data.slots ?? [];

    const newSlot: InstalledSlot = {
      slotId: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label,
      slotFamily,
      portIds: [],
    };

    const newNode = {
      ...node,
      data: { ...data, slots: [...slots, newSlot] },
    } as DeviceNode;

    set({ nodes: state.nodes.map((n, i) => (i === nodeIdx ? newNode : n)) });
    get().saveToLocalStorage();
  },

  addSlots: (nodeId, slots) => {
    if (slots.length === 0) return;
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const nodeIdx = state.nodes.findIndex((n) => n.id === nodeId && n.type === "device");
    if (nodeIdx === -1) return;
    const node = state.nodes[nodeIdx] as DeviceNode;
    const data = node.data;
    const existing = data.slots ?? [];

    const stamp = Date.now();
    const newSlots: InstalledSlot[] = slots.map((s, i) => ({
      slotId: `slot-${stamp}-${Math.random().toString(36).slice(2, 6)}-${i}`,
      label: s.label,
      slotFamily: s.slotFamily,
      portIds: [],
    }));

    const newNode = {
      ...node,
      data: { ...data, slots: [...existing, ...newSlots] },
    } as DeviceNode;

    set({ nodes: state.nodes.map((n, i) => (i === nodeIdx ? newNode : n)) });
    get().saveToLocalStorage();
  },

  updateSlot: (nodeId, slotId, patch) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const nodeIdx = state.nodes.findIndex((n) => n.id === nodeId && n.type === "device");
    if (nodeIdx === -1) return;
    const node = state.nodes[nodeIdx] as DeviceNode;
    const data = node.data;
    const slots = data.slots ?? [];
    if (!slots.some((s) => s.slotId === slotId)) return;

    const newSlots = slots.map((s) =>
      s.slotId === slotId
        ? {
            ...s,
            ...(patch.label !== undefined ? { label: patch.label } : {}),
            ...(patch.slotFamily !== undefined ? { slotFamily: patch.slotFamily } : {}),
            ...(patch.hidden !== undefined ? { hidden: patch.hidden } : {}),
          }
        : s,
    );

    const newNode = { ...node, data: { ...data, slots: newSlots } } as DeviceNode;
    set({ nodes: state.nodes.map((n, i) => (i === nodeIdx ? newNode : n)) });
    get().saveToLocalStorage();
  },

  removeSlot: (nodeId, slotId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const nodeIdx = state.nodes.findIndex((n) => n.id === nodeId && n.type === "device");
    if (nodeIdx === -1) return;
    const node = state.nodes[nodeIdx] as DeviceNode;
    const data = node.data;
    const slots = data.slots ?? [];
    const target = slots.find((s) => s.slotId === slotId);
    if (!target) return;

    // Slot and all descendants (nested cards). Match whole path segments, not a raw
    // prefix, so a sibling whose id merely starts with this one (e.g. "slot1" vs
    // "slot10") isn't swept in. (Mirrors the descendant match in swapCard.)
    const descendants = slots.filter(
      (s) => s.parentSlotId && (s.parentSlotId === slotId || s.parentSlotId.startsWith(`${slotId}/`)),
    );
    const removedSlotIds = new Set<string>([slotId, ...descendants.map((s) => s.slotId)]);
    const removedPortIds = new Set<string>([
      ...target.portIds,
      ...descendants.flatMap((s) => s.portIds),
    ]);

    const newPorts = data.ports.filter((p) => !removedPortIds.has(p.id));
    const newSlots = slots.filter((s) => !removedSlotIds.has(s.slotId));

    const newEdges = removedPortIds.size > 0
      ? state.edges.filter((e) => {
          const srcHandle = e.sourceHandle ?? "";
          const tgtHandle = e.targetHandle ?? "";
          if (e.source === nodeId && removedPortIds.has(srcHandle)) return false;
          if (e.target === nodeId && removedPortIds.has(tgtHandle)) return false;
          if (e.source === nodeId && removedPortIds.has(srcHandle.replace(/-(in|out|rear|front)$/, ""))) return false;
          if (e.target === nodeId && removedPortIds.has(tgtHandle.replace(/-(in|out|rear|front)$/, ""))) return false;
          return true;
        })
      : state.edges;

    const newNode = {
      ...node,
      data: { ...data, ports: newPorts, slots: newSlots },
    } as DeviceNode;

    set({ nodes: state.nodes.map((n, i) => (i === nodeIdx ? newNode : n)), edges: newEdges });
    get().saveToLocalStorage();
  },

  setEditingNodeId: (id) => {
    set({ editingNodeId: id });
  },

  setCreatingNodeId: (id) => {
    set({ creatingNodeId: id });
  },

  openDeviceDetailsPage: (id) => {
    set({ deviceDetailsPageId: id });
  },

  closeDeviceDetailsPage: () => {
    set({ deviceDetailsPageId: null });
  },

  openRoutingMatrix: (id) => {
    set({ routingMatrixDeviceId: id });
  },

  closeRoutingMatrix: () => {
    set({ routingMatrixDeviceId: null });
  },

  createAndEditDevice: (template, position) => {
    get().addDevice(template, position);
    const nodes = get().nodes;
    const newNodeId = nodes[nodes.length - 1].id;
    set({ editingNodeId: newNodeId, creatingNodeId: newNodeId });
  },

  addRoom: (label, position) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const newRoom: SchematicNode = {
      id: nextRoomId(),
      type: "room",
      position,
      data: { label },
      style: { width: 400, height: 300 },
      selected: true,
      zIndex: -1,
    };
    // Rooms must appear before their potential children in the array
    // Deselect everything else so the new room is the sole selection
    const deselected = state.nodes.map((n) => (n.selected ? { ...n, selected: false } : n));
    set({ nodes: [newRoom, ...deselected] });
    // Capture any existing devices that now fall inside the new room's bounds
    get().reparentAllDevices({ skipUndo: true });
    get().saveToLocalStorage();
  },

  updateRoomLabel: (nodeId, label) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        return { ...n, data: { ...n.data, label } } as SchematicNode;
      }),
    });
    get().saveToLocalStorage();
  },

  updateRoom: (nodeId, data) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const existingRoom = state.nodes.find((n) => n.id === nodeId && n.type === "room");
    const existingData = existingRoom?.data as import("./types").RoomData | undefined;
    const prevLinkedRackPageId = existingData?.linkedRackPageId;
    const prevLinkedRackId = existingData?.linkedRackId;
    const newLinkedRackPageId = data.linkedRackPageId;
    const newLinkedRackId = data.linkedRackId;
    const linkChanged = newLinkedRackPageId !== prevLinkedRackPageId || newLinkedRackId !== prevLinkedRackId;

    const updatedNodes = state.nodes.map((n) => {
      if (n.id !== nodeId || n.type !== "room") return n;
      const wasLocked = (n.data as import("./types").RoomData).locked;
      const merged = wasLocked ? { ...data, locked: true } : data;
      return { ...n, data: merged } as SchematicNode;
    });

    // Update rack backpointers atomically when link changes
    let updatedPages = state.pages;
    if (linkChanged) {
      updatedPages = state.pages.map((p): SchematicPage => {
        if (p.type !== "rack-elevation") return p;
        // Set new rack's linkedRoomId
        if (newLinkedRackPageId && newLinkedRackId && p.id === newLinkedRackPageId) {
          return { ...p, racks: p.racks.map((r) => {
            // Clear any previous link this rack had to a different room
            if (r.id === newLinkedRackId) return { ...r, linkedRoomId: nodeId };
            // Clear other racks on this page if they were linked to the same room
            if (r.linkedRoomId === nodeId) return { ...r, linkedRoomId: undefined };
            return r;
          })};
        }
        // Clear old rack's linkedRoomId
        if (prevLinkedRackPageId && prevLinkedRackId && p.id === prevLinkedRackPageId) {
          return { ...p, racks: p.racks.map((r) => r.id === prevLinkedRackId ? { ...r, linkedRoomId: undefined } : r) };
        }
        return p;
      });
    }

    set({ nodes: updatedNodes, pages: updatedPages });
    get().saveToLocalStorage();
  },

  updateAnnotation: (nodeId, data) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId || n.type !== "annotation") return n;
        return { ...n, data: { ...n.data, ...data } } as SchematicNode;
      }),
    });
    get().saveToLocalStorage();
  },

  toggleRoomLock: (nodeId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId || n.type !== "room") return n;
        const wasLocked = (n.data as import("./types").RoomData).locked;
        const locked = !wasLocked;
        return {
          ...n,
          draggable: locked ? false : undefined,
          selectable: !locked,
          className: locked ? "locked" : undefined,
          data: {
            ...n.data,
            locked: locked || undefined, // keep JSON clean
          },
        } as SchematicNode;
      }),
    });
    get().saveToLocalStorage();
  },

  toggleEquipmentRack: (nodeId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId || n.type !== "room") return n;
        const wasRack = (n.data as import("./types").RoomData).isEquipmentRack;
        return {
          ...n,
          data: {
            ...n.data,
            isEquipmentRack: wasRack ? undefined : true,
          },
        } as SchematicNode;
      }),
    });
    get().saveToLocalStorage();
  },

  addNote: (position) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const newNote: SchematicNode = {
      id: nextNoteId(),
      type: "note",
      position,
      data: { html: "" },
      style: { width: 200, height: 100 },
    };
    set({ nodes: [...state.nodes, newNote] });
    get().saveToLocalStorage();
  },

  addDimension: (position) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const mpp = state.gridSettings.metresPerPixel;
    const defaultLenPx = mpp > 0 ? Math.max(80, 2 / mpp) : 200; // ~2 m at the document scale
    const newDim: SchematicNode = {
      id: crypto.randomUUID(),
      type: "dimension",
      position,
      data: { dx: defaultLenPx, dy: 0 },
      selected: true,
    };
    const deselected = state.nodes.map((n) => (n.selected ? { ...n, selected: false } : n));
    set({ nodes: [...deselected, newDim] });
    get().saveToLocalStorage();
  },

  updateDimension: (id, patch, recordUndo) => {
    const state = get();
    if (recordUndo) pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) =>
        n.id === id && n.type === "dimension"
          ? {
              ...n,
              ...(patch.position ? { position: patch.position } : {}),
              data: {
                ...n.data,
                ...(patch.dx !== undefined ? { dx: patch.dx } : {}),
                ...(patch.dy !== undefined ? { dy: patch.dy } : {}),
              },
            }
          : n,
      ) as SchematicNode[],
    });
  },

  updateNoteHtml: (nodeId, html) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId && n.type === "note"
          ? { ...n, data: { ...n.data, html } } as SchematicNode
          : n,
      ),
    });
    get().saveToLocalStorage();
  },

  reparentNode: (nodeId, absolutePosition, options) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));
    const isRoom = node.type === "room";
    const nodeW = node.measured?.width ?? (isRoom ? 400 : 144);
    const nodeH = node.measured?.height ?? (isRoom ? 300 : 48);
    const centerX = absolutePosition.x + nodeW / 2;
    const centerY = absolutePosition.y + nodeH / 2;

    const targetRoom = findBestEnclosingRoom(nodeId, isRoom, centerX, centerY, state.nodes, nodeMap);

    const currentParent = node.parentId;
    const newParent = targetRoom?.id;

    if (currentParent === newParent) return; // no change

    if (!options?.skipUndo) {
      pushUndo({ nodes: state.nodes, edges: state.edges });
    }

    let updated = state.nodes.map((n) => {
      if (n.id !== nodeId) return n;
      if (newParent && targetRoom) {
        const targetAbsPos = getAbsolutePosition(targetRoom.id, nodeMap);
        return {
          ...n,
          parentId: newParent,
          position: {
            x: absolutePosition.x - targetAbsPos.x,
            y: absolutePosition.y - targetAbsPos.y,
          },
        };
      } else {
        return {
          ...n,
          parentId: undefined,
          position: absolutePosition,
        };
      }
    });

    updated = sortNodesParentFirst(updated);

    set({ nodes: updated });
    get().saveToLocalStorage();
  },

  reparentAllDevices: (options) => {
    const state = get();
    const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));
    const updates = new Map<string, { parentId: string | undefined; position: { x: number; y: number } }>();

    // Diagnostic fingerprint — should never fire on current code paths. If it
    // does, some mutation is parenting waypoints under rooms despite the skip
    // here and the migration. Surfaces in user consoles too so support can ask
    // "do you see [waypoint-orphan] anywhere?" for a 5-second triage.
    const orphaned = state.nodes.filter((n) => n.type === "waypoint" && n.parentId);
    if (orphaned.length > 0) {
      console.warn(
        "[waypoint-orphan]",
        orphaned.length,
        "waypoints carrying parentId at reparent time",
        orphaned.slice(0, 5).map((n) => ({
          id: n.id,
          parentId: n.parentId,
          edgeId: (n.data as { edgeId?: string } | undefined)?.edgeId,
        })),
      );
    }

    for (const node of state.nodes) {
      // Waypoints belong to edges, not rooms — reparenting them turns their
      // .position into relative-to-room coords, which downstream sync code
      // mistakes for absolute and corrupts manualWaypoints.
      if (node.type === "room" || node.type === "waypoint") continue;

      const absPos = getAbsolutePosition(node.id, nodeMap);
      const nodeW = node.measured?.width ?? 144;
      const nodeH = node.measured?.height ?? 48;
      const centerX = absPos.x + nodeW / 2;
      const centerY = absPos.y + nodeH / 2;

      const targetRoom = findBestEnclosingRoom(node.id, false, centerX, centerY, state.nodes, nodeMap);
      const newParent = targetRoom?.id;
      if (node.parentId === newParent) continue;

      if (targetRoom) {
        const targetAbs = getAbsolutePosition(targetRoom.id, nodeMap);
        updates.set(node.id, {
          parentId: targetRoom.id,
          position: { x: absPos.x - targetAbs.x, y: absPos.y - targetAbs.y },
        });
      } else {
        updates.set(node.id, { parentId: undefined, position: absPos });
      }
    }

    if (updates.size === 0) return;

    if (!options?.skipUndo) {
      pushUndo({ nodes: state.nodes, edges: state.edges });
    }

    let updated = state.nodes.map((n) => {
      const u = updates.get(n.id);
      if (!u) return n;
      return { ...n, parentId: u.parentId, position: u.position };
    });
    updated = sortNodesParentFirst(updated);
    set({ nodes: updated });
    get().saveToLocalStorage();
  },

  onRoomResizeEnd: (_nodeId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    get().reparentAllDevices({ skipUndo: true });
  },

  pushSnapshot: () => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
  },

  setPendingUndoSnapshot: () => {
    const state = get();
    pendingUndoSnapshot = structuredClone({ nodes: state.nodes, edges: state.edges, pages: state.pages, bundles: state.bundles });
  },

  clearPendingUndoSnapshot: () => {
    pendingUndoSnapshot = null;
  },

  flushPendingSnapshot: () => {
    if (pendingUndoSnapshot) {
      // pushUndo consumes pendingUndoSnapshot automatically
      pushUndo({ nodes: get().nodes, edges: get().edges });
    }
  },

  beginLiveControlBatch: () => {
    const state = get();
    if (liveControlBatchDepth === 0) {
      liveControlBatchSnapshot = structuredClone({ nodes: state.nodes, edges: state.edges, pages: state.pages, bundles: state.bundles, autoRoute: state.autoRoute });
    }
    liveControlBatchDepth += 1;
  },

  commitLiveControlBatch: () => {
    if (liveControlBatchDepth === 0) return;
    liveControlBatchDepth -= 1;
    if (liveControlBatchDepth > 0) return;
    const snapshot = liveControlBatchSnapshot;
    liveControlBatchSnapshot = null;
    pendingUndoSnapshot = null;
    if (!snapshot) return;
    const state = get();
    const changed = JSON.stringify({ nodes: snapshot.nodes, edges: snapshot.edges, pages: snapshot.pages, autoRoute: snapshot.autoRoute }) !==
      JSON.stringify({ nodes: state.nodes, edges: state.edges, pages: state.pages, autoRoute: state.autoRoute });
    if (!changed) return;
    undoStack.push(structuredClone(snapshot));
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
    useSchematicStore.setState({ undoSize: undoStack.length, redoSize: 0 });
  },

  cancelLiveControlBatch: () => {
    liveControlBatchDepth = 0;
    liveControlBatchSnapshot = null;
    pendingUndoSnapshot = null;
  },

  undo: () => {
    const prev = undoStack.pop();
    if (!prev) return;
    const state = get();
    redoStack.push(structuredClone({ nodes: state.nodes, edges: state.edges, pages: state.pages, bundles: state.bundles, autoRoute: state.autoRoute }));
    const edges = prev.edges.map(({ zIndex: _, selected: _s, ...rest }) => ({ ...rest, zIndex: 0 })) as typeof prev.edges;
    const restoreAutoRoute = prev.autoRoute !== undefined ? { autoRoute: prev.autoRoute } : {};
    set({ nodes: prev.nodes, edges, pages: prev.pages ?? state.pages, bundles: prev.bundles ?? state.bundles, ...restoreAutoRoute, undoSize: undoStack.length, redoSize: redoStack.length });
    get().saveToLocalStorage();
  },

  redo: () => {
    const next = redoStack.pop();
    if (!next) return;
    const state = get();
    undoStack.push(structuredClone({ nodes: state.nodes, edges: state.edges, pages: state.pages, bundles: state.bundles, autoRoute: state.autoRoute }));
    const edges = next.edges.map(({ zIndex: _, selected: _s, ...rest }) => ({ ...rest, zIndex: 0 })) as typeof next.edges;
    const restoreAutoRoute = next.autoRoute !== undefined ? { autoRoute: next.autoRoute } : {};
    set({ nodes: next.nodes, edges, pages: next.pages ?? state.pages, bundles: next.bundles ?? state.bundles, ...restoreAutoRoute, undoSize: undoStack.length, redoSize: redoStack.length });
    get().saveToLocalStorage();
  },

  canUndo: () => undoStack.length > 0,
  canRedo: () => redoStack.length > 0,

  selectAll: () => {
    const state = get();
    set({
      nodes: state.nodes.map((n) => ({ ...n, selected: n.type !== "room" })),
      edges: state.edges.map((e) => ({ ...e, selected: true })),
    });
  },

  selectEdges: (ids) => {
    const want = new Set(ids);
    const state = get();
    set({
      nodes: state.nodes.some((n) => n.selected) ? state.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)) : state.nodes,
      edges: state.edges.map((e) => {
        const sel = want.has(e.id);
        return e.selected === sel ? e : { ...e, selected: sel };
      }),
    });
  },

  addCustomTemplate: (template) => {
    const updated = [...get().customTemplates, template];
    const order = [...get().customTemplateOrder, templateKey(template)];
    set({ customTemplates: updated, customTemplateOrder: order });
    saveCustomTemplates(updated);
    saveCustomTemplateMeta({ groups: get().customTemplateGroups, order, groupAssignments: get().customTemplateGroupAssignments });
  },

  updateCustomTemplate: (id, template) => {
    const updated = get().customTemplates.map((t) => (t.id === id ? template : t));
    set({ customTemplates: updated });
    saveCustomTemplates(updated);
  },

  addOwnedGear: (template, quantity = 1) => {
    const normalizedQuantity = Math.max(1, Math.floor(quantity));
    const key = templateKey(template);
    const ownedGear = [...get().ownedGear];
    const existing = ownedGear.find((item) => templateKey(item.template) === key);
    if (existing) {
      existing.quantity += normalizedQuantity;
    } else {
      ownedGear.push({ template: structuredClone(template), quantity: normalizedQuantity });
    }
    set({ ownedGear, showOwnedGearPane: true });
    get().saveToLocalStorage();
  },

  setOwnedGear: (items) => {
    const ownedGear = items
      .map((item) => ({
        template: structuredClone(item.template),
        quantity: Math.max(1, Math.floor(item.quantity)),
      }))
      .filter((item) => item.template && item.quantity > 0);
    set({ ownedGear, showOwnedGearPane: true });
    get().saveToLocalStorage();
  },

  updateOwnedGearQuantity: (key, quantity) => {
    const nextQuantity = Math.max(0, Math.floor(quantity));
    const ownedGear = nextQuantity === 0
      ? get().ownedGear.filter((item) => templateKey(item.template) !== key)
      : get().ownedGear.map((item) =>
          templateKey(item.template) === key
            ? { ...item, quantity: nextQuantity }
            : item,
        );
    set({ ownedGear });
    get().saveToLocalStorage();
  },

  removeOwnedGear: (key) => {
    set({ ownedGear: get().ownedGear.filter((item) => templateKey(item.template) !== key) });
    get().saveToLocalStorage();
  },

  setPendingQuickCreate: (ctx) => set({ pendingQuickCreate: ctx }),

  setCreateAddToOwned: (on) => {
    writePref(CREATE_ADD_TO_OWNED_KEY, String(on));
    set({ createAddToOwned: on });
  },

  syncProjectDevicesToOwned: () => {
    const state = get();
    // Count distinct placed devices by inventory key; keep one representative node
    // per key to synthesize a template from when no owned entry exists yet.
    const counts = new Map<string, { count: number; data: DeviceData }>();
    for (const node of state.nodes) {
      if (node.type !== "device") continue;
      const data = node.data as DeviceData;
      const key = inventoryKeyFromDeviceData(data);
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { count: 1, data });
    }
    if (counts.size === 0) return 0;

    const ownedByInventoryKey = new Map<string, OwnedGearItem>();
    const ownedGear = state.ownedGear.map((item) => {
      const copy = { ...item };
      ownedByInventoryKey.set(inventoryKeyFromTemplate(copy.template), copy);
      return copy;
    });

    let changed = 0;
    for (const [key, { count, data }] of counts) {
      const existing = ownedByInventoryKey.get(key);
      if (existing) {
        // Merge: owned quantity is raised to the canvas count, never lowered, so
        // re-running the sync is idempotent and never duplicates.
        if (existing.quantity < count) {
          existing.quantity = count;
          changed += 1;
        }
        continue;
      }
      // Synthesize a template from the placed device's spec. The label goes in the inventory
      // key's display-name slot (inventoryKeyFromTemplate), so it must agree with
      // inventoryKeyFromDeviceData's `model ?? baseLabel ?? label` — that is what groups renamed
      // instances back onto one owned row. Every spec field is carried so nothing is lost
      // (power, thermal, PoE, dimensions, cost, artwork, aux rows, …); per-instance fields
      // (layer, group, rotation, serials) are not.
      const template: DeviceTemplate = {
        deviceType: data.deviceType || "custom",
        label: (data.model ?? data.baseLabel ?? data.label ?? data.deviceType ?? "Device").trim() || "Device",
        ports: data.ports.map((p) => ({ ...p })),
        ...(data.shortName ? { shortName: data.shortName } : {}),
        ...(data.hostname ? { hostname: data.hostname } : {}),
        ...(data.manufacturer ? { manufacturer: data.manufacturer } : {}),
        ...(data.modelNumber ? { modelNumber: data.modelNumber } : {}),
        ...(data.category ? { category: data.category } : {}),
        ...(data.color ? { color: data.color } : {}),
        ...(data.artworkAssetId ? { artworkAssetId: data.artworkAssetId } : {}),
        ...(data.referenceUrl ? { referenceUrl: data.referenceUrl } : {}),
        ...(data.searchTerms ? { searchTerms: [...data.searchTerms] } : {}),
        ...(data.powerDrawW != null ? { powerDrawW: data.powerDrawW } : {}),
        ...(data.powerCapacityW != null ? { powerCapacityW: data.powerCapacityW } : {}),
        ...(data.voltage ? { voltage: data.voltage } : {}),
        ...(data.thermalBtuh != null ? { thermalBtuh: data.thermalBtuh } : {}),
        ...(data.isVenueProvided ? { isVenueProvided: data.isVenueProvided } : {}),
        ...(data.poeBudgetW != null ? { poeBudgetW: data.poeBudgetW } : {}),
        ...(data.poeDrawW != null ? { poeDrawW: data.poeDrawW } : {}),
        ...(data.unitCost != null ? { unitCost: data.unitCost } : {}),
        ...(data.heightMm != null ? { heightMm: data.heightMm } : {}),
        ...(data.widthMm != null ? { widthMm: data.widthMm } : {}),
        ...(data.depthMm != null ? { depthMm: data.depthMm } : {}),
        ...(data.weightKg != null ? { weightKg: data.weightKg } : {}),
        ...(data.auxiliaryData ? { auxiliaryData: structuredClone(data.auxiliaryData) } : {}),
        ...(data.templateId ? { id: data.templateId } : {}),
      };
      ownedGear.push({ template: structuredClone(template), quantity: count });
      changed += 1;
    }
    if (changed > 0) {
      set({ ownedGear, showOwnedGearPane: true });
      get().saveToLocalStorage();
    }
    return changed;
  },

  addOwnedCable: (item) => {
    const cable: OwnedCableItem = { ...item, id: crypto.randomUUID() };
    set({ ownedCables: [...get().ownedCables, cable] });
    get().saveToLocalStorage();
  },

  addOwnedInventoryItem: (item) => {
    const entry: OwnedInventoryItem = { ...item, id: crypto.randomUUID() };
    set({ ownedInventory: [...get().ownedInventory, entry] });
    get().saveToLocalStorage();
  },
  updateOwnedInventoryItem: (id, patch) => {
    set({ ownedInventory: get().ownedInventory.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
    get().saveToLocalStorage();
  },
  removeOwnedInventoryItem: (id) => {
    set({ ownedInventory: get().ownedInventory.filter((it) => it.id !== id) });
    get().saveToLocalStorage();
  },

  updateOwnedCable: (id, patch) => {
    set({
      ownedCables: get().ownedCables.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
    get().saveToLocalStorage();
  },

  removeOwnedCable: (id) => {
    // Strip the cable from any connection chains so assignments never dangle.
    const edges = get().edges.map((e) =>
      e.data?.assignedCableIds?.includes(id)
        ? { ...e, data: { ...e.data, assignedCableIds: e.data.assignedCableIds.filter((cid) => cid !== id) } }
        : e,
    );
    set({ ownedCables: get().ownedCables.filter((c) => c.id !== id), edges });
    get().saveToLocalStorage();
  },

  setEdgeAssignedCables: (edgeId, cableIds) => {
    pushUndo({ nodes: get().nodes, edges: get().edges });
    // Mirror the chain total into cableLength so the cable schedule, pack
    // list, and CSV export pick the assignment up with zero extra plumbing.
    const byId = new Map(get().ownedCables.map((c) => [c.id, c]));
    const chain = cableIds
      .map((cid) => byId.get(cid))
      .filter((c): c is OwnedCableItem => !!c);
    const total = chain.reduce((sum, c) => sum + c.length, 0);
    const unit = get().distanceSettings?.unit ?? "ft";
    const summary =
      chain.length > 0
        ? `${Number.isInteger(total) ? total : total.toFixed(1)} ${unit}${
            chain.length > 1 ? ` (${chain.map((c) => c.length).join("+")})` : ""
          }`
        : undefined;
    set({
      edges: get().edges.map((e) =>
        e.id === edgeId
          ? {
              ...e,
              data: {
                ...e.data!,
                assignedCableIds: cableIds.length > 0 ? cableIds : undefined,
                ...(summary !== undefined ? { cableLength: summary } : {}),
              },
            }
          : e,
      ),
    });
    get().saveToLocalStorage();
  },

  cableAssignEdgeId: null,
  setCableAssignEdgeId: (edgeId) => set({ cableAssignEdgeId: edgeId }),
  showCableInventory: false,
  setShowCableInventory: (show) => set({ showCableInventory: show }),

  canvasViewMode: readInitialCanvasViewMode(),
  setCanvasViewMode: (mode) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(CANVAS_VIEW_MODE_KEY, mode);
    set({ canvasViewMode: mode });
  },
  nodeCompact: readBoolPref(NODE_COMPACT_KEY, false),
  setNodeCompact: (compact) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(NODE_COMPACT_KEY, String(compact));
    set({ nodeCompact: compact });
  },
  liveSignal: readBoolPref(LIVE_SIGNAL_KEY, false),
  setLiveSignal: (on) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(LIVE_SIGNAL_KEY, String(on));
    set({ liveSignal: on });
  },

  colorBy: "signal",
  setColorBy: (axis) => set({ colorBy: axis }),
  layerColorMode:
    typeof localStorage !== "undefined" && localStorage.getItem(LAYER_COLOR_MODE_KEY) === "tint"
      ? "tint"
      : "band",
  setLayerColorMode: (mode) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(LAYER_COLOR_MODE_KEY, mode);
    set({ layerColorMode: mode });
  },
  bundleView: readBoolPref(BUNDLE_VIEW_KEY, true),
  setBundleView: (on) => {
    writePref(BUNDLE_VIEW_KEY, String(on));
    set({ bundleView: on });
  },
  detailLevel: readEnumPref(DETAIL_LEVEL_KEY, ["plain", "technical"] as const, DEFAULT_DETAIL_LEVEL),
  setDetailLevel: (level) => {
    writePref(DETAIL_LEVEL_KEY, level);
    set({ detailLevel: level });
  },
  lengthUnitMode: readEnumPref(LENGTH_UNIT_MODE_KEY, ["m", "ft", "both"] as const, "m"),
  setLengthUnitMode: (mode) => {
    writePref(LENGTH_UNIT_MODE_KEY, mode);
    set({ lengthUnitMode: mode });
  },
  cableIdLabelScope: readEnumPref(CABLE_ID_LABEL_SCOPE_KEY, ["selected", "all"] as const, "all"),
  setCableIdLabelScope: (scope) => {
    writePref(CABLE_ID_LABEL_SCOPE_KEY, scope);
    set({ cableIdLabelScope: scope });
  },
  reduceMotion: readBoolPref(REDUCE_MOTION_KEY, false),
  setReduceMotion: (on) => {
    writePref(REDUCE_MOTION_KEY, String(on));
    set({ reduceMotion: on });
  },
  uiScale: clampUiScale(
    typeof localStorage !== "undefined" ? Number(localStorage.getItem(UI_SCALE_KEY) ?? 1) : 1,
  ),
  setUiScale: (scale) => {
    const next = clampUiScale(scale);
    writePref(UI_SCALE_KEY, String(next));
    set({ uiScale: next });
  },
  showArtwork: readBoolPref(SHOW_ARTWORK_KEY, true),
  setShowArtwork: (on) => {
    writePref(SHOW_ARTWORK_KEY, String(on));
    set({ showArtwork: on });
  },
  nodeColors: {},
  setNodeColor: (ids, color) => {
    if (ids.length === 0) return;
    const next = { ...get().nodeColors };
    for (const id of ids) {
      if (color === null) delete next[id];
      else next[id] = color;
    }
    set({ nodeColors: next });
  },
  nodeView: {},
  setNodeView: (ids, tier) => {
    if (ids.length === 0) return;
    const next = { ...get().nodeView };
    for (const id of ids) {
      if (tier === null) delete next[id];
      else next[id] = tier;
    }
    set({ nodeView: next });
  },

  coverageVisible: readInitialCoverageVisible(),
  setCoverageVisible: (visible) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(COVERAGE_VISIBLE_KEY, visible ? "1" : "0");
    set({ coverageVisible: visible });
  },

  setShowMiniMap: (visible) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(MINIMAP_VISIBLE_KEY, visible ? "1" : "0");
    set({ showMiniMap: visible });
  },
  setShowWarnings: (visible) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(SHOW_WARNINGS_KEY, visible ? "1" : "0");
    set({ showWarnings: visible });
  },
  setGridSettings: (patch) => {
    set({ gridSettings: { ...get().gridSettings, ...patch } });
    get().saveToLocalStorage();
  },
  dismissIssue: (id) => {
    if (get().dismissedIssueIds.includes(id)) return;
    set({ dismissedIssueIds: [...get().dismissedIssueIds, id] });
    get().saveToLocalStorage();
  },
  undismissIssue: (id) => {
    set({ dismissedIssueIds: get().dismissedIssueIds.filter((x) => x !== id) });
    get().saveToLocalStorage();
  },
  clearDismissedIssues: () => {
    set({ dismissedIssueIds: [] });
    get().saveToLocalStorage();
  },

  recordSuggestions: (patch) => {
    const state = get();
    const mergeUnique = (existing: string[], incoming: string[]): string[] => {
      const seen = new Set(existing);
      const next = [...existing];
      for (const raw of incoming) {
        const v = raw.trim();
        if (v && !seen.has(v)) { seen.add(v); next.push(v); }
      }
      return next.length === existing.length ? existing : next;
    };
    const fs = state.fieldSuggestions;
    const tagSuggestions = patch.tags?.length ? mergeUnique(state.tagSuggestions, patch.tags) : state.tagSuggestions;
    const manufacturer = patch.manufacturer ? mergeUnique(fs.manufacturer ?? [], [patch.manufacturer]) : fs.manufacturer;
    const category = patch.category ? mergeUnique(fs.category ?? [], [patch.category]) : fs.category;
    const deviceType = patch.deviceType ? mergeUnique(fs.deviceType ?? [], [patch.deviceType]) : fs.deviceType;
    const changed =
      tagSuggestions !== state.tagSuggestions ||
      manufacturer !== fs.manufacturer ||
      category !== fs.category ||
      deviceType !== fs.deviceType;
    if (!changed) return;
    set({ tagSuggestions, fieldSuggestions: { manufacturer, category, deviceType } });
    get().saveToLocalStorage();
  },

  // ── Per-unit gear inventory (Phase 4) — not undoable (like ownedGear/ownedCables) ──
  addGearUnit: (unit) => {
    set({ gearUnits: addUnit(get().gearUnits, unit, crypto.randomUUID()) });
    get().saveToLocalStorage();
  },
  updateGearUnit: (id, patch) => {
    set({ gearUnits: updateUnit(get().gearUnits, id, patch) });
    get().saveToLocalStorage();
  },
  removeGearUnit: (id) => {
    set({ gearUnits: removeUnit(get().gearUnits, id) });
    get().saveToLocalStorage();
  },
  assignGearUnit: (unitId, nodeId) => {
    set({ gearUnits: assignUnit(get().gearUnits, unitId, nodeId) });
    get().saveToLocalStorage();
  },
  unassignGearUnit: (unitId) => {
    set({ gearUnits: unassignUnit(get().gearUnits, unitId) });
    get().saveToLocalStorage();
  },

  // ── Custom SVG assets (Phase 6) — project resource, not undoable ──
  addSvgAsset: (svg) => {
    // Defense-in-depth: the store never holds unsanitized SVG, regardless of caller.
    const clean = sanitizeSvg(svg);
    if (!clean) return "";
    const id = crypto.randomUUID();
    set({ svgAssets: { ...get().svgAssets, [id]: clean } });
    get().saveToLocalStorage();
    return id;
  },
  removeSvgAsset: (id) => {
    const next = { ...get().svgAssets };
    delete next[id];
    set({ svgAssets: next });
    get().saveToLocalStorage();
  },
  svgImportTargetNodeId: null,
  setSvgImportTarget: (nodeId) => set({ svgImportTargetNodeId: nodeId }),
  setNodeSvgAsset: (nodeId, assetId) => {
    pushUndo({ nodes: get().nodes, edges: get().edges });
    set({
      nodes: get().nodes.map((n) => {
        if (n.id !== nodeId) return n;
        if (n.type === "device") return { ...n, data: { ...n.data, layoutSvgAssetId: assetId } } as SchematicNode;
        if (n.type === "object") return { ...n, data: { ...n.data, svgAssetId: assetId } } as SchematicNode;
        return n;
      }),
    });
    get().saveToLocalStorage();
  },

  // ── Layout objects (furniture) + colour zones (Phase 5) — undoable canvas changes ──
  pendingObjectPlacement: null,
  setPendingObjectPlacement: (value) => set({ pendingObjectPlacement: value }),
  addObject: (position, entry, svgAssetId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const id = crypto.randomUUID();
    const newObject: SchematicNode = {
      id,
      type: "object",
      position,
      data: {
        label: entry.label,
        catalogId: entry.id,
        widthM: entry.defaultWidthM,
        depthM: entry.defaultDepthM,
        color: entry.defaultColor,
        // AV-relevant furniture (lecterns, screens, stands, racks) is essential hardware,
        // so it defaults to appearing in the Schematic view too — toggleable in the Inspector.
        ...(entry.category === "av-furniture" ? { showInSchematic: true } : {}),
        ...(svgAssetId ? { svgAssetId } : {}),
      },
      selected: true,
    };
    const deselected = state.nodes.map((n) => (n.selected ? { ...n, selected: false } : n));
    set({ nodes: [...deselected, newObject] });
    // Nest the object in whatever room it was dropped into (same spatial rule as devices).
    get().reparentNode(id, position, { skipUndo: true });
    get().saveToLocalStorage();
  },
  addZone: (position, size) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const newZone: SchematicNode = {
      id: crypto.randomUUID(),
      type: "zone",
      position,
      data: { label: "Zone", color: "#38bdf833" },
      style: { width: size?.width ?? 320, height: size?.height ?? 220 },
      selected: true,
      zIndex: -2, // beneath rooms (-1) and devices
    };
    const deselected = state.nodes.map((n) => (n.selected ? { ...n, selected: false } : n));
    set({ nodes: [newZone, ...deselected] });
    get().saveToLocalStorage();
  },
  updateObjectData: (id, patch) => {
    pushUndo({ nodes: get().nodes, edges: get().edges });
    set({
      nodes: get().nodes.map((n) =>
        n.id === id && n.type === "object" ? ({ ...n, data: { ...n.data, ...patch } } as SchematicNode) : n,
      ),
    });
    get().saveToLocalStorage();
  },
  updateZoneData: (id, patch) => {
    pushUndo({ nodes: get().nodes, edges: get().edges });
    set({
      nodes: get().nodes.map((n) =>
        n.id === id && n.type === "zone" ? ({ ...n, data: { ...n.data, ...patch } } as SchematicNode) : n,
      ),
    });
    get().saveToLocalStorage();
  },

  // ── Transport / logistics containers (Phase 7) — operational state, not undoable ──
  addContainer: (name) => {
    set({ containers: [...get().containers, { id: crypto.randomUUID(), name, items: [], checklist: {} }] });
    get().saveToLocalStorage();
  },
  removeContainer: (id) => {
    set({ containers: get().containers.filter((c) => c.id !== id) });
    get().saveToLocalStorage();
  },
  renameContainer: (id, name) => {
    set({ containers: get().containers.map((c) => (c.id === id ? { ...c, name } : c)) });
    get().saveToLocalStorage();
  },
  setContainerColor: (id, color) => {
    set({ containers: get().containers.map((c) => (c.id === id ? { ...c, color: color || undefined } : c)) });
    get().saveToLocalStorage();
  },
  addItemToContainer: (id, item) => {
    const key = `${item.kind}:${item.refId}`;
    set({
      containers: get().containers.map((c) => {
        if (c.id !== id) return c;
        if (c.items.some((it) => `${it.kind}:${it.refId}` === key)) return c;
        return { ...c, items: [...c.items, item] };
      }),
    });
    get().saveToLocalStorage();
  },
  removeItemFromContainer: (id, itemKey) => {
    set({
      containers: get().containers.map((c) =>
        c.id === id ? { ...c, items: c.items.filter((it) => `${it.kind}:${it.refId}` !== itemKey) } : c,
      ),
    });
    get().saveToLocalStorage();
  },
  setContainerItemChecked: (id, phase, itemKey, checked) => {
    set({
      containers: get().containers.map((c) => (c.id === id ? setContainerItemCheckedPure(c, phase, itemKey, checked) : c)),
    });
    get().saveToLocalStorage();
  },
  clearContainerPhase: (id, phase) => {
    set({
      containers: get().containers.map((c) => (c.id === id ? { ...c, checklist: { ...c.checklist, [phase]: {} } } : c)),
    });
    get().saveToLocalStorage();
  },

  activeTool: DEFAULT_TOOL,
  setActiveTool: (tool) => set({ activeTool: tool }),
  quickAddNonce: 0,
  requestQuickAdd: () => set({ quickAddNonce: get().quickAddNonce + 1 }),
  deviceDrawerPinned: readInitialDeviceDrawerPinned(),
  setDeviceDrawerPinned: (pinned) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(DEVICE_DRAWER_PINNED_KEY, pinned ? "1" : "0");
    set({ deviceDrawerPinned: pinned });
  },
  libraryDensity: readInitialLibraryDensity(),
  setLibraryDensity: (density) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(LIBRARY_DENSITY_KEY, density);
    set({ libraryDensity: density });
  },

  guidedSetupOpen: false,
  setGuidedSetupOpen: (open) => set({ guidedSetupOpen: open }),

  editingRoomShapeId: null,
  setEditingRoomShape: (id) => {
    if (id) {
      const node = get().nodes.find((n) => n.id === id && n.type === "room");
      const shape = (node?.data as { shape?: { x: number; y: number }[] } | undefined)?.shape;
      if (node && (!shape || shape.length < 3)) {
        // Seed editing with the room's current rectangle outline.
        get().updateRoomShape(id, DEFAULT_RECT_SHAPE.map((p) => ({ ...p })), true);
      }
    }
    set({ editingRoomShapeId: id });
  },

  updateRoomShape: (id, shape, recordUndo = false) => {
    if (recordUndo) pushUndo({ nodes: get().nodes, edges: get().edges });
    set({
      nodes: get().nodes.map((n) =>
        n.id === id && n.type === "room"
          ? ({
              ...n,
              data: {
                ...n.data,
                shape: shape && shape.length >= 3 ? shape : undefined,
              },
            } as SchematicNode)
          : n,
      ),
    });
  },


  addLayer: (name) => {
    set({ layers: [...get().layers, { id: crypto.randomUUID(), name, visible: true, locked: false }] });
    get().saveToLocalStorage();
  },

  renameLayer: (id, name) => {
    set({ layers: get().layers.map((l) => (l.id === id ? { ...l, name } : l)) });
    get().saveToLocalStorage();
  },

  removeLayer: (id) => {
    if (id === DEFAULT_LAYER_ID) return;
    // Members fall back to the default layer so nothing disappears.
    set({
      layers: get().layers.filter((l) => l.id !== id),
      nodes: get().nodes.map((n) =>
        (n.data as { layerId?: string }).layerId === id
          ? ({ ...n, data: { ...n.data, layerId: undefined } } as SchematicNode)
          : n,
      ),
      edges: get().edges.map((e) =>
        e.data?.layerId === id ? { ...e, data: { ...e.data!, layerId: undefined } } : e,
      ),
    });
    get().saveToLocalStorage();
  },

  toggleLayerVisible: (id) => {
    set({ layers: get().layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)) });
    get().saveToLocalStorage();
  },

  toggleLayerLocked: (id) => {
    set({ layers: get().layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)) });
    get().saveToLocalStorage();
  },

  setLayerColor: (id, color) => {
    set({ layers: get().layers.map((l) => (l.id === id ? { ...l, color: color || undefined } : l)) });
    get().saveToLocalStorage();
  },

  setLayerParent: (layerId, parentId) => {
    if (layerId === DEFAULT_LAYER_ID) return; // the base layer is always a root
    const layers = get().layers;
    if (!layers.some((l) => l.id === layerId)) return;
    // Normalize + validate the target parent.
    const nextParent = parentId ?? undefined;
    if (nextParent !== undefined) {
      if (!layers.some((l) => l.id === nextParent)) return; // unknown parent
      if (wouldCreateLayerCycle(layers, layerId, nextParent)) return; // self/descendant
    }
    set({
      layers: layers.map((l) => (l.id === layerId ? { ...l, parentId: nextParent } : l)),
    });
    get().saveToLocalStorage();
  },

  isLayerEffectivelyHidden: (layerId) => isLayerEffectivelyHiddenIn(get().layers, layerId),
  isLayerEffectivelyLocked: (layerId) => isLayerEffectivelyLockedIn(get().layers, layerId),

  // Per-item Layers/Groups view overrides — ephemeral (no persist, no undo).
  hiddenNodeIds: [],
  lockedNodeIds: [],
  soloLayerId: null,
  toggleNodeHidden: (id) => {
    const cur = get().hiddenNodeIds;
    set({ hiddenNodeIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  },
  toggleNodeLocked: (id) => {
    const cur = get().lockedNodeIds;
    set({ lockedNodeIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  },
  setNodesHidden: (ids, hidden) => {
    const next = new Set(get().hiddenNodeIds);
    for (const id of ids) {
      if (hidden) next.add(id);
      else next.delete(id);
    }
    set({ hiddenNodeIds: [...next] });
  },
  setNodesLocked: (ids, locked) => {
    const next = new Set(get().lockedNodeIds);
    for (const id of ids) {
      if (locked) next.add(id);
      else next.delete(id);
    }
    set({ lockedNodeIds: [...next] });
  },
  setSoloLayer: (layerId) => set({ soloLayerId: get().soloLayerId === layerId ? null : layerId }),

  assignSelectionToLayer: (layerId) => {
    pushUndo({ nodes: get().nodes, edges: get().edges });
    const lid = layerId === DEFAULT_LAYER_ID ? undefined : layerId;
    set({
      nodes: get().nodes.map((n) =>
        n.selected ? ({ ...n, data: { ...n.data, layerId: lid } } as SchematicNode) : n,
      ),
      edges: get().edges.map((e) =>
        e.selected ? { ...e, data: { ...e.data!, layerId: lid } } : e,
      ),
    });
    get().saveToLocalStorage();
  },

  groupSelection: () => {
    const selIds = new Set(get().nodes.filter((n) => n.selected).map((n) => n.id));
    if (selIds.size < 2) {
      get().addToast("Select 2 or more items to group", "info");
      return;
    }
    pushUndo({ nodes: get().nodes, edges: get().edges });
    const gid = crypto.randomUUID();
    set({ nodes: withGroupId(get().nodes, selIds, gid) as SchematicNode[] });
    get().saveToLocalStorage();
    get().addToast(`Grouped ${selIds.size} items`, "info");
  },

  ungroupSelection: () => {
    const selIds = new Set(
      get().nodes.filter((n) => n.selected && groupIdOf(n)).map((n) => n.id),
    );
    if (selIds.size === 0) return;
    pushUndo({ nodes: get().nodes, edges: get().edges });
    set({ nodes: withoutGroupId(get().nodes, selIds) as SchematicNode[] });
    get().saveToLocalStorage();
    get().addToast(`Ungrouped ${selIds.size} item${selIds.size > 1 ? "s" : ""}`, "info");
  },

  setDeviceHost: (deviceId, hostId) => {
    pushUndo({ nodes: get().nodes, edges: get().edges });
    set({
      nodes: get().nodes.map((n) =>
        n.id === deviceId && n.type === "device"
          ? ({ ...n, data: { ...n.data, hostDeviceId: hostId } } as SchematicNode)
          : n,
      ),
    });
    get().saveToLocalStorage();
  },

  rotateDevice: (deviceId, deltaDeg) => {
    pushUndo({ nodes: get().nodes, edges: get().edges });
    set({
      nodes: get().nodes.map((n) =>
        n.id === deviceId && n.type === "device"
          ? ({
              ...n,
              data: { ...n.data, rotationDeg: rotateBy((n.data as { rotationDeg?: number }).rotationDeg, deltaDeg) },
            } as SchematicNode)
          : n,
      ),
    });
    get().saveToLocalStorage();
  },

  setDeviceRotation: (deviceId, deg, recordUndo = true) => {
    if (recordUndo) pushUndo({ nodes: get().nodes, edges: get().edges });
    set({
      nodes: get().nodes.map((n) =>
        n.id === deviceId && n.type === "device"
          ? ({ ...n, data: { ...n.data, rotationDeg: normalizeRotationDeg(deg) } } as SchematicNode)
          : n,
      ),
    });
    if (recordUndo) get().saveToLocalStorage();
  },

  reorderNodeZ: (draggedId, targetId, place) => {
    const cur = get().nodes;
    const next = reorderNodesByZ(cur, draggedId, targetId, place);
    const changed = next.length === cur.length && next.some((n, i) => n.id !== cur[i].id);
    if (!changed) return;
    pushUndo({ nodes: cur, edges: get().edges });
    set({ nodes: next });
    get().saveToLocalStorage();
  },

  setShowOwnedGearPane: (show) => {
    set({
      showOwnedGearPane: show,
      libraryActiveTab: show ? get().libraryActiveTab : "devices",
    });
    get().saveToLocalStorage();
  },

  setLibraryActiveTab: (tab) => {
    set({ libraryActiveTab: tab });
    get().saveToLocalStorage();
  },

  removeCustomTemplate: (key) => {
    const updated = get().customTemplates.filter((t) => templateKey(t) !== key);
    const order = get().customTemplateOrder.filter((k) => k !== key);
    const { [key]: _, ...groupAssignments } = get().customTemplateGroupAssignments;
    set({ customTemplates: updated, customTemplateOrder: order, customTemplateGroupAssignments: groupAssignments });
    saveCustomTemplates(updated);
    saveCustomTemplateMeta({ groups: get().customTemplateGroups, order, groupAssignments });
  },

  clearAllCustomTemplates: () => {
    set({
      customTemplates: [],
      customTemplateOrder: [],
      customTemplateGroups: [],
      customTemplateGroupAssignments: {},
    });
    saveCustomTemplates([]);
    saveCustomTemplateMeta({ groups: [], order: [], groupAssignments: {} });
  },

  // Custom template organization (#62)
  reorderCustomTemplate: (key, targetIndex) => {
    const order = get().customTemplateOrder.filter((k) => k !== key);
    order.splice(targetIndex, 0, key);
    set({ customTemplateOrder: order });
    saveCustomTemplateMeta({ groups: get().customTemplateGroups, order, groupAssignments: get().customTemplateGroupAssignments });
  },

  moveCustomTemplateToGroup: (key, groupId) => {
    const groupAssignments = { ...get().customTemplateGroupAssignments };
    if (groupId) {
      groupAssignments[key] = groupId;
    } else {
      delete groupAssignments[key];
    }
    set({ customTemplateGroupAssignments: groupAssignments });
    saveCustomTemplateMeta({ groups: get().customTemplateGroups, order: get().customTemplateOrder, groupAssignments });
  },

  addCustomTemplateGroup: (label) => {
    const id = `group-${Date.now()}`;
    const groups = [...get().customTemplateGroups, { id, label }];
    set({ customTemplateGroups: groups });
    saveCustomTemplateMeta({ groups, order: get().customTemplateOrder, groupAssignments: get().customTemplateGroupAssignments });
    return id;
  },

  removeCustomTemplateGroup: (groupId) => {
    const groups = get().customTemplateGroups.filter((g) => g.id !== groupId);
    const groupAssignments = { ...get().customTemplateGroupAssignments };
    for (const [dt, gid] of Object.entries(groupAssignments)) {
      if (gid === groupId) delete groupAssignments[dt];
    }
    set({ customTemplateGroups: groups, customTemplateGroupAssignments: groupAssignments });
    saveCustomTemplateMeta({ groups, order: get().customTemplateOrder, groupAssignments });
  },

  renameCustomTemplateGroup: (groupId, label) => {
    const groups = get().customTemplateGroups.map((g) => g.id === groupId ? { ...g, label } : g);
    set({ customTemplateGroups: groups });
    saveCustomTemplateMeta({ groups, order: get().customTemplateOrder, groupAssignments: get().customTemplateGroupAssignments });
  },

  reorderCustomTemplateGroup: (groupId, newIndex) => {
    const groups = get().customTemplateGroups.filter((g) => g.id !== groupId);
    const group = get().customTemplateGroups.find((g) => g.id === groupId);
    if (!group) return;
    groups.splice(newIndex, 0, group);
    set({ customTemplateGroups: groups });
    saveCustomTemplateMeta({ groups, order: get().customTemplateOrder, groupAssignments: get().customTemplateGroupAssignments });
  },

  toggleCustomGroupCollapsed: (groupId) => {
    const groups = get().customTemplateGroups.map((g) =>
      g.id === groupId ? { ...g, collapsed: !g.collapsed } : g,
    );
    set({ customTemplateGroups: groups });
    saveCustomTemplateMeta({ groups, order: get().customTemplateOrder, groupAssignments: get().customTemplateGroupAssignments });
  },

  // Category order (#62)
  reorderCategory: (category, targetIndex) => {
    // Build from current order or default
    const current = get().categoryOrder;
    const arr = current ? [...current] : [...CATEGORY_ORDER_DEFAULT];
    const fromIndex = arr.indexOf(category);
    if (fromIndex === -1) return;
    arr.splice(fromIndex, 1);
    arr.splice(targetIndex, 0, category);
    set({ categoryOrder: arr });
    saveCategoryOrder(arr);
  },

  resetCategoryOrder: () => {
    set({ categoryOrder: null });
    saveCategoryOrder(null);
  },

  dismissIncompatibleDialog: () => {
    set({ pendingIncompatibleConnection: null });
  },

  forceIncompatibleConnection: () => {
    const state = get();
    const pending = state.pendingIncompatibleConnection;
    if (!pending) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const incompatibleData: ConnectionData = {
      signalType: pending.sourcePort.signalType,
      connectorMismatch: true,
      allowIncompatible: true,
    };
    const existingEdges = ensureUniqueEdgeIds(state.edges);
    const newEdge: ConnectionEdge = {
      id: nextEdgeId(existingEdges),
      source: pending.connection.source,
      target: pending.connection.target,
      sourceHandle: pending.connection.sourceHandle,
      targetHandle: pending.connection.targetHandle,
      data: incompatibleData,
      style: {
        stroke: resolveEdgeStroke(incompatibleData),
        strokeWidth: 2,
      },
    };

    set({
      nodes: existingEdges === state.edges ? state.nodes : reconcileWaypointNodes(state.nodes, existingEdges),
      edges: [...existingEdges, newEdge],
      pendingIncompatibleConnection: null,
    });
    get().saveToLocalStorage();
  },

  insertAdapterBetween: (template) => {
    const state = get();
    const pending = state.pendingIncompatibleConnection;
    if (!pending) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });

    // Resolve source and target device absolute positions for midpoint
    const sourceNode = state.nodes.find((n) => n.id === pending.connection.source);
    const targetNode = state.nodes.find((n) => n.id === pending.connection.target);
    if (!sourceNode || !targetNode) {
      set({ pendingIncompatibleConnection: null });
      return;
    }

    // Compute absolute positions, walking the full parent chain so devices
    // inside a rack inside a room resolve correctly.
    const adapterNodeMap = new Map(state.nodes.map((n) => [n.id, n]));
    const absPos = (node: SchematicNode): { x: number; y: number } => {
      let x = node.position.x;
      let y = node.position.y;
      let pid: string | undefined = node.parentId;
      while (pid) {
        const parent = adapterNodeMap.get(pid);
        if (!parent) break;
        x += parent.position.x;
        y += parent.position.y;
        pid = parent.parentId;
      }
      return { x, y };
    };

    const srcAbs = absPos(sourceNode);
    const tgtAbs = absPos(targetNode);
    const srcW = sourceNode.measured?.width ?? 144;
    const tgtW = targetNode.measured?.width ?? 144;

    // Midpoint between the right edge of the left device and left edge of the right device
    // (or just center-to-center if they're stacked vertically)
    const srcCenterX = srcAbs.x + srcW / 2;
    const tgtCenterX = tgtAbs.x + tgtW / 2;
    const srcCenterY = srcAbs.y + (sourceNode.measured?.height ?? 48) / 2;
    const tgtCenterY = tgtAbs.y + (targetNode.measured?.height ?? 48) / 2;

    let idealX = Math.round(((srcCenterX + tgtCenterX) / 2) / GRID_SIZE) * GRID_SIZE;
    let idealY = Math.round(((srcCenterY + tgtCenterY) / 2) / GRID_SIZE) * GRID_SIZE;

    // If both are in the same room, parent the adapter there too
    const adapterParentId = (sourceNode.parentId && sourceNode.parentId === targetNode.parentId)
      ? sourceNode.parentId : undefined;

    // Convert back to parent-relative coords if parented
    if (adapterParentId) {
      const parentNode = state.nodes.find((n) => n.id === adapterParentId);
      if (parentNode) {
        idealX -= parentNode.position.x;
        idealY -= parentNode.position.y;
      }
    }

    // Snap to grid
    idealX = Math.round(idealX / GRID_SIZE) * GRID_SIZE;
    idealY = Math.round(idealY / GRID_SIZE) * GRID_SIZE;

    // Create adapter device
    const preset = template.id ? state.templatePresets[template.id] : undefined;
    let adapterPorts: Port[];
    let hiddenPorts: string[] | undefined;
    let color = template.color;

    if (preset) {
      const cloned = clonePorts(preset.ports);
      const idMap = new Map<string, string>();
      preset.ports.forEach((p, i) => { idMap.set(p.id, cloned[i].id); });
      adapterPorts = cloned;
      hiddenPorts = preset.hiddenPorts?.map((id) => idMap.get(id) ?? id).filter((id) => cloned.some((p) => p.id === id));
      color = preset.color ?? template.color;
    } else {
      adapterPorts = clonePorts(template.ports);
    }

    const adapterId = nextNodeId();
    let adapterNode: DeviceNode = {
      id: adapterId,
      type: "device",
      position: { x: idealX, y: idealY },
      ...(adapterParentId ? { parentId: adapterParentId } : {}),
      data: {
        label: template.label,
        deviceType: template.deviceType,
        ports: adapterPorts,
        color,
        baseLabel: template.label,
        model: template.label,
        ...(template.shortName ? { shortName: template.shortName } : {}),
        ...(template.id ? { templateId: template.id } : {}),
        ...(template.version ? { templateVersion: template.version } : {}),
        ...(template.manufacturer ? { manufacturer: template.manufacturer } : {}),
        ...(template.modelNumber ? { modelNumber: template.modelNumber } : {}),
        ...(template.referenceUrl ? { referenceUrl: template.referenceUrl } : {}),
        ...(template.category ? { category: template.category } : {}),
        ...(hiddenPorts && hiddenPorts.length > 0 ? { hiddenPorts } : {}),
      },
    };

    // Nudge adapter position if it overlaps existing devices
    const MIN_GAP = GRID_SIZE * 5; // 80px — enough for stubs + routing
    const adapterW = 144; // approximate width before measurement
    const adapterH = 48;
    let posX = adapterNode.position.x;
    const posY = adapterNode.position.y;
    for (const other of state.nodes) {
      if (other.type !== "device") continue;
      if (other.parentId !== adapterParentId) continue;
      const ow = other.measured?.width ?? 144;
      const oh = other.measured?.height ?? 48;
      // Check AABB overlap with gap
      const overlapX = posX < other.position.x + ow + MIN_GAP && posX + adapterW + MIN_GAP > other.position.x;
      const overlapY = posY < other.position.y + oh && posY + adapterH > other.position.y;
      if (overlapX && overlapY) {
        // Push horizontally toward the midpoint direction
        const pushRight = other.position.x + ow + MIN_GAP;
        const pushLeft = other.position.x - adapterW - MIN_GAP;
        // Pick whichever side is closer to the ideal position
        if (Math.abs(pushRight - idealX) < Math.abs(pushLeft - idealX)) {
          posX = Math.round(pushRight / GRID_SIZE) * GRID_SIZE;
        } else {
          posX = Math.round(pushLeft / GRID_SIZE) * GRID_SIZE;
        }
      }
    }
    adapterNode = { ...adapterNode, position: { x: posX, y: posY } };

    // Find matching ports on adapter
    const adapterInput = adapterPorts.find(
      (p) => (p.direction === "input" || p.direction === "bidirectional") && p.signalType === pending.sourcePort.signalType,
    );
    const adapterOutput = adapterPorts.find(
      (p) => (p.direction === "output" || p.direction === "bidirectional") && p.signalType === pending.targetPort.signalType,
    );

    const existingEdges = ensureUniqueEdgeIds(state.edges);
    const newEdges: ConnectionEdge[] = [];

    if (adapterInput) {
      const inputHandle = adapterInput.direction === "bidirectional" ? `${adapterInput.id}-in` : adapterInput.id;
      const inputData: ConnectionData = {
        signalType: pending.sourcePort.signalType,
        ...(!areConnectorsCompatible(pending.sourcePort.connectorType, adapterInput.connectorType) ? { connectorMismatch: true } : {}),
        ...(adapterInput.directAttach ? { directAttach: true } : {}),
      };
      newEdges.push({
        id: nextEdgeId([...existingEdges, ...newEdges]),
        source: pending.connection.source,
        target: adapterId,
        sourceHandle: pending.connection.sourceHandle,
        targetHandle: inputHandle,
        data: inputData,
        style: {
          stroke: resolveEdgeStroke(inputData),
          strokeWidth: adapterInput.directAttach ? 1 : 2,
        },
      });
    }

    if (adapterOutput) {
      const outputHandle = adapterOutput.direction === "bidirectional" ? `${adapterOutput.id}-out` : adapterOutput.id;
      const outputData: ConnectionData = {
        signalType: pending.targetPort.signalType,
        ...(!areConnectorsCompatible(adapterOutput.connectorType, pending.targetPort.connectorType) ? { connectorMismatch: true } : {}),
        ...(adapterOutput.directAttach ? { directAttach: true } : {}),
      };
      newEdges.push({
        id: nextEdgeId([...existingEdges, ...newEdges]),
        source: adapterId,
        target: pending.connection.target,
        sourceHandle: outputHandle,
        targetHandle: pending.connection.targetHandle,
        data: outputData,
        style: {
          stroke: resolveEdgeStroke(outputData),
          strokeWidth: adapterOutput.directAttach ? 1 : 2,
        },
      });
    }

    const updatedNodes = renumberNodes([...state.nodes, adapterNode]);
    set({
      nodes: existingEdges === state.edges
        ? updatedNodes
        : reconcileWaypointNodes(updatedNodes, [...existingEdges, ...newEdges]),
      edges: [...existingEdges, ...newEdges],
      pendingIncompatibleConnection: null,
    });
    get().saveToLocalStorage();
  },

  // ── Adapter-create flow ────────────────────────────────────────────────────
  // The IncompatibleConnectionDialog's "+ Create adapter" opens the DeviceEditor
  // prefilled as a two-port adapter. On Save the editor withdraws its provisional
  // node (close()'s single-undo) and calls completeAdapterCreation(template), which
  // delegates to insertAdapterBetween — so the real placed-and-wired adapter reuses
  // the exact same insertion path as the auto-matched-adapter case.
  beginAdapterCreation: (pending) => {
    const state = get();
    const src = state.nodes.find((n) => n.id === pending.connection.source);
    const tgt = state.nodes.find((n) => n.id === pending.connection.target);
    // Provisional placement only — insertAdapterBetween recomputes the true midpoint
    // once the template is finalized, and the provisional node is withdrawn on save.
    const provisionalPos = src && tgt
      ? { x: Math.round((src.position.x + tgt.position.x) / 2), y: Math.round((src.position.y + tgt.position.y) / 2) }
      : src ? { x: src.position.x, y: src.position.y } : { x: 0, y: 0 };
    const adapterTemplate: DeviceTemplate = {
      deviceType: "adapter",
      category: "adapter",
      label: `${pending.sourcePort.signalType} → ${pending.targetPort.signalType} adapter`,
      ports: [
        {
          id: "in",
          label: "In",
          signalType: pending.sourcePort.signalType,
          direction: "input",
          ...(pending.sourcePort.connectorType ? { connectorType: pending.sourcePort.connectorType } : {}),
        },
        {
          id: "out",
          label: "Out",
          signalType: pending.targetPort.signalType,
          direction: "output",
          ...(pending.targetPort.connectorType ? { connectorType: pending.targetPort.connectorType } : {}),
        },
      ],
    };
    set({ adapterCreationRequest: pending, pendingIncompatibleConnection: null });
    get().createAndEditDevice(adapterTemplate, provisionalPos);
  },

  completeAdapterCreation: (template) => {
    const req = get().adapterCreationRequest;
    if (!req) return;
    // Restore the pending connection insertAdapterBetween consumes, then delegate.
    set({ adapterCreationRequest: null, pendingIncompatibleConnection: req });
    get().insertAdapterBetween(template);
  },

  cancelAdapterCreation: () => set({ adapterCreationRequest: null }),

  // ── Internal wiring (DeviceData.internalLinks; endpoints are port LABELS) ────
  addInternalLink: (deviceId, link) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === deviceId && n.type === "device");
    if (!node) return;
    const existing = (node.data as DeviceData).internalLinks ?? [];
    if (existing.some((l) => l.from === link.from && l.to === link.to)) return; // idempotent
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) =>
        n.id === deviceId && n.type === "device"
          ? ({
              ...n,
              data: { ...n.data, internalLinks: [...((n.data as DeviceData).internalLinks ?? []), link] },
            } as DeviceNode)
          : n,
      ),
    });
    get().saveToLocalStorage();
  },

  removeInternalLink: (deviceId, link) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === deviceId && n.type === "device");
    if (!node) return;
    const existing = (node.data as DeviceData).internalLinks ?? [];
    if (!existing.some((l) => l.from === link.from && l.to === link.to)) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) => {
        if (n.id !== deviceId || n.type !== "device") return n;
        const links = ((n.data as DeviceData).internalLinks ?? []).filter(
          (l) => !(l.from === link.from && l.to === link.to),
        );
        return {
          ...n,
          data: { ...n.data, internalLinks: links.length > 0 ? links : undefined },
        } as DeviceNode;
      }),
    });
    get().saveToLocalStorage();
  },

  // ── Channel ⇄ connector model (R2-3/4/5) ──────────────────────────────────
  addDeviceChannel: (deviceId, channel) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === deviceId && n.type === "device");
    if (!node) return;
    const existing = (node.data as DeviceData).channels ?? [];
    if (existing.some((c) => c.id === channel.id)) return; // idempotent by id
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) =>
        n.id === deviceId && n.type === "device"
          ? ({ ...n, data: { ...n.data, channels: [...existing, channel] } } as DeviceNode)
          : n,
      ),
    });
    get().saveToLocalStorage();
  },

  updateDeviceChannel: (deviceId, channelId, patch) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === deviceId && n.type === "device");
    if (!node) return;
    const existing = (node.data as DeviceData).channels ?? [];
    if (!existing.some((c) => c.id === channelId)) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) =>
        n.id === deviceId && n.type === "device"
          ? ({
              ...n,
              data: {
                ...n.data,
                channels: ((n.data as DeviceData).channels ?? []).map((c) =>
                  c.id === channelId ? { ...c, ...patch, id: c.id } : c,
                ),
              },
            } as DeviceNode)
          : n,
      ),
    });
    get().saveToLocalStorage();
  },

  removeDeviceChannel: (deviceId, channelId) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === deviceId && n.type === "device");
    if (!node) return;
    const data = node.data as DeviceData;
    if (!(data.channels ?? []).some((c) => c.id === channelId)) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) => {
        if (n.id !== deviceId || n.type !== "device") return n;
        const d = n.data as DeviceData;
        const channels = (d.channels ?? []).filter((c) => c.id !== channelId);
        // Drop the removed channel from every connector's carries.
        const connectors = (d.connectors ?? []).map((conn) =>
          conn.carries.includes(channelId)
            ? { ...conn, carries: conn.carries.filter((id) => id !== channelId) }
            : conn,
        );
        return {
          ...n,
          data: {
            ...n.data,
            channels: channels.length > 0 ? channels : undefined,
            connectors: connectors.length > 0 ? connectors : d.connectors,
          },
        } as DeviceNode;
      }),
    });
    get().saveToLocalStorage();
  },

  addDeviceConnector: (deviceId, connector) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === deviceId && n.type === "device");
    if (!node) return;
    const existing = (node.data as DeviceData).connectors ?? [];
    if (existing.some((c) => c.id === connector.id)) return; // idempotent by id
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) =>
        n.id === deviceId && n.type === "device"
          ? ({ ...n, data: { ...n.data, connectors: [...existing, connector] } } as DeviceNode)
          : n,
      ),
    });
    get().saveToLocalStorage();
  },

  updateDeviceConnector: (deviceId, connectorId, patch) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === deviceId && n.type === "device");
    if (!node) return;
    const existing = (node.data as DeviceData).connectors ?? [];
    if (!existing.some((c) => c.id === connectorId)) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) =>
        n.id === deviceId && n.type === "device"
          ? ({
              ...n,
              data: {
                ...n.data,
                connectors: ((n.data as DeviceData).connectors ?? []).map((c) =>
                  c.id === connectorId ? { ...c, ...patch, id: c.id } : c,
                ),
              },
            } as DeviceNode)
          : n,
      ),
    });
    get().saveToLocalStorage();
  },

  removeDeviceConnector: (deviceId, connectorId) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === deviceId && n.type === "device");
    if (!node) return;
    if (!((node.data as DeviceData).connectors ?? []).some((c) => c.id === connectorId)) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) => {
        if (n.id !== deviceId || n.type !== "device") return n;
        const connectors = ((n.data as DeviceData).connectors ?? []).filter((c) => c.id !== connectorId);
        return {
          ...n,
          data: { ...n.data, connectors: connectors.length > 0 ? connectors : undefined },
        } as DeviceNode;
      }),
    });
    get().saveToLocalStorage();
  },

  addInternalRoute: (deviceId, fromId, toId) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === deviceId && n.type === "device");
    if (!node || fromId === toId) return;
    // Idempotent: bail if an internal route already joins these two endpoints.
    const already = state.edges.some(
      (e) =>
        e.data?.internal &&
        e.source === deviceId &&
        e.target === deviceId &&
        e.sourceHandle === fromId &&
        e.targetHandle === toId,
    );
    if (already) return;

    const data = node.data as DeviceData;
    const signalOfEndpoint = (endpointId: string): SignalType => {
      const channel = (data.channels ?? []).find((c) => c.id === endpointId);
      if (channel) return channel.signalType;
      const bus = (data.connectors ?? []).find((c) => c.id === endpointId);
      if (bus) {
        const firstChannel = (data.channels ?? []).find((c) => bus.carries.includes(c.id));
        if (firstChannel) return firstChannel.signalType;
      }
      return "custom";
    };

    pushUndo({ nodes: state.nodes, edges: state.edges });
    const newEdgeData: ConnectionData = { signalType: signalOfEndpoint(fromId), internal: true };
    const existingEdges = ensureUniqueEdgeIds(state.edges);
    const newEdge: ConnectionEdge = {
      id: nextEdgeId(existingEdges),
      source: deviceId,
      target: deviceId,
      sourceHandle: fromId,
      targetHandle: toId,
      data: newEdgeData,
      style: { stroke: resolveEdgeStroke(newEdgeData), strokeWidth: 2 },
    };
    set({
      nodes: existingEdges === state.edges ? state.nodes : reconcileWaypointNodes(state.nodes, existingEdges),
      edges: [...existingEdges, newEdge],
    });
    get().saveToLocalStorage();
  },

  removeInternalRoute: (deviceId, fromId, toId) => {
    const state = get();
    const match = (e: ConnectionEdge) =>
      e.data?.internal &&
      e.source === deviceId &&
      e.target === deviceId &&
      e.sourceHandle === fromId &&
      e.targetHandle === toId;
    if (!state.edges.some(match)) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({ edges: state.edges.filter((e) => !match(e)) });
    get().saveToLocalStorage();
  },

  listInternalRoutes: (deviceId) =>
    get().edges.filter(
      (e) => e.data?.internal && e.source === deviceId && e.target === deviceId,
    ),

  listDeviceBuses: (deviceId) => {
    const node = get().nodes.find((n) => n.id === deviceId && n.type === "device");
    if (!node) return [];
    return ((node.data as DeviceData).connectors ?? []).filter((c) => c.role === "bus");
  },

  setPatchPointMode: (deviceId, pointId, mode) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === deviceId && n.type === "device");
    if (!node) return;
    const points = (node.data as DeviceData).patchbay?.points ?? [];
    const point = points.find((p) => p.id === pointId);
    if (!point || point.mode === mode) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) => {
        if (n.id !== deviceId || n.type !== "device") return n;
        const d = n.data as DeviceData;
        return {
          ...n,
          data: {
            ...n.data,
            patchbay: {
              ...d.patchbay,
              points: (d.patchbay?.points ?? []).map((p) =>
                p.id === pointId ? { ...p, mode } : p,
              ),
            },
          },
        } as DeviceNode;
      }),
    });
    get().saveToLocalStorage();
  },

  // Internal-routing lane expansion (C6) — session/UI only, no undo, not persisted.
  expandedRoutingDeviceIds: [],
  toggleDeviceRoutingExpanded: (deviceId) =>
    set((state) => ({
      expandedRoutingDeviceIds: state.expandedRoutingDeviceIds.includes(deviceId)
        ? state.expandedRoutingDeviceIds.filter((existingId) => existingId !== deviceId)
        : [...state.expandedRoutingDeviceIds, deviceId],
    })),

  // ── Multi-document project tabs (snapshot-swap; session-only, not serialized) ─
  newDocument: (name) => {
    // Seed the current live document as tab #1 if tabs haven't been used yet.
    if (get().documents.length === 0) {
      const seedId = crypto.randomUUID();
      set({
        documents: [{ id: seedId, name: get().schematicName, snapshot: get().exportToJSON() }],
        activeDocumentId: seedId,
      });
    }
    const docs = get().documents;
    const activeId = get().activeDocumentId;
    const liveSnapshot = get().exportToJSON();
    const newId = crypto.randomUUID();
    const docName = name?.trim() || `Untitled ${docs.length + 1}`;
    const blank = createBlankSchematicFile(docName);
    const nextDocs: ProjectDocument[] = [
      ...docs.map((d) => (d.id === activeId ? { ...d, name: get().schematicName, snapshot: liveSnapshot } : d)),
      { id: newId, name: docName, snapshot: blank },
    ];
    set({ documents: nextDocs, activeDocumentId: newId });
    get().importFromJSON(blank);
    set({ activeDocumentId: newId }); // importFromJSON leaves tab state untouched
  },

  switchDocument: (id) => {
    if (get().documents.length === 0) {
      const seedId = crypto.randomUUID();
      set({
        documents: [{ id: seedId, name: get().schematicName, snapshot: get().exportToJSON() }],
        activeDocumentId: seedId,
      });
    }
    const activeId = get().activeDocumentId;
    if (id === activeId) return;
    const target = get().documents.find((d) => d.id === id);
    if (!target) return;
    const liveSnapshot = get().exportToJSON();
    const nextDocs = get().documents.map((d) =>
      d.id === activeId ? { ...d, name: get().schematicName, snapshot: liveSnapshot } : d,
    );
    set({ documents: nextDocs, activeDocumentId: id });
    get().importFromJSON(target.snapshot);
    set({ activeDocumentId: id });
  },

  renameDocument: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const docs = get().documents;
    set({ documents: docs.map((d) => (d.id === id ? { ...d, name: trimmed } : d)) });
    if (docs.length === 0 || id === get().activeDocumentId) {
      set({ schematicName: trimmed });
      get().saveToLocalStorage();
    }
  },

  closeDocument: (id) => {
    if (get().documents.length === 0) {
      const seedId = crypto.randomUUID();
      set({
        documents: [{ id: seedId, name: get().schematicName, snapshot: get().exportToJSON() }],
        activeDocumentId: seedId,
      });
    }
    const docs = get().documents;
    if (docs.length <= 1) return; // never close the last tab
    const idx = docs.findIndex((d) => d.id === id);
    if (idx === -1) return;
    const remaining = docs.filter((d) => d.id !== id);
    if (id === get().activeDocumentId) {
      const neighbour = remaining[Math.min(idx, remaining.length - 1)];
      set({ documents: remaining, activeDocumentId: neighbour.id });
      get().importFromJSON(neighbour.snapshot);
      set({ activeDocumentId: neighbour.id });
    } else {
      set({ documents: remaining });
    }
  },

  listDocuments: () => {
    const { documents, activeDocumentId, schematicName } = get();
    if (documents.length === 0) {
      return [{ id: activeDocumentId || "__active__", name: schematicName }];
    }
    return documents.map((d) => ({ id: d.id, name: d.id === activeDocumentId ? schematicName : d.name }));
  },

  setPrintView: (v) => { set({ printView: v }); },
  setPrintPaperId: (id) => { set({ printPaperId: id }); get().saveToLocalStorage(); },
  setPrintOrientation: (o) => { set({ printOrientation: o }); get().saveToLocalStorage(); },
  setPrintScale: (s) => { set({ printScale: Math.max(0.25, Math.min(2, s)) }); get().saveToLocalStorage(); },
  setPrintCustomWidthIn: (w) => { set({ printCustomWidthIn: Math.max(1, w) }); get().saveToLocalStorage(); },
  setPrintCustomHeightIn: (h) => { set({ printCustomHeightIn: Math.max(1, h) }); get().saveToLocalStorage(); },
  setPrintOriginOffset: (x, y) => { set({ printOriginOffsetX: x, printOriginOffsetY: y }); get().saveToLocalStorage(); },
  setColorKeyEnabled: (v) => { set({ colorKeyEnabled: v }); get().saveToLocalStorage(); },
  setColorKeyCorner: (c) => { set({ colorKeyCorner: c }); get().saveToLocalStorage(); },
  setColorKeyColumns: (n) => { set({ colorKeyColumns: Math.max(1, Math.min(4, n)) }); get().saveToLocalStorage(); },
  setColorKeyPage: (p) => { set({ colorKeyPage: p }); get().saveToLocalStorage(); },
  setColorKeyOverrides: (o) => { set({ colorKeyOverrides: o && Object.keys(o).length > 0 ? o : undefined }); get().saveToLocalStorage(); },
  setCableCost: (key, cost) => {
    const current = { ...get().cableCosts };
    if (cost == null || cost <= 0) { delete current[key]; } else { current[key] = cost; }
    set({ cableCosts: Object.keys(current).length > 0 ? current : undefined });
    get().saveToLocalStorage();
  },
  setRoomDistance: (roomIdA, roomIdB, distance) => {
    if (roomIdA === roomIdB) return;
    const current = { ...(get().roomDistances ?? {}) };
    const key = pairKey(roomIdA, roomIdB);
    if (distance == null || !Number.isFinite(distance) || distance <= 0) {
      delete current[key];
    } else {
      current[key] = distance;
    }
    set({ roomDistances: Object.keys(current).length > 0 ? current : undefined });
    get().saveToLocalStorage();
  },
  clearRoomDistance: (roomIdA, roomIdB) => {
    get().setRoomDistance(roomIdA, roomIdB, undefined);
  },
  setDistanceSettings: (partial) => {
    const merged: DistanceSettings = {
      ...DEFAULT_DISTANCE_SETTINGS,
      ...(get().distanceSettings ?? {}),
      ...partial,
    };
    // Clamp slack values so UI-typed garbage never propagates.
    if (!Number.isFinite(merged.slackPercent) || merged.slackPercent < 0) merged.slackPercent = 0;
    if (!Number.isFinite(merged.slackFixed) || merged.slackFixed < 0) merged.slackFixed = 0;
    set({ distanceSettings: merged });
    get().saveToLocalStorage();
  },
  setTitleBlock: (tb) => { set({ titleBlock: tb }); get().saveToLocalStorage(); },
  setTitleBlockLayout: (layout) => { set({ titleBlockLayout: layout }); get().saveToLocalStorage(); },

  setSignalColors: (colors) => {
    const overrides = getSignalColorOverrides(colors);
    set({ signalColors: overrides });
    applySignalColors(colors);
    saveSignalColors(colors);
    get().saveToLocalStorage();
  },

  setSignalLineStyles: (styles) => {
    // Only store non-solid entries
    const clean: Partial<Record<SignalType, LineStyle>> = {};
    for (const [k, v] of Object.entries(styles)) {
      if (v && v !== "solid") clean[k as SignalType] = v;
    }
    set({ signalLineStyles: Object.keys(clean).length > 0 ? clean : undefined });
    get().saveToLocalStorage();
  },

  toggleSignalTypeVisibility: (type) => {
    const current = get().hiddenSignalTypes;
    const set_ = new Set(current ? current.split(",").filter(Boolean) : []);
    if (set_.has(type)) set_.delete(type);
    else set_.add(type);
    const next = [...set_].sort().join(",");
    set({ hiddenSignalTypes: next });
    get().saveToLocalStorage();
  },

  togglePinSignalTypeVisibility: (type) => {
    const current = get().hiddenPinSignalTypes;
    const set_ = new Set(current ? current.split(",").filter(Boolean) : []);
    if (set_.has(type)) set_.delete(type);
    else set_.add(type);
    const next = [...set_].sort().join(",");
    set({ hiddenPinSignalTypes: next });
    get().saveToLocalStorage();
  },

  setHideUnconnectedPorts: (hide) => {
    set({ hideUnconnectedPorts: hide });
    get().saveToLocalStorage();
  },

  setShowPortCounts: (show) => {
    set({ showPortCounts: show });
    get().saveToLocalStorage();
  },

  setTemplateHiddenSignals: (templateId, hidden) => {
    const current = get().templateHiddenSignals;
    if (hidden.length === 0) {
      const { [templateId]: _, ...rest } = current;
      set({ templateHiddenSignals: rest });
    } else {
      set({ templateHiddenSignals: { ...current, [templateId]: hidden } });
    }
    get().saveToLocalStorage();
  },

  setReportLayout: (key, layout) => {
    set({ reportLayouts: { ...get().reportLayouts, [key]: layout } });
    get().saveToLocalStorage();
  },

  setReportHiddenColumns: (tableId, columnIds) => {
    set({ reportHiddenColumns: { ...get().reportHiddenColumns, [tableId]: columnIds } });
    get().saveToLocalStorage();
  },

  setGlobalReportHeaderLayout: (layout) => {
    set({ globalReportHeaderLayout: layout });
    get().saveToLocalStorage();
  },
  setGlobalReportFooterLayout: (layout) => {
    set({ globalReportFooterLayout: layout });
    get().saveToLocalStorage();
  },

  setEdgeHitboxSize: (size) => {
    set({ edgeHitboxSize: size });
    get().saveToLocalStorage();
  },

  showAllSignalTypes: () => {
    set({ hiddenSignalTypes: "", hiddenPinSignalTypes: "" });
    get().saveToLocalStorage();
  },

  setTemplatePreset: (templateId, preset) => {
    const current = get().templatePresets;
    if (preset === null) {
      const { [templateId]: _, ...rest } = current;
      set({ templatePresets: rest });
    } else {
      set({ templatePresets: { ...current, [templateId]: preset } });
    }
    get().saveToLocalStorage();
  },

  toggleFavoriteTemplate: (templateKey) => {
    const current = get().favoriteTemplates;
    const next = current.includes(templateKey)
      ? current.filter((k) => k !== templateKey)
      : [...current, templateKey];
    set({ favoriteTemplates: next });
    get().saveToLocalStorage();
  },

  pushRecentTemplate: (templateKey) => {
    if (!templateKey) return;
    const current = get().recentTemplates;
    // Move to front, dedupe, cap at RECENT_TEMPLATES_CAP.
    const next = [templateKey, ...current.filter((k) => k !== templateKey)].slice(0, RECENT_TEMPLATES_CAP);
    set({ recentTemplates: next });
    get().saveToLocalStorage();
  },

  setScrollConfig: (v) => {
    set({ scrollConfig: v });
    get().saveToLocalStorage();
  },

  setCableNamingScheme: (v) => {
    set({ cableNamingScheme: v });
    get().saveToLocalStorage();
  },

  setLabelCase: (mode) => {
    set({ labelCase: mode });
    get().saveToLocalStorage();
  },

  setPanMode: (mode) => {
    set({ panMode: mode });
    get().saveToLocalStorage();
  },

  setCurrency: (code) => {
    set({ currency: code });
    get().saveToLocalStorage();
  },

  setProjectStatus: (status) => {
    set({ status });
    get().saveToLocalStorage();
  },

  setShowLineJumps: (show) => {
    set({ showLineJumps: show });
    get().saveToLocalStorage();
  },

  setMcpBridgeEnabled: (enabled) => {
    try { localStorage.setItem(MCP_ENABLED_KEY, enabled ? "1" : "0"); } catch { /* ignore */ }
    set({ mcpBridgeEnabled: enabled });
  },
  setMcpBridgeToken: (token) => {
    try { localStorage.setItem(MCP_TOKEN_KEY, token); } catch { /* ignore */ }
    set({ mcpBridgeToken: token });
  },
  setMcpBridgePort: (port) => {
    try { localStorage.setItem(MCP_PORT_KEY, String(port)); } catch { /* ignore */ }
    set({ mcpBridgePort: port });
  },

  setShowFacePlateDetail: (show) => {
    set({ showFacePlateDetail: show });
    get().saveToLocalStorage();
  },

  setShowConnectionLabels: (show) => {
    set({ showConnectionLabels: show, showCableIdLabels: show });
    get().saveToLocalStorage();
  },

  setShowCableIdLabels: (show) => {
    set({ showCableIdLabels: show, showConnectionLabels: show });
    get().saveToLocalStorage();
  },

  setShowCustomLabels: (show) => {
    set({ showCustomLabels: show });
    get().saveToLocalStorage();
  },

  setCableIdGap: (gap) => {
    set({ cableIdGap: gap });
    get().saveToLocalStorage();
  },

  setCableIdMidOffset: (offset) => {
    set({ cableIdMidOffset: offset });
    get().saveToLocalStorage();
  },

  setCableIdLabelMode: (mode) => {
    set({ cableIdLabelMode: mode });
    get().saveToLocalStorage();
  },

  setStubLabelShowPort: (show) => {
    set({ stubLabelShowPort: show });
    get().saveToLocalStorage();
  },

  setStubLabelShowRoom: (show) => {
    set({ stubLabelShowRoom: show });
    get().saveToLocalStorage();
  },

  setStubLabelPageMode: (mode) => {
    set({ stubLabelPageMode: mode });
    get().saveToLocalStorage();
  },

  setUseShortNames: (use) => {
    set({ useShortNames: use });
    get().saveToLocalStorage();
  },

  setWrapDeviceLabels: (wrap) => {
    set({ wrapDeviceLabels: wrap });
    get().saveToLocalStorage();
  },

  recomputeCableIds: () => {
    const state = get();
    const rows = computeCableSchedule(state.nodes, state.edges, state.cableNamingScheme);
    const map: Record<string, string> = {};
    for (const r of rows) map[r.edgeId] = r.cableId;
    // Mirror cable IDs to the partner stub-leg edge so both halves render the same
    // cable label. The schedule emits one row per logical connection (source-side leg);
    // the target-side leg shares the same cable ID via linkedConnectionId.
    const linkById = new Map<string, string>();
    const idsByLink = new Map<string, string[]>();
    for (const e of state.edges) {
      const link = e.data?.linkedConnectionId;
      if (!link) continue;
      linkById.set(e.id, link);
      const list = idsByLink.get(link) ?? [];
      list.push(e.id);
      idsByLink.set(link, list);
    }
    for (const e of state.edges) {
      if (map[e.id]) continue;
      const link = linkById.get(e.id);
      if (!link) continue;
      const partners = idsByLink.get(link) ?? [];
      for (const pid of partners) {
        if (map[pid]) { map[e.id] = map[pid]; break; }
      }
    }
    // Persist generated IDs onto the edges themselves. Cable IDs are PERMANENT once
    // assigned — users print labels and reference them in pull sheets — so they ride
    // the save file (edge.data.cableId) instead of being re-derived per session.
    // Only edges MISSING an ID are written (stored/user-set IDs are never touched),
    // so this is a no-op on every run after the first and can't loop the App effect
    // that calls it. Not undo-tracked: assignment is derived bookkeeping, not an edit.
    let persisted = false;
    const edges = state.edges.map((e) => {
      const id = map[e.id];
      if (!id || !e.data || e.data.cableId) return e;
      persisted = true;
      return { ...e, data: { ...e.data, cableId: id } };
    });
    if (persisted) {
      set({ cableIdMap: map, edges });
      get().saveToLocalStorage();
    } else {
      set({ cableIdMap: map });
    }
  },

  exportCustomTemplates: () => {
    return structuredClone(get().customTemplates);
  },

  importCustomTemplates: (templates) => {
    const existing = get().customTemplates;
    const existingKeys = new Set(existing.map((t) => templateKey(t)));
    const newTemplates = templates.filter((t) => !existingKeys.has(templateKey(t)));
    if (newTemplates.length > 0) {
      const merged = [...existing, ...newTemplates];
      const order = [...get().customTemplateOrder, ...newTemplates.map((t) => templateKey(t))];
      set({ customTemplates: merged, customTemplateOrder: order });
      saveCustomTemplates(merged);
      saveCustomTemplateMeta({ groups: get().customTemplateGroups, order, groupAssignments: get().customTemplateGroupAssignments });
    }
  },

  setCloudSchematicId: (id) => { set({ cloudSchematicId: id }); get().saveToLocalStorage(); },
  setCloudSavedAt: (ts) => { set({ cloudSavedAt: ts }); get().saveToLocalStorage(); },
  setFileHandle: (handle) => set({ fileHandle: handle }),

  setIsOnline: (online) => set({ isOnline: online }),

  // Toasts
  toasts: [],
  addToast: (message, type, durationMs) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    const duration = durationMs ?? (type === "error" ? 8000 : 5000);
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },
  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  // ── Rack builder actions ──────────────────────────────────────────

  setActivePage: (pageId) => {
    set({ activePage: pageId });
  },

  addRackPage: (label) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const id = nextRackPageId();
    const page: RackElevationPage = { id, label, type: "rack-elevation", racks: [], placements: [], accessories: [] };
    set({ pages: [...state.pages, page], activePage: id, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
    return id;
  },

  removeRackPage: (pageId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const pages = state.pages.filter((p) => p.id !== pageId);
    const activePage = state.activePage === pageId ? "schematic" : state.activePage;
    set({ pages, activePage, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
  },

  renameRackPage: (pageId, label) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({ pages: state.pages.map((p) => p.id === pageId ? { ...p, label } : p), undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
  },

  addRack: (pageId, rackData) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const id = nextRackId();
    const rack: RackData = { ...rackData, id };
    set({
      pages: mapElevationPage(state.pages, pageId, (p) => ({ ...p, racks: [...p.racks, rack] })),
      undoSize: undoStack.length, redoSize: 0,
    });
    get().saveToLocalStorage();
    return id;
  },

  removeRack: (pageId, rackId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    // Find the rack's linked room before removing, so we can clear the backpointer
    const srcPage = state.pages.find((p) => p.id === pageId && p.type === "rack-elevation") as RackElevationPage | undefined;
    const linkedRoomId = srcPage?.racks.find((r) => r.id === rackId)?.linkedRoomId;
    const updatedPages = mapElevationPage(state.pages, pageId, (p) => ({
      ...p,
      racks: p.racks.filter((r) => r.id !== rackId),
      placements: p.placements.filter((pl) => pl.rackId !== rackId),
      accessories: p.accessories.filter((a) => a.rackId !== rackId),
    }));
    set({ pages: updatedPages, undoSize: undoStack.length, redoSize: 0 });
    // Clear the backpointer on the linked room node
    if (linkedRoomId) {
      set({
        nodes: get().nodes.map((n) =>
          n.id === linkedRoomId && n.type === "room"
            ? { ...n, data: { ...n.data, linkedRackPageId: undefined, linkedRackId: undefined } }
            : n
        ),
      });
    }
    get().saveToLocalStorage();
  },

  updateRack: (pageId, rackId, patch) => {
    const state = get();
    set({
      pages: mapElevationPage(state.pages, pageId, (p) => ({
        ...p,
        racks: p.racks.map((r) => r.id === rackId ? { ...r, ...patch } : r),
      })),
    });
    get().saveToLocalStorage();
  },

  addRackPlacement: (pageId, placementData) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const id = nextPlacementId();
    const placement: RackDevicePlacement = { ...placementData, id };
    set({
      pages: mapElevationPage(state.pages, pageId, (p) => ({ ...p, placements: [...p.placements, placement] })),
      undoSize: undoStack.length, redoSize: 0,
    });
    get().saveToLocalStorage();
    return id;
  },

  addPlacementSmart: (pageId, rackId, deviceNodeId, uPosition, face, preferredHalfRackSide) => {
    const state = get();
    const page = state.pages.find((p) => p.id === pageId && p.type === "rack-elevation") as RackElevationPage | undefined;
    if (!page) return { ok: false, reason: "no-page" };
    const rack = page.racks.find((r) => r.id === rackId);
    if (!rack) return { ok: false, reason: "no-page" };
    const device = state.nodes.find((n) => n.id === deviceNodeId)?.data as DeviceData | undefined;
    if (!device) return { ok: false, reason: "no-device" };

    const form = inferRackForm(device);

    if (form === "oversize") {
      return { ok: false, reason: "oversize" };
    }

    if (form === "shelf-only") {
      // Atomic shelf + placement: one undo entry covers both.
      pushUndo({ nodes: state.nodes, edges: state.edges });
      const shelfId = nextAccessoryId();
      const placementId = nextPlacementId();
      const innerWMm = shelfInnerWidthMm();
      const shelf: RackAccessory = {
        id: shelfId,
        rackId,
        type: "shelf",
        uPosition,
        heightU: 1,
        face,
      };
      const newW = device.widthMm ?? innerWMm;
      // Center on the shelf when there's room; otherwise pin to the left rail.
      const centeredX = Math.max(0, (innerWMm - newW) / 2);
      const placement: RackDevicePlacement = {
        id: placementId,
        rackId,
        deviceNodeId,
        uPosition,
        face,
        mountedOnShelfId: shelfId,
        shelfOffsetMm: { x: centeredX, y: 0 },
      };
      set({
        pages: mapElevationPage(state.pages, pageId, (p) => ({
          ...p,
          accessories: [...p.accessories, shelf],
          placements: [...p.placements, placement],
        })),
        undoSize: undoStack.length, redoSize: 0,
      });
      get().saveToLocalStorage();
      return { ok: true, placementId, shelfId };
    }

    if (form === "half") {
      // Honor cursor-side preference when free; otherwise flip to the other side.
      // Falls back to "left first" if no preference was supplied (legacy callers).
      const sideTaken = (side: "left" | "right") => page.placements.some((p) =>
        p.rackId === rackId && p.face === face && !p.mountedOnShelfId
        && p.halfRackSide === side
        && p.uPosition === uPosition
      );
      const preferred: "left" | "right" = preferredHalfRackSide ?? "left";
      const other: "left" | "right" = preferred === "left" ? "right" : "left";
      const halfRackSide: "left" | "right" = sideTaken(preferred) ? other : preferred;
      pushUndo({ nodes: state.nodes, edges: state.edges });
      const id = nextPlacementId();
      const placement: RackDevicePlacement = { id, rackId, deviceNodeId, uPosition, face, halfRackSide };
      set({
        pages: mapElevationPage(state.pages, pageId, (p) => ({ ...p, placements: [...p.placements, placement] })),
        undoSize: undoStack.length, redoSize: 0,
      });
      get().saveToLocalStorage();
      return { ok: true, placementId: id };
    }

    // full / unknown — direct placement, current behavior
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const id = nextPlacementId();
    const placement: RackDevicePlacement = { id, rackId, deviceNodeId, uPosition, face };
    set({
      pages: mapElevationPage(state.pages, pageId, (p) => ({ ...p, placements: [...p.placements, placement] })),
      undoSize: undoStack.length, redoSize: 0,
    });
    get().saveToLocalStorage();
    return { ok: true, placementId: id };
  },

  removeRackPlacement: (pageId, placementId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      pages: mapElevationPage(state.pages, pageId, (p) => ({ ...p, placements: p.placements.filter((pl) => pl.id !== placementId) })),
      undoSize: undoStack.length, redoSize: 0,
    });
    get().saveToLocalStorage();
  },

  updateRackPlacement: (pageId, placementId, patch) => {
    const state = get();
    set({
      pages: mapElevationPage(state.pages, pageId, (p) => ({
        ...p,
        placements: p.placements.map((pl) => pl.id === placementId ? { ...pl, ...patch } : pl),
      })),
    });
    get().saveToLocalStorage();
  },

  addRackAccessory: (pageId, accessoryData) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const id = nextAccessoryId();
    const accessory: RackAccessory = { ...accessoryData, id };
    set({
      pages: mapElevationPage(state.pages, pageId, (p) => ({ ...p, accessories: [...p.accessories, accessory] })),
      undoSize: undoStack.length, redoSize: 0,
    });
    get().saveToLocalStorage();
    return id;
  },

  removeRackAccessory: (pageId, accessoryId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      pages: mapElevationPage(state.pages, pageId, (p) => ({ ...p, accessories: p.accessories.filter((a) => a.id !== accessoryId) })),
      undoSize: undoStack.length, redoSize: 0,
    });
    get().saveToLocalStorage();
  },

  updateRackAccessory: (pageId, accessoryId, patch) => {
    const state = get();
    set({
      pages: mapElevationPage(state.pages, pageId, (p) => ({
        ...p,
        accessories: p.accessories.map((a) => a.id === accessoryId ? { ...a, ...patch } : a),
      })),
    });
    get().saveToLocalStorage();
  },

  removeRackAccessoryWithOccupants: (pageId, accessoryId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      pages: mapElevationPage(state.pages, pageId, (p) => ({
        ...p,
        accessories: p.accessories.filter((a) => a.id !== accessoryId),
        // Drop occupant placements — devices remain in the schematic, return to unracked pool
        placements: p.placements.filter((pl) => pl.mountedOnShelfId !== accessoryId),
      })),
      undoSize: undoStack.length, redoSize: 0,
    });
    get().saveToLocalStorage();
  },

  addShelfMountedDevice: (pageId, shelfId, deviceNodeId) => {
    const state = get();
    const page = state.pages.find((p) => p.id === pageId && p.type === "rack-elevation") as RackElevationPage | undefined;
    if (!page) return null;
    const shelf = page.accessories.find((a) => a.id === shelfId);
    if (!shelf || shelf.type !== "shelf") return null;
    const newDevice = state.nodes.find((n) => n.id === deviceNodeId)?.data as DeviceData | undefined;
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const id = nextPlacementId();

    // Auto-place: walk row by row from y=0 upward. On each row, push past occupants
    // whose y range intersects [rowY, rowY + newH]. If the device fits horizontally
    // there, drop it. Otherwise hop above the tallest occupant on that row and retry.
    // Lets users keep stacking small devices when the bottom row is full.
    const innerWidthMm = shelfInnerWidthMm();
    const newW = newDevice?.widthMm ?? innerWidthMm;
    const newH = newDevice?.heightMm ?? 44.45;
    const GAP = 4;
    const MAX_ROWS = 8;
    const occupants = page.placements.filter((pl) => pl.mountedOnShelfId === shelfId);
    let rowY = 0;
    let nextX = 0;
    for (let attempt = 0; attempt < MAX_ROWS; attempt++) {
      let attemptX = 0;
      let rowCeiling = rowY;
      for (const occ of occupants) {
        const dd = state.nodes.find((n) => n.id === occ.deviceNodeId)?.data as DeviceData | undefined;
        if (!dd) continue;
        const { wMm: ow, hMm: oh } = shelfFootprintMm(occ, dd);
        const ox = occ.shelfOffsetMm?.x ?? 0;
        const oy = occ.shelfOffsetMm?.y ?? 0;
        if (oy < rowY + newH && oy + oh > rowY) {
          attemptX = Math.max(attemptX, ox + ow + GAP);
          rowCeiling = Math.max(rowCeiling, oy + oh);
        }
      }
      if (attemptX + newW <= innerWidthMm + 0.5) {
        nextX = attemptX;
        break;
      }
      // Row full — hop above the tallest occupant and try again.
      rowY = rowCeiling + GAP;
    }
    const offset = { x: nextX, y: rowY };

    const placement: RackDevicePlacement = {
      id,
      rackId: shelf.rackId,
      deviceNodeId,
      uPosition: shelf.uPosition,
      face: shelf.face,
      mountedOnShelfId: shelfId,
      shelfOffsetMm: offset,
    };
    set({
      pages: mapElevationPage(state.pages, pageId, (p) => ({ ...p, placements: [...p.placements, placement] })),
      undoSize: undoStack.length, redoSize: 0,
    });
    get().saveToLocalStorage();
    return id;
  },

  isRackSlotAvailable: (pageId, rackId, uPosition, heightU, face, halfRackSide, excludePlacementId, excludeAccessoryId) => {
    const state = get();
    const page = state.pages.find((p) => p.id === pageId && p.type === "rack-elevation") as RackElevationPage | undefined;
    if (!page) return false;
    const rack = page.racks.find((r) => r.id === rackId);
    if (!rack) return false;

    // Check bounds
    if (uPosition < 1 || uPosition + heightU - 1 > rack.heightU) return false;

    // Check against existing placements on this rack and face
    for (const p of page.placements) {
      if (p.rackId !== rackId || p.face !== face) continue;
      if (excludePlacementId && p.id === excludePlacementId) continue;
      // Shelf-mounted devices are passengers — the shelf already claims its U slots
      if (p.mountedOnShelfId) continue;
      const device = state.nodes.find((n) => n.id === p.deviceNodeId);
      const deviceData = device?.data as DeviceData | undefined;
      const deviceHeightU = deviceData ? inferRackHeightU(deviceData) : 1;
      const pTop = p.uPosition + deviceHeightU - 1;
      const newTop = uPosition + heightU - 1;
      // Check U range overlap
      if (p.uPosition <= newTop && uPosition <= pTop) {
        // Ranges overlap — check width compatibility
        if (!p.halfRackSide || !halfRackSide) return false; // either is full-width → blocked
        if (p.halfRackSide === halfRackSide) return false;  // same side → blocked
        // Different sides of half-rack → OK
      }
    }

    // Check against accessories
    for (const a of page.accessories) {
      if (a.rackId !== rackId || a.face !== face) continue;
      if (excludeAccessoryId && a.id === excludeAccessoryId) continue;
      const aTop = a.uPosition + a.heightU - 1;
      const newTop = uPosition + heightU - 1;
      if (a.uPosition <= newTop && uPosition <= aTop) return false;
    }

    return true;
  },

  linkRoomToRack: (roomId, pageId, rackId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    // Find the room's current link so we can clear the old rack's backpointer
    const roomNode = state.nodes.find((n) => n.id === roomId && n.type === "room");
    const prevRackPageId = (roomNode?.data as { linkedRackPageId?: string }).linkedRackPageId;
    const prevRackId = (roomNode?.data as { linkedRackId?: string }).linkedRackId;
    // Find the target rack's current linked room so we can clear that room's link
    const targetPage = state.pages.find((p) => p.id === pageId && p.type === "rack-elevation") as RackElevationPage | undefined;
    const targetRack = targetPage?.racks.find((r) => r.id === rackId);
    const prevLinkedRoomId = targetRack?.linkedRoomId;

    const updatedPages = state.pages.map((p): SchematicPage => {
      if (p.type !== "rack-elevation") return p;
      if (p.id === pageId) {
        return { ...p, racks: p.racks.map((r) => r.id === rackId ? { ...r, linkedRoomId: roomId } : r) };
      }
      if (p.id === prevRackPageId) {
        return { ...p, racks: p.racks.map((r) => r.id === prevRackId ? { ...r, linkedRoomId: undefined } : r) };
      }
      return p;
    });

    const updatedNodes = state.nodes.map((n): SchematicNode => {
      // Set link on the target room
      if (n.id === roomId) return { ...n, data: { ...n.data, linkedRackPageId: pageId, linkedRackId: rackId } } as SchematicNode;
      // Clear link on the room that was previously linked to the target rack
      if (prevLinkedRoomId && n.id === prevLinkedRoomId) {
        return { ...n, data: { ...n.data, linkedRackPageId: undefined, linkedRackId: undefined } } as SchematicNode;
      }
      return n;
    });

    set({ pages: updatedPages, nodes: updatedNodes, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
  },

  unlinkRoom: (roomId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const roomNode = state.nodes.find((n) => n.id === roomId && n.type === "room");
    const prevRackPageId = (roomNode?.data as { linkedRackPageId?: string }).linkedRackPageId;
    const prevRackId = (roomNode?.data as { linkedRackId?: string }).linkedRackId;

    const updatedPages = prevRackPageId
      ? mapElevationPage(state.pages, prevRackPageId, (p) => ({
          ...p,
          racks: p.racks.map((r) => r.id === prevRackId ? { ...r, linkedRoomId: undefined } : r),
        }))
      : state.pages;

    const updatedNodes = state.nodes.map((n): SchematicNode =>
      n.id === roomId ? { ...n, data: { ...n.data, linkedRackPageId: undefined, linkedRackId: undefined } } as SchematicNode : n
    );

    set({ pages: updatedPages, nodes: updatedNodes, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
  },

  addPrintSheetPage: (label) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const id = nextPrintSheetId();
    const pageLabel = label ?? `Sheet ${state.pages.filter((p) => p.type === "print-sheet").length + 1}`;
    const page: PrintSheetPage = {
      id,
      label: pageLabel,
      type: "print-sheet",
      paperId: state.printPaperId ?? "letter",
      orientation: state.printOrientation ?? "landscape",
      viewports: [],
      showTitleBlock: true,
    };

    // H9: auto-fill with first rack if any exist
    const firstElevPage = state.pages.find((p): p is RackElevationPage => p.type === "rack-elevation" && p.racks.length > 0);
    if (firstElevPage) {
      const firstRack = firstElevPage.racks[0];
      const proposals = autoFillSheetForRack(page, firstRack, firstElevPage);
      for (const vp of proposals) {
        page.viewports.push({ ...vp, id: nextViewportId() });
      }
    }

    set({ pages: [...state.pages, page], activePage: id, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
    return id;
  },

  removePrintSheetPage: (pageId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const pages = state.pages.filter((p) => p.id !== pageId);
    const activePage = state.activePage === pageId ? "schematic" : state.activePage;
    set({ pages, activePage, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
  },

  renamePrintSheetPage: (pageId, label) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({ pages: state.pages.map((p) => p.id === pageId ? { ...p, label } : p), undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
  },

  duplicateRackPage: (pageId) => {
    const state = get();
    const src = state.pages.find((p) => p.id === pageId && p.type === "rack-elevation") as RackElevationPage | undefined;
    if (!src) return "";
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const newPageId = nextRackPageId();
    // Remap rack IDs so placements + accessories reference the new copies
    const rackIdMap = new Map<string, string>();
    const newRacks: RackData[] = src.racks.map((r) => {
      const nid = nextRackId();
      rackIdMap.set(r.id, nid);
      // Don't copy room link — it's 1:1 and the original still owns it
      const { linkedRoomId: _dropped, ...rest } = r;
      return { ...rest, id: nid };
    });
    // Remap accessory IDs first so shelf-mounted placements can re-point at the copied shelf.
    const accessoryIdMap = new Map<string, string>();
    const newAccessories = src.accessories.map((a) => {
      const nid = nextAccessoryId();
      accessoryIdMap.set(a.id, nid);
      return {
        ...a,
        id: nid,
        rackId: rackIdMap.get(a.rackId) ?? a.rackId,
      };
    });
    const newPlacements = src.placements.map((pl) => ({
      ...pl,
      id: nextPlacementId(),
      rackId: rackIdMap.get(pl.rackId) ?? pl.rackId,
      // Re-point shelf-mounted devices at the COPIED shelf; otherwise they'd reference the
      // source page's shelf id and the renderers would drop them from the duplicated rack.
      mountedOnShelfId: pl.mountedOnShelfId ? accessoryIdMap.get(pl.mountedOnShelfId) ?? pl.mountedOnShelfId : pl.mountedOnShelfId,
    }));
    const newPage: RackElevationPage = {
      id: newPageId,
      label: `${src.label} (copy)`,
      type: "rack-elevation",
      racks: newRacks,
      placements: newPlacements,
      accessories: newAccessories,
    };
    // Insert immediately after the source
    const idx = state.pages.findIndex((p) => p.id === pageId);
    const pages = [...state.pages.slice(0, idx + 1), newPage, ...state.pages.slice(idx + 1)];
    set({ pages, activePage: newPageId, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
    return newPageId;
  },

  duplicatePrintSheetPage: (pageId) => {
    const state = get();
    const src = state.pages.find((p) => p.id === pageId && p.type === "print-sheet") as PrintSheetPage | undefined;
    if (!src) return "";
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const newPageId = nextPrintSheetId();
    const newPage: PrintSheetPage = {
      ...src,
      id: newPageId,
      label: `${src.label} (copy)`,
      viewports: src.viewports.map((vp) => ({ ...vp, id: nextViewportId() })),
    };
    const idx = state.pages.findIndex((p) => p.id === pageId);
    const pages = [...state.pages.slice(0, idx + 1), newPage, ...state.pages.slice(idx + 1)];
    set({ pages, activePage: newPageId, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
    return newPageId;
  },

  addViewport: (pageId, viewportData) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const id = nextViewportId();
    const viewport: PrintViewport = { showStats: true, ...viewportData, id };
    const updatedPages = state.pages.map((p): SchematicPage => {
      if (p.id !== pageId || p.type !== "print-sheet") return p;
      return { ...p, viewports: [...p.viewports, viewport] };
    });
    set({ pages: updatedPages, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
    return id;
  },

  updateViewport: (pageId, viewportId, patch) => {
    const state = get();
    const updatedPages = state.pages.map((p): SchematicPage => {
      if (p.id !== pageId || p.type !== "print-sheet") return p;
      return { ...p, viewports: p.viewports.map((v) => v.id === viewportId ? { ...v, ...patch } : v) };
    });
    set({ pages: updatedPages });
    get().saveToLocalStorage();
  },

  removeViewport: (pageId, viewportId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const updatedPages = state.pages.map((p): SchematicPage => {
      if (p.id !== pageId || p.type !== "print-sheet") return p;
      return { ...p, viewports: p.viewports.filter((v) => v.id !== viewportId) };
    });
    set({ pages: updatedPages, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
  },

  setPrintSheetPaper: (pageId, paperId, orientation, customWidthIn, customHeightIn) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const updatedPages = state.pages.map((p): SchematicPage => {
      if (p.id !== pageId || p.type !== "print-sheet") return p;
      return { ...p, paperId, orientation, customWidthIn, customHeightIn };
    });
    set({ pages: updatedPages, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
  },

  moveRackToPage: (srcPageId, rackId, dstPageId) => {
    const state = get();
    const srcPage = state.pages.find((p) => p.id === srcPageId && p.type === "rack-elevation") as RackElevationPage | undefined;
    const dstPage = state.pages.find((p) => p.id === dstPageId && p.type === "rack-elevation") as RackElevationPage | undefined;
    if (!srcPage || !dstPage) return;
    const rack = srcPage.racks.find((r) => r.id === rackId);
    if (!rack) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const rackPlacements = srcPage.placements.filter((p) => p.rackId === rackId);
    const rackAccessories = srcPage.accessories.filter((a) => a.rackId === rackId);

    const updatedPages = state.pages.map((p): SchematicPage => {
      if (p.type === "print-sheet") {
        // Rewrite viewport refs that point to the moved rack
        return {
          ...p,
          viewports: p.viewports.map((v) =>
            v.rackRefPageId === srcPageId && v.rackRefId === rackId
              ? { ...v, rackRefPageId: dstPageId }
              : v
          ),
        };
      }
      if (p.id === srcPageId) {
        return {
          ...p,
          racks: p.racks.filter((r) => r.id !== rackId),
          placements: p.placements.filter((pl) => pl.rackId !== rackId),
          accessories: p.accessories.filter((a) => a.rackId !== rackId),
        };
      }
      if (p.id === dstPageId) {
        return {
          ...p,
          racks: [...p.racks, rack],
          placements: [...p.placements, ...rackPlacements],
          accessories: [...p.accessories, ...rackAccessories],
        };
      }
      return p;
    });

    // Update the linked room's linkedRackPageId to point to the new page
    const updatedNodes = rack.linkedRoomId
      ? state.nodes.map((n): SchematicNode =>
          n.id === rack.linkedRoomId
            ? { ...n, data: { ...n.data, linkedRackPageId: dstPageId } } as SchematicNode
            : n
        )
      : state.nodes;

    set({ pages: updatedPages, nodes: updatedNodes, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
  },

  saveToLocalStorage: () => {
    if (!hydrated) return;
    const state = get();
    const data: SchematicFile = {
      version: CURRENT_SCHEMA_VERSION,
      name: state.schematicName,
      nodes: state.nodes,
      edges: state.edges.map(({ zIndex: _, selected: _s, ...rest }) => rest) as ConnectionEdge[],
      ownedGear: state.ownedGear.length > 0 ? state.ownedGear : undefined,
      ownedCables: state.ownedCables.length > 0 ? state.ownedCables : undefined,
      ownedInventory: state.ownedInventory.length > 0 ? state.ownedInventory : undefined,
      layers: state.layers,
      recentCustomColors: state.recentCustomColors.length > 0 ? state.recentCustomColors : undefined,
      gearUnits: state.gearUnits.length > 0 ? state.gearUnits : undefined,
      svgAssets: Object.keys(state.svgAssets).length > 0 ? state.svgAssets : undefined,
      tagSuggestions: state.tagSuggestions.length > 0 ? state.tagSuggestions : undefined,
      fieldSuggestions: Object.keys(state.fieldSuggestions).length > 0 ? state.fieldSuggestions : undefined,
      dismissedIssueIds: state.dismissedIssueIds.length > 0 ? state.dismissedIssueIds : undefined,
      gridSettings: JSON.stringify(state.gridSettings) !== JSON.stringify(DEFAULT_GRID_SETTINGS) ? state.gridSettings : undefined,
      containers: state.containers.length > 0 ? state.containers : undefined,
      signalColors: state.signalColors,
      signalLineStyles: state.signalLineStyles,
      printPaperId: state.printPaperId,
      printOrientation: state.printOrientation,
      printScale: state.printScale,
      printCustomWidthIn: state.printPaperId === "custom" ? state.printCustomWidthIn : undefined,
      printCustomHeightIn: state.printPaperId === "custom" ? state.printCustomHeightIn : undefined,
      printOriginOffsetX: state.printOriginOffsetX || undefined,
      printOriginOffsetY: state.printOriginOffsetY || undefined,
      titleBlock: state.titleBlock,
      titleBlockLayout: state.titleBlockLayout,
      hiddenSignalTypes: state.hiddenSignalTypes ? state.hiddenSignalTypes.split(",") as SignalType[] : undefined,
      hiddenPinSignalTypes: state.hiddenPinSignalTypes ? state.hiddenPinSignalTypes.split(",") as SignalType[] : undefined,
      hideUnconnectedPorts: state.hideUnconnectedPorts || undefined,
      showPortCounts: state.showPortCounts || undefined,
      templateHiddenSignals: Object.keys(state.templateHiddenSignals).length > 0 ? state.templateHiddenSignals : undefined,
      templatePresets: Object.keys(state.templatePresets).length > 0 ? state.templatePresets : undefined,
      favoriteTemplates: state.favoriteTemplates.length > 0 ? state.favoriteTemplates : undefined,
      recentTemplates: state.recentTemplates.length > 0 ? state.recentTemplates : undefined,
      reportLayouts: Object.keys(state.reportLayouts).length > 0 ? state.reportLayouts : undefined,
      reportHiddenColumns: Object.keys(state.reportHiddenColumns).length > 0 ? state.reportHiddenColumns : undefined,
      globalReportHeaderLayout: state.globalReportHeaderLayout ?? undefined,
      globalReportFooterLayout: state.globalReportFooterLayout ?? undefined,
      scrollConfig: isDefaultScrollConfig(state.scrollConfig) ? undefined : state.scrollConfig,
      cableNamingScheme: state.cableNamingScheme !== "type-prefix" ? state.cableNamingScheme : undefined,
      labelCase: state.labelCase !== "as-typed" ? state.labelCase : undefined,
      currency: state.currency !== "USD" ? state.currency : undefined,
      status: state.status,
      panMode: state.panMode !== "select-first" ? state.panMode : undefined,
      showLineJumps: !state.showLineJumps ? false : undefined,
      showFacePlateDetail: state.showFacePlateDetail ? true : undefined,
      showCableIdLabels: !state.showCableIdLabels ? false : undefined,
      showCustomLabels: !state.showCustomLabels ? false : undefined,
      cableIdGap: state.cableIdGap !== 4 ? state.cableIdGap : undefined,
      cableIdMidOffset: state.cableIdMidOffset !== 0 ? state.cableIdMidOffset : undefined,
      cableIdLabelMode: state.cableIdLabelMode !== "endpoint" ? state.cableIdLabelMode : undefined,
      stubLabelShowPort: state.stubLabelShowPort !== DEFAULT_STUB_LABEL_SHOW_PORT ? state.stubLabelShowPort : undefined,
      stubLabelShowRoom: state.stubLabelShowRoom !== DEFAULT_STUB_LABEL_SHOW_ROOM ? state.stubLabelShowRoom : undefined,
      stubLabelPageMode: state.stubLabelPageMode !== DEFAULT_STUB_LABEL_PAGE_MODE ? state.stubLabelPageMode : undefined,
      useShortNames: state.useShortNames || undefined,
      wrapDeviceLabels: state.wrapDeviceLabels || undefined,
      hideAdapters: state.hideAdapters || undefined,
      autoRoute: state.autoRoute === false ? false : undefined,
      edgeHitboxSize: state.edgeHitboxSize !== 10 ? state.edgeHitboxSize : undefined,
      categoryOrder: state.categoryOrder ?? undefined,
      showOwnedGearPane: state.showOwnedGearPane || undefined,
      libraryActiveTab: state.libraryActiveTab !== "devices" ? state.libraryActiveTab : undefined,
      colorKeyEnabled: state.colorKeyEnabled || undefined,
      colorKeyCorner: state.colorKeyCorner !== "bottom-left" ? state.colorKeyCorner : undefined,
      colorKeyColumns: state.colorKeyColumns !== 1 ? state.colorKeyColumns : undefined,
      colorKeyPage: state.colorKeyPage !== "all" ? state.colorKeyPage : undefined,
      colorKeyOverrides: state.colorKeyOverrides && Object.keys(state.colorKeyOverrides).length > 0 ? state.colorKeyOverrides : undefined,
      pages: state.pages.length > 0 ? state.pages : undefined,
      cableCosts: state.cableCosts && Object.keys(state.cableCosts).length > 0 ? state.cableCosts : undefined,
      bundles: Object.keys(state.bundles).length > 0 ? state.bundles : undefined,
      roomDistances: state.roomDistances && Object.keys(state.roomDistances).length > 0 ? state.roomDistances : undefined,
      distanceSettings: state.distanceSettings,
    };
    // Persist cloud identity alongside autosave (not part of SchematicFile export)
    const blob: Record<string, unknown> = { ...data };
    if (state.cloudSchematicId) {
      blob.cloudSchematicId = state.cloudSchematicId;
      blob.cloudSavedAt = state.cloudSavedAt ?? undefined;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
    } catch {
      // Storage full or unavailable — silently fail
    }
  },

  loadFromLocalStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // Load default demo schematic for first-time visitors
        // Dynamically import to avoid bundling in the critical path
        import("./defaultSchematic.json").then((mod) => {
          // Only load if still empty (no race with user actions)
          if (get().nodes.length > 0) return;
          const data = migrateSchematic(mod.default) as SchematicFile;
          snapNodesToGrid(data.nodes);
          applyRoomLockState(data.nodes);
          syncCounters(data.nodes, data.edges);
          data.edges = ensureUniqueEdgeIds(removeOrphanedEdges(data.nodes, data.edges));
          data.edges = applyWaypointHeal(data.nodes, data.edges);
          // Heal-on-load: spawn break-in/out anchors for any pre-existing bundle (idempotent).
          data.nodes = reconcileBundleJunctions(data.nodes, data.edges);
          const colors = data.signalColors ?? {};
          applySignalColors(colors);
          saveSignalColors({ ...loadSignalColors(), ...colors });
          set({
            nodes: data.nodes,
            edges: data.edges,
            isDemo: true,
            schematicName: data.name ?? "Demo Schematic",
            ownedGear: data.ownedGear ?? [],
        ownedCables: data.ownedCables ?? [],
        ownedInventory: data.ownedInventory ?? [],
        layers: data.layers ?? [{ id: DEFAULT_LAYER_ID, name: "Base", visible: true, locked: false }],
        recentCustomColors: data.recentCustomColors ?? [],
        gearUnits: data.gearUnits ?? [],
        svgAssets: sanitizeSvgAssets(data.svgAssets),
        tagSuggestions: data.tagSuggestions ?? [],
        fieldSuggestions: data.fieldSuggestions ?? {},
        dismissedIssueIds: data.dismissedIssueIds ?? [],
        gridSettings: data.gridSettings ?? DEFAULT_GRID_SETTINGS,
        containers: data.containers ?? [],
            signalColors: data.signalColors,
            signalLineStyles: data.signalLineStyles,
            printPaperId: data.printPaperId ?? "arch-d",
            printOrientation: data.printOrientation ?? "landscape",
            printScale: data.printScale ?? 1.0,
            printCustomWidthIn: data.printCustomWidthIn ?? 24,
            printCustomHeightIn: data.printCustomHeightIn ?? 36,
            printOriginOffsetX: data.printOriginOffsetX ?? 0,
            printOriginOffsetY: data.printOriginOffsetY ?? 0,
            titleBlock: data.titleBlock ?? { showName: "", venue: "", designer: "", engineer: "", date: "", drawingTitle: "", company: "", revision: "", logo: "", customFields: [] },
            titleBlockLayout: data.titleBlockLayout ?? createDefaultLayout(),
            hiddenSignalTypes: data.hiddenSignalTypes?.length ? [...data.hiddenSignalTypes].sort().join(",") : "",
            hiddenPinSignalTypes: data.hiddenPinSignalTypes?.length ? [...data.hiddenPinSignalTypes].sort().join(",") : "",
            hideUnconnectedPorts: data.hideUnconnectedPorts ?? false,
            showPortCounts: data.showPortCounts ?? false,
            templateHiddenSignals: data.templateHiddenSignals ?? {},
            templatePresets: data.templatePresets ?? {},
            favoriteTemplates: data.favoriteTemplates ?? [],
            recentTemplates: data.recentTemplates ?? [],
            reportLayouts: data.reportLayouts ?? {},
            reportHiddenColumns: data.reportHiddenColumns ?? {},
            globalReportHeaderLayout: data.globalReportHeaderLayout ?? null,
            globalReportFooterLayout: data.globalReportFooterLayout ?? null,
            scrollConfig: resolveScrollConfig(data),
            cableNamingScheme: data.cableNamingScheme ?? "type-prefix",
            labelCase: resolveLabelCase(data.labelCase),
            currency: data.currency ?? "USD",
            status: data.status,
            panMode: (data.panMode === "pan-first" ? "pan-first" : "select-first") as PanMode,
            showLineJumps: data.showLineJumps ?? true,
            showFacePlateDetail: data.showFacePlateDetail ?? false,
            autoRoute: data.autoRoute ?? true,
            edgeHitboxSize: data.edgeHitboxSize ?? 10,
            showCableIdLabels: data.showCableIdLabels ?? data.showConnectionLabels ?? true,
            showConnectionLabels: data.showCableIdLabels ?? data.showConnectionLabels ?? true,
            showCustomLabels: data.showCustomLabels ?? true,
            cableIdGap: data.cableIdGap ?? 4,
            cableIdMidOffset: data.cableIdMidOffset ?? 0,
            cableIdLabelMode: data.cableIdLabelMode ?? "endpoint",
            stubLabelShowPort: data.stubLabelShowPort ?? DEFAULT_STUB_LABEL_SHOW_PORT,
            stubLabelShowRoom: data.stubLabelShowRoom ?? DEFAULT_STUB_LABEL_SHOW_ROOM,
            stubLabelPageMode: data.stubLabelPageMode ?? DEFAULT_STUB_LABEL_PAGE_MODE,
            useShortNames: data.useShortNames ?? false,
            wrapDeviceLabels: data.wrapDeviceLabels ?? false,
            hideAdapters: data.hideAdapters ?? false,
            categoryOrder: data.categoryOrder ?? null,
            showOwnedGearPane: data.showOwnedGearPane ?? false,
            libraryActiveTab: data.showOwnedGearPane ? (data.libraryActiveTab ?? "devices") : "devices",
            colorKeyEnabled: data.colorKeyEnabled ?? false,
            colorKeyCorner: data.colorKeyCorner ?? "bottom-left",
            colorKeyColumns: data.colorKeyColumns ?? 1,
            colorKeyPage: data.colorKeyPage ?? "all",
            colorKeyOverrides: data.colorKeyOverrides ?? undefined,
            pages: data.pages ?? [],
            cableCosts: data.cableCosts ?? undefined,
            bundles: data.bundles ?? {},
            roomDistances: data.roomDistances ?? undefined,
            distanceSettings: data.distanceSettings ?? undefined,
            loadSeq: get().loadSeq + 1,
          });
          if (data.pages?.length) syncRackCounters(data.pages);
          hydrated = true;
          get().saveToLocalStorage();
        });
        return false;
      }
      const parsed = JSON.parse(raw);
      const data = migrateSchematic(parsed) as SchematicFile;
      snapNodesToGrid(data.nodes);
      applyRoomLockState(data.nodes);
      syncCounters(data.nodes, data.edges);
      data.edges = ensureUniqueEdgeIds(removeOrphanedEdges(data.nodes, data.edges));
      data.edges = applyWaypointHeal(data.nodes, data.edges);
      // Heal-on-load: spawn break-in/out anchors for any pre-existing bundle (idempotent).
      data.nodes = reconcileBundleJunctions(data.nodes, data.edges);
      // Always apply colors — if file has none, reset to defaults
      const colors = data.signalColors ?? {};
      applySignalColors(colors);
      saveSignalColors({ ...loadSignalColors(), ...colors });
      set({
        nodes: data.nodes,
        edges: data.edges,
        schematicName: data.name ?? "Untitled Schematic",
        ownedGear: data.ownedGear ?? [],
        ownedCables: data.ownedCables ?? [],
        ownedInventory: data.ownedInventory ?? [],
        layers: data.layers ?? [{ id: DEFAULT_LAYER_ID, name: "Base", visible: true, locked: false }],
        recentCustomColors: data.recentCustomColors ?? [],
        gearUnits: data.gearUnits ?? [],
        svgAssets: sanitizeSvgAssets(data.svgAssets),
        tagSuggestions: data.tagSuggestions ?? [],
        fieldSuggestions: data.fieldSuggestions ?? {},
        dismissedIssueIds: data.dismissedIssueIds ?? [],
        gridSettings: data.gridSettings ?? DEFAULT_GRID_SETTINGS,
        containers: data.containers ?? [],
        signalColors: data.signalColors,
        signalLineStyles: data.signalLineStyles,
        printPaperId: data.printPaperId ?? "arch-d",
        printOrientation: data.printOrientation ?? "landscape",
        printScale: data.printScale ?? 1.0,
        printCustomWidthIn: data.printCustomWidthIn ?? 24,
        printCustomHeightIn: data.printCustomHeightIn ?? 36,
        printOriginOffsetX: data.printOriginOffsetX ?? 0,
        printOriginOffsetY: data.printOriginOffsetY ?? 0,
        titleBlock: data.titleBlock ?? { showName: "", venue: "", designer: "", engineer: "", date: "", drawingTitle: "", company: "", revision: "", logo: "", customFields: [] },
        titleBlockLayout: data.titleBlockLayout ?? createDefaultLayout(),
        hiddenSignalTypes: data.hiddenSignalTypes?.length ? [...data.hiddenSignalTypes].sort().join(",") : "",
        hiddenPinSignalTypes: data.hiddenPinSignalTypes?.length ? [...data.hiddenPinSignalTypes].sort().join(",") : "",
        hideUnconnectedPorts: data.hideUnconnectedPorts ?? false,
        showPortCounts: data.showPortCounts ?? false,
        templateHiddenSignals: data.templateHiddenSignals ?? {},
        templatePresets: data.templatePresets ?? {},
        favoriteTemplates: data.favoriteTemplates ?? [],
        recentTemplates: data.recentTemplates ?? [],
        reportLayouts: data.reportLayouts ?? {},
        reportHiddenColumns: data.reportHiddenColumns ?? {},
        globalReportHeaderLayout: data.globalReportHeaderLayout ?? null,
        globalReportFooterLayout: data.globalReportFooterLayout ?? null,
        scrollConfig: resolveScrollConfig(data),
        cableNamingScheme: data.cableNamingScheme ?? "type-prefix",
        labelCase: resolveLabelCase(data.labelCase),
        currency: data.currency ?? "USD",
        status: data.status,
        panMode: (data.panMode === "pan-first" ? "pan-first" : "select-first") as PanMode,
        showLineJumps: data.showLineJumps ?? true,
        showFacePlateDetail: data.showFacePlateDetail ?? false,
        showCableIdLabels: data.showCableIdLabels ?? data.showConnectionLabels ?? true,
        showConnectionLabels: data.showCableIdLabels ?? data.showConnectionLabels ?? true,
        showCustomLabels: data.showCustomLabels ?? true,
        cableIdGap: data.cableIdGap ?? 4,
        cableIdMidOffset: data.cableIdMidOffset ?? 0,
        cableIdLabelMode: data.cableIdLabelMode ?? "endpoint",
        stubLabelShowPort: data.stubLabelShowPort ?? DEFAULT_STUB_LABEL_SHOW_PORT,
        stubLabelShowRoom: data.stubLabelShowRoom ?? DEFAULT_STUB_LABEL_SHOW_ROOM,
        stubLabelPageMode: data.stubLabelPageMode ?? DEFAULT_STUB_LABEL_PAGE_MODE,
        useShortNames: data.useShortNames ?? false,
        wrapDeviceLabels: data.wrapDeviceLabels ?? false,
        hideAdapters: data.hideAdapters ?? false,
        autoRoute: data.autoRoute ?? true,
        edgeHitboxSize: data.edgeHitboxSize ?? 10,
        categoryOrder: data.categoryOrder ?? null,
        showOwnedGearPane: data.showOwnedGearPane ?? false,
        libraryActiveTab: data.showOwnedGearPane ? (data.libraryActiveTab ?? "devices") : "devices",
        colorKeyEnabled: data.colorKeyEnabled ?? false,
        colorKeyCorner: data.colorKeyCorner ?? "bottom-left",
        colorKeyColumns: data.colorKeyColumns ?? 1,
        colorKeyPage: data.colorKeyPage ?? "all",
        colorKeyOverrides: data.colorKeyOverrides ?? undefined,
        pages: data.pages ?? [],
        cableCosts: data.cableCosts ?? undefined,
        bundles: data.bundles ?? {},
        roomDistances: data.roomDistances ?? undefined,
        distanceSettings: data.distanceSettings ?? undefined,
        // Restore cloud identity from autosave (not part of SchematicFile)
        cloudSchematicId: parsed.cloudSchematicId ?? null,
        cloudSavedAt: parsed.cloudSavedAt ?? null,
        loadSeq: get().loadSeq + 1,
      });
      if (data.pages?.length) syncRackCounters(data.pages);
      hydrated = true;
      return true;
    } catch {
      hydrated = true;
      return false;
    }
  },

  exportToJSON: () => {
    const state = get();
    return {
      version: CURRENT_SCHEMA_VERSION,
      name: state.schematicName,
      nodes: state.nodes,
      edges: state.edges.map(({ zIndex: _, selected: _s, ...rest }) => rest) as ConnectionEdge[],
      customTemplates: state.customTemplates.length > 0 ? state.customTemplates : undefined,
      ownedGear: state.ownedGear.length > 0 ? state.ownedGear : undefined,
      ownedCables: state.ownedCables.length > 0 ? state.ownedCables : undefined,
      ownedInventory: state.ownedInventory.length > 0 ? state.ownedInventory : undefined,
      layers: state.layers,
      recentCustomColors: state.recentCustomColors.length > 0 ? state.recentCustomColors : undefined,
      gearUnits: state.gearUnits.length > 0 ? state.gearUnits : undefined,
      svgAssets: Object.keys(state.svgAssets).length > 0 ? state.svgAssets : undefined,
      tagSuggestions: state.tagSuggestions.length > 0 ? state.tagSuggestions : undefined,
      fieldSuggestions: Object.keys(state.fieldSuggestions).length > 0 ? state.fieldSuggestions : undefined,
      dismissedIssueIds: state.dismissedIssueIds.length > 0 ? state.dismissedIssueIds : undefined,
      gridSettings: JSON.stringify(state.gridSettings) !== JSON.stringify(DEFAULT_GRID_SETTINGS) ? state.gridSettings : undefined,
      containers: state.containers.length > 0 ? state.containers : undefined,
      signalColors: state.signalColors,
      signalLineStyles: state.signalLineStyles,
      printPaperId: state.printPaperId,
      printOrientation: state.printOrientation,
      printScale: state.printScale,
      printCustomWidthIn: state.printPaperId === "custom" ? state.printCustomWidthIn : undefined,
      printCustomHeightIn: state.printPaperId === "custom" ? state.printCustomHeightIn : undefined,
      printOriginOffsetX: state.printOriginOffsetX || undefined,
      printOriginOffsetY: state.printOriginOffsetY || undefined,
      titleBlock: state.titleBlock,
      titleBlockLayout: state.titleBlockLayout,
      hiddenSignalTypes: state.hiddenSignalTypes ? state.hiddenSignalTypes.split(",") as SignalType[] : undefined,
      hiddenPinSignalTypes: state.hiddenPinSignalTypes ? state.hiddenPinSignalTypes.split(",") as SignalType[] : undefined,
      hideUnconnectedPorts: state.hideUnconnectedPorts || undefined,
      showPortCounts: state.showPortCounts || undefined,
      templateHiddenSignals: Object.keys(state.templateHiddenSignals).length > 0 ? state.templateHiddenSignals : undefined,
      templatePresets: Object.keys(state.templatePresets).length > 0 ? state.templatePresets : undefined,
      favoriteTemplates: state.favoriteTemplates.length > 0 ? state.favoriteTemplates : undefined,
      recentTemplates: state.recentTemplates.length > 0 ? state.recentTemplates : undefined,
      reportLayouts: Object.keys(state.reportLayouts).length > 0 ? state.reportLayouts : undefined,
      reportHiddenColumns: Object.keys(state.reportHiddenColumns).length > 0 ? state.reportHiddenColumns : undefined,
      globalReportHeaderLayout: state.globalReportHeaderLayout ?? undefined,
      globalReportFooterLayout: state.globalReportFooterLayout ?? undefined,
      scrollConfig: isDefaultScrollConfig(state.scrollConfig) ? undefined : state.scrollConfig,
      cableNamingScheme: state.cableNamingScheme !== "type-prefix" ? state.cableNamingScheme : undefined,
      labelCase: state.labelCase !== "as-typed" ? state.labelCase : undefined,
      currency: state.currency !== "USD" ? state.currency : undefined,
      status: state.status,
      panMode: state.panMode !== "select-first" ? state.panMode : undefined,
      showLineJumps: !state.showLineJumps ? false : undefined,
      showFacePlateDetail: state.showFacePlateDetail ? true : undefined,
      showCableIdLabels: !state.showCableIdLabels ? false : undefined,
      showCustomLabels: !state.showCustomLabels ? false : undefined,
      cableIdGap: state.cableIdGap !== 4 ? state.cableIdGap : undefined,
      cableIdMidOffset: state.cableIdMidOffset !== 0 ? state.cableIdMidOffset : undefined,
      cableIdLabelMode: state.cableIdLabelMode !== "endpoint" ? state.cableIdLabelMode : undefined,
      stubLabelShowPort: state.stubLabelShowPort !== DEFAULT_STUB_LABEL_SHOW_PORT ? state.stubLabelShowPort : undefined,
      stubLabelShowRoom: state.stubLabelShowRoom !== DEFAULT_STUB_LABEL_SHOW_ROOM ? state.stubLabelShowRoom : undefined,
      stubLabelPageMode: state.stubLabelPageMode !== DEFAULT_STUB_LABEL_PAGE_MODE ? state.stubLabelPageMode : undefined,
      useShortNames: state.useShortNames || undefined,
      wrapDeviceLabels: state.wrapDeviceLabels || undefined,
      hideAdapters: state.hideAdapters || undefined,
      autoRoute: state.autoRoute === false ? false : undefined,
      edgeHitboxSize: state.edgeHitboxSize !== 10 ? state.edgeHitboxSize : undefined,
      categoryOrder: state.categoryOrder ?? undefined,
      showOwnedGearPane: state.showOwnedGearPane || undefined,
      libraryActiveTab: state.libraryActiveTab !== "devices" ? state.libraryActiveTab : undefined,
      colorKeyEnabled: state.colorKeyEnabled || undefined,
      colorKeyCorner: state.colorKeyCorner !== "bottom-left" ? state.colorKeyCorner : undefined,
      colorKeyColumns: state.colorKeyColumns !== 1 ? state.colorKeyColumns : undefined,
      colorKeyPage: state.colorKeyPage !== "all" ? state.colorKeyPage : undefined,
      colorKeyOverrides: state.colorKeyOverrides && Object.keys(state.colorKeyOverrides).length > 0 ? state.colorKeyOverrides : undefined,
      pages: state.pages.length > 0 ? state.pages : undefined,
      cableCosts: state.cableCosts && Object.keys(state.cableCosts).length > 0 ? state.cableCosts : undefined,
      bundles: Object.keys(state.bundles).length > 0 ? state.bundles : undefined,
      roomDistances: state.roomDistances && Object.keys(state.roomDistances).length > 0 ? state.roomDistances : undefined,
      distanceSettings: state.distanceSettings,
    };
  },

  importFromJSON: (rawData) => {
    rawData = repairMojibake(rawData) as SchematicFile;
    const data = migrateSchematic(rawData) as SchematicFile;
    let nodes = data.nodes ?? [];
    let edges = data.edges ?? [];
    // Sanitize note HTML to prevent XSS from malicious schematic files
    for (const node of nodes) {
      if (node.type === "note" && node.data && "html" in node.data) {
        (node.data as { html: string }).html = sanitizeNoteHtml((node.data as { html: string }).html);
      }
    }
    snapNodesToGrid(nodes);
    applyRoomLockState(nodes);
    syncCounters(nodes, edges);
    edges = ensureUniqueEdgeIds(removeOrphanedEdges(nodes, edges));
    edges = applyWaypointHeal(nodes, edges);
    // Heal-on-load: spawn break-in/out anchors for any imported bundle (idempotent).
    nodes = reconcileBundleJunctions(nodes, edges);
    // Merge imported custom templates with existing ones (avoid duplicates by template key)
    if (data.customTemplates?.length) {
      const existing = get().customTemplates;
      const existingKeys = new Set(existing.map((t) => templateKey(t)));
      const newTemplates = data.customTemplates.filter((t) => !existingKeys.has(templateKey(t)));
      if (newTemplates.length > 0) {
        const merged = [...existing, ...newTemplates];
        set({ customTemplates: merged });
        saveCustomTemplates(merged);
      }
    }
    // Always apply colors — if file has none, reset to defaults
    const colors = data.signalColors ?? {};
    applySignalColors(colors);
    saveSignalColors({ ...loadSignalColors(), ...colors });
    set({
      nodes,
      edges,
      schematicName: data.name ?? "Imported Schematic",
      isDemo: false,
      ownedGear: data.ownedGear ?? [],
        ownedCables: data.ownedCables ?? [],
        ownedInventory: data.ownedInventory ?? [],
        layers: data.layers ?? [{ id: DEFAULT_LAYER_ID, name: "Base", visible: true, locked: false }],
        recentCustomColors: data.recentCustomColors ?? [],
        gearUnits: data.gearUnits ?? [],
        svgAssets: sanitizeSvgAssets(data.svgAssets),
        tagSuggestions: data.tagSuggestions ?? [],
        fieldSuggestions: data.fieldSuggestions ?? {},
        dismissedIssueIds: data.dismissedIssueIds ?? [],
        gridSettings: data.gridSettings ?? DEFAULT_GRID_SETTINGS,
        containers: data.containers ?? [],
      signalColors: data.signalColors,
      signalLineStyles: data.signalLineStyles,
      printPaperId: data.printPaperId ?? "arch-d",
      printOrientation: data.printOrientation ?? "landscape",
      printScale: data.printScale ?? 1.0,
      printCustomWidthIn: data.printCustomWidthIn ?? 24,
      printCustomHeightIn: data.printCustomHeightIn ?? 36,
      printOriginOffsetX: data.printOriginOffsetX ?? 0,
      printOriginOffsetY: data.printOriginOffsetY ?? 0,
      titleBlock: data.titleBlock ?? { showName: "", venue: "", designer: "", engineer: "", date: "", drawingTitle: "", company: "", revision: "", logo: "", customFields: [] },
      titleBlockLayout: data.titleBlockLayout ?? createDefaultLayout(),
      hiddenSignalTypes: data.hiddenSignalTypes?.length ? [...data.hiddenSignalTypes].sort().join(",") : "",
      hiddenPinSignalTypes: data.hiddenPinSignalTypes?.length ? [...data.hiddenPinSignalTypes].sort().join(",") : "",
      hideUnconnectedPorts: data.hideUnconnectedPorts ?? false,
      showPortCounts: data.showPortCounts ?? false,
      templateHiddenSignals: data.templateHiddenSignals ?? {},
      templatePresets: data.templatePresets ?? {},
      favoriteTemplates: data.favoriteTemplates ?? [],
      recentTemplates: data.recentTemplates ?? [],
      reportLayouts: data.reportLayouts ?? {},
      reportHiddenColumns: data.reportHiddenColumns ?? {},
      globalReportHeaderLayout: data.globalReportHeaderLayout ?? null,
      globalReportFooterLayout: data.globalReportFooterLayout ?? null,
      scrollConfig: resolveScrollConfig(data),
      cableNamingScheme: data.cableNamingScheme ?? "type-prefix",
      labelCase: resolveLabelCase(data.labelCase),
      currency: data.currency ?? "USD",
      status: data.status,
      panMode: (data.panMode === "pan-first" ? "pan-first" : "select-first") as PanMode,
      showLineJumps: data.showLineJumps ?? true,
      showFacePlateDetail: data.showFacePlateDetail ?? false,
      showCableIdLabels: data.showCableIdLabels ?? data.showConnectionLabels ?? true,
      showConnectionLabels: data.showCableIdLabels ?? data.showConnectionLabels ?? true,
      showCustomLabels: data.showCustomLabels ?? true,
      cableIdGap: data.cableIdGap ?? 4,
      cableIdMidOffset: data.cableIdMidOffset ?? 0,
      cableIdLabelMode: data.cableIdLabelMode ?? "endpoint",
      stubLabelShowPort: data.stubLabelShowPort ?? DEFAULT_STUB_LABEL_SHOW_PORT,
      stubLabelPageMode: data.stubLabelPageMode ?? DEFAULT_STUB_LABEL_PAGE_MODE,
      useShortNames: data.useShortNames ?? false,
      wrapDeviceLabels: data.wrapDeviceLabels ?? false,
      hideAdapters: data.hideAdapters ?? false,
      autoRoute: data.autoRoute ?? true,
      edgeHitboxSize: data.edgeHitboxSize ?? 10,
      categoryOrder: data.categoryOrder ?? null,
      showOwnedGearPane: data.showOwnedGearPane ?? false,
      libraryActiveTab: data.showOwnedGearPane ? (data.libraryActiveTab ?? "devices") : "devices",
      colorKeyEnabled: data.colorKeyEnabled ?? false,
      colorKeyCorner: data.colorKeyCorner ?? "bottom-left",
      colorKeyColumns: data.colorKeyColumns ?? 1,
      colorKeyPage: data.colorKeyPage ?? "all",
      colorKeyOverrides: data.colorKeyOverrides ?? undefined,
      pages: data.pages ?? [],
      activePage: "schematic",
      cableCosts: data.cableCosts ?? undefined,
      bundles: data.bundles ?? {},
      roomDistances: data.roomDistances ?? undefined,
      distanceSettings: data.distanceSettings ?? undefined,
      // File imports and shared schematics always start as local-only
      cloudSchematicId: null,
      cloudSavedAt: null,
      fileHandle: null,
      loadSeq: get().loadSeq + 1,
    });
    // Post-load side-effects (ID counters + persistence). The schematic is
    // already committed to state above; a failure here must NOT propagate, or a
    // caller's try/catch mislabels a successfully-loaded file as invalid (#176).
    try {
      if (data.pages?.length) syncRackCounters(data.pages);
      saveCategoryOrder(data.categoryOrder ?? null);
      get().saveToLocalStorage();
    } catch (err) {
      console.error("Post-import side-effect failed (schematic still loaded):", err);
    }
  },

  importCsvData: (newNodes, newEdges) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const mergedNodes = [...state.nodes, ...newNodes];
    const mergedEdges = ensureUniqueEdgeIds([...state.edges, ...newEdges]);

    syncCounters(mergedNodes, mergedEdges);
    snapNodesToGrid(mergedNodes);

    set({
      nodes: renumberNodes(mergedNodes),
      edges: mergedEdges,
    });
    get().saveToLocalStorage();
  },

  newSchematic: (templateData?: SchematicFile) => {
    undoStack.length = 0;
    redoStack.length = 0;
    if (templateData) {
      // Load template as a new unsaved file
      get().importFromJSON(templateData);
      set({
        schematicName: "Untitled Schematic",
        isDemo: false,
        cloudSchematicId: null,
        cloudSavedAt: null,
        fileHandle: null,
        undoSize: 0,
        redoSize: 0,
      });
    } else {
      set({
        nodes: [],
        edges: [],
        bundles: {},
        schematicName: "Untitled Schematic",
        isDemo: false,
        ownedGear: [],
        ownedCables: [],
        ownedInventory: [],
        gearUnits: [],
        svgAssets: {},
        tagSuggestions: [],
        fieldSuggestions: {},
        dismissedIssueIds: [],
        gridSettings: DEFAULT_GRID_SETTINGS,
        containers: [],
        layers: [{ id: DEFAULT_LAYER_ID, name: "Base", visible: true, locked: false }],
        cloudSchematicId: null,
        cloudSavedAt: null,
        fileHandle: null,
        titleBlock: { showName: "", venue: "", designer: "", engineer: "", date: "", drawingTitle: "", company: "", revision: "", logo: "", customFields: [] },
        titleBlockLayout: createDefaultLayout(),
        hiddenSignalTypes: "",
        hiddenPinSignalTypes: "",
        hideUnconnectedPorts: false,
        showPortCounts: false,
        templateHiddenSignals: {},
        templatePresets: {},
        favoriteTemplates: [],
        recentTemplates: [],
        reportLayouts: {},
        reportHiddenColumns: {},
        globalReportHeaderLayout: null,
        globalReportFooterLayout: null,
        scrollConfig: { ...DEFAULT_SCROLL_CONFIG },
        cableNamingScheme: "type-prefix",
        showLineJumps: true,
        showConnectionLabels: true,
        showCableIdLabels: true,
        showCustomLabels: true,
        cableIdGap: 4,
        cableIdMidOffset: 0,
        cableIdLabelMode: "endpoint" as "endpoint" | "midpoint",
        stubLabelShowPort: DEFAULT_STUB_LABEL_SHOW_PORT,
        stubLabelShowRoom: DEFAULT_STUB_LABEL_SHOW_ROOM,
        stubLabelPageMode: DEFAULT_STUB_LABEL_PAGE_MODE,
        useShortNames: false,
        wrapDeviceLabels: true,
        autoRoute: true,
        edgeHitboxSize: 10,
        panMode: DEFAULT_PAN_MODE,
        showOwnedGearPane: false,
        libraryActiveTab: "devices" as "devices" | "owned",
        undoSize: 0,
        redoSize: 0,
        pages: [],
        activePage: "schematic",
        loadSeq: get().loadSeq + 1,
      });
    }
    get().saveToLocalStorage();
  },

  setSchematicName: (name) => {
    set({ schematicName: name });
    get().saveToLocalStorage();
  },

  patchEdgeData: (edgeId, patch) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      edges: state.edges.map((e) => {
        if (e.id !== edgeId) return e;
        const merged = { ...e.data!, ...patch };
        // Remove keys explicitly set to undefined so they don't persist in JSON
        for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
          if (patch[k] === undefined) delete (merged as Record<string, unknown>)[k];
        }
        const strokeAffectingKeys = ["color", "directAttach", "signalType"] as const;
        const strokeAffected = strokeAffectingKeys.some((k) => k in patch);
        if (strokeAffected) {
          const strokeWidth = merged.directAttach ? 1 : 2;
          return {
            ...e,
            data: merged,
            style: { ...e.style, stroke: resolveEdgeStroke(merged), strokeWidth },
          };
        }
        return { ...e, data: merged };
      }),
    });
    get().saveToLocalStorage();
  },

  patchStubLabelData: (nodeId, patch) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId || n.type !== "stub-label") return n;
        const merged = { ...(n.data as Record<string, unknown>), ...patch } as typeof n.data;
        for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
          if (patch[k] === undefined) delete (merged as Record<string, unknown>)[k];
        }
        return { ...n, data: merged };
      }),
    });
    get().saveToLocalStorage();
  },

  convertEdgeToStubs: (edgeId) => {
    const state = get();
    const edge = state.edges.find((e) => e.id === edgeId);
    if (!edge) return;
    if (edge.data?.linkedConnectionId) return; // already a stub leg

    const srcDevice = state.nodes.find((n) => n.id === edge.source);
    const tgtDevice = state.nodes.find((n) => n.id === edge.target);
    if (!srcDevice || !tgtDevice) return;

    const absPos = (n: typeof state.nodes[number]): { x: number; y: number } => {
      let x = n.position.x;
      let y = n.position.y;
      let pid = n.parentId;
      while (pid) {
        const p = state.nodes.find((nn) => nn.id === pid);
        if (!p) break;
        x += p.position.x;
        y += p.position.y;
        pid = p.parentId;
      }
      return { x, y };
    };

    // Resolve the real handle position using the same render-mirroring math the
    // stub-snap logic uses. Falls back to a device-edge approximation only when
    // the handle can't be resolved (unknown port id), which shouldn't happen in
    // practice since the edge already references the handle.
    const nodeMap = new Map(state.nodes.map((n) => [n.id, n] as const));
    const displayDefaults = {
      useShortNames: state.useShortNames,
      wrapDeviceLabels: state.wrapDeviceLabels,
    };
    const handlePosFor = (
      deviceNode: typeof state.nodes[number],
      handleId: string | null | undefined,
    ): { x: number; y: number; side: "left" | "right" } => {
      const positions = getPortAbsolutePositions(deviceNode, nodeMap, displayDefaults);
      const match = positions.find((p) => p.handleId === handleId);
      if (match) return { x: match.absX, y: match.absY, side: match.side };
      // Fallback: device vertical center on the appropriate edge.
      const dPos = absPos(deviceNode);
      const w = (deviceNode.measured?.width as number | undefined) ?? 144;
      const h = (deviceNode.measured?.height as number | undefined) ?? 48;
      const ports = (deviceNode.data as { ports?: Port[] }).ports ?? [];
      const baseId = (handleId ?? "").replace(/-(in|out|rear|front)$/, "");
      const port = ports.find((pp) => pp.id === baseId);
      let side: "left" | "right" = "right";
      if (port) {
        if (port.direction === "input") side = port.flipped ? "right" : "left";
        else if (port.direction === "output") side = port.flipped ? "left" : "right";
        else side = port.flipped ? "right" : "left";
      }
      return { x: side === "right" ? dPos.x + w : dPos.x, y: dPos.y + h / 2, side };
    };

    const srcHandle = handlePosFor(srcDevice, edge.sourceHandle);
    const tgtHandle = handlePosFor(tgtDevice, edge.targetHandle);

    const srcPlace = defaultStubPlacement({ x: srcHandle.x, y: srcHandle.y }, srcHandle.side);
    const tgtPlace = defaultStubPlacement({ x: tgtHandle.x, y: tgtHandle.y }, tgtHandle.side);
    // Round to integer pixels — any sub-pixel from the parent-chain walk would
    // make the edge router round port and stub handles to adjacent integers and
    // produce a 1-px jog at the endpoint. The 14-px box height divided by 2 is
    // an integer already, so this is just defending against deviceAbs drift.
    const srcStubAbs = { x: Math.round(srcPlace.pos.x), y: Math.round(srcPlace.pos.y) };
    const tgtStubAbs = { x: Math.round(tgtPlace.pos.x), y: Math.round(tgtPlace.pos.y) };
    const srcSide = srcPlace.handle;
    const tgtSide = tgtPlace.handle;

    const srcParentId = srcDevice.parentId;
    const tgtParentId = tgtDevice.parentId;
    const rawSrcParentAbs = srcParentId
      ? absPos(state.nodes.find((n) => n.id === srcParentId)!)
      : { x: 0, y: 0 };
    const rawTgtParentAbs = tgtParentId
      ? absPos(state.nodes.find((n) => n.id === tgtParentId)!)
      : { x: 0, y: 0 };
    const srcParentAbs = { x: Math.round(rawSrcParentAbs.x), y: Math.round(rawSrcParentAbs.y) };
    const tgtParentAbs = { x: Math.round(rawTgtParentAbs.x), y: Math.round(rawTgtParentAbs.y) };

    const linkedConnectionId = newLinkedConnectionId();
    const stubNodeIdSrc = `stub-${edge.id}-src`;
    const stubNodeIdTgt = `stub-${edge.id}-tgt`;
    const sigType = edge.data!.signalType;

    // Don't stamp data.placed yet — the X above assumes STUB_W_EST (80px), but
    // a wide cable label can produce a 200+ px box. tryPlace's overlap-correction
    // pass needs to run once after React Flow measures the real width, especially
    // for left-side stubs whose box extends back toward the device. Y is already
    // correct (computed from the real port handle row), so tryPlace will only
    // ever shift X here, not jump the stub.
    const srcStubNode: SchematicNode = {
      id: stubNodeIdSrc,
      type: "stub-label",
      position: { x: srcStubAbs.x - srcParentAbs.x, y: srcStubAbs.y - srcParentAbs.y },
      ...(srcParentId ? { parentId: srcParentId } : {}),
      zIndex: STUB_LABEL_Z_INDEX, // paint above connection lines (#178)
      data: { signalType: sigType, linkedConnectionId, side: "source" },
    } as SchematicNode;
    const tgtStubNode: SchematicNode = {
      id: stubNodeIdTgt,
      type: "stub-label",
      position: { x: tgtStubAbs.x - tgtParentAbs.x, y: tgtStubAbs.y - tgtParentAbs.y },
      ...(tgtParentId ? { parentId: tgtParentId } : {}),
      zIndex: STUB_LABEL_Z_INDEX, // paint above connection lines (#178)
      data: { signalType: sigType, linkedConnectionId, side: "target" },
    } as SchematicNode;

    const baseData = { ...edge.data! };
    delete (baseData as Record<string, unknown>).manualWaypoints;
    delete (baseData as Record<string, unknown>).autoRouteWaypoints;
    // Stubbing a bundled member removes it from the bundle (a stub has no trunk to share).
    const wasBundled = !!(baseData as Record<string, unknown>).bundleId;
    delete (baseData as Record<string, unknown>).bundleId;

    const srcLeg: ConnectionEdge = {
      ...edge,
      id: `${edge.id}-src`,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: stubNodeIdSrc,
      targetHandle: srcSide,
      data: { ...baseData, linkedConnectionId },
    };
    const tgtLegData = { ...baseData, linkedConnectionId } as ConnectionEdge["data"];
    delete (tgtLegData as Record<string, unknown>).cableId;
    delete (tgtLegData as Record<string, unknown>).label;
    delete (tgtLegData as Record<string, unknown>).cableLength;
    delete (tgtLegData as Record<string, unknown>).multicableLabel;
    const tgtLeg: ConnectionEdge = {
      ...edge,
      id: `${edge.id}-tgt`,
      source: stubNodeIdTgt,
      sourceHandle: tgtSide,
      target: edge.target,
      targetHandle: edge.targetHandle,
      data: tgtLegData,
    };

    pushUndo({ nodes: state.nodes, edges: state.edges });
    const newEdges = [...state.edges.filter((e) => e.id !== edgeId), srcLeg, tgtLeg];
    // Removing this member may drop its bundle below 2 — GC dangling membership + bundles.
    const gc = gcBundles(newEdges, state.bundles);
    set({
      // Stubbing a member can dissolve its bundle — drop the now-orphan junction anchors.
      nodes: reconcileBundleJunctions(
        reconcileWaypointNodes([...state.nodes, srcStubNode, tgtStubNode], gc.edges),
        gc.edges,
      ),
      edges: gc.edges,
      bundles: gc.bundles,
    });
    if (wasBundled) get().addToast("Removed from bundle (stubbed)", "info");
    get().saveToLocalStorage();
  },

  collapseStubsForEdge: (edgeId) => {
    const state = get();
    const edge = state.edges.find((e) => e.id === edgeId);
    if (!edge) return;
    const linkedId = edge.data?.linkedConnectionId;
    if (!linkedId) return;

    const linkedEdges = state.edges.filter((e) => e.data?.linkedConnectionId === linkedId);
    if (linkedEdges.length < 2) return;
    const srcLeg = linkedEdges.find((e) => {
      const src = state.nodes.find((n) => n.id === e.source);
      return src?.type !== "stub-label";
    });
    const tgtLeg = linkedEdges.find((e) => {
      const tgt = state.nodes.find((n) => n.id === e.target);
      return tgt?.type !== "stub-label";
    });
    if (!srcLeg || !tgtLeg) return;

    const stubIds = new Set<string>();
    for (const e of linkedEdges) {
      const src = state.nodes.find((n) => n.id === e.source);
      const tgt = state.nodes.find((n) => n.id === e.target);
      if (src?.type === "stub-label") stubIds.add(src.id);
      if (tgt?.type === "stub-label") stubIds.add(tgt.id);
    }

    // Reconstruct a single direct edge. Use srcLeg as the metadata canonical
    // (it's where cableId/label live after migration/conversion).
    const mergedData = { ...srcLeg.data! };
    delete (mergedData as Record<string, unknown>).linkedConnectionId;

    const directId = srcLeg.id.endsWith("-src") ? srcLeg.id.slice(0, -4) : `merged-${srcLeg.id}`;
    const directEdge: ConnectionEdge = {
      ...srcLeg,
      id: directId,
      source: srcLeg.source,
      sourceHandle: srcLeg.sourceHandle,
      target: tgtLeg.target,
      targetHandle: tgtLeg.targetHandle,
      data: mergedData,
    };

    pushUndo({ nodes: state.nodes, edges: state.edges });
    const newEdges = [...state.edges.filter((e) => e.data?.linkedConnectionId !== linkedId), directEdge];
    set({
      nodes: reconcileWaypointNodes(state.nodes.filter((n) => !stubIds.has(n.id)), newEdges),
      edges: newEdges,
    });
    get().saveToLocalStorage();
  },

  batchPatchEdgeData: (changes) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const changeMap = new Map(changes.map((c) => [c.edgeId, c.patch]));
    set({
      edges: state.edges.map((e) => {
        const patch = changeMap.get(e.id);
        if (!patch) return e;
        const merged = { ...e.data!, ...patch };
        for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
          if (patch[k] === undefined) delete (merged as Record<string, unknown>)[k];
        }
        // If the patch can affect the rendered stroke, recompute it.
        const strokeAffectingKeys = ["color", "directAttach", "signalType"] as const;
        const strokeAffected = strokeAffectingKeys.some((k) => k in patch);
        if (strokeAffected) {
          const strokeWidth = merged.directAttach ? 1 : 2;
          return {
            ...e,
            data: merged,
            style: { ...e.style, stroke: resolveEdgeStroke(merged), strokeWidth },
          };
        }
        return { ...e, data: merged };
      }),
    });
    get().saveToLocalStorage();
  },

  setManualWaypoints: (edgeId, waypoints) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const newEdges = state.edges.map((e) =>
      e.id === edgeId
        ? { ...e, data: { ...e.data!, manualWaypoints: waypoints, autoRouteWaypoints: undefined } }
        : e,
    );
    set({
      edges: newEdges,
      nodes: reconcileWaypointNodes(state.nodes, newEdges),
    });
    get().saveToLocalStorage();
  },

  clearManualWaypoints: (edgeId) => {
    const state = get();
    const edge = state.edges.find((e) => e.id === edgeId);
    if (!edge) return;

    const hasManual = !!edge.data?.manualWaypoints;

    // If this is a leg of a stubbed connection, "Reset Route" should also re-place its
    // stub labels: clear `placed`/`userMoved` so StubLabelNode.tryPlace re-anchors them
    // to their ports. This is the escape hatch for #182 — a stub frozen out of alignment
    // (e.g. left behind after a device move) previously couldn't be corrected because
    // Reset Route only touched edge waypoints (and bailed entirely when there were none).
    const linkedId = edge.data?.linkedConnectionId;
    const stubIdsToReset = new Set<string>();
    if (linkedId) {
      for (const n of state.nodes) {
        if (n.type !== "stub-label") continue;
        const d = n.data as import("./types").StubLabelData;
        if (d.linkedConnectionId !== linkedId) continue;
        if (d.placed === true || d.userMoved === true) stubIdsToReset.add(n.id);
      }
    }

    if (!hasManual && stubIdsToReset.size === 0) return;

    pushUndo({ nodes: state.nodes, edges: state.edges });

    const newEdges = hasManual
      ? state.edges.map((e) => {
          if (e.id !== edgeId) return e;
          const { manualWaypoints: _mw, ...restData } = e.data!;
          return { ...e, data: restData as ConnectionEdge["data"] };
        })
      : state.edges;

    let newNodes = hasManual ? reconcileWaypointNodes(state.nodes, newEdges) : state.nodes;
    if (stubIdsToReset.size > 0) {
      newNodes = newNodes.map((n) => {
        if (!stubIdsToReset.has(n.id) || n.type !== "stub-label") return n;
        const d = n.data as import("./types").StubLabelData;
        return { ...n, data: { ...d, placed: false, userMoved: false } };
      });
    }

    set({ edges: newEdges, nodes: newNodes });
    get().saveToLocalStorage();
  },

  clearAllManualWaypoints: () => {
    const state = get();
    if (!state.edges.some((e) => e.data?.manualWaypoints?.length)) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const newEdges = state.edges.map((e) => {
      if (!e.data?.manualWaypoints?.length) return e;
      // Strip both the manual route and the auto-route-frozen flag so the edge re-routes fresh.
      const { manualWaypoints: _mw, autoRouteWaypoints: _ar, ...restData } = e.data;
      return { ...e, data: restData as ConnectionEdge["data"] };
    });
    set({
      edges: newEdges,
      nodes: reconcileWaypointNodes(state.nodes, newEdges),
    });
    get().saveToLocalStorage();
  },

  // ── Connection bundling ───────────────────────────────────────────────
  createBundle: (edgeIds) => {
    const state = get();
    const ids = edgeIds.filter((id) => state.edges.some((e) => e.id === id && e.data?.signalType));
    if (ids.length < 2) {
      get().addToast("Select at least 2 connections to bundle", "info");
      return;
    }
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const id = newBundleId();
    const edges = state.edges.map((e) =>
      ids.includes(e.id) ? { ...e, data: { ...e.data!, bundleId: id } } : e,
    );
    // Spawn the bundle's break-in/break-out anchors. The members are already routed, so their
    // waypoint endpoints give the exact pin Ys — the anchors land on the cables, not at the
    // (possibly very tall) device's vertical center.
    const nodes = reconcileBundleJunctions(state.nodes, edges, routedEndpointY(state.routedEdges));
    set({ edges, bundles: { ...state.bundles, [id]: { id } }, nodes });
    get().saveToLocalStorage();
  },
  dissolveBundle: (bundleId) => {
    const state = get();
    if (!state.bundles[bundleId]) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const edges = state.edges.map((e) => {
      if (e.data?.bundleId !== bundleId) return e;
      const { bundleId: _b, ...rest } = e.data!;
      return { ...e, data: rest as ConnectionEdge["data"] };
    });
    const { [bundleId]: _gone, ...bundles } = state.bundles;
    // Drop the dissolved bundle's now-orphan junction anchors.
    const nodes = reconcileBundleJunctions(state.nodes, edges);
    set({ edges, bundles, nodes });
    get().saveToLocalStorage();
  },
  addToBundle: (bundleId, edgeIds) => {
    const state = get();
    if (!state.bundles[bundleId]) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const edges = state.edges.map((e) =>
      edgeIds.includes(e.id) && e.data?.signalType ? { ...e, data: { ...e.data!, bundleId } } : e,
    );
    // Anchors already exist for a live bundle (no-op); reconcile only spawns if somehow missing.
    const nodes = reconcileBundleJunctions(state.nodes, edges, routedEndpointY(state.routedEdges));
    set({ edges, nodes });
    get().saveToLocalStorage();
  },
  removeFromBundle: (edgeIds) => {
    const state = get();
    if (!state.edges.some((e) => edgeIds.includes(e.id) && e.data?.bundleId)) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const edges = state.edges.map((e) => {
      if (!edgeIds.includes(e.id) || !e.data?.bundleId) return e;
      const { bundleId: _b, ...rest } = e.data!;
      return { ...e, data: rest as ConnectionEdge["data"] };
    });
    // Auto-dissolve any bundle that dropped below 2 members, then drop its orphan anchors.
    const gc = gcBundles(edges, state.bundles);
    const nodes = reconcileBundleJunctions(state.nodes, gc.edges);
    set({ edges: gc.edges, bundles: gc.bundles, nodes });
    get().saveToLocalStorage();
  },
  setBundleMeta: (bundleId, patch) => {
    const state = get();
    if (!state.bundles[bundleId]) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({ bundles: { ...state.bundles, [bundleId]: { ...state.bundles[bundleId], ...patch } } });
    get().saveToLocalStorage();
  },
  setBundleTrunkWaypoints: (bundleId, trunkWaypoints) =>
    get().setBundleMeta(bundleId, { trunkWaypoints }),

  computeSimpleRoutes: (rfInstance) => {
    // Simple orthogonal L-shapes — no A*, no penalties, instant.
    // Used when autoRoute is off for lag-free editing.
    const state = get();
    const results: Record<string, RoutedEdge> = {};

    // Bundle members route along one shared trunk (straight L-gather + trunk + L-fan, no
    // A*). Tally present members per bundle; a bundle is live only with ≥2 members.
    const bundleCounts = new Map<string, number>();
    for (const e of state.edges) {
      const bid = e.data?.bundleId;
      if (bid) bundleCounts.set(bid, (bundleCounts.get(bid) ?? 0) + 1);
    }
    const bundleGroups = new Map<string, BundleEndpoint[]>();

    for (const edge of state.edges) {
      const srcInternal = rfInstance.getInternalNode(edge.source);
      const tgtInternal = rfInstance.getInternalNode(edge.target);
      if (!srcInternal || !tgtInternal) continue;

      const srcBounds = srcInternal.internals.handleBounds;
      const tgtBounds = tgtInternal.internals.handleBounds;
      const srcAbs = srcInternal.internals.positionAbsolute;
      const tgtAbs = tgtInternal.internals.positionAbsolute;

      // Find the handle positions
      const srcHandle = [...(srcBounds?.source ?? []), ...(srcBounds?.target ?? [])].find((h) => h.id === edge.sourceHandle);
      const tgtHandle = [...(tgtBounds?.source ?? []), ...(tgtBounds?.target ?? [])].find((h) => h.id === edge.targetHandle);
      if (!srcHandle || !tgtHandle) continue;

      const sx = Math.round(srcAbs.x + srcHandle.x + srcHandle.width / 2);
      const sy = Math.round(srcAbs.y + srcHandle.y + srcHandle.height / 2);
      const tx = Math.round(tgtAbs.x + tgtHandle.x + tgtHandle.width / 2);
      const ty = Math.round(tgtAbs.y + tgtHandle.y + tgtHandle.height / 2);

      // Bundle members defer to the shared-trunk pass below.
      const bid = edge.data?.bundleId;
      if (bid && (bundleCounts.get(bid) ?? 0) >= 2) {
        let group = bundleGroups.get(bid);
        if (!group) { group = []; bundleGroups.set(bid, group); }
        group.push({
          edgeId: edge.id, srcX: sx, srcY: sy, tgtX: tx, tgtY: ty,
          manualWaypoints: edge.data?.manualWaypoints,
        });
        continue;
      }

      // Use manual waypoints if present (frozen from A* or user-placed), otherwise L-shape
      let simplified: { x: number; y: number }[];
      const manualWp = edge.data?.manualWaypoints;
      if (manualWp && manualWp.length > 0) {
        const raw = [{ x: sx, y: sy }, ...manualWp, { x: tx, y: ty }];
        simplified = simplifyWaypoints(orthogonalize(raw));
      } else if (Math.abs(sy - ty) < 2) {
        simplified = [{ x: sx, y: sy }, { x: tx, y: ty }];
      } else {
        const midX = Math.round((sx + tx) / 2);
        simplified = [
          { x: sx, y: sy },
          { x: midX, y: sy },
          { x: midX, y: ty },
          { x: tx, y: ty },
        ];
      }

      const svgPath = waypointsToSvgPath(simplified);

      const midPt = simplified[Math.floor(simplified.length / 2)];
      results[edge.id] = {
        edgeId: edge.id,
        svgPath,
        waypoints: simplified,
        segments: extractSegments(simplified),
        labelX: midPt.x,
        labelY: midPt.y,
        turns: "simple",
        crossingPoints: [],
      };
    }

    // Shared-trunk pass for bundles: straight L-gather → trunk → L-fan per member, plus
    // one synthetic `bundle:<id>` trunk route for the overlay layer.
    for (const [bid, members] of bundleGroups) {
      if (members.length < 2) continue;
      const meta = state.bundles[bid];
      // Break-in / break-out points: a user trunk override wins; otherwise the bundle's junction
      // nodes are authoritative (matches the A* path in edgeRouter); fall back to computeBundleTrunk.
      const { in: jin, out: jout } = bundleJunctionsFor(state.nodes, bid);
      let entry: { x: number; y: number }, exit: { x: number; y: number }, trunk: { x: number; y: number }[];
      if (meta?.trunkWaypoints && meta.trunkWaypoints.length >= 2) {
        entry = meta.trunkWaypoints[0];
        exit = meta.trunkWaypoints[meta.trunkWaypoints.length - 1];
        trunk = meta.trunkWaypoints;
      } else {
        const bt = computeBundleTrunk(members);
        entry = jin ? jin.position : bt.entry;
        exit = jout ? jout.position : bt.exit;
        trunk = [entry, exit];
      }
      for (const m of members) {
        // Comb shape, matching the A* router: gather horizontal at the port row with the
        // vertical AT the break-in column, and — critically — fan vertical AT the break-out
        // column before the horizontal into the target. (Plain orthogonalize bends
        // horizontal-first, which ran every member along the trunk row and dropped a shared
        // vertical pressed against the target device — members flattened into one
        // unselectable stack.) User waypoints on a member shape its gather/fan legs.
        const { gather, fan } = splitMemberWaypoints(m.manualWaypoints, entry, exit);
        const pre = gather.length
          ? [{ x: m.srcX, y: m.srcY }, ...gather, entry]
          : [{ x: m.srcX, y: m.srcY }, { x: entry.x, y: m.srcY }, entry];
        const post = fan.length
          ? [exit, ...fan, { x: m.tgtX, y: m.tgtY }]
          : [exit, { x: exit.x, y: m.tgtY }, { x: m.tgtX, y: m.tgtY }];
        const wp = simplifyWaypoints(orthogonalize([
          ...pre,
          ...trunk.slice(1, -1), // user-shaped trunk interior (empty for the default straight trunk)
          ...post,
        ]));
        const midPt = wp[Math.floor(wp.length / 2)];
        results[m.edgeId] = {
          edgeId: m.edgeId, svgPath: waypointsToSvgPath(wp), waypoints: wp,
          segments: extractSegments(wp), labelX: midPt.x, labelY: midPt.y,
          turns: "bundle", crossingPoints: [],
        };
      }
      const trunkWp = simplifyWaypoints(orthogonalize(trunk.map((p) => ({ x: p.x, y: p.y }))));
      const tMid = trunkWp[Math.floor(trunkWp.length / 2)] ?? entry;
      results[`bundle:${bid}`] = {
        edgeId: `bundle:${bid}`, svgPath: waypointsToSvgPath(trunkWp), waypoints: trunkWp,
        segments: extractSegments(trunkWp), labelX: tMid.x, labelY: tMid.y,
        turns: "trunk", crossingPoints: [],
      };
    }

    // Detect crossings so line hops render in manual mode too.
    const stubbedIds = new Set(state.edges.filter((e) => e.data?.stubbed).map((e) => e.id));
    const entries = Object.values(results).filter((r) => !stubbedIds.has(r.edgeId) && !r.edgeId.startsWith("bundle:"));
    const segCount = entries.reduce((n, r) => n + r.segments.length, 0);
    const overBudget = entries.length > 400 || segCount * segCount > 250_000;
    if (!overBudget) {
      const arcMap = new Map<string, CrossingPoint[]>();
      const gapMap = new Map<string, CrossingPoint[]>();
      for (const r of entries) {
        arcMap.set(r.edgeId, []);
        gapMap.set(r.edgeId, []);
      }
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const a = entries[i];
          const b = entries[j];
          for (const sa of a.segments) {
            for (const sb of b.segments) {
              if (segmentsCross(sa, sb)) {
                const h = sa.axis === "h" ? sa : sb;
                const v = sa.axis === "v" ? sa : sb;
                const pt: CrossingPoint = { x: v.x1, y: h.y1 };
                if (sa.axis === "h") {
                  arcMap.get(a.edgeId)!.push(pt);
                  gapMap.get(b.edgeId)!.push(pt);
                } else {
                  arcMap.get(b.edgeId)!.push(pt);
                  gapMap.get(a.edgeId)!.push(pt);
                }
              }
            }
          }
        }
      }
      for (const r of entries) {
        const arcs = arcMap.get(r.edgeId)!;
        const gaps = gapMap.get(r.edgeId)!;
        if (arcs.length || gaps.length) {
          r.crossingPoints = [...arcs, ...gaps];
          r.svgPathWithHops = waypointsToSvgPathWithHops(r.waypoints, arcs, gaps);
        }
      }
    }

    set({ routedEdges: results });
  },

  recomputeRoutes: (rfInstance) => {
    const state = get();
    const hiddenSet = state.hiddenSignalTypes ? new Set(state.hiddenSignalTypes.split(",")) : null;
    let visibleEdges = hiddenSet
      ? state.edges.filter((e) => !hiddenSet.has(e.data?.signalType ?? ""))
      : state.edges;

    // --- Adapter visibility: compute hidden adapters and virtual edges ---
    const hiddenAdapterNodeIds = new Set<string>();
    const hiddenVirtualEdgeIds = new Set<string>();
    const virtualEdgeGradients: Record<string, { sourceColor: string; targetColor: string }> = {};
    // Map from virtual edge ID back to the hidden partner edge ID
    const virtualEdgeSources = new Map<string, { primaryEdgeId: string; secondaryEdgeId: string; adapterNodeId: string }>();

    for (const n of state.nodes) {
      if (n.type !== "device") continue;
      const data = n.data as DeviceData;
      if (data.deviceType !== "adapter") continue;
      // Resolve visibility
      if (data.adapterVisibility === "force-show") continue;
      if (data.adapterVisibility === "force-hide" || state.hideAdapters) {
        hiddenAdapterNodeIds.add(n.id);
      }
    }

    if (hiddenAdapterNodeIds.size > 0) {
      // For each hidden adapter, find its edge pair and create virtual edges
      const virtualEdges: ConnectionEdge[] = [];
      const replacedEdgeIds = new Set<string>();

      for (const adapterId of hiddenAdapterNodeIds) {
        // Find edges connected to this adapter
        const inboundEdge = visibleEdges.find((e) => e.target === adapterId);
        const outboundEdge = visibleEdges.find((e) => e.source === adapterId);

        if (inboundEdge && outboundEdge) {
          // Create virtual edge: source of inbound → target of outbound
          const virtualId = `virtual-${inboundEdge.id}-${outboundEdge.id}`;
          const srcSignalType = inboundEdge.data?.signalType ?? "custom";
          const tgtSignalType = outboundEdge.data?.signalType ?? "custom";

          virtualEdges.push({
            id: virtualId,
            source: inboundEdge.source,
            target: outboundEdge.target,
            sourceHandle: inboundEdge.sourceHandle,
            targetHandle: outboundEdge.targetHandle,
            data: {
              signalType: srcSignalType as SignalType,
            },
            style: inboundEdge.style,
          });

          replacedEdgeIds.add(inboundEdge.id);
          replacedEdgeIds.add(outboundEdge.id);
          hiddenVirtualEdgeIds.add(outboundEdge.id);

          virtualEdgeSources.set(virtualId, {
            primaryEdgeId: inboundEdge.id,
            secondaryEdgeId: outboundEdge.id,
            adapterNodeId: adapterId,
          });

          // If signal types differ, store gradient info for the primary edge
          if (srcSignalType !== tgtSignalType) {
            virtualEdgeGradients[inboundEdge.id] = {
              sourceColor: `var(--color-${srcSignalType})`,
              targetColor: `var(--color-${tgtSignalType})`,
            };
          }
        }
      }

      // Replace real edge pairs with virtual edges for routing
      visibleEdges = [
        ...visibleEdges.filter((e) => !replacedEdgeIds.has(e.id)),
        ...virtualEdges,
      ];
    }

    // Exclude hidden adapter nodes from obstacle computation
    const routingNodes = hiddenAdapterNodeIds.size > 0
      ? state.nodes.filter((n) => !hiddenAdapterNodeIds.has(n.id))
      : state.nodes;

    // Hand the heavy A* off to the routing worker. Build the DOM-derived handle snapshot here
    // (needs rfInstance), tag the request with a monotonic seq, stash the main-thread-only context
    // (virtual-edge remap + adapter visibility) for the matching apply step, and post. The result
    // is applied asynchronously by applyRoutingResult; stale/superseded seqs are discarded there.
    if (!routingHandlerRegistered) {
      setRoutingResultHandler(applyRoutingResult);
      routingHandlerRegistered = true;
    }
    const handles = buildHandleSnapshot(routingNodes, rfInstance);

    // Stub↔port colinearity heal: a stub handle a few px off its partner port's TRUE
    // (DOM-measured) row kinks the wire at the label. This is the only place port truth
    // exists. Corrections change nodeDigest, which re-fires routing with aligned stubs;
    // idempotent (healed stubs fall inside the dead-band next pass).
    const healedStubNodes = healStubPortAlignment(state.nodes, state.edges, handles);
    if (healedStubNodes) {
      set({ nodes: healedStubNodes });
      return;
    }

    routeSeq += 1;
    pendingRouteCtx = {
      seq: routeSeq,
      virtualEdgeSources,
      hiddenAdapterNodeIds,
      hiddenVirtualEdgeIds,
      virtualEdgeGradients,
    };
    requestRoutes({
      seq: routeSeq,
      nodes: routingNodes,
      edges: visibleEdges,
      handles,
      bundles: state.bundles,
      debug: state.debugEdges,
      routingParams: (globalThis as Record<string, unknown>).__routingParams as Record<string, number> | undefined,
    });
  },

  toggleAutoRoute: () => {
    const state = get();
    if (state.autoRouteConfirmPending) return; // Dialog already open

    if (state.autoRoute) {
      // Toggling OFF — check if we need to show the confirmation dialog
      const stash = state._edgeWaypointStash;
      if (!stash) {
        // No stash (file opened with auto-route ON) — just freeze routes, no dialog
        pushUndo({ nodes: state.nodes, edges: state.edges, autoRoute: state.autoRoute });
        get().confirmAutoRouteOff(true);
        return;
      }
      const pref = localStorage.getItem("easyschematic-autoroute-pref");
      if (pref === "keep") {
        pushUndo({ nodes: state.nodes, edges: state.edges, autoRoute: state.autoRoute });
        get().confirmAutoRouteOff(true);
      } else if (pref === "revert") {
        pushUndo({ nodes: state.nodes, edges: state.edges, autoRoute: state.autoRoute });
        get().confirmAutoRouteOff(false);
      } else {
        // "ask" (default) — show dialog, don't push undo yet
        set({ autoRouteConfirmPending: true });
      }
    } else {
      // Toggling ON — stash current waypoint state, then clear auto-generated waypoints
      pushUndo({ nodes: state.nodes, edges: state.edges, autoRoute: state.autoRoute });
      const stash: Record<string, { manualWaypoints: { x: number; y: number }[]; autoRouteWaypoints?: boolean } | null> = {};
      for (const e of state.edges) {
        stash[e.id] = e.data?.manualWaypoints?.length
          ? { manualWaypoints: e.data.manualWaypoints, autoRouteWaypoints: e.data.autoRouteWaypoints }
          : null;
      }
      const updatedEdges = state.edges.map((e) => {
        if (!e.data?.autoRouteWaypoints) return e;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { manualWaypoints, autoRouteWaypoints, ...restData } = e.data;
        return { ...e, data: restData };
      }) as typeof state.edges;
      set({
        autoRoute: true,
        edges: updatedEdges,
        nodes: reconcileWaypointNodes(state.nodes, updatedEdges),
        _edgeWaypointStash: stash,
      });
    }
  },

  confirmAutoRouteOff: (preserve) => {
    const state = get();
    // Push undo if called from dialog (pending = true means undo wasn't pushed yet)
    if (state.autoRouteConfirmPending) {
      pushUndo({ nodes: state.nodes, edges: state.edges, autoRoute: true });
    }

    if (preserve) {
      // Keep A* routes — freeze as manual waypoints
      const updatedEdges = state.edges.map((e) => {
        const route = state.routedEdges[e.id];
        if (!route || route.waypoints.length <= 2) return e;
        if (e.data?.manualWaypoints?.length && !e.data.autoRouteWaypoints) return e;
        const interior = route.waypoints.slice(1, -1);
        if (interior.length === 0) return e;
        return {
          ...e,
          data: { ...e.data!, manualWaypoints: interior, autoRouteWaypoints: true },
        };
      }) as typeof state.edges;
      set({
        autoRoute: false,
        edges: updatedEdges,
        nodes: reconcileWaypointNodes(state.nodes, updatedEdges),
        _edgeWaypointStash: null,
        autoRouteConfirmPending: false,
      });
    } else {
      // Restore previous — use stash
      const stash = state._edgeWaypointStash;
      const updatedEdges = state.edges.map((e) => {
        if (stash && e.id in stash) {
          const saved = stash[e.id];
          if (saved === null) {
            if (!e.data) return e;
            const { manualWaypoints: _, autoRouteWaypoints: _a, ...restData } = e.data;
            return { ...e, data: restData as typeof e.data };
          }
          return { ...e, data: { ...e.data!, manualWaypoints: saved.manualWaypoints, autoRouteWaypoints: saved.autoRouteWaypoints } };
        }
        // Edge not in stash — freeze A* route
        const route = state.routedEdges[e.id];
        if (!route || route.waypoints.length <= 2) return e;
        if (e.data?.manualWaypoints?.length && !e.data.autoRouteWaypoints) return e;
        const interior = route.waypoints.slice(1, -1);
        if (interior.length === 0) return e;
        return {
          ...e,
          data: { ...e.data!, manualWaypoints: interior, autoRouteWaypoints: true },
        };
      }) as typeof state.edges;
      set({
        autoRoute: false,
        edges: updatedEdges,
        nodes: reconcileWaypointNodes(state.nodes, updatedEdges),
        _edgeWaypointStash: null,
        autoRouteConfirmPending: false,
        routedEdges: {},
      });
    }
  },

  cancelAutoRouteOff: () => {
    set({ autoRouteConfirmPending: false });
  },

  toggleDebugEdges: () => {
    set((s) => ({ debugEdges: !s.debugEdges }));
  },
  bumpRoutingParams: () => {
    set((s) => ({ routingParamVersion: s.routingParamVersion + 1 }));
  },

  setResizeGuides: (guides) => {
    set({ resizeGuides: guides });
  },
}));

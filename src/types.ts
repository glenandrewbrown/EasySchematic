import type { Node, Edge } from "@xyflow/react";

export type ConnectorType =
  | "bnc" | "hdmi" | "displayport" | "vga"
  | "xlr-3" | "xlr-4" | "xlr-5" | "trs-quarter" | "trs-eighth" | "combo-xlr-trs"
  | "rj45" | "ethercon" | "sfp" | "lc" | "sc"
  | "usb-a" | "usb-b" | "usb-c"
  | "db7w2" | "db9" | "db15" | "db25" | "din-5" | "phoenix" | "terminal-block" | "powercon" | "edison" | "iec" | "iec-c5" | "iec-c7" | "iec-c15" | "iec-c20"
  | "speakon" | "socapex" | "multipin" | "rca" | "toslink" | "barrel"
  | "banana" | "binding-post" | "binding-post-banana" | "dvi" | "mini-xlr" | "opticalcon"
  | "l5-20" | "l6-20" | "l6-30" | "l21-30" | "cam-lok" | "powercon-true1"
  | "qsfp" | "qsfp28" | "mpo" | "digilink" | "pcie-6pin"
  | "mini-din-4" | "mini-din-7" | "mini-din-8"
  | "mini-hdmi" | "mini-displayport"
  | "rj11" | "rj12" | "usb-mini" | "usb-micro" | "trs-2.5mm"
  | "reverse-tnc" | "sma" | "db37"
  | "d-tap" | "v-mount" | "f-connector"
  | "lemo-2pin" | "lemo-4pin" | "lemo-5pin"
  | "wireless"
  | "solder-cup" | "punch-down-110" | "punch-down-66" | "krone-idc" | "d-hole-insert"
  | "none" | "other";

export interface PortNetworkConfig {
  ip?: string;
  subnetMask?: string;
  gateway?: string;
  vlan?: number;
  dhcp?: boolean;
}

export interface DhcpServerConfig {
  enabled: boolean;
  rangeStart?: string;   // e.g. "192.168.1.100"
  rangeEnd?: string;     // e.g. "192.168.1.200"
  subnetMask?: string;   // e.g. "255.255.255.0"
  gateway?: string;      // e.g. "192.168.1.1"
}

export interface PortCapabilities {
  maxResolution?: string;
  maxFrameRate?: number;
  maxBitDepth?: number;
  colorSpaces?: string[];
}

export interface PortActiveConfig {
  resolution?: string;
  frameRate?: number;
  bitDepth?: number;
  colorSpace?: string;
}

export type SignalType =
  | "sdi"
  | "hdmi"
  | "ndi"
  | "dante"
  | "avb"
  | "analog-audio"
  | "speaker-level"
  | "bluetooth"
  | "aes"
  | "dmx"
  | "madi"
  | "usb"
  | "ethernet"
  | "fiber"
  | "displayport"
  | "hdbaset"
  | "srt"
  | "genlock"
  | "gpio"
  | "contact-closure"
  | "rs422"
  | "serial"
  | "thunderbolt"
  | "composite"
  | "s-video"
  | "vga"
  | "dvi"
  | "power"
  | "power-l1"
  | "power-l2"
  | "power-l3"
  | "power-neutral"
  | "power-ground"
  | "midi"
  | "tally"
  | "spdif"
  | "adat"
  | "ultranet"
  | "aes50"
  | "stageconnect"
  | "wordclock"
  | "aes67"
  | "ydif"
  | "rf"
  | "st2110"
  | "artnet"
  | "sacn"
  | "ir"
  | "timecode"
  | "gigaace"
  | "dx5"
  | "slink"
  | "soundgrid"
  | "fibreace"
  | "dsnake"
  | "dxlink"
  | "gps"
  | "dars"
  | "rtmp"
  | "rtsp"
  | "mpeg-ts"
  | "component-video"
  | "digilink"
  | "ebus"
  | "control-voltage"
  | "extron-exp"
  | "pots"
  | "blu-link"
  | "cresnet"
  | "sensor"
  | "custom";

export type LineStyle = "solid" | "dashed" | "dotted" | "dash-dot";

export const LINE_STYLE_LABELS: Record<LineStyle, string> = {
  solid: "Solid",
  dashed: "Dashed",
  dotted: "Dotted",
  "dash-dot": "Dash-Dot",
};

export const LINE_STYLE_DASHARRAY: Record<LineStyle, string | undefined> = {
  solid: undefined,
  dashed: "8 4",
  dotted: "2 4",
  "dash-dot": "8 4 2 4",
};

export type PortDirection = "input" | "output" | "bidirectional" | "passthrough";

export type Gender = "male" | "female";

export interface Port {
  id: string;
  label: string;
  signalType: SignalType;
  direction: PortDirection;
  /** When true, this port's effective signal type is inherited from the connected edge at
   *  runtime (via effectiveSignalType). Used for passthrough ports where the signal is not
   *  fixed at design time. signalType is stored as "custom" as a placeholder. */
  inheritsSignal?: boolean;
  section?: string;
  connectorType?: ConnectorType;
  /** Connector gender override. Omit to derive from connector + direction convention. */
  gender?: Gender;
  /** For passthrough ports: rear-face connector type (the field-termination side). */
  rearConnectorType?: ConnectorType;
  /** For passthrough ports: rear-face gender override. */
  rearGender?: Gender;
  /** For passthrough ports: front-face connector type (the patch side). */
  frontConnectorType?: ConnectorType;
  /** For passthrough ports: front-face gender override. */
  frontGender?: Gender;
  /** ID of another passthrough port in the same device that this port is normalled to. */
  normalledTo?: string;
  /** Normalling type. Only meaningful when normalledTo is set. */
  normalling?: "full" | "half" | "none";
  capabilities?: PortCapabilities;
  networkConfig?: PortNetworkConfig;
  addressable?: boolean;
  activeConfig?: PortActiveConfig;
  isMulticable?: boolean;
  channelCount?: number;
  /** When true, this port accepts multiple connections (e.g. SRT receiver, wireless mic RX, custom logical signals). */
  multiConnect?: boolean;
  /** When true, this port attaches directly to the connected device (no separate cable needed in pack list) */
  directAttach?: boolean;
  /** When true, port renders on the opposite side of the device (input on right, output on left) */
  flipped?: boolean;
  notes?: string;
  /** PoE power draw in watts for this port (consumed when powered by switch) */
  poeDrawW?: number;
  /** Link speed for network ports */
  linkSpeed?: string;
  /** Stable link back to the template port this was cloned from — used for template-sync reconciliation. */
  templatePortId?: string;
}

export interface SlotDefinition {
  id: string;
  label: string;               // "Slot 1", "VFC Slot A"
  slotFamily: string;           // e.g. "disguise-vfc", "yamaha-my"
  defaultCardId?: string;       // pre-populated when placed on canvas
  /** When true, an empty instance of this slot is hidden on the canvas node.
   *  Default false — preserves the existing "(empty)" rendering for active expansion slots.
   *  Set true on storage-media slots (SD card bays etc.) where empty rows would be visual noise. */
  hideWhenEmpty?: boolean;
}

export interface InstalledSlot {
  slotId: string;
  label: string;
  slotFamily?: string;          // denormalized for UI card lookup (especially nested slots)
  parentSlotId?: string;        // links to parent slot for nested cards (e.g. SFP in a network module)
  cardTemplateId?: string;      // undefined = empty slot
  cardLabel?: string;           // denormalized for display/pack list
  cardManufacturer?: string;
  cardModelNumber?: string;
  cardUnitCost?: number;
  /** Denormalized from SlotDefinition.hideWhenEmpty so the canvas renderer doesn't have
   *  to walk the template tree on every paint. */
  hideWhenEmpty?: boolean;
  portIds: string[];            // tracks which ports in device.ports belong to this slot
}

export interface DeviceData {
  [key: string]: unknown;
  /** Layer membership (SchematicLayer.id). Absent = default layer. */
  layerId?: string;
  /** Logical group membership (Photoshop-style group). Absent = ungrouped. */
  groupId?: string;
  /** Display glyph shown before the device label on the canvas. */
  icon?: string;
  /** When set, this device is software running inside the named host device. */
  hostDeviceId?: string;
  label: string;
  /** Short alternative name (e.g. "HDC-5500" instead of "Sony HDC-5500 Studio Camera").
   *  Initialized from template.shortName at placement; editable per-instance. */
  shortName?: string;
  /** Per-instance override for using shortName on this device.
   *  undefined = inherit SchematicFile.useShortNames (which itself defaults false). */
  useShortName?: boolean;
  /** Per-instance override for wrapping the device label across multiple lines.
   *  undefined = inherit SchematicFile.wrapDeviceLabels. */
  wrapLabel?: boolean;
  hostname?: string;
  deviceType: string;
  ports: Port[];
  color?: string;
  /** Custom header background color (#9) */
  headerColor?: string;
  /** Original template label — present while device participates in auto-numbering.
   *  Cleared when the user gives the device a custom name. */
  baseLabel?: string;
  /** Permanent template identity — what the device *is* (e.g. "BMD SDI→HDMI").
   *  Never cleared on rename. Used for pack list grouping. */
  model?: string;
  templateId?: string;
  templateVersion?: number;
  manufacturer?: string;
  modelNumber?: string;
  /** Manufacturer spec sheet / product page URL — inherited from the source template but editable per-device */
  referenceUrl?: string;
  /** Device category (e.g. "video", "audio") — meaningful for custom templates and community submissions */
  category?: string;
  showAllPorts?: boolean;
  hiddenPorts?: string[];
  dhcpServer?: DhcpServerConfig;
  isCableAccessory?: boolean;
  integratedWithCable?: boolean;
  slots?: InstalledSlot[];
  powerDrawW?: number;
  powerCapacityW?: number;
  voltage?: string;
  /** Thermal load in BTU/h for HVAC sizing; auto-derived from powerDrawW × 3.412 if omitted */
  thermalBtuh?: number;
  /** PoE budget in watts (for network switches — power this device *supplies* over PoE) */
  poeBudgetW?: number;
  /** PoE draw in watts (power this device *consumes* over PoE, e.g. a camera or AP) */
  poeDrawW?: number;
  /** Unit cost in dollars (optional, for BOM/quoting) */
  unitCost?: number;
  isVenueProvided?: boolean;
  /** Physical height in millimeters — reserved for future rack management */
  heightMm?: number;
  /** Physical width in millimeters — reserved for future rack management */
  widthMm?: number;
  /** Physical depth in millimeters — reserved for future rack management */
  depthMm?: number;
  /** Device weight in kilograms — reserved for future rack management */
  weightKg?: number;
  /** Device orientation in the to-scale plan view, in degrees (placement state; default 0).
   *  Not shown in the schematic view. Excluded from "save as template". */
  rotationDeg?: number;
  /** Loudspeaker sensitivity in dB SPL @ 1 W / 1 m (drives plan-view coverage estimates). */
  speakerSensitivityDb?: number;
  /** Loudspeaker rated/max power in watts (drives plan-view coverage estimates). */
  speakerMaxPowerW?: number;
  /** Loudspeaker nominal coverage angle in degrees (drives the plan-view coverage wedge). */
  speakerCoverageAngleDeg?: number;
  /** Optional rack-form override — when set, bypasses the size heuristic in `inferRackForm`.
   *  Use for edge cases (e.g., desktop unit with optional rack ears, oddly-sized half-rack gear). */
  rackForm?: "full" | "half" | "shelf-only";
  /** Adapter visibility override — only meaningful for deviceType "adapter" */
  adapterVisibility?: "default" | "force-show" | "force-hide";
  /** User-customizable auxiliary data rows. Each row carries its own slot (header vs
   *  footer) and text; blank text entries within a slot render as separator gaps. */
  auxiliaryData?: AuxRow[];
  /** Search terms used to find this device in the library; editable per-placement so
   *  improved terms can ride the "save as template" submission flow. */
  searchTerms?: string[];
  /** Physical serial number of the specific unit placed on the canvas. */
  serialNumber?: string;
  /** User-defined classification tags (e.g. ["rental","audio","FOH"]) for filtering, search, and reports. */
  tags?: string[];
  /** Custom Layout-view graphic: sanitized SVG asset id (SchematicFile.svgAssets key). */
  layoutSvgAssetId?: string;
  /** Colour-zone membership (ZoneData node id) for Layout-view tinting. */
  zoneId?: string;
  /** Custom face-plate connector layout (overrides auto-layout) */
  facePlateLayout?: FacePlateLayout;
}

/** One row of auxiliary data shown on a device node. */
export interface AuxRow {
  /** Display text — may contain `{{token}}` placeholders (e.g. `{{modelNumber}}`). */
  text: string;
  /** Whether the row renders above the ports (header) or below them (footer).
   *  Defaults to "footer" when omitted. */
  position?: "header" | "footer";
}

export interface FacePlateLayout {
  positions: Record<string, { x: number; y: number }>;
  labels?: FacePlateLabel[];
  /** Custom device label position and size (defaults to top-center) */
  deviceLabel?: { x: number; y: number; fontSize?: number };
}

export interface FacePlateLabel {
  id: string;
  text: string;
  x: number; // 0-100 percentage
  y: number; // 0-100 percentage
}

export type DeviceNode = Node<DeviceData, "device">;

export interface RoomData {
  [key: string]: unknown;
  label: string;
  color?: string;
  borderColor?: string;
  borderStyle?: "dashed" | "solid" | "dotted";
  labelSize?: number;
  locked?: boolean;
  /** Layer membership (SchematicLayer.id). Absent = default layer. */
  layerId?: string;
  isEquipmentRack?: boolean;
  linkedRackPageId?: string;
  linkedRackId?: string;
  /** Real-world room width in meters. Enables on-canvas dimensions and intra-room cable estimates. */
  widthM?: number;
  /** Real-world room depth in meters. */
  depthM?: number;
  /** Real-world ceiling height in meters. */
  heightM?: number;
  /** Custom floor-plan outline: normalized polygon vertices (0..1 relative to the
   *  node box), in draw order. Absent = plain rectangle. Minimum 3 points. */
  shape?: { x: number; y: number }[];
}

export type RoomNode = Node<RoomData, "room">;

export interface NoteData {
  [key: string]: unknown;
  /** Layer membership (SchematicLayer.id). Absent = default layer. */
  layerId?: string;
  /** HTML content from contentEditable */
  html: string;
}

export type NoteNode = Node<NoteData, "note">;

export interface AnnotationData {
  [key: string]: unknown;
  /** Layer membership (SchematicLayer.id). Absent = default layer. */
  layerId?: string;
  /** Shape type for the annotation (#24) */
  shape: "rectangle" | "ellipse" | "circle" | "diamond" | "triangle";
  /** Fill color */
  color?: string;
  /** Border color */
  borderColor?: string;
  /** Optional text label */
  label?: string;
  /** Font size for the label in px */
  fontSize?: number;
}

export type AnnotationNode = Node<AnnotationData, "annotation">;

export interface StubLabelData {
  [key: string]: unknown;
  /** Signal type — controls border color, matches the linked connection */
  signalType: SignalType;
  /** Shared with the partner stub node + both stub-leg edges. Identifies one logical cable. */
  linkedConnectionId: string;
  /** Which end of the logical connection this stub represents */
  side: "source" | "target";
  /** When true, append [PortName] to the label text (per-stub override; falls back to global setting) */
  showPort?: boolean;
  /** When true, append (RoomName) to the label text (per-stub override; falls back to global setting) */
  showRoom?: boolean;
  /** When/whether to append page number (per-stub override; falls back to global setting) */
  pageMode?: StubLabelPageMode;
  /** True once one-shot auto-placement has aligned this stub with its port. Skips the
   *  align-Y / clear-overlap pass on every subsequent mount so user-dragged positions
   *  survive page refresh. New stubs from convertEdgeToStubs get auto-placed once and
   *  flipped to true; legacy stubs are flipped true wholesale by the v33→v34 migration. */
  placed?: boolean;
}

export type StubLabelNode = Node<StubLabelData, "stub-label">;

export interface WaypointData {
  [key: string]: unknown;
  /** The connection edge this waypoint belongs to. */
  edgeId: string;
  /** Position within the edge's manualWaypoints array. */
  index: number;
}

export type WaypointNode = Node<WaypointData, "waypoint">;

/** A non-electrical furniture / room object placed in the Layout view (sofa, table,
 *  chair, light, staging). No ports, no connections; excluded from the schematic,
 *  pack list, validation, and reports. Participates in room (parentId) nesting and
 *  layer visibility. */
export interface ObjectData {
  [key: string]: unknown;
  /** Display label (e.g. "Conference Table"). */
  label: string;
  /** Catalog entry id from FURNITURE_CATALOG; absent for custom-SVG objects. */
  catalogId?: string;
  /** Sanitized SVG asset id (SchematicFile.svgAssets key) — when set, renders the vector. */
  svgAssetId?: string;
  /** Fill colour. Falls back to zone colour, then catalog default. */
  color?: string;
  /** Border colour override. */
  borderColor?: string;
  /** Rotation in degrees (same convention as DeviceData.rotationDeg). */
  rotationDeg?: number;
  /** Layer membership (SchematicLayer.id). Absent = default layer. */
  layerId?: string;
  /** Colour-zone membership (ZoneData node id). */
  zoneId?: string;
  /** Logical group membership. */
  groupId?: string;
  /** Real-world width in metres. */
  widthM?: number;
  /** Real-world depth in metres. */
  depthM?: number;
  /** When true, this object also appears in the Schematic view (not just Layout) — for
   *  AV-relevant furniture (speaker/mic stands, racks, screens) that is essential
   *  hardware. Defaults on for the av-furniture catalog category at placement. */
  showInSchematic?: boolean;
}

export type ObjectNode = Node<ObjectData, "object">;

/** A colour-coded zone region for the Layout view (acoustic areas, seating sections,
 *  purpose zones). Rendered as a tinted fill beneath rooms and objects; carries no
 *  physical-scale meaning. Layout-view only. */
export interface ZoneData {
  [key: string]: unknown;
  /** Display name shown on hover / in the legend (e.g. "Zone A — Orchestra"). */
  label: string;
  /** Fill colour (a translucent CSS colour is fine, e.g. "#38bdf833"). */
  color: string;
  /** Border colour. */
  borderColor?: string;
  /** Layer membership (SchematicLayer.id). Absent = default layer. */
  layerId?: string;
  /** Custom polygon outline: normalized 0..1 vertices (same schema as RoomData.shape).
   *  Absent = the node's bounding rectangle. */
  shape?: { x: number; y: number }[];
}

export type ZoneNode = Node<ZoneData, "zone">;

export type SchematicNode = DeviceNode | RoomNode | NoteNode | AnnotationNode | StubLabelNode | WaypointNode | ObjectNode | ZoneNode;

export interface ConnectionData {
  [key: string]: unknown;
  /** Layer membership (SchematicLayer.id). Absent = default layer. */
  layerId?: string;
  signalType: SignalType;
  manualWaypoints?: { x: number; y: number }[];
  /** When true, manualWaypoints were auto-generated from A* route and can be overwritten on re-route */
  autoRouteWaypoints?: boolean;
  connectorMismatch?: boolean;
  cableId?: string;
  cableLength?: string;
  /** Owned-cable ids (OwnedCableItem.id) assigned to this run, in chain order.
   *  More than one id means physically chained cables (joined via couplers). */
  assignedCableIds?: string[];
  multicableLabel?: string;
  /** User-defined label displayed on the connection line (#5) */
  label?: string;
  /** Per-end label at the source side. Overrides `label` at the source endpoint. (#114) */
  sourceLabel?: string;
  /** Per-end label at the target side. Overrides `label` at the target endpoint. (#114) */
  targetLabel?: string;
  /** When set, this edge is one half of a logical cable that has been split into two
   *  stub-leg edges connected via stub-label nodes. Both halves share the same id. */
  linkedConnectionId?: string;
  /** @deprecated v31+: stubs are real nodes now. Kept on the type so the v30→v31 migration can read it. */
  stubbed?: boolean;
  /** @deprecated v31+: replaced by StubLabelNode position. */
  stubSourceEnd?: { x: number; y: number };
  /** @deprecated v31+: replaced by StubLabelNode position. */
  stubTargetEnd?: { x: number; y: number };
  /** @deprecated v31+: migrated to the source-leg edge's manualWaypoints. */
  stubSourceWaypoints?: { x: number; y: number }[];
  /** @deprecated v31+: migrated to the target-leg edge's manualWaypoints. */
  stubTargetWaypoints?: { x: number; y: number }[];
  /** Allow connection between incompatible connector types (#6) */
  allowIncompatible?: boolean;
  /** @deprecated Use hideCableId instead. Migrated in schema v25. */
  hideLabel?: boolean;
  /** Per-edge: hide cable ID label (#61) */
  hideCableId?: boolean;
  /** Per-edge: cable ID endpoint spacing override in pixels (#61) */
  cableIdGap?: number;
  /** Per-edge: cable ID midpoint offset along path in pixels (#61) */
  cableIdMidOffset?: number;
  /** Per-edge: cable ID label display mode override (#61) */
  cableIdLabelMode?: "endpoint" | "midpoint";
  /** @deprecated v31+: moved to StubLabelData.showPort. */
  stubLabelShowPort?: boolean;
  /** @deprecated v31+: moved to StubLabelData.pageMode. */
  stubLabelPageMode?: StubLabelPageMode;
  /** Edge represents a direct physical attachment, not a separate cable */
  directAttach?: boolean;
  /** Visual line style — solid (default), dashed, dotted, or dash-dot */
  lineStyle?: LineStyle;
  /** Per-connection color override (CSS color). Falls back to signal-type color. Ignored for direct-attach. */
  color?: string;
}

export type ConnectionEdge = Edge<ConnectionData>;

export interface DeviceTemplate {
  id?: string;
  version?: number;
  deviceType: string;
  category?: string;
  label: string;
  /** Optional short name (e.g. model number without manufacturer prefix). When the
   *  schematic's "use short names" setting is on, this is shown instead of label. */
  shortName?: string;
  hostname?: string;
  ports: Port[];
  color?: string;
  searchTerms?: string[];
  manufacturer?: string;
  modelNumber?: string;
  imageUrl?: string;
  referenceUrl?: string;
  slots?: SlotDefinition[];
  slotFamily?: string;           // only set on expansion card templates
  powerDrawW?: number;           // Max power consumption in watts
  powerCapacityW?: number;       // Total supply capacity in watts (distros only)
  voltage?: string;              // Informational: "100-240V", "208V", "120V"
  thermalBtuh?: number;          // Thermal load in BTU/h for HVAC sizing; auto-derived from powerDrawW × 3.412 if omitted
  isVenueProvided?: boolean;     // Venue-owned gear — excluded from pack list
  poeBudgetW?: number;           // PoE budget in watts (switches/PSEs supplying PoE)
  poeDrawW?: number;             // PoE draw in watts (PDs consuming PoE — cameras, APs, etc.)
  unitCost?: number;             // MSRP / default unit cost in dollars
  heightMm?: number;             // Physical height in millimeters
  widthMm?: number;              // Physical width in millimeters
  depthMm?: number;              // Physical depth in millimeters
  weightKg?: number;             // Device weight in kilograms
  rackForm?: "full" | "half" | "shelf-only"; // Optional override for the size-based rack-form heuristic
  auxiliaryData?: AuxRow[];      // Aux rows shown on the node (each row carries its own header/footer slot)
  facePlateLayout?: FacePlateLayout; // Custom face-plate connector positions
}

export interface CustomTemplateGroup {
  id: string;
  label: string;
  collapsed?: boolean;
}

export interface CustomTemplateMeta {
  groups: CustomTemplateGroup[];
  order: string[];                          // template key (id ?? deviceType) in display order
  groupAssignments: Record<string, string>; // template key -> groupId
}

export interface TemplatePreset {
  ports: Port[];
  hiddenPorts?: string[];
  color?: string;
}

export interface OwnedGearItem {
  template: DeviceTemplate;
  quantity: number;
}

/** A named layer for organizing schematic content (Photoshop-style show/hide/lock). */
export interface SchematicLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  /** Optional colour swatch for the layer (hex or CSS colour); used in the Layers panel
   *  and for optional on-canvas tinting of member nodes. */
  color?: string;
}

/** The implicit layer that unassigned content belongs to. */
export const DEFAULT_LAYER_ID = "default";

/** A physical cable (or stock of identical cables) the user owns. */
export interface OwnedCableItem {
  id: string;
  /** Display name, e.g. "BNC 12G 10 m" */
  label: string;
  /** Optional construction/type note, e.g. "BNC 12G-SDI", "Cat6A S/FTP" */
  cableType?: string;
  /** Optional signal type this cable stock is intended for (used for filtering) */
  signalType?: SignalType;
  /** Exact length in the schematic's distance unit (DistanceSettings.unit) */
  length: number;
  quantity: number;
}

export interface OwnedGearFile {
  version: 1;
  ownedGear: OwnedGearItem[];
}

export type GearUnitCondition = "excellent" | "good" | "fair" | "poor";

/** A single physical unit of owned gear — one specific piece of hardware with its own
 *  identity, condition record, optional photo, and optional link to a placed device.
 *  Lives at SchematicFile.gearUnits[] and coexists with the quantity-aggregate ownedGear. */
export interface GearUnit {
  /** Stable UUID generated at creation. */
  id: string;
  /** Source template id when created from a library template. */
  templateId?: string;
  /** Denormalized manufacturer for display when no template is available. */
  manufacturer?: string;
  /** Make/model label (always present for display). */
  model: string;
  /** Physical serial number as printed on the unit. */
  serialNumber?: string;
  /** Asset tag / barcode for venue or rental tracking. */
  assetTag?: string;
  /** Compressed photo as a data URL (JPEG, capped on import). */
  photo?: string;
  /** Free-text condition notes. */
  notes?: string;
  /** Condition tier for quick filtering. */
  condition?: GearUnitCondition;
  /** Links this unit to a placed device node (DeviceNode id). Cleared when that node is deleted. */
  assignedNodeId?: string;
}

/** Per-field autocomplete suggestion pools, keyed by the DeviceData field they serve. */
export interface FieldSuggestions {
  manufacturer?: string[];
  category?: string[];
  deviceType?: string[];
}

/** Grid scale + snap settings. Per-document: affects ruler labels and CAD export. */
export interface GridSettings {
  /** Snap step in canvas pixels (schematic view). Default 20 (GRID_SIZE). */
  snapStep: number;
  /** Whether nodes snap to the grid on drag. Default true. */
  snapEnabled: boolean;
  /** Whether the dot grid is drawn. Default true. */
  gridVisible: boolean;
  /** Layout-view grid real-world unit. Default "m". */
  layoutGridUnit: "m" | "ft";
  /** Layout-view grid real-world size per cell, in layoutGridUnit. Default 1. */
  layoutGridStep: number;
  /**
   * Document-level Layout scale: real-world metres per canvas pixel. This is the
   * SINGLE source of truth for px↔metres in the Layout view (replaces the old
   * per-room scale). Default 0.01 (1 px = 10 mm, i.e. 1 m = 100 px).
   */
  metresPerPixel: number;
  /** Layout-view grid rendering: full-length ruled lines (CAD) or dots. Default "lines". */
  layoutGridStyle: "lines" | "dots";
}

/** Document Layout scale default: 1 px = 10 mm (1 m = 100 px). */
export const DEFAULT_METRES_PER_PIXEL = 0.01;

export const DEFAULT_GRID_SETTINGS: GridSettings = {
  snapStep: 20,
  snapEnabled: true,
  gridVisible: true,
  layoutGridUnit: "m",
  layoutGridStep: 1,
  metresPerPixel: DEFAULT_METRES_PER_PIXEL,
  layoutGridStyle: "lines",
};

/** A load-in/load-out checklist phase. */
export type TransportPhase = "load-out" | "off-load" | "setup" | "pull-down" | "repack";

export const TRANSPORT_PHASES: readonly TransportPhase[] = [
  "load-out",
  "off-load",
  "setup",
  "pull-down",
  "repack",
];

export const TRANSPORT_PHASE_LABELS: Record<TransportPhase, string> = {
  "load-out": "Load Out",
  "off-load": "Off-Load",
  setup: "Setup",
  "pull-down": "Pull Down",
  repack: "Repack",
};

/** One item packed into a transport container. */
export interface TransportItem {
  /** "device" → DeviceNode id; "cable" → packList cable key (cableType|signalType|length). */
  kind: "device" | "cable";
  refId: string;
  qty: number;
}

/** A transport container (case, cart, bag) grouping items for load-in/load-out, with a
 *  five-phase checklist. Lives at SchematicFile.containers[]. */
export interface TransportContainer {
  id: string;
  name: string;
  /** Optional swatch colour. */
  color?: string;
  items: TransportItem[];
  /** Per-phase, per-item checked state. Absent entry = unchecked. */
  checklist: Partial<Record<TransportPhase, Record<string, boolean>>>;
}

export interface CustomField {
  id: string;
  label: string;
  value: string;
}

export interface TitleBlock {
  showName: string;
  venue: string;
  designer: string;
  engineer: string;
  date: string;
  drawingTitle: string;
  company: string;
  revision: string;
  logo: string;
  customFields: CustomField[];
}

export type CellContentType = "field" | "static" | "logo" | "pageNumber";

export interface TitleBlockCell {
  id: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  content:
    | { type: "field"; field: string }
    | { type: "static"; text: string }
    | { type: "logo" }
    | { type: "pageNumber" };
  fontSize: number;
  fontWeight: "normal" | "bold";
  fontFamily: "sans-serif" | "serif" | "monospace";
  align: "left" | "center" | "right";
  color: string;
}

export interface TitleBlockLayout {
  columns: number[];
  rows: number[];
  cells: TitleBlockCell[];
  widthIn: number;
  heightIn: number;
}

// ── Rack Builder Types ──────────────────────────────────────────────

export type RackType = "floor-19" | "wall-mount" | "desktop" | "open-2post" | "open-4post";

export const RACK_TYPE_LABELS: Record<RackType, string> = {
  "floor-19": "19\" Floor Standing",
  "wall-mount": "Wall Mount",
  "desktop": "Desktop / Tabletop",
  "open-2post": "Open Frame (2-Post)",
  "open-4post": "Open Frame (4-Post)",
};

export interface RackData {
  id: string;
  label: string;
  rackType: RackType;
  /** Rack height in rack units (e.g. 42, 25, 12) */
  heightU: number;
  /** Rack depth in mm (600, 800, 1000, 1200) */
  depthMm: number;
  /** Width class — 19" standard or half-rack */
  widthClass: "19in" | "half";
  /** Position on the rack page canvas */
  position: { x: number; y: number };
  linkedRoomId?: string;
}

export interface RackDevicePlacement {
  id: string;
  rackId: string;
  /** Links to the device's node ID in the schematic */
  deviceNodeId: string;
  /** Bottom U position (1-based, bottom-up numbering) */
  uPosition: number;
  /** Which face of the rack the device is mounted on */
  face: "front" | "rear";
  /** For half-rack-width devices mounted in a 19" rack */
  halfRackSide?: "left" | "right";
  /** When set, this device sits on the shelf accessory with that ID; uPosition/face are
   *  inherited from the shelf and `halfRackSide` is ignored. */
  mountedOnShelfId?: string;
  /** Only meaningful when mountedOnShelfId is set: device is laid on its side
   *  (90° rotation around the depth axis). Width and height swap when rendered. */
  rotated?: boolean;
  /** Only meaningful when mountedOnShelfId is set: free-form position on the shelf,
   *  in mm. `x` is offset from the shelf's left inner-rail; `y` is height above the
   *  shelf surface (for stacking). Default {x:0, y:0} when undefined. */
  shelfOffsetMm?: { x: number; y: number };
}

/** A front + rear pair whose summed depth exceeds the rack's internal depth at overlapping U positions. */
export interface RackDepthConflict {
  aId: string;
  bId: string;
  uOverlapStart: number;
  uOverlapEnd: number;
  depthOverhangMm: number;
}

export type RackAccessoryType = "blank-panel" | "vent-panel" | "shelf" | "drawer" | "cable-manager" | "fan-unit";

export const RACK_ACCESSORY_LABELS: Record<RackAccessoryType, string> = {
  "blank-panel": "Blank Panel",
  "vent-panel": "Vent Panel",
  "shelf": "Shelf",
  "drawer": "Drawer",
  "cable-manager": "Cable Manager",
  "fan-unit": "Fan Unit",
};

export interface RackAccessory {
  id: string;
  rackId: string;
  type: RackAccessoryType;
  uPosition: number;
  heightU: number;
  face: "front" | "rear";
  label?: string;
  /** Usable depth for shelf-mounted gear in mm (only meaningful when type === "shelf").
   *  Defaults to ~60% of rack.depthMm when unset. */
  shelfDepthMm?: number;
}

export interface RackElevationPage {
  id: string;
  label: string;
  type: "rack-elevation";
  racks: RackData[];
  placements: RackDevicePlacement[];
  accessories: RackAccessory[];
}

export interface PrintViewport {
  id: string;
  kind: "rack-front" | "rack-rear" | "rack-side";
  rackRefPageId: string;
  rackRefId: string;
  positionMm: { x: number; y: number };
  sizeMm: { w: number; h: number };
  scale?: number;
  showLabel?: boolean;
  showStats?: boolean;
}

export interface PrintSheetPage {
  id: string;
  label: string;
  type: "print-sheet";
  paperId: string;
  orientation: "landscape" | "portrait";
  customWidthIn?: number;
  customHeightIn?: number;
  viewports: PrintViewport[];
  showTitleBlock: boolean;
}

export type SchematicPage = RackElevationPage | PrintSheetPage;

export interface SchematicFile {
  version: number;
  name: string;
  nodes: SchematicNode[];
  edges: ConnectionEdge[];
  customTemplates?: DeviceTemplate[];
  ownedGear?: OwnedGearItem[];
  ownedCables?: OwnedCableItem[];
  layers?: SchematicLayer[];
  signalColors?: Partial<Record<SignalType, string>>;
  signalLineStyles?: Partial<Record<SignalType, LineStyle>>;
  printPaperId?: string;
  printOrientation?: "landscape" | "portrait";
  printScale?: number;
  printCustomWidthIn?: number;
  printCustomHeightIn?: number;
  printOriginOffsetX?: number;
  printOriginOffsetY?: number;
  titleBlock?: TitleBlock;
  titleBlockLayout?: TitleBlockLayout;
  hiddenSignalTypes?: SignalType[];
  hiddenPinSignalTypes?: SignalType[];
  /** @deprecated Replaced in schema v27 by the {{deviceType}} auxiliary row. Kept on the file
   *  shape so the migration can honor the user's prior suppression intent. */
  hideDeviceTypes?: boolean;
  hideUnconnectedPorts?: boolean;
  showPortCounts?: boolean;
  templateHiddenSignals?: Record<string, SignalType[]>;
  templatePresets?: Record<string, TemplatePreset>;
  favoriteTemplates?: string[];
  recentTemplates?: string[];
  // Report layout preferences (pack list PDF, etc.) keyed by report ID
  reportLayouts?: Record<string, unknown>;
  globalReportHeaderLayout?: TitleBlockLayout;
  globalReportFooterLayout?: TitleBlockLayout;
  /** @deprecated Use scrollConfig instead. Kept for backwards compatibility on import. */
  scrollBehavior?: "zoom" | "pan";
  /** Per-modifier scroll wheel action mapping (#19) */
  scrollConfig?: ScrollConfig;
  /** Cable naming scheme for cable schedule (#1) */
  cableNamingScheme?: "sequential" | "type-prefix";
  /** Show line jump arcs where connections cross (#18) */
  showLineJumps?: boolean;
  /** @deprecated Use showCableIdLabels instead. Kept for backwards compatibility. */
  showConnectionLabels?: boolean;
  /** Show cable ID labels at connection endpoints (#61) */
  showCableIdLabels?: boolean;
  /** Show custom labels on connections (#61) */
  showCustomLabels?: boolean;
  /** Cable ID endpoint spacing in pixels (#61) */
  cableIdGap?: number;
  /** Cable ID midpoint offset along path in pixels (#61) */
  cableIdMidOffset?: number;
  /** Cable ID label display mode — at endpoints or midpoint (#61) */
  cableIdLabelMode?: "endpoint" | "midpoint";
  /** Global toggle: when true, all adapters default to hidden on schematic */
  hideAdapters?: boolean;
  /** When false, edges use simple orthogonal L-shapes instead of A* routing */
  autoRoute?: boolean;
  /** Edge interaction hitbox width in pixels (default 10, React Flow default is 20) */
  edgeHitboxSize?: number;
  /** User-preferred device category display order (#62) */
  categoryOrder?: string[];
  /** Show the owned-gear tab in the left library panel */
  showOwnedGearPane?: boolean;
  /** Active tab in the left library panel */
  libraryActiveTab?: "devices" | "owned";
  /** Color key / signal legend for print view (#70) */
  colorKeyEnabled?: boolean;
  colorKeyCorner?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  colorKeyColumns?: number;
  colorKeyPage?: "first" | "last" | "all";
  colorKeyOverrides?: Partial<Record<SignalType, boolean>>;
  /** Rack elevation pages */
  pages?: SchematicPage[];
  /** Show connector-level face-plate detail in rack views (default off; advanced) */
  showFacePlateDetail?: boolean;
  /** Cable unit costs keyed by "cableType|signalType|cableLength" */
  cableCosts?: Record<string, number>;
  /** Force-case device/port/slot labels on write (normal = leave as-typed) */
  labelCase?: LabelCaseMode;
  /** Pairwise distances between top-level rooms; key is canonical pairKey("idA","idB"). */
  roomDistances?: Record<string, number>;
  /** Unit + slack settings for converting room distance → estimated cable length (#146). */
  distanceSettings?: DistanceSettings;
  /** ISO 4217 currency code for cost display in reports (#158). Defaults to "USD". */
  currency?: string;
  /** Left-drag canvas behavior — select box (default) or pan viewport */
  panMode?: PanMode;
  /** Show the destination port name on stub labels (e.g. "→ Projector [HDMI In 1]") */
  stubLabelShowPort?: boolean;
  /** Show the destination room name on stub labels (e.g. "→ Projector (Room A)") */
  stubLabelShowRoom?: boolean;
  /** When to show "Pg N" on stub labels: always | only when ends are on different pages | never */
  stubLabelPageMode?: StubLabelPageMode;
  /** Render device labels using their shortName when available. Defaults false;
   *  user opt-in via Preferences. */
  useShortNames?: boolean;
  /** Wrap long device labels across two lines instead of truncating with ellipsis.
   *  New files default true; undefined on loaded files = legacy single-line truncate. */
  wrapDeviceLabels?: boolean;
  /** Sanitized custom SVG graphics, keyed by UUID; referenced by
   *  DeviceData.layoutSvgAssetId / ObjectData.svgAssetId. */
  svgAssets?: Record<string, string>;
  /** Per-unit physical gear inventory (coexists with the ownedGear quantity view). */
  gearUnits?: GearUnit[];
  /** Document-level tag suggestion pool (unioned with per-device tags for the combobox). */
  tagSuggestions?: string[];
  /** Per-field autocomplete suggestion pools (manufacturer / category / deviceType). */
  fieldSuggestions?: FieldSuggestions;
  /** Validation issue ids the user has dismissed. */
  dismissedIssueIds?: string[];
  /** Grid scale + snap settings for this document. */
  gridSettings?: GridSettings;
  /** Transport containers for load-in/load-out tracking. */
  containers?: TransportContainer[];
}

export type LabelCaseMode = "as-typed" | "uppercase" | "lowercase" | "capitalize";
export const DEFAULT_LABEL_CASE: LabelCaseMode = "as-typed";

export type PanMode = "select-first" | "pan-first";
export const DEFAULT_PAN_MODE: PanMode = "select-first";

/** Canvas render mode — schematic (signal-flow diagram), to-scale layout (top-down floor
 *  view with vector graphics, furniture, and zones), or schedule (full-page cable BOM).
 *  Session/UI preference only (persisted to localStorage); never written to SchematicFile.
 *  Note: the legacy value "plan" is migrated to "layout" on read (see readInitialCanvasViewMode). */
export type CanvasViewMode = "schematic" | "layout" | "schedule";
export const DEFAULT_CANVAS_VIEW_MODE: CanvasViewMode = "schematic";

/** All known canvas view modes, in display order. */
export const CANVAS_VIEW_MODES: readonly CanvasViewMode[] = ["schematic", "layout", "schedule"];

/** Validate a persisted/raw canvas-view-mode value at the localStorage boundary.
 *  Returns the value only when it is a known mode; otherwise the default. */
export function parseCanvasViewMode(raw: string | null | undefined): CanvasViewMode {
  return CANVAS_VIEW_MODES.includes(raw as CanvasViewMode)
    ? (raw as CanvasViewMode)
    : DEFAULT_CANVAS_VIEW_MODE;
}

export type StubLabelPageMode = "always" | "cross-page" | "never";
export const DEFAULT_STUB_LABEL_SHOW_PORT = false;
export const DEFAULT_STUB_LABEL_SHOW_ROOM = true;
export const DEFAULT_STUB_LABEL_PAGE_MODE: StubLabelPageMode = "cross-page";

export interface DistanceSettings {
  unit: "m" | "ft";
  /** Additional slack as a percentage of the room-to-room distance (e.g. 15 = +15%). */
  slackPercent: number;
  /** Additional slack added after percent (same unit as distance). */
  slackFixed: number;
}

export const DEFAULT_DISTANCE_SETTINGS: DistanceSettings = {
  unit: "ft",
  slackPercent: 15,
  slackFixed: 0,
};

export type ScrollAction = "zoom" | "pan-x" | "pan-y";

export interface ScrollConfig {
  /** Scroll wheel with no modifier key */
  scroll: ScrollAction;
  /** Shift + scroll wheel */
  shiftScroll: ScrollAction;
  /** Ctrl + scroll wheel */
  ctrlScroll: ScrollAction;
  /** Zoom speed multiplier (default 1.0, range 0.25–3.0) */
  zoomSpeed: number;
  /** Pan speed multiplier (default 1.0, range 0.25–3.0) */
  panSpeed: number;
  /** Enable automatic trackpad detection (default true) */
  trackpadEnabled: boolean;
}

export const DEFAULT_SCROLL_CONFIG: ScrollConfig = {
  scroll: "zoom",
  shiftScroll: "pan-x",
  ctrlScroll: "pan-y",
  zoomSpeed: 1,
  panSpeed: 1,
  trackpadEnabled: true,
};

export const SIGNAL_COLORS: Record<SignalType, string> = {
  sdi: "var(--color-sdi)",
  hdmi: "var(--color-hdmi)",
  ndi: "var(--color-ndi)",
  dante: "var(--color-dante)",
  avb: "var(--color-avb)",
  "analog-audio": "var(--color-analog-audio)",
  "speaker-level": "var(--color-speaker-level)",
  bluetooth: "var(--color-bluetooth)",
  aes: "var(--color-aes)",
  dmx: "var(--color-dmx)",
  madi: "var(--color-madi)",
  usb: "var(--color-usb)",
  ethernet: "var(--color-ethernet)",
  fiber: "var(--color-fiber)",
  displayport: "var(--color-displayport)",
  hdbaset: "var(--color-hdbaset)",
  srt: "var(--color-srt)",
  genlock: "var(--color-genlock)",
  gpio: "var(--color-gpio)",
  "contact-closure": "var(--color-contact-closure)",
  rs422: "var(--color-rs422)",
  serial: "var(--color-serial)",
  thunderbolt: "var(--color-thunderbolt)",
  composite: "var(--color-composite)",
  "component-video": "var(--color-component-video)",
  "s-video": "var(--color-s-video)",
  vga: "var(--color-vga)",
  dvi: "var(--color-dvi)",
  power: "var(--color-power)",
  "power-l1": "var(--color-power-l1)",
  "power-l2": "var(--color-power-l2)",
  "power-l3": "var(--color-power-l3)",
  "power-neutral": "var(--color-power-neutral)",
  "power-ground": "var(--color-power-ground)",
  midi: "var(--color-midi)",
  tally: "var(--color-tally)",
  spdif: "var(--color-spdif)",
  adat: "var(--color-adat)",
  ultranet: "var(--color-ultranet)",
  aes50: "var(--color-aes50)",
  stageconnect: "var(--color-stageconnect)",
  wordclock: "var(--color-wordclock)",
  aes67: "var(--color-aes67)",
  ydif: "var(--color-ydif)",
  rf: "var(--color-rf)",
  st2110: "var(--color-st2110)",
  artnet: "var(--color-artnet)",
  sacn: "var(--color-sacn)",
  ir: "var(--color-ir)",
  timecode: "var(--color-timecode)",
  gigaace: "var(--color-gigaace)",
  dx5: "var(--color-dx5)",
  slink: "var(--color-slink)",
  soundgrid: "var(--color-soundgrid)",
  fibreace: "var(--color-fibreace)",
  dsnake: "var(--color-dsnake)",
  dxlink: "var(--color-dxlink)",
  gps: "var(--color-gps)",
  dars: "var(--color-dars)",
  rtmp: "var(--color-rtmp)",
  rtsp: "var(--color-rtsp)",
  "mpeg-ts": "var(--color-mpeg-ts)",
  digilink: "var(--color-digilink)",
  ebus: "var(--color-ebus)",
  "control-voltage": "var(--color-control-voltage)",
  "extron-exp": "var(--color-extron-exp)",
  pots: "var(--color-pots)",
  "blu-link": "var(--color-blu-link)",
  cresnet: "var(--color-cresnet)",
  sensor: "var(--color-sensor)",
  custom: "var(--color-custom)",
};

export const CONNECTOR_LABELS: Record<ConnectorType, string> = {
  bnc: "BNC",
  hdmi: "HDMI",
  displayport: "DisplayPort",
  vga: "VGA (DB15)",
  "xlr-3": "XLR-3",
  "xlr-4": "XLR-4",
  "xlr-5": "XLR-5",
  "trs-quarter": '1/4" TRS',
  "trs-eighth": '3.5mm TRS',
  "combo-xlr-trs": "XLR/TRS Combo",
  rj45: "RJ45",
  ethercon: "EtherCon",
  sfp: "SFP/SFP+",
  lc: "Fiber - LC",
  sc: "Fiber - SC",
  "usb-a": "USB-A",
  "usb-b": "USB-B",
  "usb-c": "USB-C",
  db7w2: "D-Sub 7W2",
  db9: "DB9",
  db15: "DB15",
  db25: "DB25",
  "din-5": "DIN-5",
  phoenix: "Phoenix",
  "terminal-block": "Terminal Block",
  powercon: "powerCON",
  edison: "Edison",
  iec: "IEC C14",
  "iec-c5": "IEC C5",
  "iec-c7": "IEC C7",
  "iec-c15": "IEC C15",
  "iec-c20": "IEC C20",
  speakon: "speakON",
  socapex: "Socapex",
  multipin: "Multi-pin",
  rca: "RCA",
  toslink: "TOSLINK",
  barrel: "DC Barrel",
  banana: "Banana",
  "binding-post": "Binding Post",
  "binding-post-banana": "Binding Post (Banana)",
  dvi: "DVI",
  "mini-din-4": "Mini-DIN 4-pin",
  "mini-din-7": "Mini-DIN 7-pin",
  "mini-din-8": "Mini-DIN 8-pin",
  "mini-hdmi": "Mini HDMI",
  "mini-displayport": "Mini DisplayPort",
  "mini-xlr": "Mini XLR",
  opticalcon: "Fiber - opticalCON",
  "l5-20": "NEMA L5-20",
  "l6-20": "NEMA L6-20",
  "l6-30": "NEMA L6-30",
  "l21-30": "NEMA L21-30",
  "cam-lok": "Cam-Lok",
  "powercon-true1": "powerCON TRUE1",
  rj11: "RJ11",
  rj12: "RJ12",
  qsfp: "QSFP+",
  qsfp28: "QSFP28",
  mpo: "Fiber - MPO/MTP",
  digilink: "DigiLink",
  "pcie-6pin": "PCIe 6-pin Aux",
  "lemo-2pin": "LEMO 2-pin",
  "lemo-4pin": "LEMO 4-pin",
  "lemo-5pin": "LEMO 5-pin",
  "usb-mini": "Mini USB",
  "usb-micro": "Micro USB",
  "trs-2.5mm": "2.5mm TRS",
  "reverse-tnc": "Reverse TNC",
  sma: "SMA",
  db37: "DB37",
  "d-tap": "D-Tap",
  "v-mount": "V-Mount",
  "f-connector": "F-Connector",
  wireless: "Wireless",
  "solder-cup": "Solder Cup",
  "punch-down-110": "Punch-down (110)",
  "punch-down-66": "Punch-down (66)",
  "krone-idc": "Krone IDC",
  "d-hole-insert": "D-Hole Insert",
  none: "None",
  other: "Other",
};

/** Which visual side of the device a port appears on (respects flip). */
export function portSide(p: Port): "left" | "right" {
  if (p.direction === "input") return p.flipped ? "right" : "left";
  if (p.direction === "output") return p.flipped ? "left" : "right";
  // bidirectional and passthrough: default left; flipped swaps side
  return p.flipped ? "right" : "left";
}

export const SIGNAL_LABELS: Record<SignalType, string> = {
  sdi: "SDI",
  hdmi: "HDMI",
  ndi: "NDI",
  dante: "Dante",
  avb: "AVB",
  "analog-audio": "Analog",
  "speaker-level": "Speaker",
  bluetooth: "Bluetooth",
  aes: "AES",
  dmx: "DMX",
  madi: "MADI",
  usb: "USB",
  ethernet: "Ethernet",
  fiber: "Fiber",
  displayport: "DisplayPort",
  hdbaset: "HDBaseT",
  srt: "SRT",
  genlock: "Genlock",
  gpio: "GPIO",
  "contact-closure": "Contact Closure",
  rs422: "RS-422",
  serial: "Serial",
  thunderbolt: "Thunderbolt",
  composite: "Composite",
  "s-video": "S-Video",
  vga: "VGA",
  dvi: "DVI",
  power: "Power",
  "power-l1": "L1 (Phase A)",
  "power-l2": "L2 (Phase B)",
  "power-l3": "L3 (Phase C)",
  "power-neutral": "Neutral",
  "power-ground": "Ground",
  midi: "MIDI",
  tally: "Tally",
  spdif: "S/PDIF",
  adat: "ADAT",
  ultranet: "Ultranet",
  aes50: "AES50",
  stageconnect: "StageConnect",
  wordclock: "Word Clock",
  aes67: "AES67",
  ydif: "YDIF",
  rf: "RF",
  st2110: "ST 2110",
  artnet: "Art-Net",
  sacn: "sACN",
  ir: "IR",
  timecode: "Timecode",
  gigaace: "GigaACE",
  dx5: "DX5",
  slink: "SLink",
  soundgrid: "SoundGrid",
  fibreace: "fibreACE",
  dsnake: "dSnake",
  dxlink: "DX Link",
  gps: "GPS",
  dars: "DARS",
  rtmp: "RTMP",
  rtsp: "RTSP",
  "mpeg-ts": "MPEG-TS",
  "component-video": "Component Video",
  digilink: "DigiLink",
  ebus: "eBUS",
  "control-voltage": "0-10V Control",
  "extron-exp": "Extron EXP",
  pots: "POTS",
  "blu-link": "BLU link",
  cresnet: "Cresnet",
  sensor: "Sensor",
  custom: "Custom",
};

/** Signal types organized by functional group (for searchable dropdowns) */
export const SIGNAL_GROUPS: Record<string, SignalType[]> = {
  "Video": ["sdi", "hdmi", "displayport", "dvi", "composite", "component-video", "s-video", "vga"],
  "Video over IP": ["ndi", "srt", "hdbaset", "st2110"],
  "Audio": ["analog-audio", "speaker-level", "bluetooth", "aes", "dante", "avb", "aes67", "madi", "spdif", "adat", "ultranet", "aes50", "stageconnect", "ydif", "soundgrid", "gigaace", "dx5", "dsnake", "slink", "fibreace", "digilink", "extron-exp", "pots", "blu-link"],
  "Network": ["ethernet", "fiber"],
  "Control / Data": ["dmx", "artnet", "sacn", "rs422", "serial", "gpio", "contact-closure", "ir", "midi", "tally", "usb", "thunderbolt", "dxlink", "ebus", "control-voltage", "cresnet", "sensor"],
  "Sync / Clock": ["genlock", "wordclock", "timecode", "dars", "gps"],
  "Power": ["power", "power-l1", "power-l2", "power-l3", "power-neutral", "power-ground"],
  "Streaming": ["rtmp", "rtsp", "mpeg-ts", "rf"],
  "Other": ["custom"],
};

/** Connector types organized by functional group (for searchable dropdowns) */
export const CONNECTOR_GROUPS: Record<string, ConnectorType[]> = {
  "Video": ["bnc", "hdmi", "mini-hdmi", "displayport", "mini-displayport", "dvi", "vga"],
  "Audio": ["xlr-3", "xlr-4", "xlr-5", "mini-xlr", "combo-xlr-trs", "trs-quarter", "trs-eighth", "trs-2.5mm", "rca", "din-5", "mini-din-4", "mini-din-7", "mini-din-8", "toslink"],
  "Network / Data": ["rj45", "ethercon", "sfp", "lc", "sc", "opticalcon", "qsfp", "qsfp28", "mpo", "rj11", "rj12"],
  "USB": ["usb-a", "usb-b", "usb-c", "usb-mini", "usb-micro"],
  "D-Sub / Serial": ["db9", "db15", "db25", "db37", "db7w2", "lemo-5pin"],
  "Power": ["iec", "iec-c5", "iec-c7", "iec-c15", "iec-c20", "powercon", "powercon-true1", "edison", "barrel", "l5-20", "l6-20", "l6-30", "l21-30", "cam-lok", "socapex", "pcie-6pin", "lemo-2pin", "lemo-4pin", "d-tap", "v-mount"],
  "Speaker": ["speakon", "banana", "binding-post", "binding-post-banana"],
  "Terminal": ["phoenix", "terminal-block", "multipin", "solder-cup", "punch-down-110", "punch-down-66", "krone-idc"],
  "RF": ["reverse-tnc", "sma", "f-connector"],
  "Other": ["wireless", "digilink", "d-hole-insert", "none", "other"],
};

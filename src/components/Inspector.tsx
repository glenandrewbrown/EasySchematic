import { useMemo, useState, type ReactNode } from "react";
import { useSchematicStore, type NodeViewTier } from "../store";
import { DEFAULT_LAYER_ID, DEFAULT_DISTANCE_SETTINGS, SIGNAL_COLORS } from "../types";
import type { ConnectionData, ConnectionEdge, DeviceData, OwnedCableItem, RoomData, ObjectData, ZoneData, SchematicNode } from "../types";
import { isSpeaker, resolveSpeakerSpec } from "../speakerSpec";
import { splAtDistanceDb } from "../speakerCoverage";
import { describeDevicePorts } from "../portConnections";
import { cableTypesForSignal } from "../cableRules";
import { computeCableSchedule } from "../cableSchedule";
import { connectionRun } from "../connectionRunLength";
import { validateSchematic, countIssues } from "../validation";
import { buildDeviceSuggestions } from "../deviceSuggestions";
import { deviceClassColor } from "../deviceClassColor";
import { SIGNAL_FAMILY_COLORS } from "../signalFamilies";
import { chainLength } from "../cableFit";
import { FEET_PER_METER, formatLengthMode, formatLengthParts, type LengthUnitMode } from "../lengthFormat";
import { signalLabel } from "../plainLanguage";
import Combobox from "./ui/Combobox";
import TagInput from "./ui/TagInput";
import SymbolPickerDialog from "./SymbolPickerDialog";
import SvgAssetImportDialog from "./SvgAssetImportDialog";
import ArtworkChip from "./ArtworkChip";
import ColorSwatchRow from "./ColorSwatchRow";
import { getSymbolByQualifiedId, isSymbolArtworkId } from "../deviceArtwork";

/**
 * Figma-style contextual inspector: edits the currently-selected device or room
 * inline on the right, replacing the pop-up editor for everyday edits. Deep/rare
 * edits (bulk ports, template management) still open the full modal via "Edit details…".
 *
 * Bodies are remount-keyed by node id, so field state initializes from the node
 * without a sync effect. Text/number fields commit on blur/Enter (updateDevice
 * pushes one undo entry per commit); selects commit immediately.
 */

const DEFAULT_CEILING_M = 3;
const LISTENER_PLANE_M = 1.2;

/** Mono, uppercase, wide-tracked section label — the engineering-instrument label style. */
const SECTION_LABEL_STYLE = { fontFamily: "var(--font-mono)", letterSpacing: "0.12em" } as const;

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div
      className="text-[10px] uppercase text-[var(--color-text-muted)] font-semibold pt-1"
      style={SECTION_LABEL_STYLE}
    >
      {children}
    </div>
  );
}

/** Read-only muted-label + value row (no input), for derived/contextual info. */
function ReadRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] uppercase text-[var(--color-text-muted)] shrink-0" style={SECTION_LABEL_STYLE}>{label}</span>
      <span className="text-xs text-[var(--color-text)] truncate text-right flex-1 min-w-0" style={{ fontFamily: "var(--font-mono)" }}>{value}</span>
    </div>
  );
}

interface SegmentedOption<T extends string> {
  id: T;
  /** Always a word — the segment is never identified by colour alone. */
  label: string;
  tip: string;
}

/**
 * Compact word-labelled segmented control. `value` of null renders every segment inactive,
 * which is how a mixed multi-device selection reads: no tier is claimed for all of them.
 */
function Segmented<T extends string>({
  options,
  value,
  onSelect,
  label,
}: {
  options: readonly SegmentedOption<T>[];
  value: T | null;
  onSelect: (id: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex gap-0.5 p-0.5 rounded-[var(--ui-radius-sm)] bg-[var(--color-bg)] border border-[var(--ui-border)]"
    >
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            title={o.tip}
            aria-pressed={on}
            onClick={() => onSelect(o.id)}
            className={`flex-1 px-1.5 py-0.5 rounded-[4px] text-[9.5px] font-semibold cursor-pointer transition-colors ${
              on
                ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Device colour palette. Reuses the eight signal-family hues — already the codebase's
 * "distinct hues that stay apart" set (see reportMetrics) — so no new colour literals enter
 * the app. Named by hue rather than by family: this is a grouping colour the user assigns,
 * not a signal reading.
 */
const BLOCK_SWATCHES: ReadonlyArray<{ name: string; color: string }> = [
  { name: "Blue", color: SIGNAL_FAMILY_COLORS.video },
  { name: "Green", color: SIGNAL_FAMILY_COLORS.network },
  { name: "Gold", color: SIGNAL_FAMILY_COLORS.audio },
  { name: "Amber", color: SIGNAL_FAMILY_COLORS.control },
  { name: "Red", color: SIGNAL_FAMILY_COLORS.power },
  { name: "Crimson", color: SIGNAL_FAMILY_COLORS.speaker },
  { name: "Magenta", color: SIGNAL_FAMILY_COLORS.rf },
  { name: "Slate", color: SIGNAL_FAMILY_COLORS.other },
];

/** The value shared by every entry, or `mixed` when they disagree — the multi-select read. */
function commonValue<T>(values: readonly (T | undefined)[]): { mixed: boolean; value: T | undefined } {
  const first = values[0];
  const mixed = values.some((v) => v !== first);
  return { mixed, value: mixed ? undefined : first };
}

/** Device-count chip, so a batch edit always says how many devices it will touch. */
function CountChip({ count }: { count: number }) {
  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold text-[var(--color-text-muted)] bg-[var(--color-bg)] border border-[var(--ui-border)]"
      style={SECTION_LABEL_STYLE}
    >
      {count === 1 ? "1 device" : `${count} devices`}
    </span>
  );
}

/**
 * Colour override for every listed device at once. Writes through `setNodeColor`, whose
 * `null` clears the override and returns the device to its signal-derived class colour.
 */
function DeviceColorRow({ ids }: { ids: readonly string[] }) {
  const nodeColors = useSchematicStore((s) => s.nodeColors);
  const setNodeColor = useSchematicStore((s) => s.setNodeColor);
  const picked = commonValue(ids.map((id) => nodeColors[id]));
  const currentName = picked.mixed
    ? "Mixed"
    : picked.value
      ? (BLOCK_SWATCHES.find((s) => s.color === picked.value)?.name ?? "Custom")
      : "Automatic — follows the signal colour";

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>Device colour</SectionTitle>
        <CountChip count={ids.length} />
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* LAYPAL swatch row + ＋ custom chip → native colour picker (boards 1b/5c). */}
        <ColorSwatchRow
          colors={BLOCK_SWATCHES.map((s) => s.color)}
          value={picked.mixed ? undefined : picked.value}
          onPick={(hex) => setNodeColor(ids, hex)}
          size={20}
          ariaLabel="Device colour"
        />
        <button
          type="button"
          onClick={() => setNodeColor(ids, null)}
          title="Reset to the automatic signal colour"
          className="ui-btn ui-btn-secondary px-1.5 py-0.5 text-[9.5px]"
        >
          Auto
        </button>
      </div>
      <div className="text-[10px] text-[var(--color-text-muted)] leading-relaxed -mt-1.5">
        {currentName}
      </div>
    </>
  );
}

/** Display units for every length reading. A view preference — never the document's own maths. */
const UNIT_MODES: ReadonlyArray<SegmentedOption<LengthUnitMode>> = [
  { id: "m", label: "m", tip: "Show lengths in metres" },
  { id: "ft", label: "ft", tip: "Show lengths in feet and inches" },
  { id: "both", label: "Both", tip: "Show metres and feet together" },
];

/** Ordered least → most detail, matching the `NodeViewTier` union. */
const VIEW_TIERS: ReadonlyArray<SegmentedOption<NodeViewTier>> = [
  { id: "tile", label: "Tile", tip: "Tile — label only" },
  { id: "compact", label: "Compact", tip: "Compact — label and I/O count" },
  { id: "default", label: "Default", tip: "Default — label, ports and status" },
  { id: "detailed", label: "Detailed", tip: "Detailed — ports, routing and footer" },
];

/**
 * Per-device detail tier for every listed device at once. The baseline comes from the global
 * `nodeCompact` view option; `setNodeView(ids, null)` drops the override back onto it.
 */
function DeviceViewRow({ ids }: { ids: readonly string[] }) {
  const nodeView = useSchematicStore((s) => s.nodeView);
  const setNodeView = useSchematicStore((s) => s.setNodeView);
  const nodeCompact = useSchematicStore((s) => s.nodeCompact);
  const baseline: NodeViewTier = nodeCompact ? "compact" : "default";
  const tier = commonValue(ids.map((id) => nodeView[id] ?? baseline));
  const overridden = ids.some((id) => nodeView[id] !== undefined);
  const baselineLabel = VIEW_TIERS.find((t) => t.id === baseline)?.label ?? baseline;

  return (
    <>
      <SectionTitle>Device view</SectionTitle>
      <Segmented
        label="Device view"
        options={VIEW_TIERS}
        value={tier.mixed ? null : (tier.value ?? baseline)}
        onSelect={(id) => setNodeView(ids, id)}
      />
      <div className="flex items-center justify-between gap-2 -mt-1.5">
        <span className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
          {tier.mixed ? "Mixed across the selection" : `Baseline ${baselineLabel} (View options)`}
        </span>
        <button
          type="button"
          onClick={() => setNodeView(ids, null)}
          disabled={!overridden}
          title="Drop the override and follow the View options baseline"
          className="ui-btn ui-btn-secondary px-1.5 py-0.5 text-[9.5px]"
        >
          Reset
        </button>
      </div>
    </>
  );
}

interface FieldProps {
  label: string;
  value: string | number | undefined;
  onCommit: (v: string) => void;
  type?: "text" | "number";
  placeholder?: string;
  suffix?: string;
  min?: number;
  step?: number;
}

function Field({ label, value, onCommit, type = "text", placeholder, suffix, min, step }: FieldProps) {
  const [v, setV] = useState(value ?? "");
  return (
    <label className="block">
      <span className="block text-[10px] uppercase text-[var(--color-text-muted)] mb-0.5" style={SECTION_LABEL_STYLE}>{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          className="ui-input w-full text-xs"
          type={type}
          value={v}
          placeholder={placeholder}
          min={min}
          step={step}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => onCommit(String(v))}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        {suffix && <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">{suffix}</span>}
      </div>
    </label>
  );
}

interface ComboFieldProps {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
}

/** Muted-label wrapper around the compact Combobox, matching Field's layout. */
function ComboField({ label, value, onCommit, suggestions, placeholder }: ComboFieldProps) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase text-[var(--color-text-muted)] mb-0.5" style={SECTION_LABEL_STYLE}>{label}</span>
      <Combobox value={value} onCommit={onCommit} suggestions={suggestions} placeholder={placeholder} compact />
    </label>
  );
}

function DeviceBody({ node }: { node: SchematicNode }) {
  const data = node.data as DeviceData;
  const layers = useSchematicStore((s) => s.layers);
  const updateDevice = useSchematicStore((s) => s.updateDevice);
  const setDeviceRotation = useSchematicStore((s) => s.setDeviceRotation);
  const rotateDevice = useSchematicStore((s) => s.rotateDevice);
  const setEditingNodeId = useSchematicStore((s) => s.setEditingNodeId);
  const setSvgImportTarget = useSchematicStore((s) => s.setSvgImportTarget);
  const allNodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const tagSuggestions = useSchematicStore((s) => s.tagSuggestions);
  const fieldSuggestions = useSchematicStore((s) => s.fieldSuggestions);
  const recordSuggestions = useSchematicStore((s) => s.recordSuggestions);
  const detailLevel = useSchematicStore((s) => s.detailLevel);
  const nodeColors = useSchematicStore((s) => s.nodeColors);
  const portInfos = useMemo(() => describeDevicePorts(node.id, allNodes, edges), [node.id, allNodes, edges]);
  const suggestions = useMemo(
    () => buildDeviceSuggestions(allNodes, { tagSuggestions, fieldSuggestions }),
    [allNodes, tagSuggestions, fieldSuggestions],
  );
  const selectDevice = (id: string) =>
    useSchematicStore.setState((s) => ({
      nodes: s.nodes.map((n) => ({ ...n, selected: n.id === id })),
      edges: s.edges.map((e) => ({ ...e, selected: false })),
    }));
  const [speakerOpen, setSpeakerOpen] = useState(false);
  const [physicalOpen, setPhysicalOpen] = useState(false);
  const [powerOpen, setPowerOpen] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [artworkPickerOpen, setArtworkPickerOpen] = useState(false);
  const [artworkUploadOpen, setArtworkUploadOpen] = useState(false);

  const patch = (p: Partial<DeviceData>) => updateDevice(node.id, { ...data, ...p });
  const numOrUndef = (s: string) => (s.trim() === "" ? undefined : Number(s));

  const speaker = isSpeaker(data);
  const spec = resolveSpeakerSpec(data);
  const ceilingM = (() => {
    // parent room ceiling, for the on-axis SPL readout
    const rooms = useSchematicStore.getState().nodes;
    const parent = node.parentId ? rooms.find((n) => n.id === node.parentId) : undefined;
    const hM = (parent?.data as RoomData | undefined)?.heightM;
    return typeof hM === "number" && hM > 0 ? hM : DEFAULT_CEILING_M;
  })();
  const splDb =
    speaker && spec.sensitivityDb != null && spec.maxPowerW != null
      ? splAtDistanceDb(spec.sensitivityDb, spec.maxPowerW, Math.max(0.1, ceilingM - LISTENER_PLANE_M))
      : null;

  // A colour override outranks the signal-derived class colour on every surface, this hero included.
  const accent = nodeColors[node.id] ?? deviceClassColor(data.ports);
  const heroType = data.deviceType || data.category || "";
  const artworkCaption = data.artworkAssetId
    ? isSymbolArtworkId(data.artworkAssetId)
      ? getSymbolByQualifiedId(data.artworkAssetId)?.name ?? "Symbol"
      : "Uploaded SVG"
    : "Class default";

  return (
    <div className="flex flex-col gap-3 px-3 py-3 overflow-y-auto">
      <div className="relative flex items-center gap-2.5 pl-3">
        <span
          className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full"
          style={{ background: accent }}
        />
        <ArtworkChip artworkAssetId={data.artworkAssetId} device={data} size={36} color={accent} className="shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold text-[var(--color-text-heading)] truncate">{data.label}</span>
          {heroType && <span className="text-[10.5px] text-[var(--color-text-muted)] truncate">{heroType}</span>}
        </div>
        <span
          className="ml-auto flex items-center gap-1 rounded-full px-1.5 py-0.5 shrink-0"
          style={{
            background: "color-mix(in srgb, var(--color-success) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-success) 28%, transparent)",
            color: "var(--color-success)",
            fontSize: "9.5px",
          }}
        >
          <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: "var(--color-success)" }} />
          Clean
        </span>
      </div>
      <div className="h-px bg-[var(--ui-border)]" />

      <SectionTitle>Identity</SectionTitle>
      <Field label="Label" value={data.label} onCommit={(v) => patch({ label: v, baseLabel: undefined })} placeholder="Device name" />
      <Field label="Short name" value={data.shortName} onCommit={(v) => patch({ shortName: v || undefined })} placeholder="e.g. 8040b" />
      <div className="grid grid-cols-2 gap-2">
        <ComboField
          label="Manufacturer"
          value={data.manufacturer ?? ""}
          suggestions={suggestions.manufacturer}
          placeholder="Genelec"
          onCommit={(v) => {
            patch({ manufacturer: v || undefined });
            if (v) recordSuggestions({ manufacturer: v });
          }}
        />
        <Field label="Model" value={data.modelNumber} onCommit={(v) => patch({ modelNumber: v || undefined })} placeholder="8040b" />
      </div>
      <ComboField
        label="Type"
        value={data.deviceType ?? ""}
        suggestions={suggestions.deviceType}
        placeholder="speaker"
        onCommit={(v) => {
          patch({ deviceType: v });
          if (v) recordSuggestions({ deviceType: v });
        }}
      />
      <div>
        <span className="block text-[10px] uppercase text-[var(--color-text-muted)] mb-0.5" style={SECTION_LABEL_STYLE}>Artwork</span>
        <div className="flex items-center gap-2">
          <ArtworkChip artworkAssetId={data.artworkAssetId} device={data} size={24} />
          <span className="text-[11px] text-[var(--color-text-muted)] truncate flex-1 min-w-0">{artworkCaption}</span>
          <button type="button" className="ui-btn ui-btn-secondary px-1.5 py-0.5 text-[10px]" onClick={() => setArtworkPickerOpen(true)}>
            Change…
          </button>
        </div>
      </div>
      <ComboField
        label="Category"
        value={data.category ?? ""}
        suggestions={suggestions.category}
        placeholder="audio"
        onCommit={(v) => {
          patch({ category: v || undefined });
          if (v) recordSuggestions({ category: v });
        }}
      />
      <Field label="Serial No." value={data.serialNumber} onCommit={(v) => patch({ serialNumber: v || undefined })} placeholder="e.g. SN-00421" />
      <label className="block">
        <span className="block text-[10px] uppercase text-[var(--color-text-muted)] mb-0.5" style={SECTION_LABEL_STYLE}>Tags</span>
        <TagInput
          tags={data.tags ?? []}
          suggestions={suggestions.tags}
          placeholder="Add tag…"
          onChange={(tags) => patch({ tags: tags.length > 0 ? tags : undefined })}
          onBlur={() => {
            const tags = data.tags ?? [];
            if (tags.length > 0) recordSuggestions({ tags });
          }}
        />
      </label>

      <div className="h-px bg-[var(--ui-border)]" />
      <button
        className="flex items-center justify-between text-[10px] uppercase text-[var(--color-text-muted)] font-semibold cursor-pointer"
        style={SECTION_LABEL_STYLE}
        onClick={() => setPhysicalOpen((o) => !o)}
      >
        <span>Physical &amp; placement</span>
        <span>{physicalOpen ? "▾" : "▸"}</span>
      </button>
      {physicalOpen && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            <Field label="W (mm)" value={data.widthMm} onCommit={(v) => patch({ widthMm: numOrUndef(v) })} type="number" min={1} />
            <Field label="D (mm)" value={data.depthMm} onCommit={(v) => patch({ depthMm: numOrUndef(v) })} type="number" min={1} />
            <Field label="H (mm)" value={data.heightMm} onCommit={(v) => patch({ heightMm: numOrUndef(v) })} type="number" min={1} />
          </div>
          <div>
            <span className="block text-[10px] uppercase text-[var(--color-text-muted)] mb-0.5" style={SECTION_LABEL_STYLE}>Rotation / aim</span>
            <div className="flex items-center gap-1.5">
              <input
                key={`rot-${data.rotationDeg ?? 0}`}
                className="ui-input w-16 text-xs"
                type="number"
                defaultValue={Math.round(Number(data.rotationDeg ?? 0))}
                onBlur={(e) => setDeviceRotation(node.id, Number(e.target.value) || 0)}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              />
              <span className="text-[10px] text-[var(--color-text-muted)]">°</span>
              <button className="ui-btn ui-btn-secondary px-2 py-1 text-[11px]" onClick={() => rotateDevice(node.id, -90)} title="Rotate 90° CCW">↺</button>
              <button className="ui-btn ui-btn-secondary px-2 py-1 text-[11px]" onClick={() => rotateDevice(node.id, 90)} title="Rotate 90° CW">↻</button>
            </div>
          </div>
          <label className="block">
            <span className="block text-[10px] uppercase text-[var(--color-text-muted)] mb-0.5" style={SECTION_LABEL_STYLE}>Layer</span>
            <select
              className="ui-input w-full text-xs"
              value={data.layerId ?? DEFAULT_LAYER_ID}
              onChange={(e) => patch({ layerId: e.target.value === DEFAULT_LAYER_ID ? undefined : e.target.value })}
            >
              {layers.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>
          <div>
            <span className="block text-[10px] uppercase text-[var(--color-text-muted)] mb-0.5" style={SECTION_LABEL_STYLE}>Custom graphic (Layout)</span>
            <div className="flex items-center gap-1.5">
              <button className="ui-btn ui-btn-secondary flex-1 text-xs" onClick={() => setSvgImportTarget(node.id)}>
                {data.layoutSvgAssetId ? "Replace SVG…" : "Import SVG…"}
              </button>
              {data.layoutSvgAssetId && (
                <button className="ui-btn ui-btn-secondary text-xs" onClick={() => patch({ layoutSvgAssetId: undefined })} title="Remove custom graphic">Clear</button>
              )}
            </div>
            <ChooseSymbolButton nodeId={node.id} />
          </div>
        </div>
      )}

      <div className="h-px bg-[var(--ui-border)]" />
      <SectionTitle>Ports &amp; connections</SectionTitle>
      {portInfos.length === 0 ? (
        <div className="text-[11px] text-[var(--color-text-muted)] px-1">No ports.</div>
      ) : (
        <div className="flex flex-col -mx-1">
          {portInfos.map((info) => (
            <button
              key={info.port.id}
              type="button"
              disabled={!info.connected}
              onClick={() => info.otherDeviceId && selectDevice(info.otherDeviceId)}
              title={`${signalLabel(info.port.signalType, detailLevel)} · ${info.connected ? `Connected to ${info.otherDeviceLabel}${info.otherPortLabel ? ` [${info.otherPortLabel}]` : ""} — click to select` : "Unconnected"}`}
              className="flex items-center gap-1.5 px-1.5 py-1 rounded text-left enabled:hover:bg-[var(--color-surface-hover)] enabled:cursor-pointer disabled:cursor-default transition-colors"
            >
              {info.connected ? (
                <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: SIGNAL_COLORS[info.port.signalType] }} />
              ) : (
                <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ border: `1.5px solid ${SIGNAL_COLORS[info.port.signalType]}`, opacity: 0.55 }} />
              )}
              <span className="text-[11px] text-[var(--color-text)] truncate shrink-0 max-w-[7rem]">{info.port.label}</span>
              {(info.port.direction === "input" || info.port.direction === "output") && (
                <span className="text-[8.5px] uppercase text-[var(--color-text-muted)] shrink-0 opacity-70" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}>{info.port.direction === "input" ? "IN" : "OUT"}</span>
              )}
              {/* Plain names are sentences, not codes — only the technical label wears the mono-code treatment. */}
              <span
                className={`text-[9px] text-[var(--color-text-muted)] truncate max-w-[8rem] ${detailLevel === "technical" ? "uppercase" : ""}`}
                style={detailLevel === "technical" ? { fontFamily: "var(--font-mono)", letterSpacing: "0.1em" } : undefined}
              >
                {signalLabel(info.port.signalType, detailLevel)}
              </span>
              <span className="flex-1 min-w-0" />
              <span className="text-[10px] text-[var(--color-text-muted)] truncate min-w-0 text-right">
                {info.connected ? `→ ${info.otherDeviceLabel}${info.otherPortLabel ? ` [${info.otherPortLabel}]` : ""}` : "—"}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="h-px bg-[var(--ui-border)]" />
      <DeviceColorRow ids={[node.id]} />
      <div className="text-[10px] text-[var(--color-text-muted)] leading-relaxed -mt-1.5">
        Shift-click devices on the canvas to colour several at once.
      </div>

      <div className="h-px bg-[var(--ui-border)]" />
      <DeviceViewRow ids={[node.id]} />

      {speaker && (
        <>
          <div className="h-px bg-[var(--ui-border)]" />
          <button
            className="flex items-center justify-between text-[10px] uppercase text-[var(--color-text-muted)] font-semibold cursor-pointer"
            style={SECTION_LABEL_STYLE}
            onClick={() => setSpeakerOpen((o) => !o)}
          >
            <span>Loudspeaker / coverage</span>
            <span>{speakerOpen ? "▾" : "▸"}</span>
          </button>
          {speakerOpen && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-2">
                <Field label="Sens dB" value={data.speakerSensitivityDb} onCommit={(v) => patch({ speakerSensitivityDb: numOrUndef(v) })} type="number" step={0.1} />
                <Field label="Power W" value={data.speakerMaxPowerW} onCommit={(v) => patch({ speakerMaxPowerW: numOrUndef(v) })} type="number" />
                <Field label="Cover °" value={data.speakerCoverageAngleDeg} onCommit={(v) => patch({ speakerCoverageAngleDeg: numOrUndef(v) })} type="number" />
              </div>
              <div className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
                {splDb != null
                  ? `≈ ${splDb.toFixed(1)} dB on-axis at the listener plane (nominal).`
                  : "Set sensitivity + power for an SPL estimate."}
              </div>
            </div>
          )}
        </>
      )}

      {(data.powerDrawW != null ||
        data.powerCapacityW != null ||
        (data.voltage != null && data.voltage !== "") ||
        data.poeDrawW != null ||
        data.poeBudgetW != null) && (
        <>
          <div className="h-px bg-[var(--ui-border)]" />
          <button
            className="flex items-center justify-between text-[10px] uppercase text-[var(--color-text-muted)] font-semibold cursor-pointer"
            style={SECTION_LABEL_STYLE}
            onClick={() => setPowerOpen((o) => !o)}
          >
            <span>Power</span>
            <span>{powerOpen ? "▾" : "▸"}</span>
          </button>
          {powerOpen && (
            <div className="flex flex-col gap-1">
              {data.powerDrawW != null && <ReadRow label="Draw" value={`${data.powerDrawW} W`} />}
              {data.powerCapacityW != null && <ReadRow label="Capacity" value={`${data.powerCapacityW} W`} />}
              {data.voltage != null && data.voltage !== "" && <ReadRow label="Voltage" value={data.voltage} />}
              {data.poeDrawW != null && <ReadRow label="PoE draw" value={`${data.poeDrawW} W`} />}
              {data.poeBudgetW != null && <ReadRow label="PoE budget" value={`${data.poeBudgetW} W`} />}
            </div>
          )}
        </>
      )}

      {(() => {
        const ipPorts = data.ports.filter((p) => p.networkConfig?.ip);
        const hasHostname = data.hostname != null && data.hostname !== "";
        if (!hasHostname && ipPorts.length === 0) return null;
        return (
          <>
            <div className="h-px bg-[var(--ui-border)]" />
            <button
              className="flex items-center justify-between text-[10px] uppercase text-[var(--color-text-muted)] font-semibold cursor-pointer"
              style={SECTION_LABEL_STYLE}
              onClick={() => setNetworkOpen((o) => !o)}
            >
              <span>Network</span>
              <span>{networkOpen ? "▾" : "▸"}</span>
            </button>
            {networkOpen && (
              <div className="flex flex-col gap-1">
                {hasHostname && <ReadRow label="Host" value={data.hostname} />}
                {ipPorts.map((p) => {
                  const net = p.networkConfig;
                  const extras = [
                    net?.subnetMask ? net.subnetMask : null,
                    net?.vlan != null ? `VLAN ${net.vlan}` : null,
                  ].filter(Boolean);
                  return (
                    <div key={p.id} className="flex items-baseline gap-2">
                      <span className="text-[11px] text-[var(--color-text)] truncate shrink-0 max-w-[7rem]">{p.label}</span>
                      <span className="text-[11px] text-[var(--color-text-muted)] truncate text-right flex-1 min-w-0" style={{ fontFamily: "var(--font-mono)" }}>
                        {net?.ip}
                        {extras.length > 0 ? ` · ${extras.join(" · ")}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        );
      })()}

      <div className="h-px bg-[var(--ui-border)]" />
      <button className="ui-btn ui-btn-secondary w-full text-xs" onClick={() => setEditingNodeId(node.id)}>
        Edit details…
      </button>

      {artworkPickerOpen && (
        <SymbolPickerDialog
          title="Choose artwork"
          onPick={(entry) => {
            patch({ artworkAssetId: `${entry.category}/${entry.id}` });
            setArtworkPickerOpen(false);
          }}
          onClose={() => setArtworkPickerOpen(false)}
          onUpload={() => {
            setArtworkPickerOpen(false);
            setArtworkUploadOpen(true);
          }}
          onClear={data.artworkAssetId ? () => {
            patch({ artworkAssetId: undefined });
            setArtworkPickerOpen(false);
          } : undefined}
        />
      )}
      {artworkUploadOpen && (
        <SvgAssetImportDialog
          onPicked={(assetId) => {
            patch({ artworkAssetId: assetId });
            setArtworkUploadOpen(false);
          }}
          onClose={() => setArtworkUploadOpen(false)}
        />
      )}
    </div>
  );
}

function RoomBody({ node }: { node: SchematicNode }) {
  const data = node.data as RoomData;
  const updateRoom = useSchematicStore((s) => s.updateRoom);
  const patch = (p: Partial<RoomData>) => updateRoom(node.id, { ...data, ...p });
  const numOrUndef = (s: string) => (s.trim() === "" ? undefined : Number(s));

  return (
    <div className="flex flex-col gap-3 px-3 py-3 overflow-y-auto">
      <SectionTitle>Room</SectionTitle>
      <Field label="Name" value={data.label} onCommit={(v) => patch({ label: v })} placeholder="Room name" />
      <SectionTitle>Real dimensions</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Width m" value={data.widthM} onCommit={(v) => patch({ widthM: numOrUndef(v) })} type="number" step={0.1} />
        <Field label="Depth m" value={data.depthM} onCommit={(v) => patch({ depthM: numOrUndef(v) })} type="number" step={0.1} />
        <Field label="Height m" value={data.heightM} onCommit={(v) => patch({ heightM: numOrUndef(v) })} type="number" step={0.1} />
      </div>
      <div className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
        Setting a width scales the room to scale in Layout view and powers cable-run + coverage estimates.
      </div>
    </div>
  );
}

/** 6-digit #RRGGBB for a native colour input (strips any alpha suffix). */
function hexOf(c: string | undefined, fallback: string): string {
  return c && /^#[0-9a-f]{6}/i.test(c) ? c.slice(0, 7) : fallback;
}

/** "Browse symbol library" button + picker: registers the chosen glyph as an SVG asset
 *  and assigns it to the device/object (layoutSvgAssetId / svgAssetId via setNodeSvgAsset). */
function ChooseSymbolButton({ nodeId }: { nodeId: string }) {
  const [open, setOpen] = useState(false);
  const addSvgAsset = useSchematicStore((s) => s.addSvgAsset);
  const setNodeSvgAsset = useSchematicStore((s) => s.setNodeSvgAsset);
  return (
    <>
      <button className="ui-btn ui-btn-secondary w-full text-xs mt-1.5" onClick={() => setOpen(true)}>
        Browse symbol library…
      </button>
      {open && (
        <SymbolPickerDialog
          title="Choose a graphic"
          onPick={(entry) => {
            const id = addSvgAsset(entry.svg);
            setNodeSvgAsset(nodeId, id);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ObjectBody({ node }: { node: SchematicNode }) {
  const data = node.data as ObjectData;
  const updateObjectData = useSchematicStore((s) => s.updateObjectData);
  const layers = useSchematicStore((s) => s.layers);
  const setSvgImportTarget = useSchematicStore((s) => s.setSvgImportTarget);
  const patch = (p: Partial<ObjectData>) => updateObjectData(node.id, p);
  const numOrUndef = (s: string) => (s.trim() === "" ? undefined : Number(s));
  return (
    <div className="flex flex-col gap-3 px-3 py-3 overflow-y-auto">
      <SectionTitle>Object</SectionTitle>
      <Field label="Label" value={data.label} onCommit={(v) => patch({ label: v })} placeholder="Object name" />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Width m" value={data.widthM} onCommit={(v) => patch({ widthM: numOrUndef(v) })} type="number" step={0.1} />
        <Field label="Depth m" value={data.depthM} onCommit={(v) => patch({ depthM: numOrUndef(v) })} type="number" step={0.1} />
      </div>
      <Field label="Rotation°" value={data.rotationDeg ?? 0} onCommit={(v) => patch({ rotationDeg: Number(v) || 0 })} type="number" step={15} />
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          className="accent-[var(--color-accent)]"
          checked={!!data.showInSchematic}
          onChange={(e) => patch({ showInSchematic: e.target.checked || undefined })}
        />
        <span className="text-[11px] text-[var(--color-text)]">Show in Schematic view</span>
      </label>
      <p className="text-[10px] text-[var(--color-text-muted)] -mt-1.5 leading-snug">
        Keep AV-relevant furniture (speaker stands, racks) visible in the Schematic, not just Plan.
      </p>
      <label className="block">
        <span className="block text-[10px] uppercase text-[var(--color-text-muted)] mb-0.5" style={SECTION_LABEL_STYLE}>Fill colour</span>
        <input className="w-full h-7 cursor-pointer rounded border border-[var(--ui-border)] bg-transparent" type="color" value={hexOf(data.color, "#e2e8f0")} onChange={(e) => patch({ color: e.target.value })} />
      </label>
      <label className="block">
        <span className="block text-[10px] uppercase text-[var(--color-text-muted)] mb-0.5" style={SECTION_LABEL_STYLE}>Layer</span>
        <select className="ui-input w-full text-xs" value={data.layerId ?? DEFAULT_LAYER_ID} onChange={(e) => patch({ layerId: e.target.value === DEFAULT_LAYER_ID ? undefined : e.target.value })}>
          {layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      <div>
        <span className="block text-[10px] uppercase text-[var(--color-text-muted)] mb-0.5" style={SECTION_LABEL_STYLE}>Custom graphic</span>
        <button className="ui-btn ui-btn-secondary w-full text-xs" onClick={() => setSvgImportTarget(node.id)}>
          {data.svgAssetId ? "Replace SVG…" : "Import SVG…"}
        </button>
        <ChooseSymbolButton nodeId={node.id} />
      </div>
    </div>
  );
}

function ZoneBody({ node }: { node: SchematicNode }) {
  const data = node.data as ZoneData;
  const updateZoneData = useSchematicStore((s) => s.updateZoneData);
  const layers = useSchematicStore((s) => s.layers);
  const patch = (p: Partial<ZoneData>) => updateZoneData(node.id, p);
  return (
    <div className="flex flex-col gap-3 px-3 py-3 overflow-y-auto">
      <SectionTitle>Zone</SectionTitle>
      <Field label="Label" value={data.label} onCommit={(v) => patch({ label: v })} placeholder="Zone name" />
      <label className="block">
        <span className="block text-[10px] uppercase text-[var(--color-text-muted)] mb-0.5" style={SECTION_LABEL_STYLE}>Fill colour</span>
        {/* Zones store a translucent fill (#RRGGBB + alpha); keep ~33% alpha on edit. */}
        <input className="w-full h-7 cursor-pointer rounded border border-[var(--ui-border)] bg-transparent" type="color" value={hexOf(data.color, "#38bdf8")} onChange={(e) => patch({ color: e.target.value + "55" })} />
      </label>
      <label className="block">
        <span className="block text-[10px] uppercase text-[var(--color-text-muted)] mb-0.5" style={SECTION_LABEL_STYLE}>Border colour</span>
        <input className="w-full h-7 cursor-pointer rounded border border-[var(--ui-border)] bg-transparent" type="color" value={hexOf(data.borderColor, "#0284c7")} onChange={(e) => patch({ borderColor: e.target.value })} />
      </label>
      <label className="block">
        <span className="block text-[10px] uppercase text-[var(--color-text-muted)] mb-0.5" style={SECTION_LABEL_STYLE}>Layer</span>
        <select className="ui-input w-full text-xs" value={data.layerId ?? DEFAULT_LAYER_ID} onChange={(e) => patch({ layerId: e.target.value === DEFAULT_LAYER_ID ? undefined : e.target.value })}>
          {layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
    </div>
  );
}

/**
 * Multi-device editing surface. Deliberately narrow: only the controls that are genuinely
 * set-wide (colour, view tier) batch here. Identity fields stay single-selection — writing one
 * label across a selection would destroy the very thing that tells the devices apart.
 */
function BatchBody({ devices }: { devices: readonly SchematicNode[] }) {
  const nodeColors = useSchematicStore((s) => s.nodeColors);
  const ids = devices.map((n) => n.id);
  const picked = commonValue(ids.map((id) => nodeColors[id]));
  const accent = picked.mixed ? "var(--color-text-muted)" : (picked.value ?? "var(--color-accent)");
  const names = devices.map((n) => (n.data as DeviceData).label || (n.data as DeviceData).deviceType || "Device");
  const shown = names.slice(0, 3).join(" · ");
  const rest = names.length - 3;

  const portTotal = devices.reduce((sum, n) => sum + ((n.data as DeviceData).ports?.length ?? 0), 0);

  return (
    <div className="flex flex-col gap-3 px-3 py-3 overflow-y-auto">
      <div className="relative flex items-center gap-2.5 pl-3">
        <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full" style={{ background: accent }} />
        <div
          className="flex items-center justify-center w-9 h-9 rounded-lg text-base shrink-0"
          style={{ background: "var(--color-surface-hover)", border: "1px solid var(--ui-border)", color: accent }}
        >
          {devices.length}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold text-[var(--color-text-heading)] truncate">
            {devices.length} devices selected
          </span>
          <span className="text-[10.5px] text-[var(--color-text-muted)] truncate">
            {shown}
            {rest > 0 ? ` · +${rest} more` : ""}
          </span>
        </div>
      </div>
      <div className="h-px bg-[var(--ui-border)]" />

      <SectionTitle>Selection</SectionTitle>
      <div className="flex flex-col gap-1">
        <ReadRow label="Devices" value={devices.length} />
        <ReadRow label="Ports" value={portTotal} />
      </div>

      <div className="h-px bg-[var(--ui-border)]" />
      <DeviceColorRow ids={ids} />

      <div className="h-px bg-[var(--ui-border)]" />
      <DeviceViewRow ids={ids} />

      <div className="text-[11px] text-[var(--color-text-muted)] leading-relaxed pt-1">
        Colour and view apply to all {devices.length} selected devices. Select a single device to edit
        its label, model and ports.
      </div>
    </div>
  );
}

/** Picks the right body for a selected node type (device/room/object/zone). */
function NodeBody({ node }: { node: SchematicNode }) {
  switch (node.type) {
    case "device": return <DeviceBody node={node} />;
    case "room": return <RoomBody node={node} />;
    case "object": return <ObjectBody node={node} />;
    case "zone": return <ZoneBody node={node} />;
    default: return null;
  }
}

function ConnectionBody({ edge, nodes }: { edge: ConnectionEdge; nodes: SchematicNode[] }) {
  const setCableAssignEdgeId = useSchematicStore((s) => s.setCableAssignEdgeId);
  const data = (edge.data ?? { signalType: "custom" }) as ConnectionData;
  const sig = data.signalType;
  const cable = cableTypesForSignal(sig)[0];

  const edges = useSchematicStore((s) => s.edges);
  const cableNamingScheme = useSchematicStore((s) => s.cableNamingScheme);
  const roomDistances = useSchematicStore((s) => s.roomDistances);
  const distanceSettings = useSchematicStore((s) => s.distanceSettings);
  const ownedCables = useSchematicStore((s) => s.ownedCables);
  const detailLevel = useSchematicStore((s) => s.detailLevel);
  const lengthUnitMode = useSchematicStore((s) => s.lengthUnitMode);
  const setLengthUnitMode = useSchematicStore((s) => s.setLengthUnitMode);
  const run = useMemo(() => {
    const rows = computeCableSchedule(nodes, edges, cableNamingScheme, { roomDistances, distanceSettings });
    return connectionRun(rows, edge.id, cable?.maxRunM);
  }, [nodes, edges, cableNamingScheme, roomDistances, distanceSettings, edge.id, cable?.maxRunM]);

  /**
   * The exact run: the real total of the cable chain assigned from stock. Owned-cable lengths are
   * stored in the document's own unit, so they normalize to metres here — the display unit is a
   * separate view preference and must not leak into the maths.
   */
  const stockUnit = distanceSettings?.unit ?? DEFAULT_DISTANCE_SETTINGS.unit;
  const exactMeters = useMemo(() => {
    const ids = data.assignedCableIds;
    if (!ids?.length) return undefined;
    const byId = new Map(ownedCables.map((c) => [c.id, c]));
    const chain = ids.map((id) => byId.get(id)).filter((c): c is OwnedCableItem => !!c);
    if (chain.length === 0) return undefined;
    const total = chainLength(chain);
    return stockUnit === "ft" ? total / FEET_PER_METER : total;
  }, [data.assignedCableIds, ownedCables, stockUnit]);

  // Exact when stock is assigned; otherwise the estimate is the only real number we have.
  const readingMeters = exactMeters ?? run.meters;
  const parts = readingMeters !== undefined ? formatLengthParts(readingMeters, lengthUnitMode) : null;

  const deviceById = (id: string) => nodes.find((n) => n.id === id && n.type === "device");
  const src = deviceById(edge.source);
  const tgt = deviceById(edge.target);
  const nameOf = (n: SchematicNode | undefined) =>
    n ? (n.data as DeviceData).label || (n.data as DeviceData).deviceType : "—";
  const portLabelOf = (n: SchematicNode | undefined, handle: string | null | undefined) => {
    if (!n || !handle) return undefined;
    const base = handle.replace(/-(in|out|source|target)$/i, "");
    return (n.data as DeviceData).ports.find((p) => p.id === handle || p.id === base)?.label;
  };
  const selectDevice = (id: string | undefined) => {
    if (!id) return;
    useSchematicStore.setState((s) => ({
      nodes: s.nodes.map((n) => ({ ...n, selected: n.id === id })),
      edges: s.edges.map((e) => ({ ...e, selected: false })),
    }));
  };

  const endpoint = (label: string, n: SchematicNode | undefined, handle: string | null | undefined) => {
    const pl = portLabelOf(n, handle);
    return (
      <button
        type="button"
        onClick={() => selectDevice(n?.id)}
        disabled={!n}
        className="flex items-center gap-2 px-1.5 py-1 -mx-1 rounded text-left enabled:hover:bg-[var(--color-surface-hover)] enabled:cursor-pointer disabled:cursor-default"
        title={n ? "Select device" : undefined}
      >
        <span className="text-[10px] uppercase text-[var(--color-text-muted)] w-8 shrink-0" style={SECTION_LABEL_STYLE}>{label}</span>
        <span className="text-xs text-[var(--color-text)] truncate">
          {nameOf(n)}
          {pl ? <span className="text-[var(--color-text-muted)]"> [{pl}]</span> : null}
        </span>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <SectionTitle>Connection</SectionTitle>
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-sm shrink-0 border border-[var(--ui-border)]" style={{ background: SIGNAL_COLORS[sig] }} />
        <span className="text-xs text-[var(--color-text)]">{signalLabel(sig, detailLevel)}</span>
      </div>

      <div className="h-px bg-[var(--ui-border)]" />
      <SectionTitle>Endpoints</SectionTitle>
      {endpoint("From", src, edge.sourceHandle)}
      {endpoint("To", tgt, edge.targetHandle)}

      <div className="h-px bg-[var(--ui-border)]" />
      <SectionTitle>Cable</SectionTitle>
      <div className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
        {cable ? `${cable.label} · max ${cable.maxRunM} m run` : "No catalog cable type for this signal."}
      </div>
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>{exactMeters !== undefined ? "Exact length" : "Estimated run"}</SectionTitle>
        <Segmented
          label="Length units"
          options={UNIT_MODES}
          value={lengthUnitMode}
          onSelect={setLengthUnitMode}
        />
      </div>
      <div className="flex flex-col justify-center rounded-[var(--ui-radius)] border border-[var(--ui-border)] bg-[var(--color-bg)] px-3 py-1.5">
        <span
          className="text-base font-semibold leading-tight"
          style={{
            fontFamily: "var(--font-mono)",
            color: run.overMax ? "var(--color-error)" : "var(--color-text-heading)",
          }}
        >
          {parts ? parts.primary : "—"}
        </span>
        {parts?.secondary && (
          <span className="text-[9px] text-[var(--color-text-muted)]" style={{ fontFamily: "var(--font-mono)" }}>
            {parts.secondary}
          </span>
        )}
      </div>
      <div className="text-[10px] text-[var(--color-text-muted)] leading-relaxed -mt-1.5">
        {exactMeters !== undefined
          ? "Total of the cable chain assigned from stock."
          : readingMeters !== undefined
            ? "Estimated from device placement — assign cable from stock for an exact length."
            : "No estimate yet — set room distances or place the devices to scale."}
      </div>
      {exactMeters !== undefined && run.meters !== undefined && (
        <div className="text-[11px] text-[var(--color-text-muted)]">
          Estimated run:{" "}
          <span className="text-[var(--color-text)]" style={{ fontFamily: "var(--font-mono)" }}>
            {formatLengthMode(run.meters, lengthUnitMode)}
          </span>
        </div>
      )}
      {run.overMax && cable ? (
        <div className="text-[11px]" style={{ color: "var(--color-error)" }}>
          ⚠ Exceeds the {cable.maxRunM} m maximum for {cable.label}.
        </div>
      ) : null}
      <div className="text-[11px] text-[var(--color-text-muted)]">
        Assigned: <span className="text-[var(--color-text)]" style={{ fontFamily: "var(--font-mono)" }}>{data.cableLength ? data.cableLength : "none"}</span>
      </div>
      {data.connectorMismatch && !data.allowIncompatible && (
        <div className="text-[11px]" style={{ color: "var(--color-warning)" }}>⚠ Connector mismatch on this connection.</div>
      )}

      <div className="h-px bg-[var(--ui-border)]" />
      <button className="ui-btn ui-btn-secondary w-full text-xs" onClick={() => setCableAssignEdgeId(edge.id)}>
        Assign cable…
      </button>
    </div>
  );
}

/** Nothing-selected fallback: a compact document overview with validation summary. */
function DocumentOverview({ nodes, edges }: { nodes: SchematicNode[]; edges: ConnectionEdge[] }) {
  const deviceCount = nodes.filter((n) => n.type === "device").length;
  const roomCount = nodes.filter((n) => n.type === "room").length;
  const connectionCount = edges.length;
  const issues = useMemo(() => countIssues(validateSchematic(nodes, edges)), [nodes, edges]);
  const clean = issues.total === 0;
  const dotColor = issues.errors > 0 ? "var(--color-error)" : issues.warnings > 0 ? "var(--color-warning)" : "var(--color-success)";

  return (
    <div className="flex flex-col gap-3 px-3 py-3 overflow-y-auto">
      <SectionTitle>Document</SectionTitle>
      <div className="flex flex-col gap-1">
        <ReadRow label="Devices" value={deviceCount} />
        <ReadRow label="Rooms" value={roomCount} />
        <ReadRow label="Connections" value={connectionCount} />
      </div>

      <div className="h-px bg-[var(--ui-border)]" />
      <SectionTitle>Validation</SectionTitle>
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
        <span className="text-xs text-[var(--color-text)]">
          {clean
            ? "No issues"
            : `${issues.errors} error${issues.errors === 1 ? "" : "s"} · ${issues.warnings} warning${issues.warnings === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="text-[11px] text-[var(--color-text-muted)] leading-relaxed pt-1">
        Select a device, room, or connection to edit it here.
      </div>
    </div>
  );
}

/** Right-rail contextual inspector — shows when exactly one device, room, or connection is selected. */
export default function Inspector({ embedded = false }: { embedded?: boolean } = {}) {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const selected = nodes.filter((n) => n.selected);
  const single =
    selected.length === 1 &&
    (selected[0].type === "device" || selected[0].type === "room" || selected[0].type === "object" || selected[0].type === "zone")
      ? selected[0]
      : null;
  // 2+ devices selected: colour and view tier batch across them (a mixed selection that also
  // holds rooms/objects still batches its devices — those are what these controls act on).
  const selectedDevices = selected.filter((n) => n.type === "device");
  const batch = !single && selectedDevices.length > 1 ? selectedDevices : null;
  const selectedEdges = edges.filter((e) => e.selected);
  const singleEdge = !single && selected.length === 0 && selectedEdges.length === 1 ? selectedEdges[0] : null;

  if (embedded) {
    if (single)
      return (
        <div className="h-full overflow-y-auto">
          <NodeBody key={single.id} node={single} />
        </div>
      );
    if (batch)
      return (
        <div className="h-full overflow-y-auto">
          <BatchBody devices={batch} />
        </div>
      );
    if (singleEdge)
      return (
        <div className="h-full overflow-y-auto">
          <ConnectionBody key={singleEdge.id} edge={singleEdge} nodes={nodes} />
        </div>
      );
    return (
      <div className="h-full overflow-y-auto">
        <DocumentOverview nodes={nodes} edges={edges} />
      </div>
    );
  }

  if (!single && !batch) return null;
  const title = batch
    ? "Devices"
    : single!.type === "device"
      ? "Device"
      : single!.type === "room"
        ? "Room"
        : single!.type === "object"
          ? "Object"
          : "Zone";

  return (
    <div className="w-60 bg-[var(--color-surface)] border-l border-[var(--color-border)] flex flex-col h-full overflow-hidden" data-print-hide>
      <div className="px-3 py-2 border-b border-[var(--ui-border)] flex items-center justify-between shrink-0">
        <h2
          className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase"
          style={SECTION_LABEL_STYLE}
        >
          {title}
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {batch ? <BatchBody devices={batch} /> : <NodeBody key={single!.id} node={single!} />}
      </div>
    </div>
  );
}

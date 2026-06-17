import { useMemo, useState, type ReactNode } from "react";
import { useSchematicStore } from "../store";
import { DEFAULT_LAYER_ID, SIGNAL_LABELS, SIGNAL_COLORS } from "../types";
import type { ConnectionData, ConnectionEdge, DeviceData, RoomData, ObjectData, ZoneData, SchematicNode } from "../types";
import { isSpeaker, resolveSpeakerSpec } from "../speakerSpec";
import { splAtDistanceDb } from "../speakerCoverage";
import { describeDevicePorts } from "../portConnections";
import { cableTypesForSignal } from "../cableRules";
import { computeCableSchedule } from "../cableSchedule";
import { connectionRun } from "../connectionRunLength";
import { validateSchematic, countIssues } from "../validation";
import { buildDeviceSuggestions } from "../deviceSuggestions";
import Combobox from "./ui/Combobox";
import TagInput from "./ui/TagInput";

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

  return (
    <div className="flex flex-col gap-3 px-3 py-3 overflow-y-auto">
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
      <div className="grid grid-cols-2 gap-2">
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
        <Field label="Icon" value={data.icon} onCommit={(v) => patch({ icon: v || undefined })} placeholder="🔊" />
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
      <SectionTitle>Physical &amp; placement</SectionTitle>
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
      </div>

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
              title={info.connected ? `Connected to ${info.otherDeviceLabel}${info.otherPortLabel ? ` [${info.otherPortLabel}]` : ""} — click to select` : "Unconnected"}
              className="flex items-center gap-1.5 px-1.5 py-1 rounded text-left enabled:hover:bg-[var(--color-surface-hover)] enabled:cursor-pointer disabled:cursor-default transition-colors"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${info.connected ? "" : "bg-[var(--color-text-muted)] opacity-40"}`}
                style={info.connected ? { background: "var(--color-success)" } : undefined}
              />
              <span className="text-[11px] text-[var(--color-text)] truncate shrink-0 max-w-[7rem]">{info.port.label}</span>
              <span className="text-[9px] uppercase text-[var(--color-text-muted)] shrink-0" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.1em" }}>{SIGNAL_LABELS[info.port.signalType]}</span>
              <span className="flex-1 min-w-0" />
              <span className="text-[10px] text-[var(--color-text-muted)] truncate min-w-0 text-right">
                {info.connected ? `→ ${info.otherDeviceLabel}${info.otherPortLabel ? ` [${info.otherPortLabel}]` : ""}` : "—"}
              </span>
            </button>
          ))}
        </div>
      )}

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
          <SectionTitle>Power</SectionTitle>
          <div className="flex flex-col gap-1">
            {data.powerDrawW != null && <ReadRow label="Draw" value={`${data.powerDrawW} W`} />}
            {data.powerCapacityW != null && <ReadRow label="Capacity" value={`${data.powerCapacityW} W`} />}
            {data.voltage != null && data.voltage !== "" && <ReadRow label="Voltage" value={data.voltage} />}
            {data.poeDrawW != null && <ReadRow label="PoE draw" value={`${data.poeDrawW} W`} />}
            {data.poeBudgetW != null && <ReadRow label="PoE budget" value={`${data.poeBudgetW} W`} />}
          </div>
        </>
      )}

      {(() => {
        const ipPorts = data.ports.filter((p) => p.networkConfig?.ip);
        const hasHostname = data.hostname != null && data.hostname !== "";
        if (!hasHostname && ipPorts.length === 0) return null;
        return (
          <>
            <div className="h-px bg-[var(--ui-border)]" />
            <SectionTitle>Network</SectionTitle>
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
          </>
        );
      })()}

      <div className="h-px bg-[var(--ui-border)]" />
      <button className="ui-btn ui-btn-secondary w-full text-xs" onClick={() => setEditingNodeId(node.id)}>
        Edit details…
      </button>
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
  const run = useMemo(() => {
    const rows = computeCableSchedule(nodes, edges, cableNamingScheme, { roomDistances, distanceSettings });
    return connectionRun(rows, edge.id, cable?.maxRunM);
  }, [nodes, edges, cableNamingScheme, roomDistances, distanceSettings, edge.id, cable?.maxRunM]);

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
        <span className="text-xs text-[var(--color-text)]">{SIGNAL_LABELS[sig]}</span>
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
      <div className="text-[11px] text-[var(--color-text-muted)]">
        Estimated run:{" "}
        <span
          className={run.overMax ? "font-medium" : "text-[var(--color-text)]"}
          style={{ fontFamily: "var(--font-mono)", ...(run.overMax ? { color: "var(--color-error)" } : {}) }}
        >
          {run.text ?? "—"}
        </span>
        {run.overMax && cable ? <span style={{ color: "var(--color-error)" }}> · exceeds {cable.maxRunM} m max</span> : null}
      </div>
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
  const selectedEdges = edges.filter((e) => e.selected);
  const singleEdge = !single && selected.length === 0 && selectedEdges.length === 1 ? selectedEdges[0] : null;

  if (embedded) {
    if (single)
      return (
        <div className="h-full overflow-y-auto">
          <NodeBody key={single.id} node={single} />
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

  if (!single) return null;
  const node = single;
  const title = node.type === "device" ? "Device" : node.type === "room" ? "Room" : node.type === "object" ? "Object" : "Zone";

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
        <NodeBody key={node.id} node={node} />
      </div>
    </div>
  );
}

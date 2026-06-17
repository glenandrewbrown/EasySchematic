import {
  type DragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useReactFlow } from "@xyflow/react";
import { getBundledTemplates, fetchTemplates } from "../templateApi";
import type { DeviceTemplate, DeviceData, SchematicNode } from "../types";
import { useSchematicStore } from "../store";
import { scoreTemplate } from "../templateSearch";
import { inventoryKeyFromDeviceData, inventoryKeyFromTemplate } from "../inventoryKey";
import { SIGNAL_FAMILY_COLORS, familyFor } from "../signalFamilies";

/**
 * Rebuilt "Insert" panel content matching the design overhaul mockup. Renders as a
 * normal full-height flex column so the lead's floating wrapper owns positioning.
 *
 * Two lists, switched by a segmented control:
 *   - "My Devices · N": owned gear only (drag-first rows, grip · class icon · name ·
 *     I/O + use-count · `+` to place). N = owned-gear count.
 *   - "Catalog · 2.4k": every template with an activate/deactivate toggle. The toggle
 *     maps directly to ownedGear — on = addOwnedGear, off = removeOwnedGear. Inactive
 *     (un-owned) rows render dimmed.
 *
 * Drag-to-canvas is preserved via the shared "application/easyschematic-device" payload.
 */

const CATALOG_RENDER_CAP = 400;

function setDeviceDragPayload(event: DragEvent, template: DeviceTemplate) {
  event.dataTransfer.setData(
    "application/easyschematic-device",
    JSON.stringify(template),
  );
  event.dataTransfer.effectAllowed = "move";
}

function getTemplateKey(template: DeviceTemplate): string {
  return template.id ?? template.deviceType;
}

/** Dominant signal family of a template — drives the class-colour icon chip. */
function classColorFor(template: DeviceTemplate): string {
  const first = template.ports[0]?.signalType;
  if (!first) return SIGNAL_FAMILY_COLORS.other;
  return SIGNAL_FAMILY_COLORS[familyFor(first)];
}

/** Count of input/output ports, expressed as the mockup's "N I/O" meta. */
function ioCount(template: DeviceTemplate): number {
  return template.ports.filter(
    (p) => p.direction === "input" || p.direction === "output" || p.direction === "bidirectional",
  ).length;
}

/** Map of inventory-key → number of those devices already placed on the canvas. */
function getUsedInventoryCounts(nodes: SchematicNode[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    if (node.type !== "device") continue;
    const data = node.data as DeviceData;
    const key = inventoryKeyFromDeviceData(data);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function GripIcon() {
  return (
    <svg
      width="11"
      height="14"
      viewBox="0 0 12 16"
      fill="currentColor"
      className="shrink-0 text-[var(--color-text-muted)]/50"
      aria-hidden
    >
      <circle cx="3" cy="3" r="1.3" />
      <circle cx="9" cy="3" r="1.3" />
      <circle cx="3" cy="8" r="1.3" />
      <circle cx="9" cy="8" r="1.3" />
      <circle cx="3" cy="13" r="1.3" />
      <circle cx="9" cy="13" r="1.3" />
    </svg>
  );
}

/** Class-colour icon chip — a small filled square in the device's family colour. */
function ClassChip({ color, dim }: { color: string; dim?: boolean }) {
  return (
    <span
      className="shrink-0 w-[22px] h-[22px] rounded-md border border-[var(--ui-border)] bg-[var(--color-surface)] flex items-center justify-center"
      style={{ opacity: dim ? 0.5 : 1 }}
      aria-hidden
    >
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
    </span>
  );
}

/** A pill toggle switch (Catalog rows). On = owned. */
function ToggleSwitch({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`ml-auto shrink-0 relative inline-block w-7 h-4 rounded-full transition-colors duration-150 ${
        on ? "bg-[var(--color-accent)]" : "bg-[var(--ui-border-strong)]"
      }`}
    >
      <span
        className={`absolute top-0.5 w-3 h-3 rounded-full transition-all duration-150 ${
          on ? "left-3.5 bg-white" : "left-0.5 bg-[var(--color-text-muted)]"
        }`}
      />
    </span>
  );
}

function ListHint({ children }: { children: ReactNode }) {
  return (
    <div className="px-1.5 pt-1 pb-2 text-[9px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
      {children}
    </div>
  );
}

/* ── My Devices: owned gear, drag-first, with `+` to place ── */
function OwnedRow({
  template,
  io,
  used,
  onPlace,
}: {
  template: DeviceTemplate;
  io: number;
  used: number;
  onPlace: () => void;
}) {
  const meta =
    used > 0 ? `${io} I/O · ×${used}` : io > 0 ? `${io} I/O` : "Source";
  return (
    <div
      className="group flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--color-surface-raised)] border border-[var(--ui-border)] cursor-grab active:cursor-grabbing hover:border-[var(--ui-border-strong)] transition-colors"
      draggable
      onDragStart={(e) => setDeviceDragPayload(e, template)}
      title="Drag to canvas, or use + to place"
    >
      <GripIcon />
      <ClassChip color={classColorFor(template)} />
      <span className="flex flex-col min-w-0 leading-tight">
        <span className="text-[11.5px] font-medium text-[var(--color-text-heading)] truncate">
          {template.label}
        </span>
        <span className="text-[9px] text-[var(--color-text-muted)] font-[var(--font-mono)]">
          {meta}
        </span>
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPlace();
        }}
        className="ml-auto shrink-0 w-6 h-6 inline-flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] transition-colors cursor-pointer"
        title={`Place ${template.label} on canvas`}
        aria-label={`Place ${template.label} on canvas`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

/* ── Catalog: every template, activate/deactivate toggle ── */
function CatalogRow({
  template,
  owned,
  onToggle,
}: {
  template: DeviceTemplate;
  owned: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer ${
        owned ? "" : "opacity-[0.62]"
      }`}
      title={owned ? `Remove ${template.label} from My Devices` : `Add ${template.label} to My Devices`}
    >
      <ClassChip color={owned ? classColorFor(template) : "var(--color-text-muted)"} dim={!owned} />
      <span className="flex flex-col min-w-0 leading-tight">
        <span
          className={`text-[11.5px] font-medium truncate ${
            owned ? "text-[var(--color-text-heading)]" : "text-[var(--color-text)]"
          }`}
        >
          {template.label}
        </span>
        <span className="text-[9px] text-[var(--color-text-muted)]">
          {owned ? "Owned" : "Not owned"}
        </span>
      </span>
      <ToggleSwitch on={owned} label={owned ? "Owned" : "Not owned"} />
    </button>
  );
}

export default function InsertPanel({ onCollapse }: { onCollapse?: () => void }) {
  const ownedGear = useSchematicStore((s) => s.ownedGear);
  const addOwnedGear = useSchematicStore((s) => s.addOwnedGear);
  const removeOwnedGear = useSchematicStore((s) => s.removeOwnedGear);
  const customTemplates = useSchematicStore((s) => s.customTemplates);
  const nodes = useSchematicStore((s) => s.nodes);
  const addDevice = useSchematicStore((s) => s.addDevice);
  const addToast = useSchematicStore((s) => s.addToast);

  const { screenToFlowPosition } = useReactFlow();

  const [tab, setTab] = useState<"owned" | "catalog">("owned");
  const [search, setSearch] = useState("");
  const [templates, setTemplates] = useState(getBundledTemplates);

  useEffect(() => {
    fetchTemplates()
      .then(setTemplates)
      .catch(() => console.warn("Using bundled device library (API unavailable)"));
  }, []);

  const query = search.trim();

  const ownedSet = useMemo(
    () => new Set(ownedGear.map((item) => getTemplateKey(item.template))),
    [ownedGear],
  );

  const usedCounts = useMemo(() => getUsedInventoryCounts(nodes), [nodes]);

  const catalogTemplates = useMemo(
    () => [...templates, ...customTemplates].filter((t) => t.category !== "Expansion Cards"),
    [templates, customTemplates],
  );

  const catalogCountLabel = useMemo(() => {
    const n = catalogTemplates.length;
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
    return `${n}`;
  }, [catalogTemplates.length]);

  const filteredOwned = useMemo(() => {
    const items = query
      ? ownedGear.filter((item) => scoreTemplate(item.template, query) > 0)
      : ownedGear;
    return items;
  }, [ownedGear, query]);

  const filteredCatalog = useMemo(() => {
    if (!query) return catalogTemplates.slice(0, CATALOG_RENDER_CAP);
    return catalogTemplates
      .map((t) => ({ t, score: scoreTemplate(t, query) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.t.label.localeCompare(b.t.label))
      .slice(0, CATALOG_RENDER_CAP)
      .map((r) => r.t);
  }, [catalogTemplates, query]);

  /** Place a device at the current viewport centre (the + button). */
  const placeOnCanvas = useCallback(
    (template: DeviceTemplate) => {
      const pane = document.querySelector(".react-flow");
      const rect = pane?.getBoundingClientRect();
      const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
      const position = screenToFlowPosition({ x: cx, y: cy });
      addDevice(template, position);
      addToast(`Added ${template.label}`, "success");
    },
    [screenToFlowPosition, addDevice, addToast],
  );

  const toggleOwned = useCallback(
    (template: DeviceTemplate) => {
      const key = getTemplateKey(template);
      if (ownedSet.has(key)) removeOwnedGear(key);
      else addOwnedGear(template, 1);
    },
    [ownedSet, addOwnedGear, removeOwnedGear],
  );

  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 shrink-0">
        <span className="text-xs font-semibold text-[var(--color-text-heading)]">Insert</span>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className="ml-auto w-[23px] h-[23px] inline-flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
            title="Collapse"
            aria-label="Collapse insert panel"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Segmented control */}
      <div className="mx-3 mb-2 flex gap-0.5 p-[3px] rounded-lg bg-[var(--color-bg)] border border-[var(--ui-border)] shrink-0">
        <button
          type="button"
          onClick={() => setTab("owned")}
          aria-pressed={tab === "owned"}
          className={`flex-1 h-[25px] rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
            tab === "owned"
              ? "bg-[var(--color-surface-raised)] border border-[var(--ui-border-strong)] text-[var(--color-text-heading)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          My Devices · <span className="font-[var(--font-mono)]">{ownedGear.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("catalog")}
          aria-pressed={tab === "catalog"}
          className={`flex-1 h-[25px] rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
            tab === "catalog"
              ? "bg-[var(--color-surface-raised)] border border-[var(--ui-border-strong)] text-[var(--color-text-heading)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          Catalog · <span className="font-[var(--font-mono)]">{catalogCountLabel}</span>
        </button>
      </div>

      {/* Search */}
      <div className="mx-3 mb-2.5 flex items-center gap-2 h-[30px] px-2.5 rounded-lg bg-[var(--color-bg)] border border-[var(--ui-border)] shrink-0">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="shrink-0 text-[var(--color-text-muted)]" aria-hidden>
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={1.6} />
          <path d="M21 21l-4-4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tab === "owned" ? "Search my devices…" : "Search catalog…"}
          className="flex-1 min-w-0 bg-transparent text-[11.5px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)]"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-sm leading-none cursor-pointer"
            aria-label="Clear search"
          >
            &times;
          </button>
        )}
      </div>

      {/* Lists */}
      {tab === "owned" ? (
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          <ListHint>Drag to canvas · ⠿ reorder</ListHint>
          {filteredOwned.length === 0 ? (
            <div className="px-2 py-6 text-center text-[11px] text-[var(--color-text-muted)]">
              {ownedGear.length === 0
                ? "No owned devices yet. Open Catalog and toggle gear you own."
                : `No owned device matches “${query}”.`}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {filteredOwned.map((item) => {
                const template = item.template;
                const used = usedCounts.get(inventoryKeyFromTemplate(template)) ?? 0;
                return (
                  <OwnedRow
                    key={getTemplateKey(template)}
                    template={template}
                    io={ioCount(template)}
                    used={used}
                    onPlace={() => placeOnCanvas(template)}
                  />
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          <ListHint>Toggle to own · only owned gear shows in My Devices</ListHint>
          {filteredCatalog.length === 0 ? (
            <div className="px-2 py-6 text-center text-[11px] text-[var(--color-text-muted)]">
              No device matches “{query}”.
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {filteredCatalog.map((template) => (
                <CatalogRow
                  key={getTemplateKey(template)}
                  template={template}
                  owned={ownedSet.has(getTemplateKey(template))}
                  onToggle={() => toggleOwned(template)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

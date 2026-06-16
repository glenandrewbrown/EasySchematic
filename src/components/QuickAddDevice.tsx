import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { getBundledTemplates, fetchTemplates } from "../templateApi";
import { SIGNAL_LABELS } from "../types";
import type { DeviceTemplate } from "../types";
import { useSchematicStore, GRID_SIZE } from "../store";
import { scoreTemplate } from "../templateSearch";
import {
  deviceFootprint,
  gridPositions,
  parseQuantity,
  parseListLine,
  isMultiLine,
  splitLines,
  MAX_BULK_COUNT,
  type Footprint,
  type Point,
} from "../quickAddLayout";

const MAX_RESULTS = 12;

type SpecialItem = { kind: "note" } | { kind: "room" } | { kind: "create" };
type ResultItem = { type: "device"; template: DeviceTemplate } | { type: "special"; item: SpecialItem; label: string; subtitle: string };

const SPECIAL_ITEMS: { item: SpecialItem; label: string; subtitle: string; keywords: string[] }[] = [
  { item: { kind: "note" }, label: "Note", subtitle: "Text annotation", keywords: ["note", "text", "annotation", "label", "comment"] },
  { item: { kind: "room" }, label: "Room", subtitle: "Grouping container", keywords: ["room", "group", "area", "zone", "container"] },
  { item: { kind: "create" }, label: "Create New Device", subtitle: "Blank or copy from existing", keywords: ["create", "new", "custom", "blank", "device", "empty"] },
];

function scoreSpecial(keywords: string[], query: string): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  let matched = 0;
  for (const word of words) {
    if (keywords.some((k) => k.includes(word))) matched++;
  }
  return matched === words.length ? 90 : 0;
}

/** Best-scoring template for a free-text query, or null if nothing matches. */
function bestMatch(query: string, templates: DeviceTemplate[]): DeviceTemplate | null {
  let best: DeviceTemplate | null = null;
  let bestScore = 0;
  for (const t of templates) {
    const s = scoreTemplate(t, query);
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }
  return best;
}

interface ListRow {
  raw: string;
  count: number;
  query: string;
  template: DeviceTemplate | null;
}

export default function QuickAddDevice({
  position,
  onClose,
  onOpenDeviceCreator,
}: {
  position: { x: number; y: number };
  onClose: () => void;
  onOpenDeviceCreator?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [openPanel, setOpenPanel] = useState<"category" | "brand" | null>(null);
  const [rapidFire, setRapidFire] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const [qtyOverride, setQtyOverride] = useState<number | null>(null);
  const [listText, setListText] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // How many devices have been placed in this session — drives the rapid-fire cascade.
  const placedCountRef = useRef(0);

  const addDevice = useSchematicStore((s) => s.addDevice);
  const addDevices = useSchematicStore((s) => s.addDevices);
  const addNote = useSchematicStore((s) => s.addNote);
  const addRoom = useSchematicStore((s) => s.addRoom);
  const reparentNode = useSchematicStore((s) => s.reparentNode);
  const customTemplates = useSchematicStore((s) => s.customTemplates);
  const favoriteTemplates = useSchematicStore((s) => s.favoriteTemplates);
  const recentTemplates = useSchematicStore((s) => s.recentTemplates);

  const [templates, setTemplates] = useState(getBundledTemplates);
  const favoriteSet = useMemo(() => new Set(favoriteTemplates), [favoriteTemplates]);
  const allTemplates = useMemo(() => [...templates, ...customTemplates], [templates, customTemplates]);

  useEffect(() => {
    fetchTemplates().then(setTemplates).catch(() => {});
  }, []);

  const templateByKey = useMemo(() => {
    const map = new Map<string, DeviceTemplate>();
    for (const t of allTemplates) map.set(t.id ?? t.deviceType, t);
    return map;
  }, [allTemplates]);

  // Parse any quantity prefix/suffix from the search so "8x JBL" searches "JBL".
  const parsedQty = useMemo(() => parseQuantity(search), [search]);
  const query = parsedQty.rest.trim();
  const effectiveCount = Math.min(MAX_BULK_COUNT, Math.max(1, qtyOverride ?? parsedQty.count));
  const listMode = listText !== null;

  // Cross-filtered dropdown options
  const categories = useMemo(() => {
    const source = selectedBrands.size > 0
      ? allTemplates.filter((t) => t.manufacturer && selectedBrands.has(t.manufacturer))
      : allTemplates;
    return [...new Set(source.map((t) => t.category).filter(Boolean))].sort() as string[];
  }, [allTemplates, selectedBrands]);

  const brands = useMemo(() => {
    const source = selectedCategories.size > 0
      ? allTemplates.filter((t) => t.category && selectedCategories.has(t.category))
      : allTemplates;
    return [...new Set(source.map((t) => t.manufacturer).filter(Boolean))].sort() as string[];
  }, [allTemplates, selectedCategories]);

  const toggleCategory = useCallback((cat: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }, []);

  const toggleBrand = useCallback((brand: string) => {
    setSelectedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(brand)) next.delete(brand); else next.add(brand);
      return next;
    });
  }, []);

  const hasFilter = selectedCategories.size > 0 || selectedBrands.size > 0;

  // Recents + favorites chips for one-click re-add (shown when the query is empty).
  const chipTemplates = useMemo(() => {
    const seen = new Set<string>();
    const out: DeviceTemplate[] = [];
    for (const key of [...recentTemplates, ...favoriteTemplates]) {
      if (seen.has(key)) continue;
      const t = templateByKey.get(key);
      if (t) {
        seen.add(key);
        out.push(t);
      }
      if (out.length >= 8) break;
    }
    return out;
  }, [recentTemplates, favoriteTemplates, templateByKey]);

  const results: ResultItem[] = useMemo(() => {
    // Pre-filter templates by active filters
    const filtered = allTemplates.filter((t) => {
      if (selectedCategories.size > 0 && (!t.category || !selectedCategories.has(t.category))) return false;
      if (selectedBrands.size > 0 && (!t.manufacturer || !selectedBrands.has(t.manufacturer))) return false;
      return true;
    });

    const deviceItems: { item: ResultItem; score: number }[] = filtered.map((t) => {
      let score = query ? scoreTemplate(t, query) : 0;
      if (score > 0 && favoriteSet.has(t.id ?? t.deviceType)) score += 200;
      return { item: { type: "device" as const, template: t }, score };
    });

    // Hide special items when filters are active (they aren't devices)
    const specialItems: { item: ResultItem; score: number }[] = hasFilter
      ? []
      : SPECIAL_ITEMS.map((s) => ({
          item: { type: "special" as const, item: s.item, label: s.label, subtitle: s.subtitle },
          score: query ? scoreSpecial(s.keywords, query) : 0,
        }));

    const all = [...specialItems, ...deviceItems];

    if (!query) {
      // No query: show specials first, then favorites, then alphabetical
      const specials = specialItems.map((s) => s.item);
      const favs = deviceItems
        .filter((d) => d.item.type === "device" && favoriteSet.has(d.item.template.id ?? d.item.template.deviceType))
        .map((d) => d.item);
      const rest = deviceItems
        .filter((d) => d.item.type === "device" && !favoriteSet.has(d.item.template.id ?? d.item.template.deviceType))
        .sort((a, b) => {
          const al = a.item.type === "device" ? a.item.template.label : "";
          const bl = b.item.type === "device" ? b.item.template.label : "";
          return al.localeCompare(bl);
        })
        .map((d) => d.item);
      return [...specials, ...favs, ...rest].slice(0, MAX_RESULTS);
    }

    return all
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item)
      .slice(0, MAX_RESULTS);
  }, [allTemplates, selectedCategories, selectedBrands, query, favoriteSet, hasFilter]);

  // Reset selection when results change
  /* eslint-disable react-hooks/set-state-in-effect -- resetting derived state */
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Auto-focus
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list || listMode) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, listMode]);

  /** Add a batch of {template, position} and reparent each into its room. */
  const placeAt = useCallback(
    (items: { template: DeviceTemplate; position: Point }[]) => {
      if (items.length === 0) return;
      if (items.length === 1) {
        addDevice(items[0].template, items[0].position);
      } else {
        addDevices(items);
      }
      // Reparent the just-placed devices (last N) into the room under each cell.
      const n = items.length;
      setTimeout(() => {
        const state = useSchematicStore.getState();
        const devices = state.nodes.filter((node) => node.type === "device");
        const placed = devices.slice(-n);
        placed.forEach((node, i) => {
          if (items[i]) reparentNode(node.id, items[i].position, { skipUndo: true });
        });
      }, 0);
    },
    [addDevice, addDevices, reparentNode],
  );

  /**
   * Place `count` copies of `template`. In rapid-fire mode the copies continue
   * the cascade from earlier placements; otherwise they start a fresh grid at the
   * anchor. Newly created devices are reparented into the room under each cell.
   */
  const placeTemplate = useCallback(
    (template: DeviceTemplate, count: number, keepOpen: boolean) => {
      const fp: Footprint = deviceFootprint(template);
      const startIndex = keepOpen ? placedCountRef.current : 0;
      // Compute the full grid up to the new total, then take the new slice.
      const grid = gridPositions(position, fp, startIndex + count);
      const positions = grid.slice(startIndex, startIndex + count);
      placeAt(positions.map((p) => ({ template, position: p })));
      placedCountRef.current = startIndex + count;
      if (keepOpen) {
        setAddedCount((c) => c + count);
        setSearch("");
        setQtyOverride(null);
        inputRef.current?.focus();
      } else {
        onClose();
      }
    },
    [position, onClose, placeAt],
  );

  const placeSpecial = useCallback(
    (item: SpecialItem) => {
      if (item.kind === "note") {
        const centered = {
          x: Math.round((position.x - 100) / GRID_SIZE) * GRID_SIZE,
          y: Math.round((position.y - 50) / GRID_SIZE) * GRID_SIZE,
        };
        addNote(centered);
      } else if (item.kind === "room") {
        const centered = {
          x: Math.round((position.x - 200) / GRID_SIZE) * GRID_SIZE,
          y: Math.round((position.y - 150) / GRID_SIZE) * GRID_SIZE,
        };
        addRoom("Room", centered);
      } else if (item.kind === "create") {
        onOpenDeviceCreator?.();
      }
      onClose();
    },
    [addNote, addRoom, position, onClose, onOpenDeviceCreator],
  );

  const selectResult = useCallback(
    (result: ResultItem, keepOpen: boolean) => {
      if (result.type === "device") placeTemplate(result.template, effectiveCount, keepOpen);
      else placeSpecial(result.item); // specials are one-shot regardless of mode
    },
    [placeTemplate, placeSpecial, effectiveCount],
  );

  // ---- List (paste) mode ----------------------------------------------------

  const listRows: ListRow[] = useMemo(() => {
    if (!listMode || !listText) return [];
    return splitLines(listText).map((raw) => {
      const { count, query: q } = parseListLine(raw);
      return { raw, count, query: q, template: q ? bestMatch(q, allTemplates) : null };
    });
  }, [listMode, listText, allTemplates]);

  const listTotal = useMemo(
    () => listRows.reduce((sum, r) => sum + (r.template ? r.count : 0), 0),
    [listRows],
  );

  const placeList = useCallback(() => {
    const matched = listRows.filter((r) => r.template);
    if (matched.length === 0) return;
    // Expand to a flat template array, then lay them out on one grid sized to the
    // largest footprint so nothing overlaps (templates can differ in size).
    const expanded: DeviceTemplate[] = [];
    for (const row of matched) {
      for (let i = 0; i < Math.min(row.count, MAX_BULK_COUNT); i++) expanded.push(row.template!);
    }
    if (expanded.length === 0) return;
    let maxW = 0;
    let maxH = 0;
    for (const t of matched) {
      const fp = deviceFootprint(t.template!);
      maxW = Math.max(maxW, fp.w);
      maxH = Math.max(maxH, fp.h);
    }
    const positions = gridPositions(position, { w: maxW, h: maxH }, expanded.length);
    placeAt(expanded.map((t, i) => ({ template: t, position: positions[i] })));
    onClose();
  }, [listRows, position, placeAt, onClose]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (isMultiLine(text)) {
      e.preventDefault();
      setListText(text);
    }
  }, []);

  const exitListMode = useCallback(() => {
    setListText(null);
    setSearch("");
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (listMode) exitListMode();
      else onClose();
      return;
    }
    if (listMode) {
      if (e.key === "Enter") {
        e.preventDefault();
        placeList();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Shift+Enter always keeps the spotlight open (rapid-fire for one press).
      const keepOpen = rapidFire || e.shiftKey;
      if (results[selectedIndex]) selectResult(results[selectedIndex], keepOpen);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="absolute bg-[var(--color-surface-raised)] border border-[var(--ui-border)] rounded-xl shadow-[var(--ui-shadow-menu)] w-72 flex flex-col overflow-hidden"
        style={{ left: "50%", top: "30%", transform: "translateX(-50%)" }}
      >
        <div className="px-2 pt-2 pb-1.5 flex gap-1.5 items-center">
          <input
            ref={inputRef}
            type="text"
            value={listMode ? "" : search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={listMode ? "Pasted list…" : "Add device, note, room…  (8x to bulk, paste a list)"}
            disabled={listMode}
            className="ui-input flex-1 min-w-0 text-[var(--color-text-heading)]"
          />
          {!listMode && (
            <div className="flex items-center gap-0.5 shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-surface)]" title="Quantity to place">
              <button
                onMouseDown={(e) => { e.preventDefault(); setQtyOverride(Math.max(1, effectiveCount - 1)); }}
                className="px-1.5 py-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)]"
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="text-xs tabular-nums w-5 text-center text-[var(--color-text-heading)]">{effectiveCount}</span>
              <button
                onMouseDown={(e) => { e.preventDefault(); setQtyOverride(Math.min(MAX_BULK_COUNT, effectiveCount + 1)); }}
                className="px-1.5 py-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)]"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          )}
        </div>

        {!listMode && (
          <div className="px-2 pb-2 border-b border-[var(--ui-border)]">
            <div className="flex gap-1.5">
              <div className={`flex-1 min-w-0 flex items-center rounded border transition-colors ${
                  openPanel === "category"
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                    : selectedCategories.size > 0
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                }`}>
                <button
                  onMouseDown={(e) => { e.preventDefault(); setOpenPanel((p) => p === "category" ? null : "category"); }}
                  className="flex-1 min-w-0 px-1.5 py-1 text-[10px] text-left truncate"
                >
                  {selectedCategories.size > 0 ? `Categories (${selectedCategories.size})` : "Categories"}
                </button>
                {selectedCategories.size > 0 && (
                  <button
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedCategories(new Set()); }}
                    className="px-1 text-[var(--color-accent)] hover:opacity-70 text-xs shrink-0"
                  >
                    &times;
                  </button>
                )}
              </div>
              <div className={`flex-1 min-w-0 flex items-center rounded border transition-colors ${
                  openPanel === "brand"
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                    : selectedBrands.size > 0
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                }`}>
                <button
                  onMouseDown={(e) => { e.preventDefault(); setOpenPanel((p) => p === "brand" ? null : "brand"); }}
                  className="flex-1 min-w-0 px-1.5 py-1 text-[10px] text-left truncate"
                >
                  {selectedBrands.size > 0 ? `Brands (${selectedBrands.size})` : "Brands"}
                </button>
                {selectedBrands.size > 0 && (
                  <button
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedBrands(new Set()); }}
                    className="px-1 text-[var(--color-accent)] hover:opacity-70 text-xs shrink-0"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>
            {openPanel === "category" && (
              <div className="mt-1.5 max-h-28 overflow-y-auto flex flex-wrap gap-1">
                {categories.map((c) => (
                  <button
                    key={c}
                    onMouseDown={(e) => { e.preventDefault(); toggleCategory(c); }}
                    className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                      selectedCategories.has(c)
                        ? "bg-[var(--color-accent)] text-white"
                        : "bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            {openPanel === "brand" && (
              <div className="mt-1.5 max-h-28 overflow-y-auto flex flex-wrap gap-1">
                {brands.map((m) => (
                  <button
                    key={m}
                    onMouseDown={(e) => { e.preventDefault(); toggleBrand(m); }}
                    className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                      selectedBrands.has(m)
                        ? "bg-[var(--color-accent)] text-white"
                        : "bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recents / favorites quick chips (empty query, normal mode) */}
        {!listMode && !query && !hasFilter && chipTemplates.length > 0 && (
          <div className="px-2 py-1.5 border-b border-[var(--ui-border)] flex flex-wrap gap-1">
            {chipTemplates.map((t) => (
              <button
                key={t.id ?? t.deviceType}
                onMouseDown={(e) => { e.preventDefault(); placeTemplate(t, effectiveCount, rapidFire); }}
                title={`Add ${t.label}`}
                className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] truncate max-w-[8rem]"
              >
                {favoriteSet.has(t.id ?? t.deviceType) ? "★ " : "↻ "}{t.label}
              </button>
            ))}
          </div>
        )}

        {listMode ? (
          <div className="max-h-72 overflow-y-auto">
            <div className="px-3 py-1.5 text-[10px] text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
              {listRows.length} line{listRows.length === 1 ? "" : "s"} · {listTotal} device{listTotal === 1 ? "" : "s"} to place
            </div>
            {listRows.map((row, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-1 text-xs border-b border-[var(--color-border)]/40 last:border-0"
              >
                <span className="tabular-nums text-[var(--color-text-muted)] w-7 shrink-0">{row.count}×</span>
                {row.template ? (
                  <span className="flex-1 min-w-0 truncate text-[var(--color-text-heading)]">
                    <span className="text-emerald-500">✓</span> {row.template.label}
                  </span>
                ) : (
                  <span className="flex-1 min-w-0 truncate text-[var(--color-text-muted)]">
                    <span className="text-amber-500">✗</span> {row.query || row.raw} <span className="opacity-60">(no match)</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div ref={listRef} className="max-h-64 overflow-y-auto">
            {results.length === 0 && (query || hasFilter) && (
              <div className="text-xs text-[var(--color-text-muted)] text-center py-4">
                No matching devices
              </div>
            )}
            {results.map((result, i) => {
              if (result.type === "special") {
                return (
                  <div
                    key={result.item.kind}
                    onMouseDown={() => selectResult(result, false)}
                    onMouseEnter={() => setSelectedIndex(i)}
                    className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
                      i === selectedIndex
                        ? "bg-[var(--color-accent)]/15 text-[var(--color-text-heading)]"
                        : "text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                    }`}
                  >
                    <span className="text-[var(--color-text-muted)] text-xs shrink-0">
                      {result.item.kind === "note" ? "📝" : result.item.kind === "room" ? "▢" : "⊞"}
                    </span>
                    <div className="flex flex-col gap-0 flex-1 min-w-0">
                      <span className="text-xs font-medium truncate">{result.label}</span>
                      <span className="text-[10px] text-[var(--color-text-muted)] truncate">{result.subtitle}</span>
                    </div>
                  </div>
                );
              }
              const template = result.template;
              const signals = [...new Set(template.ports.map((p) => p.signalType))]
                .map((t) => SIGNAL_LABELS[t])
                .join(" / ");
              const isFav = favoriteSet.has(template.id ?? template.deviceType);
              return (
                <div
                  key={template.id ?? template.deviceType}
                  onMouseDown={(e) => selectResult(result, rapidFire || e.shiftKey)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
                    i === selectedIndex
                      ? "bg-[var(--color-accent)]/15 text-[var(--color-text-heading)]"
                      : "text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                  }`}
                >
                  {isFav && <span className="text-amber-400 text-xs shrink-0">★</span>}
                  <div className="flex flex-col gap-0 flex-1 min-w-0">
                    <span className="text-xs font-medium truncate">{template.label}</span>
                    <span className="text-[10px] text-[var(--color-text-muted)] truncate">{signals}</span>
                  </div>
                  {effectiveCount > 1 && (
                    <span className="text-[10px] text-[var(--color-accent)] tabular-nums shrink-0">×{effectiveCount}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {listMode ? (
          <div className="px-2 py-1.5 border-t border-[var(--color-border)] flex items-center gap-2">
            <button
              onMouseDown={(e) => { e.preventDefault(); exitListMode(); }}
              className="ui-btn text-[11px] px-2 py-1"
            >
              Back
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); placeList(); }}
              disabled={listTotal === 0}
              className="ui-btn-primary text-[11px] px-2 py-1 flex-1 disabled:opacity-40"
            >
              Place all ({listTotal})
            </button>
          </div>
        ) : (
          <div className="px-3 py-1.5 border-t border-[var(--color-border)] text-[9px] text-[var(--color-text-muted)] flex items-center gap-3">
            <label className="flex items-center gap-1 cursor-pointer select-none" title="Keep open after placing for rapid adding">
              <input
                type="checkbox"
                checked={rapidFire}
                onChange={(e) => setRapidFire(e.target.checked)}
                className="accent-[var(--color-accent)]"
              />
              <span>Rapid</span>
            </label>
            <span><kbd className="font-mono">↑↓</kbd> nav</span>
            <span><kbd className="font-mono">⏎</kbd> place</span>
            <span><kbd className="font-mono">⇧⏎</kbd> +keep</span>
            {addedCount > 0 && <span className="ml-auto text-[var(--color-accent)]">{addedCount} added</span>}
          </div>
        )}
      </div>
    </div>
  );
}

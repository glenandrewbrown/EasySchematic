/**
 * CommandPalette — ⌘K overlay for EasySchematic.
 *
 * Self-contained: manages its own open/close state and keyboard listeners.
 * Mount once (no props required); the lead wires it in App.tsx.
 *
 * Store actions wired:
 *   "Insert device…"           → setActiveTool("device")   [opens device drawer]
 *   "Auto-route all"           → toggleAutoRoute()          [toggles auto-routing]
 *   "Validate schematic"       → writes localStorage key + dispatches StorageEvent
 *                                so RightRail opens the "validate" tab
 *   "Export / Reports…"        → setCanvasViewMode("schedule") [closest: Schedule has Cable BOM tab]
 *   "Go to device"             → mutates nodes.selected in the store (immutable map)
 *   "Switch workspace"         → setCanvasViewMode(mode)
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useSchematicStore } from "../store";
import type { DeviceNode } from "../types";

// ─── Right-rail validation tab key (matches RightRail.tsx STORAGE_KEY) ───────
const RIGHT_RAIL_TAB_KEY = "easyschematic-rightrail-tab";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaletteItem {
  id: string;
  label: string;
  sublabel?: string;
  swatchColor?: string;
  shortcut?: string;
  onSelect: () => void;
}

interface PaletteGroup {
  heading: string;
  items: PaletteItem[];
}

// ─── SVG icons (inline, sized 15×15) ─────────────────────────────────────────

function IconInsert() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 9v6M9 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconAutoRoute() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function IconValidate() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconExport() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 16V4M8 8l4-4 4 4M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSchematic() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="16" y="6" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9.5" y="13" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 8.5h3.5M15.5 8.5H12M12 13V9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IconLayout() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 9h18M9 9v12" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function IconSchedule() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 9h18M9 9v11" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function IconRack() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="3" width="14" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7h8M8 11h8M8 15h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Store selectors
  const nodes = useSchematicStore((s) => s.nodes);
  const setActiveTool = useSchematicStore((s) => s.setActiveTool);
  const toggleAutoRoute = useSchematicStore((s) => s.toggleAutoRoute);
  const setCanvasViewMode = useSchematicStore((s) => s.setCanvasViewMode);
  const pages = useSchematicStore((s) => s.pages);
  const setActivePage = useSchematicStore((s) => s.setActivePage);
  const addRackPage = useSchematicStore((s) => s.addRackPage);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHighlightIndex(0);
  }, []);

  /** Select a single device node in the store (immutable map). */
  const selectNode = useCallback(
    (nodeId: string) => {
      useSchematicStore.setState((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, selected: true } : { ...n, selected: false },
        ),
        edges: state.edges.map((e) => ({ ...e, selected: false })),
      }));
    },
    [],
  );

  /** Open the RightRail "validate" tab by writing to localStorage and dispatching
   *  a StorageEvent so RightRail.tsx picks it up even within the same window. */
  const openValidateTab = useCallback(() => {
    localStorage.setItem(RIGHT_RAIL_TAB_KEY, "validate");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: RIGHT_RAIL_TAB_KEY,
        newValue: "validate",
        storageArea: localStorage,
      }),
    );
  }, []);

  // ── Build item groups from live store data ─────────────────────────────────

  const deviceNodes = nodes.filter((n): n is DeviceNode => n.type === "device");

  const actionItems: PaletteItem[] = [
    {
      id: "insert-device",
      label: "Insert device…",
      shortcut: "D",
      onSelect: () => {
        setActiveTool("device");
        close();
      },
    },
    {
      id: "auto-route",
      label: "Auto-route all connections",
      shortcut: "⇧R",
      onSelect: () => {
        toggleAutoRoute();
        close();
      },
    },
    {
      id: "validate",
      label: "Validate schematic",
      onSelect: () => {
        openValidateTab();
        close();
      },
    },
    {
      id: "export",
      label: "Export / Reports…",
      // Opens Schedule view which contains Cable BOM | Inventory | Logistics tabs
      onSelect: () => {
        setCanvasViewMode("schedule");
        close();
      },
    },
  ];

  const goToItems: PaletteItem[] = deviceNodes.map((n) => ({
    id: `goto-${n.id}`,
    label: n.data.label,
    sublabel: n.data.deviceType || n.data.category || "",
    swatchColor: n.data.headerColor ?? "var(--color-accent)",
    onSelect: () => {
      selectNode(n.id);
      close();
    },
  }));

  const workspaceItems: PaletteItem[] = [
    {
      id: "ws-schematic",
      label: "Schematic",
      shortcut: "⇧1",
      onSelect: () => {
        setCanvasViewMode("schematic");
        close();
      },
    },
    {
      id: "ws-layout",
      label: "Plan",
      // Store mode key stays "layout"; the persona is labelled "Plan" in the top bar.
      onSelect: () => {
        setCanvasViewMode("layout");
        close();
      },
    },
    {
      id: "ws-schedule",
      label: "Schedule",
      onSelect: () => {
        setCanvasViewMode("schedule");
        close();
      },
    },
    {
      id: "ws-rack",
      label: "Rack",
      // Mirror EditorTopBar's persona switcher: open the first rack page, or
      // create one if none exists (addRackPage returns the new page id).
      onSelect: () => {
        const rack = pages.find((pg) => pg.type?.startsWith("rack"));
        setActivePage(rack ? rack.id : addRackPage("Rack Page 1"));
        close();
      },
    },
  ];

  const groups: PaletteGroup[] = [
    { heading: "Actions", items: actionItems },
    { heading: "Go to device", items: goToItems },
    { heading: "Switch workspace", items: workspaceItems },
  ];

  // ── Filtered flat list ─────────────────────────────────────────────────────

  const filtered: PaletteItem[] = query.trim() === ""
    ? groups.flatMap((g) => g.items)
    : groups.flatMap((g) =>
        g.items.filter(
          (item) =>
            item.label.toLowerCase().includes(query.toLowerCase()) ||
            (item.sublabel ?? "").toLowerCase().includes(query.toLowerCase()),
        ),
      );

  // ── Filtered group structure for rendering ─────────────────────────────────

  const filteredGroups: PaletteGroup[] = groups
    .map((g) => ({
      ...g,
      items: query.trim() === ""
        ? g.items
        : g.items.filter(
            (item) =>
              item.label.toLowerCase().includes(query.toLowerCase()) ||
              (item.sublabel ?? "").toLowerCase().includes(query.toLowerCase()),
          ),
    }))
    .filter((g) => g.items.length > 0);

  // ── Focus input when opened ────────────────────────────────────────────────

  useEffect(() => {
    if (open) {
      setHighlightIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // ── Reset highlight to 0 when query changes ────────────────────────────────

  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  // ── Global ⌘K / Ctrl+K toggle ─────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        if (open) {
          setQuery("");
          setHighlightIndex(0);
        }
        return;
      }

      if (!open) return;

      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length));
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((i) =>
          filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length,
        );
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        filtered[highlightIndex]?.onSelect();
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, filtered, highlightIndex, close]);

  // ── Open from the top-bar ⌘K launcher pill ────────────────────────────────
  useEffect(() => {
    function onOpenRequest() {
      setQuery("");
      setHighlightIndex(0);
      setOpen(true);
    }
    window.addEventListener("easyschematic:open-command-palette", onOpenRequest);
    return () => window.removeEventListener("easyschematic:open-command-palette", onOpenRequest);
  }, []);

  // ── Scroll highlighted item into view ─────────────────────────────────────

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLDivElement>(
      `[data-palette-index="${highlightIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  if (!open) return null;

  // ── Compute running index across all groups for highlight tracking ──────────

  let runningIndex = 0;

  return (
    /* Backdrop */
    <div
      role="presentation"
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: "rgba(4, 7, 14, 0.62)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "13vh",
      }}
    >
      {/* Panel — stop click propagation so clicks inside don't close */}
      <div
        role="dialog"
        aria-modal
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          maxWidth: "92vw",
          background: "var(--color-surface)",
          border: "1px solid var(--ui-border-strong)",
          borderRadius: 13,
          boxShadow: "var(--ui-shadow-menu)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Search header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            padding: "14px 16px",
            borderBottom: "1px solid var(--ui-border)",
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="11" cy="11" r="7" stroke="var(--color-text-muted)" strokeWidth="1.6" />
            <path d="M21 21l-4-4" stroke="var(--color-text-muted)" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            aria-label="Search commands"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
              // The input is always focused while the palette is open, so handle
              // navigation/close keys here directly rather than relying on the
              // window listener (whose events the input otherwise swallows).
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                close();
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                e.stopPropagation();
                setHighlightIndex((i) =>
                  filtered.length === 0 ? 0 : (i + 1) % filtered.length,
                );
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                e.stopPropagation();
                setHighlightIndex((i) =>
                  filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length,
                );
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                filtered[highlightIndex]?.onSelect();
                return;
              }
            }}
            placeholder="Search devices, run a command, jump to a device…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 14.5,
              color: "var(--color-text)",
              fontFamily: "inherit",
            }}
          />
          {/* Blinking cursor line */}
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 1.5,
              height: 17,
              background: "var(--color-accent)",
              borderRadius: 1,
            }}
          />
          <kbd
            style={{
              fontSize: 9.5,
              color: "var(--color-text-muted)",
              padding: "2px 6px",
              border: "1px solid var(--ui-border)",
              borderRadius: 4,
              fontFamily: "var(--font-mono)",
            }}
          >
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          style={{ maxHeight: 340, overflowY: "auto", padding: 8 }}
        >
          {filteredGroups.length === 0 && (
            <p
              style={{
                textAlign: "center",
                padding: "20px 0",
                fontSize: 12.5,
                color: "var(--color-text-muted)",
                margin: 0,
              }}
            >
              No results
            </p>
          )}

          {filteredGroups.map((group) => (
            <div key={group.heading}>
              {/* Section heading — mono uppercase */}
              <div
                aria-hidden
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  letterSpacing: "0.11em",
                  textTransform: "uppercase",
                  color: "var(--color-text-muted)",
                  padding: "6px 9px 5px",
                  marginTop: group.heading !== filteredGroups[0].heading ? 4 : 0,
                }}
              >
                {group.heading}
              </div>

              {group.items.map((item) => {
                const idx = runningIndex++;
                const isHighlighted = idx === highlightIndex;
                const isActionGroup = group.heading === "Actions";

                return (
                  <div
                    key={item.id}
                    data-palette-index={idx}
                    role="option"
                    aria-selected={isHighlighted}
                    onClick={item.onSelect}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 11,
                      padding: "9px 10px",
                      borderRadius: 8,
                      cursor: "pointer",
                      background: isHighlighted
                        ? "var(--color-accent-soft)"
                        : "transparent",
                      border: isHighlighted
                        ? "1px solid color-mix(in srgb, var(--color-accent) 42%, transparent)"
                        : "1px solid transparent",
                      transition: "background 80ms ease, border-color 80ms ease",
                    }}
                  >
                    {/* Icon or swatch */}
                    {item.swatchColor !== undefined ? (
                      <span
                        aria-hidden
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          background: item.swatchColor,
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <span
                        aria-hidden
                        style={{
                          color: isHighlighted
                            ? "var(--color-accent)"
                            : "var(--color-text)",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        {item.id === "insert-device" && <IconInsert />}
                        {item.id === "auto-route" && <IconAutoRoute />}
                        {item.id === "validate" && <IconValidate />}
                        {item.id === "export" && <IconExport />}
                        {item.id === "ws-schematic" && <IconSchematic />}
                        {item.id === "ws-layout" && <IconLayout />}
                        {item.id === "ws-schedule" && <IconSchedule />}
                        {item.id === "ws-rack" && <IconRack />}
                      </span>
                    )}

                    {/* Label */}
                    <span
                      style={{
                        flex: 1,
                        fontSize: 12.5,
                        color: isHighlighted
                          ? "var(--color-text-heading)"
                          : isActionGroup
                          ? "var(--color-text-heading)"
                          : "var(--color-text)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.label}
                    </span>

                    {/* Sublabel (device type) */}
                    {item.sublabel && (
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 9.5,
                          color: "var(--color-text-muted)",
                          flexShrink: 0,
                        }}
                      >
                        {item.sublabel}
                      </span>
                    )}

                    {/* Shortcut chip */}
                    {item.shortcut && (
                      <kbd
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 9.5,
                          color: "var(--color-text-muted)",
                          padding: "1px 5px",
                          border: "1px solid var(--ui-border)",
                          borderRadius: 4,
                          background: "transparent",
                          flexShrink: 0,
                        }}
                      >
                        {item.shortcut}
                      </kbd>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "9px 14px",
            borderTop: "1px solid var(--ui-border)",
          }}
        >
          {(
            [
              ["↑↓", "navigate"],
              ["↵", "select"],
              ["⌘K", "toggle"],
            ] as const
          ).map(([key, label]) => (
            <span
              key={key}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--color-text-muted)",
                marginLeft: key === "⌘K" ? "auto" : undefined,
              }}
            >
              {key} {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * CommandPalette — ⌘K overlay for EasySchematic. The menu button promises that
 * every command lives here, so entries route to real store setters only; the
 * palette owns no behaviour of its own.
 *
 * Self-contained: manages its own open/close state and keyboard listeners.
 * Mount once (no props required); the lead wires it in App.tsx.
 *
 * Toggle rows are labelled with the action they perform ("Hide line jumps"),
 * never with a state colour — the label is the only cue and states the outcome.
 *
 * Two non-obvious wirings:
 *   "Validate schematic"  → writes the RightRail tab key + dispatches a StorageEvent
 *                           so RightRail opens its "validate" tab in this same window
 *   "Export / Reports…"   → the Schedule workspace, which hosts the Cable BOM tab
 *
 * Shortcut chips appear only for keys App.tsx actually binds (the TOOL_DEFS
 * single-key tools) — an unbacked chip is a promise the app cannot keep.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useReactFlow } from "@xyflow/react";
import { useSchematicStore } from "../store";
import type { DeviceNode } from "../types";
import { deviceClassColor } from "../deviceClassColor";
import { useTheme } from "../hooks/useTheme";
import { detailLevelLabel, type DetailLevel } from "../plainLanguage";
import type { LengthUnitMode } from "../lengthFormat";

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

function IconSelect() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 3l6.5 17 2.4-6.9 6.9-2.4L5 3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconConnect() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9.5 14.5l5-5M8 12l-2 2a3.5 3.5 0 0 0 5 5l2-2M16 12l2-2a3.5 3.5 0 0 0-5-5l-2 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconTheme() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
    </svg>
  );
}

function IconZoomIn() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10.5 8v5M8 10.5h5M20 20l-4.7-4.7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconZoomOut() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 10.5h5M20 20l-4.7-4.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconCableId() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 10.5V5a2 2 0 0 1 2-2h5.5L21 13.5 13.5 21 3 10.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="7.5" cy="7.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

function IconLineJumps() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 15h5a3.5 3.5 0 0 0 7 0h8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M10.5 4v16" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IconLiveSignal() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 12h4l3-7 5 14 3-7h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCompact() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 4h16M4 20h16M8 9l4-3 4 3M8 15l4 3 4-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconArtwork() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8.5" cy="9.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function IconDetail() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6h16M4 11h16M4 16h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconRuler() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="1.5"
        y="8"
        width="21"
        height="8"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M6.5 8v3M11 8v4M15.5 8v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Command id → row glyph. Ids absent from the map render no glyph; the dynamic
 * "Go to device" rows carry a signal-colour swatch instead.
 */
const ICON: Record<string, ComponentType> = {
  "tool-select": IconSelect,
  "tool-connect": IconConnect,
  "insert-device": IconInsert,
  "ws-schematic": IconSchematic,
  "ws-layout": IconLayout,
  "ws-schedule": IconSchedule,
  "ws-rack": IconRack,
  "view-theme": IconTheme,
  "view-zoom-in": IconZoomIn,
  "view-zoom-out": IconZoomOut,
  "view-cable-ids": IconCableId,
  "view-line-jumps": IconLineJumps,
  "view-auto-route": IconAutoRoute,
  "view-live-signal": IconLiveSignal,
  "view-compact": IconCompact,
  "view-artwork": IconArtwork,
  "view-detail": IconDetail,
  "view-length-unit": IconRuler,
  "doc-validate": IconValidate,
  "doc-export": IconExport,
};

/** Cycle order for the length-unit command; each label names the destination. */
const LENGTH_UNIT_CYCLE: Record<LengthUnitMode, { next: LengthUnitMode; label: string }> = {
  m: { next: "ft", label: "Show cable lengths in feet" },
  ft: { next: "both", label: "Show cable lengths in metres & feet" },
  both: { next: "m", label: "Show cable lengths in metres" },
};

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
  const autoRoute = useSchematicStore((s) => s.autoRoute);
  const toggleAutoRoute = useSchematicStore((s) => s.toggleAutoRoute);
  const setCanvasViewMode = useSchematicStore((s) => s.setCanvasViewMode);
  const pages = useSchematicStore((s) => s.pages);
  const setActivePage = useSchematicStore((s) => s.setActivePage);
  const addRackPage = useSchematicStore((s) => s.addRackPage);
  const showCableIdLabels = useSchematicStore((s) => s.showCableIdLabels);
  const setShowCableIdLabels = useSchematicStore((s) => s.setShowCableIdLabels);
  const showLineJumps = useSchematicStore((s) => s.showLineJumps);
  const setShowLineJumps = useSchematicStore((s) => s.setShowLineJumps);
  const liveSignal = useSchematicStore((s) => s.liveSignal);
  const setLiveSignal = useSchematicStore((s) => s.setLiveSignal);
  const nodeCompact = useSchematicStore((s) => s.nodeCompact);
  const setNodeCompact = useSchematicStore((s) => s.setNodeCompact);
  const showArtwork = useSchematicStore((s) => s.showArtwork);
  const setShowArtwork = useSchematicStore((s) => s.setShowArtwork);
  const detailLevel = useSchematicStore((s) => s.detailLevel);
  const setDetailLevel = useSchematicStore((s) => s.setDetailLevel);
  const lengthUnitMode = useSchematicStore((s) => s.lengthUnitMode);
  const setLengthUnitMode = useSchematicStore((s) => s.setLengthUnitMode);

  // Zoom lives on the canvas instance (App mounts the palette inside
  // ReactFlowProvider), and the theme class is owned by the useTheme hook.
  const { zoomIn, zoomOut } = useReactFlow();
  const { isDark, toggle: toggleTheme } = useTheme();

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

  const toolItems: PaletteItem[] = [
    {
      id: "tool-select",
      label: "Select tool",
      shortcut: "V",
      onSelect: () => {
        setActiveTool("select");
        close();
      },
    },
    {
      id: "tool-connect",
      label: "Connect tool — join two ports",
      shortcut: "C",
      onSelect: () => {
        setActiveTool("connect");
        close();
      },
    },
    {
      id: "insert-device",
      label: "Insert device…",
      shortcut: "D",
      onSelect: () => {
        setActiveTool("device");
        close();
      },
    },
  ];

  const goToItems: PaletteItem[] = deviceNodes.map((n) => ({
    id: `goto-${n.id}`,
    label: n.data.label,
    sublabel: n.data.deviceType || n.data.category || "",
    swatchColor: deviceClassColor(n.data.ports),
    onSelect: () => {
      selectNode(n.id);
      close();
    },
  }));

  const workspaceItems: PaletteItem[] = [
    {
      id: "ws-schematic",
      label: "Schematic",
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

  const nextDetailLevel: DetailLevel = detailLevel === "plain" ? "technical" : "plain";
  const lengthUnitStep = LENGTH_UNIT_CYCLE[lengthUnitMode];

  const viewItems: PaletteItem[] = [
    {
      id: "view-theme",
      label: isDark ? "Switch to light theme" : "Switch to dark theme",
      onSelect: () => {
        toggleTheme();
        close();
      },
    },
    {
      id: "view-zoom-in",
      label: "Zoom in",
      onSelect: () => {
        zoomIn();
        close();
      },
    },
    {
      id: "view-zoom-out",
      label: "Zoom out",
      onSelect: () => {
        zoomOut();
        close();
      },
    },
    {
      id: "view-cable-ids",
      label: showCableIdLabels ? "Hide cable ID labels" : "Show cable ID labels",
      onSelect: () => {
        setShowCableIdLabels(!showCableIdLabels);
        close();
      },
    },
    {
      id: "view-line-jumps",
      label: showLineJumps ? "Hide line jumps" : "Show line jumps",
      onSelect: () => {
        setShowLineJumps(!showLineJumps);
        close();
      },
    },
    {
      id: "view-auto-route",
      label: autoRoute ? "Turn auto-route off" : "Turn auto-route on",
      onSelect: () => {
        toggleAutoRoute();
        close();
      },
    },
    {
      id: "view-live-signal",
      label: liveSignal ? "Stop live signal animation" : "Animate live signal",
      onSelect: () => {
        setLiveSignal(!liveSignal);
        close();
      },
    },
    {
      id: "view-compact",
      label: nodeCompact ? "Show devices at full size" : "Show devices compact",
      onSelect: () => {
        setNodeCompact(!nodeCompact);
        close();
      },
    },
    {
      id: "view-artwork",
      label: showArtwork ? "Hide device artwork" : "Show device artwork",
      onSelect: () => {
        setShowArtwork(!showArtwork);
        close();
      },
    },
    {
      id: "view-detail",
      label: `Switch to ${detailLevelLabel(nextDetailLevel)}`,
      onSelect: () => {
        setDetailLevel(nextDetailLevel);
        close();
      },
    },
    {
      id: "view-length-unit",
      label: lengthUnitStep.label,
      onSelect: () => {
        setLengthUnitMode(lengthUnitStep.next);
        close();
      },
    },
  ];

  const docItems: PaletteItem[] = [
    {
      id: "doc-validate",
      label: "Validate schematic",
      onSelect: () => {
        openValidateTab();
        close();
      },
    },
    {
      id: "doc-export",
      label: "Export / Reports…",
      // Opens Schedule view which contains Cable BOM | Inventory | Logistics tabs
      onSelect: () => {
        setCanvasViewMode("schedule");
        close();
      },
    },
  ];

  const groups: PaletteGroup[] = [
    { heading: "Tools", items: toolItems },
    { heading: "Go to device", items: goToItems },
    { heading: "Switch workspace", items: workspaceItems },
    { heading: "View", items: viewItems },
    { heading: "Document", items: docItems },
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
          width: 474,
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
                // Device names read as data; every other row is a command.
                const isDeviceGroup = group.heading === "Go to device";
                const Glyph = ICON[item.id];

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
                    ) : Glyph ? (
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
                        <Glyph />
                      </span>
                    ) : null}

                    {/* Label */}
                    <span
                      style={{
                        flex: 1,
                        fontSize: 12.5,
                        color: isHighlighted || !isDeviceGroup
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

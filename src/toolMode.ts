/**
 * Canvas tool model for the left tool rail (step 5 of the Figma-grade redesign).
 *
 * Pure + UI-agnostic: the rail component, the store's `activeTool` state, and the
 * global keyboard shortcuts all share these definitions. The locked single-key
 * hotkeys are V/D/R/C/N (Select/Device/Room/Connect/Note); Pan is mouse/space-hold
 * only (no letter), matching the deep-interview decision (no ⌘K palette).
 */

/** The active canvas interaction tool. */
export type ToolId = "select" | "device" | "room" | "connect" | "note" | "pan" | "object" | "zone";

/** The tool the canvas starts in — direct selection/manipulation. */
export const DEFAULT_TOOL: ToolId = "select";

export interface ToolDef {
  id: ToolId;
  /** Short rail label / tooltip name. */
  label: string;
  /** Single-key shortcut (uppercase display form), or "" when the tool has none. */
  hotkey: string;
  /** Tooltip description of what the tool does. */
  title: string;
  /** When true, the tool is only available in the to-scale Layout view. */
  layoutOnly?: boolean;
}

/**
 * Tools in top-to-bottom rail order: navigation group (Select, Pan) then the
 * creation group (Device, Connect, Room, Note, plus Layout-only Object/Zone).
 */
export const TOOL_DEFS: readonly ToolDef[] = [
  { id: "select", label: "Select", hotkey: "V", title: "Select & move (V)" },
  { id: "pan", label: "Pan", hotkey: "", title: "Pan the canvas (hold Space or middle-drag)" },
  { id: "device", label: "Device", hotkey: "D", title: "Place a device — opens the library (D)" },
  { id: "connect", label: "Connect", hotkey: "C", title: "Connect ports — signal-aware (C)" },
  { id: "room", label: "Room", hotkey: "R", title: "Draw a room (R)" },
  { id: "note", label: "Note", hotkey: "N", title: "Add a note (N)" },
  { id: "object", label: "Object", hotkey: "O", title: "Place a room object — furniture, fixtures (O) · Layout view", layoutOnly: true },
  { id: "zone", label: "Zone", hotkey: "Z", title: "Draw a colour-coded zone (Z) · Layout view", layoutOnly: true },
];

/** Lookup of hotkey letter → tool, built once from TOOL_DEFS (tools with "" excluded). */
const HOTKEY_TO_TOOL: ReadonlyMap<string, ToolId> = new Map(
  TOOL_DEFS.filter((t) => t.hotkey !== "").map((t) => [t.hotkey.toLowerCase(), t.id]),
);

/**
 * Resolve a pressed key to a tool, case-insensitively. Returns undefined for any
 * key that isn't a tool hotkey (including Pan, which has no letter). Callers should
 * still guard against firing while the user is typing in an input/textarea.
 */
export function toolForHotkey(key: string): ToolId | undefined {
  if (!key) return undefined;
  return HOTKEY_TO_TOOL.get(key.toLowerCase());
}

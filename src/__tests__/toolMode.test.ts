import { describe, it, expect } from "vitest";
import {
  TOOL_DEFS,
  DEFAULT_TOOL,
  toolForHotkey,
  type ToolId,
} from "../toolMode";

describe("toolMode", () => {
  it("defines the six tools in rail order", () => {
    expect(TOOL_DEFS.map((t) => t.id)).toEqual([
      "select",
      "device",
      "room",
      "connect",
      "note",
      "pan",
    ]);
  });

  it("defaults to the Select tool", () => {
    expect(DEFAULT_TOOL).toBe<ToolId>("select");
  });

  it("assigns the locked single-key hotkeys V/D/R/C/N", () => {
    const byId = Object.fromEntries(TOOL_DEFS.map((t) => [t.id, t.hotkey]));
    expect(byId.select).toBe("V");
    expect(byId.device).toBe("D");
    expect(byId.room).toBe("R");
    expect(byId.connect).toBe("C");
    expect(byId.note).toBe("N");
  });

  it("leaves Pan without a single-key letter hotkey (mouse/space-hold only)", () => {
    const pan = TOOL_DEFS.find((t) => t.id === "pan");
    expect(pan).toBeDefined();
    expect(pan?.hotkey).toBe("");
  });

  it("gives every tool a non-empty label and title", () => {
    for (const t of TOOL_DEFS) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.title.length).toBeGreaterThan(0);
    }
  });

  it("maps the hotkey letters to tools, case-insensitively", () => {
    expect(toolForHotkey("v")).toBe("select");
    expect(toolForHotkey("V")).toBe("select");
    expect(toolForHotkey("d")).toBe("device");
    expect(toolForHotkey("r")).toBe("room");
    expect(toolForHotkey("c")).toBe("connect");
    expect(toolForHotkey("n")).toBe("note");
    expect(toolForHotkey("N")).toBe("note");
  });

  it("returns undefined for unmapped keys (incl. pan, which has no letter)", () => {
    expect(toolForHotkey("p")).toBeUndefined();
    expect(toolForHotkey("x")).toBeUndefined();
    expect(toolForHotkey("")).toBeUndefined();
    expect(toolForHotkey("1")).toBeUndefined();
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import type { DeviceTemplate } from "../types";

// The store touches localStorage at runtime; provide a minimal shim for the
// node test environment before importing it.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
  key(i: number) { return [...this.store.keys()][i] ?? null; }
  get length() { return this.store.size; }
}
if (!("localStorage" in globalThis)) {
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
}

const { useSchematicStore } = await import("../store");

function template(deviceType: string, label = deviceType): DeviceTemplate {
  return { deviceType, label, ports: [] } as DeviceTemplate;
}

describe("addDevices (bulk placement)", () => {
  beforeEach(() => {
    useSchematicStore.setState({ nodes: [], edges: [], recentTemplates: [] });
  });

  it("places every device in the batch", () => {
    const before = useSchematicStore.getState().nodes.length;
    useSchematicStore.getState().addDevices([
      { template: template("amp"), position: { x: 0, y: 0 } },
      { template: template("amp"), position: { x: 200, y: 0 } },
      { template: template("amp"), position: { x: 400, y: 0 } },
    ]);
    expect(useSchematicStore.getState().nodes.length).toBe(before + 3);
  });

  it("groups the whole batch into a single undo entry", () => {
    const store = useSchematicStore.getState();
    store.addDevices([
      { template: template("mic"), position: { x: 0, y: 0 } },
      { template: template("mic"), position: { x: 200, y: 0 } },
      { template: template("mic"), position: { x: 400, y: 0 } },
    ]);
    expect(useSchematicStore.getState().nodes.length).toBe(3);
    // A single undo should remove all three (one history entry, not three).
    useSchematicStore.getState().undo();
    expect(useSchematicStore.getState().nodes.length).toBe(0);
  });

  it("ignores an empty batch", () => {
    useSchematicStore.getState().addDevices([]);
    expect(useSchematicStore.getState().nodes.length).toBe(0);
  });

  it("records each placed template in recents", () => {
    useSchematicStore.getState().addDevices([
      { template: template("spk", "Speaker"), position: { x: 0, y: 0 } },
    ]);
    expect(useSchematicStore.getState().recentTemplates).toContain("spk");
  });
});

describe("pushRecentTemplate", () => {
  beforeEach(() => {
    useSchematicStore.setState({ recentTemplates: [] });
  });

  it("keeps most-recent first and dedupes", () => {
    const s = useSchematicStore.getState();
    s.pushRecentTemplate("a");
    s.pushRecentTemplate("b");
    s.pushRecentTemplate("a");
    expect(useSchematicStore.getState().recentTemplates).toEqual(["a", "b"]);
  });

  it("caps the list at 12 entries", () => {
    const s = useSchematicStore.getState();
    for (let i = 0; i < 20; i++) s.pushRecentTemplate(`t${i}`);
    const recents = useSchematicStore.getState().recentTemplates;
    expect(recents.length).toBe(12);
    // Newest first → t19 leads, t8 is the oldest still kept.
    expect(recents[0]).toBe("t19");
    expect(recents).not.toContain("t7");
  });

  it("ignores empty keys", () => {
    useSchematicStore.getState().pushRecentTemplate("");
    expect(useSchematicStore.getState().recentTemplates).toEqual([]);
  });
});

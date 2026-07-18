import { describe, it, expect, beforeEach } from "vitest";
import type { DeviceData, SchematicNode } from "../types";

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
const { inventoryKeyFromTemplate } = await import("../inventoryKey");

let nextId = 0;
function deviceNode(data: Partial<DeviceData> & { label: string }): SchematicNode {
  return {
    id: `test-node-${nextId++}`,
    type: "device",
    position: { x: 0, y: 0 },
    data: { deviceType: "custom", ports: [], ...data } as DeviceData,
  } as SchematicNode;
}

describe("syncProjectDevicesToOwned (Add all project devices)", () => {
  beforeEach(() => {
    useSchematicStore.setState({ nodes: [], edges: [], ownedGear: [] });
  });

  it("imports every distinct canvas device with correct counts", () => {
    useSchematicStore.setState({
      nodes: [
        deviceNode({ label: "Amp X", manufacturer: "Lab" }),
        deviceNode({ label: "Amp X", manufacturer: "Lab" }),
        deviceNode({ label: "Mixer Y" }),
      ],
    });
    const changed = useSchematicStore.getState().syncProjectDevicesToOwned();
    expect(changed).toBe(2);
    const owned = useSchematicStore.getState().ownedGear;
    expect(owned).toHaveLength(2);
    const amp = owned.find((o) => o.template.label === "Amp X");
    expect(amp?.quantity).toBe(2);
    expect(amp?.template.manufacturer).toBe("Lab");
    expect(owned.find((o) => o.template.label === "Mixer Y")?.quantity).toBe(1);
  });

  it("is idempotent — re-running changes nothing and never duplicates", () => {
    useSchematicStore.setState({
      nodes: [deviceNode({ label: "Amp X" }), deviceNode({ label: "Amp X" })],
    });
    const store = useSchematicStore.getState();
    expect(store.syncProjectDevicesToOwned()).toBe(1);
    expect(useSchematicStore.getState().syncProjectDevicesToOwned()).toBe(0);
    const owned = useSchematicStore.getState().ownedGear;
    expect(owned).toHaveLength(1);
    expect(owned[0].quantity).toBe(2);
  });

  it("merges by inventory key: raises owned quantity to the canvas count, never lowers", () => {
    useSchematicStore.setState({
      nodes: [
        deviceNode({ label: "Amp X" }),
        deviceNode({ label: "Amp X" }),
        deviceNode({ label: "Amp X" }),
        deviceNode({ label: "Spare Z" }),
      ],
      ownedGear: [
        { template: { deviceType: "custom", label: "Amp X", ports: [] }, quantity: 1 },
        { template: { deviceType: "custom", label: "Spare Z", ports: [] }, quantity: 5 },
      ],
    });
    useSchematicStore.getState().syncProjectDevicesToOwned();
    const owned = useSchematicStore.getState().ownedGear;
    expect(owned).toHaveLength(2);
    expect(owned.find((o) => o.template.label === "Amp X")?.quantity).toBe(3);
    // Owning more than the canvas uses must never be clobbered down.
    expect(owned.find((o) => o.template.label === "Spare Z")?.quantity).toBe(5);
  });

  it("matches renamed instances back to their template via model/baseLabel", () => {
    useSchematicStore.setState({
      nodes: [deviceNode({ label: "FOH Amp 1", baseLabel: "Amp X" })],
      ownedGear: [
        { template: { deviceType: "custom", label: "Amp X", ports: [] }, quantity: 1 },
      ],
    });
    const changed = useSchematicStore.getState().syncProjectDevicesToOwned();
    // Canvas count (1) does not exceed owned (1) → no change, no duplicate row.
    expect(changed).toBe(0);
    expect(useSchematicStore.getState().ownedGear).toHaveLength(1);
  });

  it("synthesized templates keep the inventory key of their source device", () => {
    useSchematicStore.setState({
      nodes: [deviceNode({ label: "Renamed", baseLabel: "Cam A", manufacturer: "PTZ Co" })],
    });
    useSchematicStore.getState().syncProjectDevicesToOwned();
    const owned = useSchematicStore.getState().ownedGear;
    expect(owned).toHaveLength(1);
    expect(inventoryKeyFromTemplate(owned[0].template)).toBe("PTZ Co||Cam A");
  });

  it("returns 0 and leaves owned gear untouched on an empty canvas", () => {
    useSchematicStore.setState({
      ownedGear: [
        { template: { deviceType: "custom", label: "Amp X", ports: [] }, quantity: 2 },
      ],
    });
    expect(useSchematicStore.getState().syncProjectDevicesToOwned()).toBe(0);
    expect(useSchematicStore.getState().ownedGear).toHaveLength(1);
  });
});

describe("quick-create context + owned-checkbox pref", () => {
  it("setPendingQuickCreate stores and clears the context", () => {
    const ctx = { qty: 4, anchor: { x: 16, y: 32 }, placeOnSave: true };
    useSchematicStore.getState().setPendingQuickCreate(ctx);
    expect(useSchematicStore.getState().pendingQuickCreate).toEqual(ctx);
    useSchematicStore.getState().setPendingQuickCreate(null);
    expect(useSchematicStore.getState().pendingQuickCreate).toBeNull();
  });

  it("createAddToOwned defaults ON and persists through the pref writer", () => {
    expect(useSchematicStore.getState().createAddToOwned).toBe(true);
    useSchematicStore.getState().setCreateAddToOwned(false);
    expect(useSchematicStore.getState().createAddToOwned).toBe(false);
    expect(globalThis.localStorage.getItem("easyschematic-create-add-to-owned")).toBe("false");
    useSchematicStore.getState().setCreateAddToOwned(true);
    expect(useSchematicStore.getState().createAddToOwned).toBe(true);
  });
});

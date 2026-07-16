import { describe, test, expect } from "vitest";
import {
  resolveContainerItems,
  itemKey,
  phaseProgress,
  containerProgress,
  setItemChecked,
  buildContainerCsv,
} from "../logistics";
import { TRANSPORT_PHASES } from "../types";
import type { SchematicNode, TransportContainer } from "../types";
import type { PackListData } from "../packList";

// ---------- Fixtures ----------

const nodes = [
  {
    id: "dev1",
    type: "device",
    position: { x: 0, y: 0 },
    data: { label: "Sony Camera", deviceType: "camera", ports: [] },
  },
  {
    id: "dev2",
    type: "device",
    position: { x: 100, y: 0 },
    data: { label: "BMD Switcher", deviceType: "switcher", ports: [] },
  },
] as unknown as SchematicNode[];

// Cable summary row keyed by cableType|signalType|cableLength → "Belden 1694A|SDI|50ft".
const CABLE_KEY = "Belden 1694A|SDI|50ft";
const packData: PackListData = {
  devices: [],
  cables: [],
  summary: [
    {
      cableType: "Belden 1694A",
      signalType: "SDI",
      cableLength: "50ft",
      route: "Within Stage",
      count: 3,
    },
  ],
  accessories: [],
  adapters: [],
  racks: [],
};

/** A container: 1 present device, 1 missing device, 1 present cable. */
function makeContainer(): TransportContainer {
  return {
    id: "c1",
    name: "Case A",
    color: "#ff0000",
    items: [
      { kind: "device", refId: "dev1", qty: 1 },
      { kind: "device", refId: "ghost", qty: 1 },
      { kind: "cable", refId: CABLE_KEY, qty: 2 },
    ],
    checklist: {
      "load-out": {
        "device:dev1": true,
        "cable:Belden 1694A|SDI|50ft": true,
      },
    },
  };
}

// ---------- itemKey ----------

describe("itemKey", () => {
  test("formats as kind:refId", () => {
    // Arrange
    const item = { kind: "device", refId: "dev1", qty: 1 } as const;

    // Act
    const key = itemKey(item);

    // Assert
    expect(key).toBe("device:dev1");
  });

  test("formats cable keys including the pipe-delimited refId", () => {
    expect(itemKey({ kind: "cable", refId: CABLE_KEY, qty: 1 })).toBe(
      `cable:${CABLE_KEY}`,
    );
  });
});

// ---------- resolveContainerItems ----------

describe("resolveContainerItems", () => {
  test("marks present device found:true with live label and type", () => {
    // Arrange
    const container = makeContainer();

    // Act
    const resolved = resolveContainerItems(container, packData, nodes);

    // Assert
    const dev = resolved[0];
    expect(dev.found).toBe(true);
    expect(dev.label).toBe("Sony Camera");
    expect(dev.subLabel).toBe("camera");
  });

  test("marks missing device found:false", () => {
    // Arrange
    const container = makeContainer();

    // Act
    const resolved = resolveContainerItems(container, packData, nodes);

    // Assert
    expect(resolved[1].found).toBe(false);
    expect(resolved[1].label).toBe("Missing device");
  });

  test("resolves a cable row by the shared key strategy and uses its live count as qty", () => {
    // Arrange
    const container = makeContainer();

    // Act
    const resolved = resolveContainerItems(container, packData, nodes);

    // Assert
    const cable = resolved[2];
    expect(cable.found).toBe(true);
    expect(cable.label).toBe("Belden 1694A");
    expect(cable.subLabel).toContain("SDI");
    expect(cable.subLabel).toContain("50ft");
    expect(cable.qty).toBe(3); // re-derived from the live summary row, not the stored 2
  });

  test("marks a cable found:false when no summary row matches", () => {
    // Arrange
    const container: TransportContainer = {
      ...makeContainer(),
      items: [{ kind: "cable", refId: "Nonexistent|HDMI|10ft", qty: 1 }],
    };

    // Act
    const resolved = resolveContainerItems(container, packData, nodes);

    // Assert
    expect(resolved[0].found).toBe(false);
    expect(resolved[0].label).toBe("Missing cable");
  });
});

// ---------- phaseProgress ----------

describe("phaseProgress", () => {
  test("counts checked items against total for a phase with state", () => {
    // Arrange
    const container = makeContainer();

    // Act
    const progress = phaseProgress(container, "load-out");

    // Assert
    expect(progress).toEqual({ checked: 2, total: 3 });
  });

  test("returns zero checked for a phase with no state", () => {
    // Arrange
    const container = makeContainer();

    // Act
    const progress = phaseProgress(container, "repack");

    // Assert
    expect(progress).toEqual({ checked: 0, total: 3 });
  });
});

// ---------- containerProgress ----------

describe("containerProgress", () => {
  test("covers all five phases", () => {
    // Arrange
    const container = makeContainer();

    // Act
    const progress = containerProgress(container);

    // Assert
    expect(Object.keys(progress).sort()).toEqual([...TRANSPORT_PHASES].sort());
    expect(progress["load-out"]).toEqual({ checked: 2, total: 3 });
    expect(progress["setup"]).toEqual({ checked: 0, total: 3 });
  });
});

// ---------- setItemChecked ----------

describe("setItemChecked", () => {
  test("immutably toggles an item without mutating the original", () => {
    // Arrange
    const container = makeContainer();

    // Act
    const next = setItemChecked(container, "setup", "device:dev1", true);

    // Assert
    expect(next).not.toBe(container);
    expect(next.checklist).not.toBe(container.checklist);
    expect(next.checklist["setup"]?.["device:dev1"]).toBe(true);
    // original untouched
    expect(container.checklist["setup"]).toBeUndefined();
  });

  test("can uncheck a previously-checked item", () => {
    // Arrange
    const container = makeContainer();

    // Act
    const next = setItemChecked(container, "load-out", "device:dev1", false);

    // Assert
    expect(next.checklist["load-out"]?.["device:dev1"]).toBe(false);
    expect(container.checklist["load-out"]?.["device:dev1"]).toBe(true);
  });
});

// ---------- buildContainerCsv ----------

describe("buildContainerCsv", () => {
  test("includes qty, labels, type/signal and a column per phase", () => {
    // Arrange
    const container = makeContainer();
    const resolved = resolveContainerItems(container, packData, nodes);

    // Act
    const csv = buildContainerCsv(container, resolved);
    const lines = csv.split("\n");

    // Assert — header has the three fixed columns plus each phase
    expect(lines[0]).toContain("Qty");
    expect(lines[0]).toContain("Item");
    expect(lines[0]).toContain("Type/Signal");
    for (const phase of TRANSPORT_PHASES) {
      expect(lines[0]).toContain(phase);
    }
    // Body contains derived labels and a checkmark for the checked load-out item
    expect(csv).toContain("Sony Camera");
    expect(csv).toContain("Belden 1694A");
    expect(csv).toContain("✓");
  });
});

import { describe, test, expect } from "vitest";
import type { GearUnit } from "../types";
import {
  addUnit,
  updateUnit,
  removeUnit,
  assignUnit,
  unassignUnit,
  clearAssignmentsForNode,
  unitForNode,
  fitDimensions,
  buildGearSuggestions,
} from "../gearInventory";

function makeUnit(over: Partial<GearUnit> = {}): GearUnit {
  return { id: "u-base", model: "X32", ...over };
}

describe("addUnit", () => {
  test("appends a new unit with the supplied id", () => {
    // Arrange
    const units: GearUnit[] = [makeUnit({ id: "u1" })];

    // Act
    const next = addUnit(units, { model: "QL5", manufacturer: "Yamaha" }, "u2");

    // Assert
    expect(next).toHaveLength(2);
    expect(next[1]).toEqual({ id: "u2", model: "QL5", manufacturer: "Yamaha" });
  });

  test("does not mutate the original array", () => {
    // Arrange
    const units: GearUnit[] = [makeUnit({ id: "u1" })];

    // Act
    addUnit(units, { model: "QL5" }, "u2");

    // Assert
    expect(units).toHaveLength(1);
  });
});

describe("updateUnit", () => {
  test("merges the patch into the matching unit", () => {
    // Arrange
    const units: GearUnit[] = [makeUnit({ id: "u1", model: "X32" })];

    // Act
    const next = updateUnit(units, "u1", { model: "X32 Compact", condition: "good" });

    // Assert
    expect(next[0]).toEqual({ id: "u1", model: "X32 Compact", condition: "good" });
  });

  test("never overwrites the id", () => {
    // Arrange
    const units: GearUnit[] = [makeUnit({ id: "u1" })];

    // Act
    const next = updateUnit(units, "u1", { id: "hacked" } as Partial<GearUnit>);

    // Assert
    expect(next[0].id).toBe("u1");
  });

  test("returns the array unchanged for an unknown id", () => {
    // Arrange
    const units: GearUnit[] = [makeUnit({ id: "u1" })];

    // Act
    const next = updateUnit(units, "missing", { model: "Nope" });

    // Assert
    expect(next).toEqual(units);
  });

  test("does not mutate the original unit object", () => {
    // Arrange
    const original = makeUnit({ id: "u1", model: "X32" });
    const units: GearUnit[] = [original];

    // Act
    updateUnit(units, "u1", { model: "Changed" });

    // Assert
    expect(original.model).toBe("X32");
  });
});

describe("removeUnit", () => {
  test("removes the matching unit", () => {
    // Arrange
    const units: GearUnit[] = [makeUnit({ id: "u1" }), makeUnit({ id: "u2" })];

    // Act
    const next = removeUnit(units, "u1");

    // Assert
    expect(next.map((u) => u.id)).toEqual(["u2"]);
  });

  test("returns the array unchanged for an unknown id and does not mutate", () => {
    // Arrange
    const units: GearUnit[] = [makeUnit({ id: "u1" })];

    // Act
    const next = removeUnit(units, "missing");

    // Assert
    expect(next).toEqual(units);
    expect(units).toHaveLength(1);
  });
});

describe("assignUnit", () => {
  test("sets assignedNodeId on the targeted unit", () => {
    // Arrange
    const units: GearUnit[] = [makeUnit({ id: "u1" })];

    // Act
    const next = assignUnit(units, "u1", "node-A");

    // Assert
    expect(next[0].assignedNodeId).toBe("node-A");
  });

  test("a node maps to one unit: assigning a second unit clears the first", () => {
    // Arrange
    const units: GearUnit[] = [
      makeUnit({ id: "u1", assignedNodeId: "node-A" }),
      makeUnit({ id: "u2" }),
    ];

    // Act
    const next = assignUnit(units, "u2", "node-A");

    // Assert
    expect(next.find((u) => u.id === "u1")?.assignedNodeId).toBeUndefined();
    expect(next.find((u) => u.id === "u2")?.assignedNodeId).toBe("node-A");
  });

  test("does not mutate the original units", () => {
    // Arrange
    const first = makeUnit({ id: "u1", assignedNodeId: "node-A" });
    const units: GearUnit[] = [first, makeUnit({ id: "u2" })];

    // Act
    assignUnit(units, "u2", "node-A");

    // Assert
    expect(first.assignedNodeId).toBe("node-A");
  });
});

describe("unassignUnit", () => {
  test("clears assignedNodeId on the targeted unit", () => {
    // Arrange
    const units: GearUnit[] = [makeUnit({ id: "u1", assignedNodeId: "node-A" })];

    // Act
    const next = unassignUnit(units, "u1");

    // Assert
    expect(next[0].assignedNodeId).toBeUndefined();
    expect("assignedNodeId" in next[0]).toBe(false);
  });

  test("returns the array unchanged for an unknown id", () => {
    // Arrange
    const units: GearUnit[] = [makeUnit({ id: "u1", assignedNodeId: "node-A" })];

    // Act
    const next = unassignUnit(units, "missing");

    // Assert
    expect(next).toEqual(units);
  });
});

describe("clearAssignmentsForNode", () => {
  test("clears every unit pointing at the node", () => {
    // Arrange
    const units: GearUnit[] = [
      makeUnit({ id: "u1", assignedNodeId: "node-A" }),
      makeUnit({ id: "u2", assignedNodeId: "node-A" }),
      makeUnit({ id: "u3", assignedNodeId: "node-B" }),
    ];

    // Act
    const next = clearAssignmentsForNode(units, "node-A");

    // Assert
    expect(next.find((u) => u.id === "u1")?.assignedNodeId).toBeUndefined();
    expect(next.find((u) => u.id === "u2")?.assignedNodeId).toBeUndefined();
    expect(next.find((u) => u.id === "u3")?.assignedNodeId).toBe("node-B");
  });

  test("does not mutate the original units", () => {
    // Arrange
    const tied = makeUnit({ id: "u1", assignedNodeId: "node-A" });
    const units: GearUnit[] = [tied];

    // Act
    clearAssignmentsForNode(units, "node-A");

    // Assert
    expect(tied.assignedNodeId).toBe("node-A");
  });
});

describe("unitForNode", () => {
  test("returns the unit assigned to the node", () => {
    // Arrange
    const units: GearUnit[] = [
      makeUnit({ id: "u1", assignedNodeId: "node-A" }),
      makeUnit({ id: "u2", assignedNodeId: "node-B" }),
    ];

    // Act
    const found = unitForNode(units, "node-B");

    // Assert
    expect(found?.id).toBe("u2");
  });

  test("returns undefined when no unit is assigned", () => {
    // Arrange
    const units: GearUnit[] = [makeUnit({ id: "u1" })];

    // Act
    const found = unitForNode(units, "node-Z");

    // Assert
    expect(found).toBeUndefined();
  });
});

describe("fitDimensions", () => {
  test("scales down a landscape image to fit the width bound", () => {
    // Arrange / Act
    const fit = fitDimensions(1600, 900, 800, 600);

    // Assert
    expect(fit).toEqual({ w: 800, h: 450 });
  });

  test("scales down a portrait image to fit the height bound", () => {
    // Arrange / Act
    const fit = fitDimensions(900, 1600, 800, 600);

    // Assert
    expect(fit).toEqual({ w: 338, h: 600 });
  });

  test("does not upscale when the image already fits", () => {
    // Arrange / Act
    const fit = fitDimensions(400, 300, 800, 600);

    // Assert
    expect(fit).toEqual({ w: 400, h: 300 });
  });
});

describe("buildGearSuggestions", () => {
  test("returns sorted, de-duplicated, non-empty manufacturers and models", () => {
    // Arrange
    const units: GearUnit[] = [
      makeUnit({ id: "u1", manufacturer: "Yamaha", model: "QL5" }),
      makeUnit({ id: "u2", manufacturer: "Behringer", model: "X32" }),
      makeUnit({ id: "u3", manufacturer: "Yamaha", model: "QL5" }),
      makeUnit({ id: "u4", manufacturer: "  ", model: "  " }),
      makeUnit({ id: "u5", manufacturer: " Allen & Heath ", model: " SQ-6 " }),
    ];

    // Act
    const { manufacturers, models } = buildGearSuggestions(units);

    // Assert
    expect(manufacturers).toEqual(["Allen & Heath", "Behringer", "Yamaha"]);
    expect(models).toEqual(["QL5", "SQ-6", "X32"]);
  });

  test("returns empty arrays for an empty inventory", () => {
    // Arrange / Act
    const { manufacturers, models } = buildGearSuggestions([]);

    // Assert
    expect(manufacturers).toEqual([]);
    expect(models).toEqual([]);
  });
});

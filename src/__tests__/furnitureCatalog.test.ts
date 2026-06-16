import { describe, it, expect } from "vitest";
import {
  FURNITURE_CATALOG,
  furnitureById,
  type FurnitureCategory,
} from "../furnitureCatalog";

const VALID_CATEGORIES: readonly FurnitureCategory[] = [
  "seating",
  "tables",
  "staging",
  "lighting",
  "av-furniture",
  "miscellaneous",
];

describe("FURNITURE_CATALOG", () => {
  it("ships at least the expected number of entries", () => {
    // Arrange / Act / Assert
    expect(FURNITURE_CATALOG.length).toBeGreaterThanOrEqual(16);
  });

  it("gives every entry a non-empty id, label, and svg", () => {
    // Arrange
    const entries = FURNITURE_CATALOG;

    // Act / Assert
    for (const entry of entries) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.svg.length).toBeGreaterThan(0);
    }
  });

  it("gives every entry positive default width and depth in metres", () => {
    // Arrange
    const entries = FURNITURE_CATALOG;

    // Act / Assert
    for (const entry of entries) {
      expect(entry.defaultWidthM).toBeGreaterThan(0);
      expect(entry.defaultDepthM).toBeGreaterThan(0);
    }
  });

  it("gives every entry a non-empty default colour", () => {
    // Arrange
    const entries = FURNITURE_CATALOG;

    // Act / Assert
    for (const entry of entries) {
      expect(entry.defaultColor.length).toBeGreaterThan(0);
    }
  });

  it("assigns every entry a valid category", () => {
    // Arrange
    const entries = FURNITURE_CATALOG;

    // Act / Assert
    for (const entry of entries) {
      expect(VALID_CATEGORIES).toContain(entry.category);
    }
  });

  it("uses unique ids across all entries", () => {
    // Arrange
    const ids = FURNITURE_CATALOG.map((entry) => entry.id);

    // Act
    const uniqueIds = new Set(ids);

    // Assert
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("uses kebab-case ids", () => {
    // Arrange
    const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

    // Act / Assert
    for (const entry of FURNITURE_CATALOG) {
      expect(entry.id).toMatch(kebabCase);
    }
  });
});

describe("furnitureById", () => {
  it("finds a known entry by its id", () => {
    // Arrange
    const knownId = "conference-table";

    // Act
    const entry = furnitureById(knownId);

    // Assert
    expect(entry).toBeDefined();
    expect(entry?.id).toBe(knownId);
    expect(entry?.label).toBe("Conference Table");
  });

  it("returns undefined for an unknown id", () => {
    // Arrange
    const unknownId = "no-such-furniture";

    // Act
    const entry = furnitureById(unknownId);

    // Assert
    expect(entry).toBeUndefined();
  });
});

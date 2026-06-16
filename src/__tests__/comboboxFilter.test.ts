import { describe, expect, it } from "vitest";
import { filterSuggestions } from "../comboboxFilter";

describe("filterSuggestions", () => {
  it("returns suggestions containing the query as a substring", () => {
    // Arrange
    const suggestions = ["Front of House", "Monitor World", "House Left"];

    // Act
    const result = filterSuggestions("house", suggestions);

    // Assert
    expect(result).toEqual(["House Left", "Front of House"]);
  });

  it("matches case-insensitively", () => {
    // Arrange
    const suggestions = ["Dante", "HDMI", "SDI"];

    // Act
    const result = filterSuggestions("hdmi", suggestions);

    // Assert
    expect(result).toEqual(["HDMI"]);
  });

  it("orders prefix matches before other substring matches", () => {
    // Arrange
    const suggestions = ["a-bar", "bar", "foobar", "barstool"];

    // Act
    const result = filterSuggestions("bar", suggestions);

    // Assert — entries starting with the query come first, in input order
    expect(result).toEqual(["bar", "barstool", "a-bar", "foobar"]);
  });

  it("slices the result to the limit option", () => {
    // Arrange
    const suggestions = ["a1", "a2", "a3", "a4", "a5"];

    // Act
    const result = filterSuggestions("a", suggestions, { limit: 3 });

    // Assert
    expect(result).toEqual(["a1", "a2", "a3"]);
  });

  it("defaults to a limit of 8 results", () => {
    // Arrange
    const suggestions = Array.from({ length: 20 }, (_, i) => `tag${i}`);

    // Act
    const result = filterSuggestions("tag", suggestions);

    // Assert
    expect(result).toHaveLength(8);
  });

  it("returns the first N suggestions for an empty query", () => {
    // Arrange
    const suggestions = ["one", "two", "three", "four"];

    // Act
    const result = filterSuggestions("", suggestions, { limit: 2 });

    // Assert
    expect(result).toEqual(["one", "two"]);
  });

  it("treats a whitespace-only query as empty", () => {
    // Arrange
    const suggestions = ["alpha", "beta"];

    // Act
    const result = filterSuggestions("   ", suggestions);

    // Assert
    expect(result).toEqual(["alpha", "beta"]);
  });

  it("de-duplicates matches case-insensitively, keeping the first occurrence", () => {
    // Arrange
    const suggestions = ["Audio", "audio", "AUDIO", "Audio Rack"];

    // Act
    const result = filterSuggestions("audio", suggestions);

    // Assert
    expect(result).toEqual(["Audio", "Audio Rack"]);
  });

  it("can exclude an exact (case-insensitive) match via excludeExact", () => {
    // Arrange
    const suggestions = ["stage", "stage left", "backstage"];

    // Act
    const result = filterSuggestions("stage", suggestions, { excludeExact: true });

    // Assert
    expect(result).toEqual(["stage left", "backstage"]);
  });

  it("returns an empty array when nothing matches", () => {
    // Arrange
    const suggestions = ["red", "green", "blue"];

    // Act
    const result = filterSuggestions("purple", suggestions);

    // Assert
    expect(result).toEqual([]);
  });

  it("does not mutate the input array", () => {
    // Arrange
    const suggestions = ["b", "a", "c"];
    const snapshot = [...suggestions];

    // Act
    filterSuggestions("a", suggestions);

    // Assert
    expect(suggestions).toEqual(snapshot);
  });

  it("returns an empty array when the limit is zero or negative", () => {
    // Arrange
    const suggestions = ["a", "b"];

    // Act
    const result = filterSuggestions("a", suggestions, { limit: 0 });

    // Assert
    expect(result).toEqual([]);
  });
});

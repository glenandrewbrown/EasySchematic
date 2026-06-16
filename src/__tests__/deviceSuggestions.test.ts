import { describe, it, expect } from "vitest";
import {
  buildDeviceSuggestions,
  type SuggestionNode,
  type SuggestionPools,
} from "../deviceSuggestions";

/** Build a device node with arbitrary data fields. */
function deviceNode(data: Record<string, unknown>): SuggestionNode {
  return { type: "device", data };
}

const EMPTY_POOLS: SuggestionPools = { tagSuggestions: [], fieldSuggestions: {} };

describe("buildDeviceSuggestions", () => {
  it("returns empty axes when there are no nodes and no pools", () => {
    const result = buildDeviceSuggestions([], EMPTY_POOLS);
    expect(result).toEqual({ tags: [], manufacturer: [], category: [], deviceType: [] });
  });

  it("unions node field values with the stored pools per axis", () => {
    const nodes: SuggestionNode[] = [
      deviceNode({ manufacturer: "Sony", category: "video", deviceType: "camera" }),
      deviceNode({ manufacturer: "Genelec", category: "audio", deviceType: "speaker" }),
    ];
    const pools: SuggestionPools = {
      tagSuggestions: [],
      fieldSuggestions: {
        manufacturer: ["Shure"],
        category: ["network"],
        deviceType: ["switch"],
      },
    };
    const result = buildDeviceSuggestions(nodes, pools);
    expect(result.manufacturer).toEqual(["Genelec", "Shure", "Sony"]);
    expect(result.category).toEqual(["audio", "network", "video"]);
    expect(result.deviceType).toEqual(["camera", "speaker", "switch"]);
  });

  it("unions tags from node arrays with the tag pool", () => {
    const nodes: SuggestionNode[] = [
      deviceNode({ tags: ["rental", "FOH"] }),
      deviceNode({ tags: ["audio"] }),
    ];
    const pools: SuggestionPools = { tagSuggestions: ["backup"], fieldSuggestions: {} };
    const result = buildDeviceSuggestions(nodes, pools);
    expect(result.tags).toEqual(["audio", "backup", "FOH", "rental"]);
  });

  it("de-dupes case-insensitively, keeping the first spelling encountered", () => {
    const nodes: SuggestionNode[] = [
      deviceNode({ manufacturer: "Sony", tags: ["Rental"] }),
      deviceNode({ manufacturer: "SONY", tags: ["rental"] }),
    ];
    const pools: SuggestionPools = {
      tagSuggestions: ["RENTAL"],
      fieldSuggestions: { manufacturer: ["sony"] },
    };
    const result = buildDeviceSuggestions(nodes, pools);
    // First-wins: node order precedes pool order, so original casing survives.
    expect(result.manufacturer).toEqual(["Sony"]);
    expect(result.tags).toEqual(["Rental"]);
  });

  it("trims whitespace and drops empty / whitespace-only values", () => {
    const nodes: SuggestionNode[] = [
      deviceNode({ manufacturer: "  Sony  ", category: "   ", tags: ["  rental  ", "  ", ""] }),
    ];
    const pools: SuggestionPools = {
      tagSuggestions: ["", "  "],
      fieldSuggestions: { manufacturer: [""], deviceType: ["  amp  "] },
    };
    const result = buildDeviceSuggestions(nodes, pools);
    expect(result.manufacturer).toEqual(["Sony"]);
    expect(result.category).toEqual([]);
    expect(result.tags).toEqual(["rental"]);
    expect(result.deviceType).toEqual(["amp"]);
  });

  it("sorts each axis alphabetically", () => {
    const nodes: SuggestionNode[] = [
      deviceNode({ category: "zebra" }),
      deviceNode({ category: "alpha" }),
      deviceNode({ category: "mike" }),
    ];
    const result = buildDeviceSuggestions(nodes, EMPTY_POOLS);
    expect(result.category).toEqual(["alpha", "mike", "zebra"]);
  });

  it("ignores non-device nodes and non-string field values", () => {
    const nodes: SuggestionNode[] = [
      { type: "room", data: { manufacturer: "ShouldBeIgnored" } },
      deviceNode({ manufacturer: 42, category: null, deviceType: "amp", tags: [7, "ok", null] }),
    ];
    const result = buildDeviceSuggestions(nodes, EMPTY_POOLS);
    expect(result.manufacturer).toEqual([]);
    expect(result.category).toEqual([]);
    expect(result.deviceType).toEqual(["amp"]);
    expect(result.tags).toEqual(["ok"]);
  });

  it("does not mutate the input nodes or pools", () => {
    const nodes: SuggestionNode[] = [deviceNode({ manufacturer: "Sony", tags: ["rental"] })];
    const nodesSnapshot = JSON.parse(JSON.stringify(nodes));
    const pools: SuggestionPools = {
      tagSuggestions: ["backup"],
      fieldSuggestions: { manufacturer: ["Shure"] },
    };
    const poolsSnapshot = JSON.parse(JSON.stringify(pools));
    buildDeviceSuggestions(nodes, pools);
    expect(nodes).toEqual(nodesSnapshot);
    expect(pools).toEqual(poolsSnapshot);
  });
});

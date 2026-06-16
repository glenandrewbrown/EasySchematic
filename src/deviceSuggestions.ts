// Pure, immutable builder for the per-document autocomplete pools that back the
// Identity-section comboboxes and the device Tag input. Combines the values
// already present on the canvas's device nodes with the persisted suggestion
// pools, so the dropdowns stay useful even after a device is deleted.
//
// Dependency-free and node-testable: the React components that consume it
// (Inspector, DeviceEditor) only pass plain data in.

/** Minimal structural view of a node — avoids importing the full SchematicNode
 *  union (and its churn) just to read four fields. */
export interface SuggestionNode {
  type?: string;
  data?: Record<string, unknown>;
}

/** Persisted suggestion pools, as stored on the SchematicFile / Zustand store. */
export interface SuggestionPools {
  tagSuggestions: string[];
  fieldSuggestions: {
    manufacturer?: string[];
    category?: string[];
    deviceType?: string[];
  };
}

export interface DeviceSuggestions {
  tags: string[];
  manufacturer: string[];
  category: string[];
  deviceType: string[];
}

/** Trim, drop empties, de-dupe case-insensitively (first spelling wins), sort A→Z. */
function normalizePool(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Pull a string field off every device node's data, skipping non-strings. */
function collectField(nodes: readonly SuggestionNode[], field: string): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.type !== "device") continue;
    const value = node.data?.[field];
    if (typeof value === "string") out.push(value);
  }
  return out;
}

/** Pull all string entries from every device node's `tags` array. */
function collectTags(nodes: readonly SuggestionNode[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.type !== "device") continue;
    const tags = node.data?.tags;
    if (!Array.isArray(tags)) continue;
    for (const tag of tags) {
      if (typeof tag === "string") out.push(tag);
    }
  }
  return out;
}

/**
 * Build the four autocomplete pools (tags + manufacturer/category/deviceType)
 * by unioning the values present on device nodes with the persisted pools, then
 * trimming, de-duplicating (case-insensitive), and sorting each axis.
 *
 * Pure and immutable: never mutates `nodes` or `pools`.
 */
export function buildDeviceSuggestions(
  nodes: readonly SuggestionNode[],
  pools: SuggestionPools,
): DeviceSuggestions {
  const fs = pools.fieldSuggestions;
  return {
    tags: normalizePool([...collectTags(nodes), ...pools.tagSuggestions]),
    manufacturer: normalizePool([...collectField(nodes, "manufacturer"), ...(fs.manufacturer ?? [])]),
    category: normalizePool([...collectField(nodes, "category"), ...(fs.category ?? [])]),
    deviceType: normalizePool([...collectField(nodes, "deviceType"), ...(fs.deviceType ?? [])]),
  };
}

/**
 * Logical Photoshop/OmniGraffle-style grouping.
 *
 * Groups are NOT React Flow parent nodes — `parentId` is already the
 * room-membership engine, so a node can only have one spatial parent. Instead
 * each member node carries a `groupId` on its data. Moving / hiding / locking a
 * group operates over the set of nodes that share that groupId. Group hide/lock
 * cascades via resolveNodeVisibility (layerVisibility.ts), which walks groupId.
 *
 * All functions here are pure (no React Flow, no store) and immutable.
 */

interface GroupableNode {
  id: string;
  data?: Record<string, unknown>;
}

/** Read a node's group id, if it belongs to a group. */
export function groupIdOf(node: GroupableNode): string | undefined {
  const g = node.data?.groupId;
  return typeof g === "string" && g.length > 0 ? g : undefined;
}

/**
 * Expand a set of seed node ids to include every node that shares a groupId
 * with any seed. This is what makes dragging one member of a group move the
 * whole group: the drag handler applies its delta to the expanded id set.
 */
export function expandToGroupSiblings(
  nodes: readonly GroupableNode[],
  seedIds: Iterable<string>,
): Set<string> {
  const seeds = seedIds instanceof Set ? seedIds : new Set(seedIds);
  const groupIds = new Set<string>();
  for (const n of nodes) {
    if (seeds.has(n.id)) {
      const g = groupIdOf(n);
      if (g) groupIds.add(g);
    }
  }
  if (groupIds.size === 0) return new Set(seeds);
  const out = new Set(seeds);
  for (const n of nodes) {
    const g = groupIdOf(n);
    if (g && groupIds.has(g)) out.add(n.id);
  }
  return out;
}

/**
 * Immutably set `groupId` on the given ids. Unchanged nodes keep their
 * reference (so React/Zustand can skip re-rendering them).
 */
export function withGroupId<T extends GroupableNode>(
  nodes: readonly T[],
  ids: ReadonlySet<string>,
  groupId: string,
): T[] {
  return nodes.map((n) =>
    ids.has(n.id) ? ({ ...n, data: { ...n.data, groupId } } as T) : n,
  );
}

/** Immutably remove `groupId` from the given ids. */
export function withoutGroupId<T extends GroupableNode>(
  nodes: readonly T[],
  ids: ReadonlySet<string>,
): T[] {
  return nodes.map((n) => {
    if (!ids.has(n.id) || groupIdOf(n) === undefined) return n;
    const data = { ...n.data };
    delete (data as { groupId?: string }).groupId;
    return { ...n, data } as T;
  });
}

/**
 * Pure node paint-order (z-order) reordering for the Layers & Groups tree.
 *
 * Canvas paint order follows the `nodes` array order among nodes sharing a
 * z-index tier (rooms are pinned to zIndex -1, devices default to 0), and React
 * Flow requires every parent node to precede its children. Reordering is therefore
 * restricted to same-parent siblings, which keeps that invariant trivially intact.
 */

export type ZPlace = "before" | "after";

/**
 * Return a new array with `draggedId` moved to just before/after `targetId`.
 * No-op (returns a shallow copy in the original order) when the ids are equal,
 * either is missing, or the two nodes have different parents.
 */
export function reorderNodesByZ<T extends { id: string; parentId?: string }>(
  nodes: readonly T[],
  draggedId: string,
  targetId: string,
  place: ZPlace,
): T[] {
  if (draggedId === targetId) return nodes.slice();

  const dragged = nodes.find((n) => n.id === draggedId);
  const target = nodes.find((n) => n.id === targetId);
  if (!dragged || !target) return nodes.slice();

  // Only siblings (same parent) may be reordered, so a child can never be moved
  // before its parent in the array.
  if ((dragged.parentId ?? undefined) !== (target.parentId ?? undefined)) {
    return nodes.slice();
  }

  const without = nodes.filter((n) => n.id !== draggedId);
  const targetIdx = without.findIndex((n) => n.id === targetId);
  if (targetIdx === -1) return nodes.slice();

  const insertIdx = place === "before" ? targetIdx : targetIdx + 1;
  return [...without.slice(0, insertIdx), dragged, ...without.slice(insertIdx)];
}

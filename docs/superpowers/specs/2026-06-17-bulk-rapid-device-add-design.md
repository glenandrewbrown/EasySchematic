# Bulk / Rapid Device Add — Design

**Date:** 2026-06-17
**Status:** Approved, ready for implementation
**Branch:** feat/venue-cad-and-figma-redesign

## Problem

Adding devices is one-at-a-time: double-click canvas → `QuickAddDevice` spotlight →
search → Enter places **one** device → spotlight closes → repeat. Building a rack or
importing a gear list is slow. We want a super-fast add workflow.

## Approach

Extend the existing `QuickAddDevice` spotlight (entry point unchanged: double-click
canvas or double-click a room). The spotlight gains four powers; no new UI to learn.

## Components

### 1. Store

- **`addDevices(items: { template: DeviceTemplate; position: { x: number; y: number } }[])`**
  — places N devices in **one** undo entry. Current `addDevice` pushes one undo per
  call, which is wrong for batches. `addDevice` stays for the single-place path
  (can be reimplemented as `addDevices([{template, position}])` if clean).
- **`recentTemplates: string[]`** (cap 12, most-recent-first) — persisted in-file,
  mirroring `favoriteTemplates` exactly (optional field, `?? []` on load → **no schema
  bump**). Updated on every successful place. New action `pushRecentTemplate(key)`.

### 2. Layout helper — `src/quickAddLayout.ts` (pure, unit-tested)

- `deviceFootprint(template)` → `{ w, h }` (extract the existing inline math from
  `QuickAddDevice.placeDevice`).
- `gridPositions(anchor, footprint, count, opts?)` → `{ x, y }[]` — row that wraps to a
  new line after `maxCols` (~5), grid-snapped (`GRID_SIZE`), spaced by footprint + gap.
- `parseQuantity(query)` → `{ count, rest }` — handles `8x JBL`, `8 JBL`, `JBL x8`,
  defaulting to `count: 1` when no count present. Conservative: only treat a leading/
  trailing integer token as a count.
- `parseListLine(line)` → `{ count, query }` — `3x Foo`, `3 Foo`, `3* Foo`, or bare `Foo`.

### 3. Spotlight behaviors (`QuickAddDevice.tsx`)

- **Rapid-fire (stay open):** pinned toggle; also Shift+Enter places-and-keeps-open.
  After placing, anchor advances one grid cell via `gridPositions`, search clears, input
  refocuses. Footer shows an "N added" counter. Esc finishes.
- **Quantity:** `parseQuantity` on the active query; a small qty stepper next to the
  input mirrors/overrides it. Enter drops N at once via `addDevices` (one batch / one undo).
- **Multi-line paste → list mode:** detected when the input value contains newlines.
  Switches to a preview: each line `parseListLine` → `scoreTemplate` best match. Preview
  shows `matched label · qty`, unmatched lines flagged. "Place all" places everything as
  one `addDevices` batch laid out by `gridPositions`.
- **Recents / favorites row:** when the query is empty, a compact chip row of recents +
  favorites at the top for one-click re-add.

## Data flow

```
input query ──parseQuantity──> {count, rest} ──scoreTemplate──> template
                                                     │
multi-line input ──split──> lines ──parseListLine──> [{count, query}] ──scoreTemplate──> [matches]
                                                     │
                                          gridPositions(anchor, footprint, totalCount)
                                                     │
                                          addDevices([{template, position}...])  // 1 undo
                                                     │
                                          pushRecentTemplate(key) for each
```

## Error handling

- List mode: unmatched lines are shown but skipped (never silently dropped — flagged in
  preview). Empty list / all-unmatched → "Place all" disabled.
- `parseQuantity`: ignore absurd counts (clamp to a sane max, e.g. 100) to avoid
  accidental flooding from a stray big number.
- Batch place still reparents into the room under the anchor (existing single-place does
  this); apply per-device reparent after the batch.

## Testing

- `src/__tests__/quickAddLayout.test.ts`: `deviceFootprint`, `gridPositions` (wrap,
  snap, spacing), `parseQuantity` (all forms + no-count default + clamp), `parseListLine`.
- Store test: `addDevices` produces one undo entry for N devices; `recentTemplates`
  caps at 12 and is most-recent-first.
- Node-env only (repo convention: no jsdom; assert logic, not DOM).

## Scope / deferred

- DEFERRED: drag-to-define a placement region; saving a multi-device "kit" preset.
- Recents stored per-file (consistent with favorites).
- List mode auto-detected by newlines (no separate mode toggle).

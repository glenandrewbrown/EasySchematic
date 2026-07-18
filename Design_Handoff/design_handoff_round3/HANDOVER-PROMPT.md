# Handover prompt — paste into the local Claude Code session

---

Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to import this project:
https://claude.ai/design/p/b8df2e25-f0ce-4d0c-8e6a-5ce96a928892?file=design_handoff_round3%2FRound+3+Design+Package.dc.html

**Import the whole `design_handoff_round3/` folder, then read, in order:**
1. `README.md` — scope + locked decisions (OS-follow theme · per-workspace accents stay · idle port glow = connector-type colour)
2. `RED-LINES.md` — P0 requirements with exact file:line targets in this repo
3. `GAP-AUDIT.md` — node-anatomy deltas (§R5) + cleanup (§R6)
4. `PATCH-PLAN-2.md` — do the work in its Phase A→E order; every phase must ship a working app
5. `Round 3 Design Package.dc.html` — **the visual spec.** Open it in a browser and keep it side-by-side; boards are referenced by id (1a–5g) from the docs. `feedback/*.png` are the original annotated screenshots.

**This is NOT a reskin.** The following are functional/backend features — implement them fully, not just their looks:

- **A1 · Signal-flow direction** (`OffsetEdge.tsx:970–1040`): replace the chord-axis gradient band with a path-following dash march per board 2d; verify `flowDir` end-to-end (both drag directions, collapsed bidir, passthrough). Band always exits the OUTPUT port.
- **A2 · Create-from-search** (`QuickAddDevice.tsx:556`, `DeviceCreatorPicker.tsx:159`): `+ Create "{query}"` rows, prefilled creator, place-on-save, per-row Create chips in the paste list (boards 4a/4b).
- **A3 · Owned-list registration** (board 4c): new store/behavior — creator footer "Also add to My Devices" checkbox (default ON, remembered per user); Insert drawer ▸ My Devices "Add all project devices (N)" bulk sync — dedupe by inventory key, merge quantities, never duplicate; owned status must feed Schedule ▸ Items source chips + gear inventory. **Created/placed items must appear in a list immediately.**
- **B · Artwork system** (boards 3a–3c): deprecate `data.icon` emoji → `artworkAssetId` (symbol id or uploaded SVG) with load-time migration table; wire `SymbolPickerDialog` into the Device Editor (replaces the emoji strip at `DeviceEditor.tsx:1182`); class→default-symbol map beside `deviceClassColor.ts`; expand `Design_Handoff/svg-library/` with video/lighting/compute-control/power sets (~40, license-clean via `_build` pipeline) and regenerate; same asset renders in node header chip, library/quick-add rows, Inspector hero, Plan footprint. Emoji ban: zero emoji codepoints in app chrome.
- **C · Node & connector anatomy** (boards 2a–2c, GAP-AUDIT §R5): class-tinted header (`color-mix({classColor} 14%, raised)`), left-aligned identity with artwork chip, **Handle = the single 9px edge indicator** (delete inner swatches + grey rings) with uniform 20px row pitch, layer band inset 1.5px inside the border, badge clamping, content-fit width before truncation. **Tile tier = artwork + name + ONE aggregate in / ONE aggregate out handle concatenating all of that side's edges** (real handle/graph work — anchors must not drift; keep `headerBandHeight()` in sync). Glow keyframes re-anchored to the edge indicator, hue = the port's signal colour.
- **C2 · Cable↔port anchoring (critical, Glen):** every cable terminates at its port indicator's center — one distinct anchor per port at every tier/zoom; adjacent-port runs must never be ambiguous. Screenshot-diff wire anchors before/after.
- **C3 · Custom colours** (boards 1b/5c): every LAYPAL swatch row (inspector, context menu, layers, sheet) ends with a ＋ chip → native OS colour picker (`input[type=color]`); picked colours persist in a per-document recent-colours row.
- **D · Adaptive layout — the biggest item** (boards 1a–1g): DELETE `MobileGate.tsx`. Implement the three width tiers via one `useLayoutTier()` hook (1140/768): tablet = overlay drawers + minimised rail + dialog caps + schedule h-scroll; phone = 48px top bar with ⋯ overflow, bottom workspace tab bar (safe-area padded), FAB tool cluster, inspector/layers as a 3-detent bottom sheet, full-screen editor sheets, tap-tap connect reusing the Connect-tool path, pinch/two-finger pan, long-press context menus, ≥44px effective targets, `viewport-fit=cover`. Nothing feature-gated — everything reachable at every tier.
- **E · Cleanup + preferences**: remove Inter `@font-face` + TTFs; **UI font preference** (board 5g: Jost default / IBM Plex Sans / Public Sans / System — swaps `--font-ui` only, mono stays Plex, self-hosted woff2, persisted in `easyschematic.ui.v1`); final emoji grep.

**Rules of engagement**
- Don't touch the routing engine (`src/routing/*`, `edgeRouter.ts`, worker), data migrations beyond those specified, print/DXF/PDF generators, or device library data.
- Keep existing tests green; add tests for new store logic (owned-list merge, artwork migration, keymap/units already covered).
- Acceptance criteria live in RED-LINES.md and PATCH-PLAN-2.md per phase — **demonstrate each with unannotated captures of the exact interaction named** (e.g. a 3-turn run flowing output→input through every leg; phone walkthrough at 390×844: place → tap-tap connect → edit in sheet → read BOM). Do not self-certify with annotated claims; capture what the criteria name.
- When a board and prose disagree, the board wins; when the board and repo reality collide, say so instead of improvising.

---

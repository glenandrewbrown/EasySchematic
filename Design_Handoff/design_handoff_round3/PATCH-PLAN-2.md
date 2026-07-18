# Patch Plan 2 — Round-3 fixes

Order chosen so the highest-visibility bugs land first and each phase ships a working app. All references: `RED-LINES.md` (R1–R4), `GAP-AUDIT.md` (R5–R6).

## Phase A — Flow direction + create-from-search (1–2 days) · R1, R4
**Files:** `OffsetEdge.tsx`, `liveSignal.css`, `QuickAddDevice.tsx`, `DeviceCreatorPicker.tsx`, `DeviceSwapDialog.tsx`.
1. Replace gradient band with dash-march overlay per R1 spec; keyframes in `liveSignal.css`; verify `flowDir` on drag-both-ways, bidir, passthrough.
2. `+ Create "{query}"` rows + prefilled creator + place-on-save per R4; per-row Create chips in paste list; "Also add to My Devices" default-on checkbox + "Add all project devices" bulk sync (boards 4a/4c).
**Accept:** R1 + R4 acceptance lists, plus: no routing geometry, marker, or hit-area regressions (existing e2e stays green).

## Phase B — Artwork system (3–4 days) · R3
**Files:** `DeviceEditor.tsx`, `DeviceNode.tsx`, `Inspector.tsx`, `QuickAddDevice.tsx`, `SymbolPickerDialog.tsx`, `types.ts` + migration, `deviceClassColor.ts` (class→symbol map), `Design_Handoff/svg-library/` + `scripts/generate-symbol-library.mjs`.
1. `artworkId` model + emoji→symbol migration; Artwork row in Device Editor → SymbolPickerDialog (search/tabs/upload/none).
2. Header icon chip (tinted SVG, 16/24px) + class-default fallback; thumbnails in QuickAdd/Insert rows; Inspector artwork row.
3. Library expansion: video / lighting / compute-control / power sets (~40 symbols) via existing build pipeline; regenerate; new category tabs.
4. Emoji-ban grep across `src/`.
**Accept:** R3 acceptance list.

## Phase C — Node anatomy (2–3 days) · R5
**Files:** `DeviceNode.tsx`, `deviceNodeMotion.css`, `auxiliaryData.ts` (keep `headerBandHeight` in sync — snap/height estimates depend on it).
1. Class-tinted header (14% over raised), left-aligned identity (artwork chip · name · meta line), status dot in header.
2. Single-glyph edge connectors (Handle = indicator; filled/hollow/violet, signal-coloured); delete inner swatches; port anchors must not drift (anchors derive from the same row math).
3. Content-fit width vs label truncation; badge clamping; layer band inset 1.5px inside the class border (board 2a); Tile tier = artwork + name + single aggregate in/out connectors (board 2c); glow = connector-type colour (board 2b).
4. LAYPAL colour rows everywhere gain a ＋ custom chip → native OS colour picker, with per-document recent colours (boards 1b/5c).
**Accept:** R5 acceptance; wire anchors pixel-identical before/after (screenshot diff on demo doc); `snapUtils` height estimates still match measured nodes.

## Phase D — Adaptive layout (5–7 days) · R2
**Files:** delete `MobileGate.tsx`; `App.tsx`, `EditorTopBar.tsx`, `ToolRail.tsx`, `CanvasBottomBar.tsx`, `RightRail.tsx`/`Inspector.tsx` (sheet mode), `ScheduleView.tsx`, dialog shells, `index.html` (viewport-fit).
1. Tier B (tablet) first: rail auto-minimise, drawer overlay, dialog caps, schedule scroll.
2. Tier C (phone): 48px top bar + overflow menu, bottom workspace tabs, FAB tool cluster, inspector bottom sheet w/ detents, full-screen editors, view sheet.
3. Touch: pinch/two-finger pan, tap-tap connect, long-press context, 44px targets, safe areas.
**Accept:** R2 acceptance matrix at 390×844 / 768×1024 / 1024×768 / 1440×900.

## Phase E — Cleanup + decisions (0.5 day) · R6
Inter removal; **UI font preference** (Jost default / IBM Plex Sans / Public Sans / System — board 5g, swaps `--font-ui` only, persisted); theme-default + per-workspace-accent + glow-scope decisions applied as Glen rules; final emoji grep; refresh `feature-captures/` with honest, unannotated proof shots per acceptance items.

**Total:** ~2–3 weeks single engineer. **Definition of done:** every R1–R5 acceptance demonstrated with a capture; v7 side-by-side at 1440×900 for node/chrome; phone walkthrough video (place → connect → inspect → BOM) at 390×844.

# Gap Audit — claims vs reality, and v7 fidelity deltas

Audited 2026-07-17 against root `src/` + Glen's screenshots + `uploads/feature-captures/*` (Claude Code's own annotated captures of v0.48).

## 1 · Claim audit (`feature-captures/INDEX.md`)

| Claim | Verdict | Notes |
|---|---|---|
| Slate × Carbon tokens | **Mostly true** | `theme.css` carries the v4 values (light `#e7ebf1`/dark `#1a212d` ground, azure accent, coral = attention-only, Plex Mono + Jost vars). |
| Jost + IBM Plex Mono | **True, with debris** | `index.css:56` sets Jost; but Inter `@font-face` + `/fonts/Inter-*.ttf` still ship (`index.css:24–36`) — dead weight, remove. |
| One top bar, ⌘K, persona pill, tool rail, bottom bar, rulers, right rail, layers, minimap, Insert drawer, Schedule workspace | **Present** | Confirmed in captures + component tree (`EditorTopBar`, `CommandPalette`, `ToolRail`, `CanvasBottomBar`, `CanvasRuler`, `RightRail`, `LayersPanel`, `ScheduleView`, `InsertPanel`, `QuickAddDevice`). Fine-grain fidelity not re-audited this round. |
| "Currents cable glow / live-signal band flowing output → input" | **False as shipped** | Band geometry + sign are wrong — see `RED-LINES.md §R1`. |
| Dark theme "token-driven navy variant" | **True** | `.dark` block = Slate dark values. |
| Measure tool, rack drag-and-drop, reports | **Not audited** | Take captures 05/08/09 at face value until exercised. |
| "Fully implemented the design" | **False** | R1–R5 below/in RED-LINES are user-visible misses. |

## 2 · R5 — Device-node anatomy deltas (P1)

Evidence: `feedback/05-node-closeup-kii-three.png`, `feedback/06-node-closeup-kii-control.png` vs v7 node spec (round-2 pack, Phase 5).

**a) Header band isn't class-tinted.** `DeviceNode.tsx:683–700` deliberately keeps the header `--color-surface-raised` (comment: tinting "made the card read washed-out"). That failure came from tinting with the **block/header colour**; v7 tints with the **class colour at 14% over raised**: `color-mix(in srgb, {classColor} 14%, var(--color-surface-raised))`. Body wash (7% over surface) is already right — header must match it.

**b) Identity is centered; v7 is left-aligned.** Current: emoji + name centered, mono category centered below (`renderHeaderBand`). v7: artwork chip left · name (wraps, never truncates) · meta line (category · layer chip) beneath, left-aligned; status dot right. Rework alongside the R3 artwork chip.

**c) Double-encoded port connectors.** Each port shows an outer grey-ringed Handle **plus** an inner square swatch (`DeviceNode.tsx:419–452, 465`). v7 has **one** glyph: a 9px indicator sitting on the node edge which IS the handle — filled = wired, 1.5px hollow ring = open, violet ring = virtual, always in the resolved signal colour. Remove the inner swatches; restyle the Handle itself. The grey rings are what makes nodes read noisy in the closeups.

**d) Port-label truncation.** "Network …" ellipsizes into meaninglessness. v7: node width is content-fit 132–330px — widen to the longest label before truncating; at the cap, middle-truncate with a full-name tooltip.

**e) Issue badge placement.** The gold dot renders at the outer top-right corner, visually detached/overlapping the border (closeup 05). Clamp badges inside node bounds (≥6px inset), never straddling the radius.

**f) Idle port glow — DECIDED (Glen, 07-17): keep it; it means connector type.** The halo hue must always equal the port's resolved signal colour (never accent/white). Wired ports pulse (2s, Live-signal gated, reduced-motion off); open ports glow only while the Connect tool is armed. Re-anchor `deviceNodeSwatchGlow` to the edge connector once the inner swatches are deleted. Visual spec: design package board 2b.

**Acceptance for R5:** v7 prototype and app side-by-side at 100% zoom, same demo device: header tint, left-aligned identity w/ artwork chip, single-glyph edge connectors, no stray badge, "Network Out" fully legible.

## 3 · R6 — Misc / decisions (P2)

| Item | Detail | Action |
|---|---|---|
| Inter fonts | `index.css:24–36` + `public/fonts/Inter-*.ttf` unused | Delete faces + files; verify no `font-family: Inter` remains |
| Default theme | Follows OS `prefers-color-scheme` (`useTheme.ts`) | **DECIDED (Glen, 07-17): keep OS-follow**; manual toggle persists |
| Per-workspace accent hues | `theme.css:167–176` — azure/teal/amber/violet personas, attribute-scoped | **DECIDED (Glen, 07-17): keep.** Light: `#1664c8 #0d7a6a #915f10 #5b3fc4` · Dark: `#6fb8ff #35c8b2 #e6b354 #b49cf6` (design package board 5b) |
| Emoji in chrome | Residual glyphs beyond R3 scope | Covered by R3 step 6 grep |
| Round-2 phases 5–7 fine detail | Mismatch popover, connect chip, connection inspector, tiers/batching | Not re-audited this round — re-verify against v7 after R5 lands |

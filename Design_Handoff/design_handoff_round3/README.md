# Design Handoff — Round 3 (post-implementation review)

**Date:** 2026-07-17 · **Reviewer:** design (v7 prototype author) + Glen (red-line screenshots)
**Target repo:** the mounted `EasySchematic/` working copy — audit is against **root `src/`** (the post-merge fork actually running as v0.48), NOT `EasySchematic-Public-Origin/`.

## Verdict on "fully implemented"

Not true — but not zero either. The round-2 structural work largely landed (single top bar, ⌘K, persona pill, tool rail, bottom bar, rulers, right rail + layers, Schedule workspace, Slate × Carbon token values in `theme.css`, Jost + IBM Plex Mono). What remains broken or missing is exactly what a user sees first:

1. **Signal-flow animation runs the wrong way** (geometry bug, not a tuning issue) — `RED-LINES.md §R1`
2. **A "desktop only" gate instead of an adaptive layout** — `§R2`
3. **Emoji as device icons** — the artwork/SVG gallery that already ships in this repo isn't wired to device identity — `§R3`
4. **Search dead-ends** ("No matching devices") with no create path — `§R4`
5. **Device-node anatomy deviates from v7** (header, connectors, truncation) — `GAP-AUDIT.md §R5`

## Contents

| File | What it is |
|---|---|
| `HANDOVER-PROMPT.md` | The prompt to paste into the local Claude Code session (MCP import + full feature list + rules) |
| `Round 3 Design Package.dc.html` | **The visual spec** — hi-fi boards for every item below: responsive system (1a–1g), node & connector anatomy incl. flow-direction diagram (2a–2d), artwork system (3a–3c), search→create (4a–4b), full design-system reference (5a–5f). Board ids are referenced from the other docs. |
| `RED-LINES.md` | Glen's 6 annotated screenshots turned into precise, code-cited requirements (P0) |
| `GAP-AUDIT.md` | Claim-vs-reality audit of `feature-captures/INDEX.md` + v7 fidelity deltas (P1–P2) |
| `PATCH-PLAN-2.md` | Phased fix plan with file targets and acceptance criteria |
| `feedback/*.png` | The 6 red-line screenshots, renamed to match §R numbers |

## Decisions (Glen, 07-17) — already folded into the docs
1. Theme default **follows the OS**; manual toggle persists.
2. **Per-workspace accents stay** (azure / teal / amber / violet).
3. **Idle port glow stays and means connector type** — halo hue = the port's signal colour (board 2b).

## How to work

- Fix in `PATCH-PLAN-2.md` phase order; every phase ships a working app.
- The v7 prototype (`EasySchematic - Slate x Carbon (real UI) v7.dc.html`, in the design project; copy in repo `Temp/design_handoff_v7_parity/`) is still the visual spec — open side-by-side at 1440×900.
- Round-2 pack (`Temp/design_handoff_v7_parity/PATCH-PLAN.md`) remains valid for anything it specs that round 3 doesn't re-open; §0 tokens/motion values there are canonical.
- Don't self-certify with annotated screenshots again: acceptance criteria here name the exact interaction to demonstrate (e.g. "a 3-turn run flows output→input through every leg"). Capture those, unannotated.

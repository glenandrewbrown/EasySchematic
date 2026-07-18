# R2 UI Design Brief — for claude.design

**Date:** 2026-07-18
**Companion to:** `2026-07-18-r2-trinnov-channel-model-design.md` (the data-model spec — read it for behaviour; this brief is for the visuals).
**Audience:** claude.design, producing production-ready component designs (light + dark) that a developer then implements in the existing React 19 + Tailwind v4 codebase.

---

## 0. How to use this brief

Design **each component below as its own screen/frame**, in **both light and dark themes**, showing **every listed state**. Use the exact design tokens in §2 — do not invent colours, fonts, or radii. The output must look native to EasySchematic (an "engineering instrument", not a consumer app). Where a component extends an existing one (e.g. the device node), match the current anatomy and only add what's described.

Deliver, per component: the default frame, each state, and a short redline note for any spacing/size that isn't obvious from the tokens.

---

## 1. Product context

**EasySchematic** is a browser + desktop tool for drawing professional AV signal-flow schematics (think studios, venues, broadcast). Users are audio/AV engineers with a high bar — precision and legibility matter more than flair.

**Terminology (strict — user-facing text only):** Device (not node), Connection/Cable (not edge), Port (not handle), Channel, Connector, Bus. Never expose "node/edge/handle".

**Aesthetic:** deep-navy "Blueprint" instrument. Dense but calm. Monospace for anything numeric or ID-like (channel counts, serials, pin numbers, IDs). Colour is **data**, not decoration (see §2.3) — never colour something just to make it pretty.

---

## 2. Design system (MUST match)

### 2.1 Core tokens

| Token | Light | Dark |
|-------|-------|------|
| `--color-bg` (app/canvas) | `#e7ebf1` | `#1a212d` |
| `--color-surface` (panels/cards/nodes) | `#ffffff` | `#3a4659` |
| `--color-surface-raised` (node header, active seg) | `#ffffff` | `#46556a` |
| `--color-surface-hover` | `#eef1f6` | `#232c38` |
| `--color-border` (strong, node/content) | `#9aa4b2` | `#76859a` |
| `--color-text` (body) | `#343c47` | `#e8edf4` |
| `--color-text-heading` (titles/values) | `#11151b` | `#f9fbfd` |
| `--color-text-muted` (labels/meta) | `#586273` | `#b6c0cd` |
| `--color-accent` (azure intent) | `#1664c8` | `#6fb8ff` |
| `--color-accent-soft` | `rgba(22,100,200,.10)` | `rgba(111,184,255,.16)` |
| `--color-success` | `#188a64` | `#54d6a6` |
| `--color-warning` | `#8a5e12` | `#eac06a` |
| `--color-error` (Carbon coral — attention accent) | `#d6453a` | `#ff8a7e` |

Radii: `--ui-radius-sm 6px`, `--ui-radius 8px`, `--ui-radius-lg 12px`. Menu/overlay shadow: soft, large, low-opacity (see `--ui-shadow-menu`; dark = `0 24px 60px -28px rgba(0,0,0,.66)`).

**Per-workspace accent** (the `--color-accent` above is overridden by workspace): Schematic = azure/blue, Plan = teal, Schedule = amber, Rack = violet. R2 lives in the **Schematic** workspace → azure accent. Design to the azure accent but keep accent usage token-driven.

### 2.2 Typography
- **UI font:** Jost (default), self-hosted. Headings/labels/buttons.
- **Mono font:** IBM Plex Mono — **owns all numerics, IDs, channel counts, pin numbers, serials.** Any `8ch`, `pt.24`, `ain1`, `DB25`, matrix coordinates → mono.
- Sizes in the app run tight: 13–13.5px body, 12–12.5px controls, 10.5–11px meta/uppercase labels (letter-spacing ~.08–.13em, uppercase, muted).

### 2.3 Signal colour = data (critical)
Signal type drives colour everywhere a signal is shown (port connector dot, cable, channel). 8 brand-anchored families, ~70 interpolated types. Anchors: **AES, Analog, Dante, USB, SDI, HDMI, Ethernet, Power.** For this brief use these representative hues (the real values come from `signalFamilies.ts` at build time — designer may approximate):
- Analog audio → warm gold/amber
- AES / digital audio → violet
- Ethernet/Dante → green
- Video (SDI/HDMI) → blue/cyan
- Power → coral/red
A **connector dot** is always drawn in its signal colour. A **bus** uses the violet/AES family tint. Never recolour a signal arbitrarily.

### 2.4 Existing anatomy to harmonize with
- **Device node:** class-tinted header (`color-mix(classColor 14%, surface-raised)`), left-aligned identity (artwork chip · wrapping name · `CATEGORY · layer` mono-caps meta · status dot). Body = port rows on a **16px vertical grid**. **The connector IS a single 9px dot** = the port's edge connector: filled = wired, 1.5px hollow ring = open, violet ring = virtual, soft halo = multi-connect — always in the port's signal colour. Node width content-fits 144→330px. Ports now sit **just inside the card rim** (recent change). Respect all of this — R2 extends the row, it doesn't restyle the node.
- **Cables (OffsetEdge):** orthogonal routed strand in the signal colour; optional animated dash "live signal" overlay.
- **Secondary surfaces** (DeviceEditor, Reports, Preferences) are full-screen overlays with a consistent shell: header (title + ✕), body, footer (Cancel / primary azure button). New full-screen tools (matrix) use this same shell.
- **Right rail** hosts the Inspector (accordions) + docked Layers.

### 2.5 Motion & a11y
- Subtle, fast, purposeful. All motion **reduced-motion gated**. Hover/active states use `--color-surface-hover` / accent-soft, not big transforms.
- 44px min touch targets on touch; 9px dot gets a 44px invisible hit area on touch (already handled).
- Both themes must pass AA contrast. Coral (`--color-error`) is the reserved attention accent — use it sparingly (destructive, broken normal, over-capacity warnings).

---

## 3. Components

For each: **Purpose · Where it lives · Anatomy · States · Interactions · Data shown · Acceptance.**

---

### C1 — Multi-channel port row + connector label (DeviceNode body)
**Purpose:** show a channel that is exposed on one or more physical connectors, with its connector type always labelled.
**Where:** inside a device node's body, one row per channel, on the 16px grid.
**Anatomy:**
- The single 9px connector dot at the card rim (signal colour), as today.
- Channel label (Jost, `--color-text`), e.g. `Analog In 1`.
- **Connector sublabel** (mono, muted, small): `· XLR`. When a channel has **multiple alternate connectors**, show a compact chip cluster instead: `XLR` `DB25·1` — the active/wired one lit in the signal colour, the alternates muted; a wired-elsewhere sibling shows a subtle "occupied" lock.
- Direction stays as today (in on left, out on right; passthrough/bidirectional variants).
**States:** open · wired (dot filled) · **occupied-by-sibling** (this connector locked because its channel is wired via an alternate — muted + tiny lock) · virtual/bus · multi-connect halo · hover · selected (for C2 multi-select).
**Interactions:** hover a connector chip → tooltip with full connector + channel detail; click (in editor) selects the row.
**Data:** channel label, signal type (→ dot colour), connector type(s), channel count if the connector is a bundle (`DB25 · 8ch` as the sublabel on a bundle connector).
**Acceptance:** row height stays on the 16px grid; a 1:1 simple device is visually unchanged except the new `· XLR` sublabel; a shared-connector channel reads clearly as "same channel, two jacks".

---

### C2 — Channel / connector editor + multi-select bulk-edit (DeviceEditor)
**Purpose:** author channels, connectors, and the carries-mapping; edit many ports at once.
**Where:** the existing full-screen DeviceEditor (3-column port builder). This is a new/expanded editing surface within it.
**Anatomy:**
- A list of **channels** (label, signal type, direction, group) and a list of **connectors** (label, type, role physical/bus, and a **carries** multi-select mapping channels → this connector).
- **Multi-select:** rows are selectable (checkbox on hover + shift-range + ⌘-click + "select all in section"). Selected rows get an accent-soft highlight + accent left-border.
- **Bulk-edit bar:** appears (docked, sliding up from the bottom of the list) when ≥1 row selected: `N selected` + inline controls to set Signal type / Connector type / Group across the selection + a Clear. Mono for the count.
**States:** none-selected (bar hidden) · some-selected (bar shown) · all-selected · mixed-values (a bulk field shows an "—" placeholder when the selection differs).
**Interactions:** shift-range select; ⌘-click toggle; bulk field change applies to all selected with one undo entry; Esc clears selection.
**Acceptance:** selecting 8 analog inputs and assigning a shared DB25 connector is a 3-click flow; bulk bar never covers the row you're editing.

---

### C3 — Bulk-add ports form (extended)
**Purpose:** create N fully-configured channels/connectors at once.
**Where:** the existing "Bulk" popover in the DeviceEditor port column (the current one has: label prefix, from/to range, signal type, optional Section).
**Anatomy (add to the current form):** connector **type** select, **group/section**, and a **connector-exposure** choice — "expose as: individual connectors (N) / one bundle connector (1× carrying all) / both". Keep the live `Preview: Input 1, Input 2 … Input 8` line; extend it to preview the connector setup too (`+ DB25 carrying 1–8`).
**States:** default · invalid range · preview.
**Acceptance:** one dialog produces "8 analog inputs on 8 XLR **and** 1 DB25" without post-editing.

---

### C4 — Multi-channel cable (canvas label + Cable BOM row)
**Purpose:** make a cable's channel bundle legible.
**Where:** (a) a small label on the canvas cable (mid-span chip), (b) a row in the Cable BOM table (Schedule view).
**Anatomy:**
- Canvas: a compact mono chip on the cable — `DB25 · 8ch` — in the signal colour, appearing on hover/selection (don't clutter every cable always).
- BOM row: connector type, channel count (mono), signal type swatch, length, endpoints. A **fit warning** variant (coral) when the two ends' channel counts differ.
**States:** default · selected/hover (chip shown) · over/under-capacity (coral warning) · 1-channel (no `·Nch` suffix).
**Acceptance:** an 8-ch DB25 cable is instantly distinguishable from a 1-ch XLR at a glance in both canvas and BOM.

---

### C5 — Routing matrix (full-screen editor)
**Purpose:** route any input channel/bus to any output channel/bus inside a device (Trinnov-style), creating real internal cables.
**Where:** a full-screen overlay (same shell as DeviceEditor) opened from the device (Inspector/context-menu/DeviceEditor button).
**Anatomy:**
- A **grid**: rows = sources (input channels, then buses), columns = sinks (output channels, then buses). Sticky row headers (left, mono channel labels) and column headers (top, rotated or short labels).
- **Cell** = a routable cross-point. Empty = faint grid. Routed = filled dot/square in the signal colour (amber to a physical out, **violet** to/from a bus). Hover highlights the full row + column.
- **Bus management:** a header affordance to add / rename / remove virtual buses (bus rows+cols appear in violet).
- Grouping dividers between sections (Analog / AES / Buses). Section labels mono-caps muted.
- Footer: counts (`12 routes · 3 buses`, mono) + Done.
**States:** empty · routed cells · hover cross-hair · fan-out (one row, many cells) · summing (one column, many cells — subtle "Σ" marker on the column header) · bus row/col · scrolled (sticky headers) · large matrix (horizontal scroll inside its own container — the page body never scrolls sideways).
**Interactions:** click cell toggles a route (creates/deletes an internal cable); hover shows the resulting path label; add-bus inline.
**Acceptance:** an 8×10 matrix with 2 buses is readable without zoom; summing and fan-out are visually distinct; scales to 64×64 with scroll.

---

### C6 — Expanded device / internal-routing lane (canvas)
**Purpose:** reveal internal cables on the canvas without spaghetti.
**Where:** a device node's **expanded** state on the schematic canvas (toggled by "Show internal routing").
**Anatomy:** the node grows a dedicated internal **lane** (a recessed inset panel inside the card, below the port rows) where internal cables draw as short orthogonal segments between the device's own channels/buses — each in its signal colour, matching the OffsetEdge look but confined to the lane. A small header on the lane: `Internal routing · N routes` + a collapse control.
**States:** collapsed (default — lane hidden, node normal) · expanded (lane shown) · empty (expanded but no routes → hint) · a route highlighted (when hovered from the matrix or path-explain).
**Acceptance:** expanding doesn't shove other nodes chaotically (node grows downward predictably); collapsed devices are exactly as today; internal cables never leak into the global canvas routing.

---

### C7 — Patchbay device (face + per-point mode control)
**Purpose:** represent a physical patchbay (e.g. Neutrik NYS-SPP-L1, 48 jacks / 24 points) accurately and legibly.
**Where:** a device node on the canvas; expanded form shows per-point detail.
**Anatomy:**
- **Collapsed face:** a horizontal 1U-style strip — two rows of jacks (A top, B bottom), 24 columns, mono point numbers. Jacks render as small rings; **patched** jacks fill in the signal colour; a jack whose channel is **live** gets a subtle halo. This is a *schematic* representation, not a photoreal render — clean, instrument-like, on-grid.
- **Per-point mode indicator:** each column shows its mode compactly (a 3-state glyph or letter: **HN / SP / IS** in mono, muted) beneath the point number.
- **Expanded:** per-point detail using C8's diagram + a mode selector (segmented: Half-normalled / Split / Isolated).
**States:** point idle · point patched (front A / front B / both) · mode = HN / SP / IS · live signal · selected point.
**Acceptance:** 24 points fit a canvas node width with horizontal scroll if needed; mode is readable at a glance across all 24; patched vs open is obvious.

---

### C8 — Patchbay normalling diagram (the 3 modes — clean redraw)
**Purpose:** show *exactly* the internal wiring of one patch point for its mode + plug state. **This is the component Glen most wants done well** (my rough version was rejected).
**Where:** the expanded patchbay point (C7), and inline in help/tooltips.
**Anatomy:** a single point drawn as a clean schematic: four terminals — **Front A, Front B** (patch face, left) and **Rear A, Rear B** (tie-lines, right) — with internal conductors drawn per mode:
- **Half-normalled:** Rear A → Rear B normalled (solid, live colour). Front A taps the A node (non-breaking — draw as a junction dot). Front B enters through a **break contact** on the A→B path (draw the switch/break symbol; open when Front B unpatched, opened-and-rerouted when patched).
- **Split:** all four terminals joined at a common node (passive mult) — draw the 4-way junction.
- **Isolated:** two separate straight conductors (Front A↔Rear A, Front B↔Rear B), no cross-link.
Include the **plug states** as variants: idle, Front A patched (→ passive-split highlight), Front B patched (→ broken-normal highlight in coral).
**Design intent:** precise, technical, legible — like a real service diagram but in the app's token palette. Live/active conductors in signal colour; broken normal in coral; passive-split node flagged (amber/warning). Terminals labelled in mono. No skeuomorphism, no gradients — flat instrument line-art.
**States (each a frame):** HN-idle · HN-frontA-tap (passive split) · HN-frontB-insert (broken normal) · Split · Isolated.
**Acceptance:** an engineer who's never seen the app understands the signal path and where it breaks, from the diagram alone.

---

### C9 — Signal-flow visualizer / path-explain overlay
**Purpose:** answer "where does my signal actually go?" across normalling + routing, including passive-split level effects.
**Where:** an overlay/panel triggered by hovering/selecting a cable or a patch point (extends the existing path-explain).
**Anatomy:**
- A **linear trace**: source → hops → sinks, each hop a pill (mono for device/port IDs, signal-colour accents). Branch points (taps, fan-outs) shown as a fork.
- **Break markers** (coral) where a normal is broken; **passive-split markers** (amber) where one source drives multiple loads, with an advisory chip: `passive mult — level/impedance interaction (worst-case ~−6 dB)`.
- Compact enough to sit as a floating card near the cursor or docked in the right rail.
**States:** simple 2-hop path · path through a normalled patch point · path with a passive split (warning) · path with a broken normal · multi-branch fan-out.
**Acceptance:** for the classic case (console → half-normal point → monitor, with a recorder tapped on front A) the overlay clearly shows the monitor still fed AND the passive-split warning.

---

## 4. Global deliverable checklist (per component)
- [ ] Light + dark frames.
- [ ] Every listed state.
- [ ] Tokens only (no invented colours/fonts/radii).
- [ ] Mono for all numerics/IDs; Jost for UI text.
- [ ] Signal-colour-as-data respected.
- [ ] AV terminology in all labels.
- [ ] Reduced-motion-safe (note any motion).
- [ ] Redlines for any non-obvious size/spacing.

## 5. Priority order for design (matches build order)
1. **C2, C3** (editor foundation — R2-1/R2-2) — needed first.
2. **C1, C4** (channel row + cable — R2-3).
3. **C5, C6** (matrix + expanded lane — R2-4).
4. **C7, C8, C9** (patchbay + normalling + signal-flow — R2-5). C8 is the hero.

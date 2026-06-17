# EasySchematic SVG Symbol Library — Research & Provenance

A curated, **license-clean** set of vector symbols for use as device/object icons
and floor-plan furniture in EasySchematic. Every file is a self-contained `<svg>`
document, cleaned so the app's `sanitizeSvg` injector keeps it intact and it tints
via `currentColor`.

**Total: 124 symbols** (deduped, breadth over volume).

| Category   | Files | Subcategories covered |
|------------|------:|-----------------------|
| generic    | 33    | 20 |
| audio      | 34    | 23 |
| network    | 26    | 14 |
| furniture  | 31    | 23 |
| **TOTAL**  | **124** | **80** |

---

## Sources & Licenses

All sources are permissive / open. Raw `.svg` bytes were fetched from
`raw.githubusercontent.com` (see `_build/sources.py` for exact per-file paths and
`_build/fetch_and_clean.py` for the fetch+clean pipeline).

| Source | Repo | License | Files used | Attribution required? |
|--------|------|---------|-----------:|-----------------------|
| **Tabler Icons** | [tabler/tabler-icons](https://github.com/tabler/tabler-icons) | **MIT** | ~50 | Recommended, not required |
| **Lucide** | [lucide-icons/lucide](https://github.com/lucide-icons/lucide) | **ISC** | 5 | Recommended, not required |
| **Bootstrap Icons** | [twbs/icons](https://github.com/twbs/icons) | **MIT** | 1 | Recommended, not required |
| **Material Symbols** | [google/material-design-icons](https://github.com/google/material-design-icons) (via [marella/material-symbols](https://github.com/marella/material-symbols)) | **Apache-2.0** | ~38 | Recommended (NOTICE) |
| **Font Awesome Free 6** | [FortAwesome/Font-Awesome](https://github.com/FortAwesome/Font-Awesome) | **CC-BY-4.0** (icons) | ~7 | **YES — attribution required** |
| **game-icons.net** | [game-icons/icons](https://github.com/game-icons/icons) | **CC-BY-3.0** | 13 | **YES — attribution required** |

> **Note on game-icons.net**: each glyph is authored as a full-bleed background
> path + a white foreground glyph. The build pipeline strips the background path
> (`M0 0h512v512H0z`) and recolours the foreground to `currentColor`, so they tint
> like the line-art sets. All 13 used are by **Delapouite** (CC BY 3.0).

### Excluded (per brief)
Proprietary vendor topology sets — **Cisco, AWS, Azure, GCP, IBM** — were **not**
used. They are license-incompatible even where downloadable.

---

## Consolidated Attribution Block (surface this in-app)

Drop this into an About / Credits / Licenses panel. The CC-BY entries are the only
ones that legally **require** attribution; the MIT/ISC/Apache entries are credited
as good practice.

```
Symbol artwork in EasySchematic is assembled from open icon libraries:

• Tabler Icons — MIT License — © Paweł Kuna — https://tabler.io/icons
• Lucide — ISC License — © Lucide Contributors (forked from Feather, MIT © Cole Bemis) — https://lucide.dev
• Bootstrap Icons — MIT License — © The Bootstrap Authors — https://icons.getbootstrap.com
• Material Symbols — Apache License 2.0 — © Google — https://fonts.google.com/icons
• Font Awesome Free 6 — Icons licensed under CC BY 4.0 — © Fonticons, Inc. — https://fontawesome.com
• game-icons.net — CC BY 3.0 — © Delapouite — https://game-icons.net

Icons have been cleaned/recoloured for use as themable diagram symbols.
Full per-symbol provenance: Design_Handoff/svg-library/manifest.json
```

---

## What's in the box (per-subcategory)

### generic (33)
arrow ×2 · bracket-group ×2 · callout ×2 · circle ×2 · cross ×1 · dimension-marker ×3 ·
double-arrow ×2 · ellipse ×1 · grid ×2 · hexagon ×1 · line ×2 · north-arrow ×2 ·
plus ×1 · rectangle ×1 · rounded-rect ×1 · scale-bar ×1 · star ×1 · text-label ×2 ·
triangle ×2 · zone-area ×2

### audio (34)
antenna ×3 · ceiling-speaker ×1 · column-speaker ×1 · di-box ×1 · dsp-processor ×2 ·
headphones ×2 · iem ×1 · line-array ×1 · loudspeaker ×2 · media-player ×2 ·
microphone-boundary ×1 · microphone-condenser ×1 · microphone-handheld ×2 ·
microphone-lavalier ×1 · microphone-studio ×1 · mixing-console ×3 · point-source ×1 ·
power-amplifier ×2 · stage-box-snake ×1 · stage-monitor ×1 · subwoofer ×2 ·
waveform ×1 · wireless-mic ×1

### network (26)
access-point ×2 · cloud ×2 · equipment-rack ×2 · firewall ×2 · media-converter ×1 ·
modem ×2 · nas ×2 · network-topology ×2 · nic-endpoint ×2 · patch-panel ×1 ·
poe-injector ×1 · router ×2 · server ×3 · switch ×2

### furniture (31)
banquet-table ×1 · bar ×1 · chair ×2 · cocktail-table ×1 · dancefloor ×1 · dj-booth ×1 ·
door ×2 · double-door ×1 · lectern-podium ×2 · lighting ×1 · mic-stand ×1 ·
person-audience ×2 · pillar-column ×1 · pipe-and-drape ×1 · plant-tree ×2 ·
rectangular-table ×1 · round-table ×2 · sofa ×2 · speaker-stand ×1 · stackable-chair ×1 ·
stage-deck ×2 · truss-segment ×1 · window ×1

### Subcategories that could NOT be sourced cleanly (substitutions noted)
Every requested subcategory has at least one symbol, but a few are **approximations**
rather than purpose-drawn AV/venue art (open icon sets have no exact glyph):

- **audio › stage-monitor / line-array** — no dedicated wedge/line-array glyph exists
  in open sets; both reuse the game-icons `speaker` silhouette. Consider drawing
  bespoke wedge + array-element glyphs later (the hardcoded `src/symbols/index.ts`
  registry is the right home for those).
- **audio › di-box / stage-box-snake** — represented by a generic box / connected-plug
  glyph; functional but not literal.
- **audio › column-speaker / ceiling-speaker** — mapped to `device-speaker` /
  `surround_sound`; acceptable but generic.
- **furniture › truss-segment** — `grid-pattern` placeholder (no truss glyph in open sets).
- **furniture › pipe-and-drape** — `curtains` (Material) is the closest match.
- **furniture › dj-booth** — game-icons `audio-cassette` (closest DJ-gear glyph; no booth glyph).
- **furniture › cocktail-table vs banquet-table** — Material has limited table glyphs;
  both lean on `table_bar`/`table_restaurant`. The game-icons `round-table` /
  `table` (rectangular) are the strongest literal top-down footprints.

These are the natural candidates for **bespoke** symbols if higher fidelity is wanted —
none block the deliverable.

---

## Cleaning pipeline (what was done to each file)

`_build/fetch_and_clean.py` applies, per file:

1. Strip `<?xml?>`, `<!DOCTYPE>`, XML comments, `<script>`, `on*` handlers,
   external `href`/`//` refs, and root `width`/`height` (KEEP `viewBox`).
2. Recolour to **`currentColor`**:
   - **stroke-based line-art** (Tabler/Lucide/Feather, `fill="none"`): every concrete
     stroke colour → `currentColor`; root guaranteed a `stroke="currentColor"` hook.
   - **fill-based art** (Material/Font Awesome/Bootstrap): every concrete fill colour →
     `currentColor`; root guaranteed a `fill="currentColor"` hook.
   - `none` / `transparent` are preserved.
3. **game-icons only**: drop the full-bleed background path so the glyph tints cleanly.
4. Collapse whitespace; keep a clean `viewBox` (`0 0 24 24`, `0 -960 960 960`, or
   `0 0 512 512` depending on source — all render fine in the app's
   `preserveAspectRatio` containers).

### Validation performed
- **0 / 124** files contain a banned construct, `width`/`height`, or external ref.
- **0 / 124** fail XML parse.
- **0 / 124** contain an element outside the app's `sanitizeSvg` allowlist.
- **124 / 124** carry a `currentColor` paint hook.
- **124 / 124** pass the app's **actual** `sanitizeSvg()` (node/regex path) with
  **0 nulled** and **0 losing `currentColor`** (harness: `_build/sanitize_check.mjs`).
- Visual contact sheet (`_build/contact-sheet.html` → `svg-library-contact-sheet.png`)
  confirms every glyph renders as crisp tinted art — none blank, none solid blocks.

---

## Integration notes — mapping to the app's existing systems

EasySchematic resolves a device/object's plan-view glyph through **two** independent
mechanisms. This library can feed **both**:

### 1. `svgAssets` store (custom-SVG path) — DROP-IN, no code changes needed
- **Store**: `useSchematicStore().svgAssets: Record<string, string>` — keys arbitrary
  **sanitized full-`<svg>` markup** by a generated id. Written via
  `addSvgAsset(svg) → id` (`src/store.ts:3466`), which runs `sanitizeSvg` at the
  boundary.
- **Consumers**:
  - `DeviceData.layoutSvgAssetId` → `svgAssets[id]`, injected by
    `DevicePlanNode.tsx:49` / `:186`.
  - `ObjectData.svgAssetId` → `svgAssets[id]`, injected by `ObjectPlanNode.tsx:39`.
  - User entry point today: `SvgAssetImportDialog.tsx` (file upload → `addSvgAsset`).
- **These library files are exactly that shape** (full `<svg viewBox=… fill/stroke="currentColor">`).
  They already pass `sanitizeSvg` verbatim (verified). To make them first-class:
  - **Option A (fastest)**: ship them as a bundled "Symbol catalog" the
    `SvgAssetImportDialog` (or a new picker) lists alongside "Choose SVG file…",
    so users pick from the 124 instead of hunting for files. Read the `.svg` text,
    pass through `addSvgAsset`, assign the returned id to
    `layoutSvgAssetId` / `svgAssetId`.
  - **Option B**: `import sheet from "…?raw"` at build time, or fetch from a static
    path, then seed `svgAssets` / a read-only catalog map keyed by `manifest.json` id.
  - `manifest.json` is built to drive such a picker directly: `{ id, name, category,
    subcategory, tags, file, source, license, attribution }`.

### 2. `src/symbols/index.ts` hardcoded glyph registry (deviceType keyword path)
- **Shape**: `DEVICE_SYMBOLS: Record<string, { id, label, svg }>` where `svg` is
  **inner markup only** (no outer `<svg>` tag), authored for `0 0 24 24`,
  `stroke="currentColor"`, `fill="none"`. `symbolForDeviceType(deviceType)` does
  ordered keyword matching and `DevicePlanNode.tsx:95/:186` injects `symbol.svg`.
- This registry currently has **12** glyphs (speaker, subwoofer, wired/wireless-mic,
  amplifier, mixer, audio-io, rack, display, projector, camera, computer). It is the
  right home for **automatic** deviceType→glyph defaults (no user action).
- **To extend it from this library**: take any **24×24** entry (the Tabler/Lucide
  ones), strip the outer `<svg …>`/`</svg>` wrapper to get inner markup, and add a
  `DEVICE_SYMBOLS["…"]` entry + a keyword branch in `symbolForDeviceType`. Good
  candidates to add: `mixing-console`, `power-amplifier`, `dsp-processor`,
  `headphones`, `antenna`, plus network types (`switch`, `router`, `access-point`,
  `server`, `cloud`) which the registry currently lacks entirely.
- ⚠️ The non-24×24 sources (Material `0 -960 960 960`, game-icons `0 0 512 512`) are
  **not** suitable for this inner-markup registry as-is (the registry assumes a
  24×24 frame). Use those via the `svgAssets` path (#1) instead, or re-fit their
  viewBox if porting into the registry.

### Recommended split
- **Furniture + plan-only props** → `svgAssets` catalog (#1), surfaced in the Object
  drawer / Layout view. Many are intentionally multi-viewBox; they only need to be a
  pickable footprint.
- **Audio/network device defaults** → extend `src/symbols/index.ts` (#2) with the
  24×24 line-art entries so devices get an automatic glyph by `deviceType`, no upload.
- **Generic diagram primitives** → most useful as `svgAssets` annotations / the
  Insert panel; the dimension/north-arrow/scale-bar set pairs well with the existing
  Plan `PlanScaleBar` chrome.

---

## Files

```
svg-library/
├── manifest.json                 # machine-readable index (124 entries)
├── RESEARCH.md                   # this file
├── generic/   (33 .svg)
├── audio/     (34 .svg)
├── network/   (26 .svg)
├── furniture/ (31 .svg)
└── _build/                       # reproducible pipeline (not shipped to app)
    ├── sources.py                # curated source list + license metadata
    ├── fetch_and_clean.py        # fetch → clean → write → manifest
    ├── sanitize_check.mjs        # runs files through the app's real sanitizeSvg
    └── contact-sheet.html        # visual QA sheet
```

To regenerate: `python3 _build/fetch_and_clean.py` from `svg-library/`.

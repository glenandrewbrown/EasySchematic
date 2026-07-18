# Red lines — Glen's review, 2026-07-17 (all P0)

Each item: evidence → root cause in code → required fix → acceptance. File:line references are against the mounted repo root `src/`.

---

## R1 · Signal-flow animation direction is wrong

**Evidence:** `feedback/01-signal-flow-direction.png` — "The animations directing signal flow are all heading the wrong direction."

**Code:** `src/components/OffsetEdge.tsx` 970–1040 (`showLiveBand` / `renderBand`), `src/liveSignal.css`.

**Two compounding root causes:**

1. **Chord-axis gradient can't follow a routed path.** The band is a repeating `linearGradient` laid along the straight source→target chord (`bandDx = targetX - sourceX`…). Auto-routed edges are orthogonal with turns: each leg's apparent motion is the chord axis projected onto that leg — legs running against the chord component appear to flow **backwards**, perpendicular legs just shimmer in place. No sign choice fixes this; the technique is wrong for multi-turn paths.
2. **The sign convention is inverted.** The comment claims "SVG translate moves the lit band OPPOSITE to the translate (verified empirically)" — false. Translating `gradientTransform` by +v moves the rendered band **by +v**. So `sign = -1` (used for forward flow) actually sweeps toward the **source**.

**Fix — replace the gradient band with a path-following dash march** (this is the v7 `escableflow` spec):

- Overlay `<path d={edgePath}>` (same routed `d` as the core), `fill:none`, `stroke` = `color-mix(in srgb, white 65%, {signalColor})`, `strokeWidth = coreW`, `stroke-linecap:round`, `pointer-events:none`.
- `stroke-dasharray: 10 62` (≈10px lit band per 72px period, user units — do NOT tie to `vector-effect`, so world-space speed is zoom-stable like the rest of the edge).
- Animate `stroke-dashoffset` **72 → 0** repeating (decreasing offset moves dashes forward along path direction = source→target). CSS keyframes in `liveSignal.css` preferred (natively gated by `prefers-reduced-motion`); duration 3s idle / 1.7s selected (keep current speeds).
- Direction: path is emitted source→target. `flowDir === "forward"` → 72→0; `"reverse"` → 0→72; `"bi"` → keep current both-ways treatment (two overlays) or a subtle symmetric shimmer — pick one and note it.
- Keep every existing gate: `liveSignal` flag, reduced motion, wireless, direct-attach, dashed cores.
- **Verify `flowDir` derivation end-to-end:** the band must always exit the OUTPUT port and arrive at the INPUT port, including edges the user drew starting from the input side, collapsed bidirectional handles, and passthrough (rear/front) circuits.

**Acceptance**
- A run with ≥3 turns: the lit band travels output→input through **every leg**, including legs pointing back toward the source's x/y.
- Draw the same connection twice (once starting at the output, once at the input): band direction identical.
- Ethernet/bi link: chosen bi treatment renders; no false directionality.
- Reduced motion: no band, no swatch pulse. Selected edge animates faster than idle.

---

## R2 · Fully adaptive layout — remove the desktop gate

**Evidence:** `feedback/02-mobile-gate-vs-adaptive.png` — "The APP should have a fully adaptive layout and work cleanly on any screensize including tablets or phones."

**Code:** `src/components/MobileGate.tsx` (768px gate + sessionStorage dismiss) and its mount in `App.tsx`.

**Fix — delete `MobileGate` entirely; make the layout responsive in three tiers:**

**Tier A · ≥1140px (desktop)** — as today; keep the existing top-bar degradation steps (≤1300 / ≤1240 / ≤1140).

**Tier B · 768–1139px (tablet / compact desktop)**
- Right rail auto-starts minimised (restore tab); Insert drawer overlays the canvas instead of docking; minimap default-off (View popover toggle).
- All dialogs ≤ 92vw; Schedule KPI cards wrap 2×2; grid gets horizontal scroll with sticky first column.

**Tier C · <768px (phone / touch)**
- Top bar 48px: logo mark · truncated breadcrumb · ⌘K icon · overflow menu (theme, export, login inside).
- Persona pill → **bottom tab bar** (4 icon+label tabs, thumb reach, `env(safe-area-inset-bottom)` padded).
- Tool rail → floating FAB cluster bottom-left (Add primary; long-press/expand for Select·Connect·Note·Measure).
- Canvas bottom bar folds into one "View" sheet trigger next to zoom.
- Inspector/right rail → **bottom sheet** (drag handle, detents: peek 96px / half / full) opening on selection; Layers as a tab inside the sheet.
- Device Editor + dialogs → full-screen sheets, single-column forms.
- Touch input: enable ReactFlow `zoomOnPinch`, two-finger pan; tap-output-then-tap-input completes a connection (reuse Connect-tool click-click path); long-press 500ms = context menu; **≥44px effective hit targets** — port handles get an expanded invisible touch radius; `touch-action: manipulation` on controls; `viewport-fit=cover`.
- No gate, no sessionStorage key, no "Continue Anyway".

**Acceptance** (test at 390×844 portrait, 768×1024, 1024×768, plus 1440×900 regression)
- All four workspaces reachable and usable at every size: place a device from search, connect two ports by tap-tap, edit its name in the inspector sheet, read the Cable BOM.
- No horizontal body scroll; fixed chrome respects safe areas; no tap target under 44px on touch tiers.
- `MobileGate.tsx` deleted; nothing branches on "mobile" to hide functionality (only re-composition).

---

## R3 · Device artwork gallery — kill the emoji system

**Evidence:** `feedback/03-emoji-icon-picker.png` ("These shouldn't be emojis… populated with a large database of various device SVG vectors; this is where the artwork would be"), plus emoji headers in `feedback/05`/`06`.

**Code:** the emoji system lives at
- `src/components/DeviceEditor.tsx:1182` — hard-coded 20-emoji "Icon" strip
- `src/components/DeviceNode.tsx:718` — `data.icon` rendered as a raw text span in the header
- `src/components/Inspector.tsx:427` — free-text "Icon" field, placeholder 🔊
- `src/components/QuickAddDevice.tsx:575` — 📝/▢/⊞ glyphs on special rows

**The replacement already ships in this repo — wire it up:** `src/symbolLibrary.ts` (+ `symbolLibrary.generated.ts`, ~150 curated license-clean `currentColor` SVGs in 4 categories), `SymbolPickerDialog.tsx`, the `addSvgAsset()` upload pipeline (`SvgAssetImportDialog.tsx`), regenerable from `Design_Handoff/svg-library/` via `scripts/generate-symbol-library.mjs`.

**Fix:**
1. **Data model:** deprecate `data.icon` (emoji string) → `artworkId` on the device/template: either a `symbolId` from the library or an uploaded `svgAssetId`. One-time migration maps each legacy emoji to the nearest symbol (ship the mapping table in code; unknown → class default).
2. **Device Editor:** replace the emoji strip with an **Artwork** row: current artwork thumbnail + "Choose artwork…" → `SymbolPickerDialog` (search field, category tabs, Upload SVG entry, None). Preview card in the editor renders it live.
3. **DeviceNode header:** replace the emoji span with a 16px (compact) / 24px (default+, per v7) icon chip rendering the symbol SVG tinted `classColor` on a `color-mix({classColor} 15%, transparent)` chip. **No artwork set → class-default symbol** via a `deviceClass → symbolId` map (speaker→`audio/loudspeaker`, mixer→`audio/mixing-console`, switch→`network/network-switch`, …) — never an emoji, never empty.
4. **Same artwork everywhere:** QuickAdd + Insert-drawer row thumbnails, Plan footprints (already SVG-driven — reuse the same asset), rack faceplate default, Inspector hero. Inspector "Icon" free-text field → read-only artwork row + "Change…" (opens picker).
5. **Library expansion** (the "large database" ask): current categories are generic/audio/network/furniture — **video, lighting, compute/control, and power classes have no artwork**. Extend `Design_Handoff/svg-library/` using the existing `_build/fetch_and_clean.py` pipeline (license-clean sources only, per `RESEARCH.md`), ~40 additions: video (PTZ cam, camcorder, projector, LED wall, display, capture, video switcher, media server), lighting (moving head, PAR, fresnel, dimmer, lighting console, hazer), compute/control (desktop, laptop, tablet, phone, control processor, touch panel, KVM), power (PDU, UPS, conditioner, distro). Regenerate + update category tabs/labels.
6. **Emoji ban in chrome:** remove the QuickAdd special-row emojis (use library/lucide-style glyphs consistent with the tool rail). Grep for emoji codepoints before closing.

**Acceptance**
- Emoji strip gone; picking artwork persists, renders in node header, library rows, Plan, Inspector; upload-SVG path works from the same picker.
- Legacy documents with emoji icons migrate silently to symbols on load.
- Every device shows *some* vector artwork (class default at minimum). Zero emoji rendered anywhere in app chrome.

---

## R4 · No-match search must offer "Create"

**Evidence:** `feedback/04-quickadd-no-match.png` — "If no matching device is found in a search, you should be presented with an option to create it."

**Code:** dead-end empty states at `QuickAddDevice.tsx:556–559`, `DeviceCreatorPicker.tsx:159`, unmatched paste rows at `QuickAddDevice.tsx:548`. (`DeviceSwapDialog.tsx:129` stays a plain empty state — creating mid-swap is out of scope; add "Try a different term".)

**Fix:**
- QuickAdd zero-results → replace the label with an actionable, keyboard-selectable row: **`+ Create "{query}"`** (accent row; Enter activates when it's the sole result). Opens the device creator (Device Editor "new template" path) prefilled `name = {query}` and carries the qty stepper value. On save: template lands in **My Devices**, device(s) placed at the quick-add anchor, quick-add closes.
- **Owned-list registration (Glen, 07-17 — design package board 4c):** the creator footer carries an **"Also add to My Devices" checkbox, default ON** (remembered per user) — created items must appear in a list immediately. The Insert drawer ▸ My Devices tab gains **"Add all project devices (N)"**: bulk-syncs everything on the canvas into the owned list (dedupe by inventory key, quantities merge, never duplicate). Owned status feeds Schedule ▸ Items source chips + gear inventory.
- If the active scope was "My Devices", show a second row `Search catalog for "{query}"` above Create.
- `DeviceCreatorPicker` zero-results → same `+ Create "{query}"` row.
- Multi-line paste list: each ✗ "(no match)" row gets a per-row `Create` chip (same prefill; returns to the list after save so remaining rows keep their state).

**Acceptance**
- Type an unknown model (e.g. "Trinnov") → Enter → creator opens prefilled → save → node(s) on canvas at the anchor, template in My Devices, immediately searchable.
- Created device is visible in My Devices with its quantity, no further action; "Add all project devices" imports every distinct canvas device with correct counts and merges on re-run.
- Paste 3 lines with 1 unknown → the unknown row's Create chip resolves it to a ✓ without losing the other rows.

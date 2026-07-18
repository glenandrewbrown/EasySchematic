# R2 — Trinnov-class devices: channels, connectors, cables & routing

**Date:** 2026-07-18
**Status:** Design (approved model; pending spec review → implementation plan)
**Scope:** Four coupled DeviceEditor / data-model features (R2-1 … R2-4) that make EasySchematic model professional multi-channel AV gear (Trinnov D-MON, MADI/Dante interfaces, DB25 breakouts) correctly.

---

## 1. Problem

The current model treats a device Port as a single, single-channel connector with one connector type. Real gear breaks all three assumptions:

- **One channel, many connectors (mutex).** A Trinnov analog channel is available on *both* an XLR *and* a DB25 pin. Wiring one must occupy the other — they are the same electrical channel.
- **One connector, many channels (bundle).** An AES3 XLR carries 2 channels; a DB25 carries 8; MADI carries 64; Dante over one RJ45 carries many. A single cable into one physical connector delivers a *set* of channels.
- **In-device routing.** A Trinnov routes almost any input to any output and to arbitrary virtual buses (summing/mixing). Today there is no way to express internal signal routing.

Two supporting editor gaps make the above unauthorable:

- No way to select/edit multiple ports at once.
- Bulk-add of ports can't set connector type, group, or channel settings.

---

## 2. Core data model — channels ⇄ connectors

The unifying abstraction is a **many-to-many mapping between logical channels and physical connectors**, both owned by the device.

```ts
// New on DeviceData (schema v50 → v51)

interface DeviceChannel {
  id: string;                 // stable, e.g. "ain1"
  label: string;              // "Analog In 1"
  signalType: SignalType;     // existing union
  direction: "in" | "out";
  group?: string;             // section/group (existing concept)
}

type ConnectorRole = "physical" | "bus";

interface DeviceConnector {
  id: string;                 // stable, e.g. "db25-in-a"
  label: string;              // "Analog In DB25"
  type: ConnectorType;        // existing union (xlr3, db25, rj45, bnc, …)
  role: ConnectorRole;        // "physical" for real jacks, "bus" for virtual buses
  carries: string[];          // channelIds this connector exposes
                              //   XLR → ["ain1"], DB25 → ["ain1".."ain8"], AES-XLR → ["ch1","ch2"]
}

interface DeviceData {
  // …existing…
  channels?: DeviceChannel[];
  connectors?: DeviceConnector[];
}
```

- **Channel** = the logical signal (the routable unit).
- **Connector** = a physical jack (or a virtual bus, see §4) that `carries` a set of channels.
- **Mutex is derived, not stored:** a channel is *occupied* when any connector that `carries` it has a connection. Plugging the DB25 marks all 8 XLR alternates occupied; plugging one XLR marks that channel's DB25 pin occupied.

**Back-compat / migration (v51):** existing single-channel ports migrate to one channel + one physical connector (`carries:[thatChannel]`), 1:1. No visible change for simple gear. `headerBandHeight()` / port-grid invariant preserved because the row model is unchanged for 1:1 devices.

> The legacy `Port[]` stays as the render/anchor unit for the common 1:1 case; `channels`/`connectors` are the richer layer that multi-channel gear opts into. The DeviceNode row is still one Handle = one router anchor. (Resolves the Option-B concern about reshaping every Port consumer — consumers keep seeing ports; the channel layer is additive.)

---

## 3. Connections carry channel bundles

A cable plugs into a **connector**, and therefore carries that connector's whole channel set.

```ts
interface ConnectionData {
  // …existing (cableLength, etc.)…
  connectorId?: string;       // which connector on each end the cable plugs into
  channelCount?: number;      // derived = connector.carries.length (denormalized for BOM/label)
}
```

- **Cable label + Cable BOM** show the bundle: `DB25 · 8ch`, `AES XLR · 2ch`, `MADI · 64ch`. Single-channel cables show no `·Nch` suffix (or `·1ch` off by default).
- Channel count for validation/BOM = `min(sourceConnector.carries.length, targetConnector.carries.length)` when the two ends differ (e.g. an 8-ch DB25 into a 2-ch breakout — surfaces a fit warning, reusing the cable-fit verdict pattern in `cableFit.ts`).

---

## 4. Virtual buses

Buses are `DeviceConnector`s with `role:"bus"` — internal-only endpoints, valid as both source and sink in the matrix, never physical jacks.

- User-defined: add / rename / remove in the matrix editor.
- Carry one or more channels like any connector (a stereo bus carries 2 channels).
- Rendered distinctly (violet, per the "signal colour is data" convention — bus tint).

---

## 5. Internal routing = real Connections (R2-4)

An internal route is a real `Connection` with **both endpoints on the same device** + `internal: true`, routing a source channel/bus to a sink channel/bus.

- **Reuses everything:** Cable BOM, length assignment, path-explain all see internal cables for free — no new reporting code.
- **Canvas render (Glen's call): drawn on canvas, gated.** Internal cables are hidden by default; a per-device **"Show internal routing"** toggle (device context menu + matrix header) expands the node into an internal routing lane where internal cables draw as short orthogonal segments. Collapsed = clean.
- **Matrix editor:** full-screen. Rows = sources (input channels + buses), cols = sinks (output channels + buses). Cell click = create/delete an internal `Connection`. Amber cell = to a physical output channel, violet = to/from a bus. Fan-out (one source → many sinks) and summing (many sources → one sink/bus) both allowed.

### ⚠️ Primary technical risk — intra-node edges
The A\* router (`edgeRouter.ts`) routes *between* nodes; same-device endpoints are new. **Mitigation:** internal cables only route/draw when the device is expanded, inside the node's own routing lane — they never enter the global pathfinder. `OffsetEdge` needs a same-node branch (short orthogonal path within the expanded node's bounds). **This is the piece to prototype first** before committing the matrix UI.

---

## 6. Editor foundation (R2-1, R2-2)

These ship first and make the channel/connector model authorable.

- **R2-1 · multi-port select + bulk-edit.** Shift/⌘-click, shift-range, "select all in section". A bulk-edit bar sets signalType / connectorType / group / channel-mapping across the selection.
- **R2-2 · bulk-add with settings.** The bulk-add form (`Input from 1 to 8`) gains: connector type, group/section, and channel/connector-mapping — so N ports/channels come out fully configured (e.g. "add 8 analog inputs, exposed on both a DB25 and 8 XLRs").

---

## 7. Connector labels on every port (bundled add)

Every DeviceNode port row and DeviceEditor row shows its connector type as a sublabel — `Analog In 1 · XLR` — derived from the connector. Consistency win Glen requested; widens nodes within the existing content-fit range.

---

## 8. Build order & phasing

Each ships + verifies (tsc/eslint/build/tests + desktop screenshot) before the next.

1. **R2-1** multi-select + bulk-edit (DeviceEditor only; no schema).
2. **R2-2** bulk-add settings (DeviceEditor only).
3. **R2-3** channel⇄connector model + mutex + multi-channel cable display (schema v51, migration, DeviceEditor channel/connector editor, DeviceNode connector labels, connect-validation mutex, Cable BOM `·Nch`).
4. **R2-4** virtual buses + routing matrix + internal cables + expand-node render (builds on R2-3; prototype intra-node edge first).
5. **R2-5** patchbay archetype + normalling resolver + signal-flow visualizer (builds on R2-3 channel model + R2-4 internal-routing/expand-node). See §11.

---

## 9. Schema & tests

- **Schema:** `CURRENT_SCHEMA_VERSION` 50 → 51. Migration v50→v51: backfill `channels`/`connectors` from existing ports 1:1 (additive; simple gear unchanged).
- **Tests:** pure helpers get unit tests — channel/connector mapping + occupancy/mutex derivation, channel-count/bundle math, internal-cable BOM inclusion, migration round-trip. Matrix + expand-node get logic tests (route create/delete, fan-out/summing). Target: keep the suite green (currently 833) + new coverage for each pure module.

---

## 11. Patchbay archetype (R2-5)

A patchbay is the ultimate stress test of internal routing: routing is **implicit** (normalled) and **plug-state-dependent** (patching a front jack can break a normal). The goal is a device that shows *exactly* where signal goes for any patch combination, including passive-split level effects.

### Structure
A patchbay device has `points: PatchPoint[]` (e.g. 24 columns for a Neutrik NYS-SPP-L1 48-jack 1U). Each point is one vertical A/B strip with **four connectors** and a **mode**:

```ts
type NormallingMode = "half-normalled" | "split" | "isolated";

interface PatchPoint {
  id: string;
  label?: string;            // e.g. "1", or a tie-line name
  mode: NormallingMode;
  // four connectors, mapped into DeviceConnector[]:
  //   rearA  — permanent tie-line (top,   gear side)
  //   rearB  — permanent tie-line (bottom, gear side)
  //   frontA — patch jack (top face)
  //   frontB — patch jack (bottom face)
}
```

- **Rear connectors** = tie-lines: wired on the canvas to other devices' ports (permanent).
- **Front connectors** = patch face: patch cables plug here.
- Mode is per-point (real patchbays set it per card/orientation); editable in the DeviceEditor and via a quick per-point control on the expanded node.

### Normalling resolver (the core — pure, unit-tested)
`resolvePatchPoint(mode, { frontAPatched, frontBPatched }) → PatchNet[]` returns the effective electrical nets (which of {rearA, rearB, frontA, frontB} are commoned) plus flags. Truth table:

| Mode | Front-A patched | Front-B patched | Effective nets | Notes |
|------|-----------------|-----------------|----------------|-------|
| **half-normalled** | – | – | `{rearA, rearB}` | normal live: rearA→rearB |
| half-normalled | A | – | `{rearA, rearB, frontA}` | **passive split** — frontA taps, normal still live |
| half-normalled | – | B | `{rearA, frontA?}`, `{frontB, rearB}` | **insert** — frontB breaks the normal, feeds rearB; rearA now dangling (or tapped by frontA) |
| half-normalled | A | B | `{rearA, frontA}`, `{frontB, rearB}` | frontA taps rearA; frontB→rearB (broken normal) |
| **split** | any | any | `{rearA, rearB, frontA, frontB}` | permanent passive mult, no breaks |
| **isolated** | any | any | `{rearA, frontA}`, `{rearB, frontB}` | two independent thru circuits |

- **Passive-split detection:** any net with **>1 sink** on a passive path is flagged `passiveSplit` → surfaces a warning annotation ("passive mult — level/impedance interaction; worst-case ~-6 dB into low-Z loads"). This is the "effect on the audio signal" Glen asked for. (Modeled as a flag + note in v1; no numeric loss math beyond the advisory, unless load impedances are known.)

### Signal-flow visualizer
- The patchbay resolves its internal nets from mode + live patch state, then emits **internal Connections** (per §5) so path-explain traces *through* it automatically: "Console Out → [Patchbay pt.3 rearA] →(half-normal)→ rearB → Monitor In; front-A tap → Recorder In (passive split)."
- On the **expanded node** (§5), each point draws its live internal wiring in the app style (a clean redraw of the Neutrik mode diagrams), highlighting the active path and marking broken normals + passive splits.
- Path-explain / signal-flow overlay gains normalling awareness so hovering any cable shows the full resolved route, breaks included.

### Fit with the channel model
Each point's A and B are `DeviceChannel`s; the four jacks are `DeviceConnector`s carrying them; the **mode + plug-state → internal Connections** mapping is a conditional specialization of the §5 internal-routing engine. So R2-5 is mostly: the resolver, the patchbay device template/archetype, the per-point mode UI, and the expanded-node normalling render — all on top of R2-3 + R2-4.

## 12. Open items / non-goals (v1)

- Per-cross-point gain / mute in the matrix — **out of v1** (routing on/off only). Revisit.
- Mono/stereo channel pairing UI sugar — out of v1 (buses can carry 2ch, which covers stereo buses).
- Auto-deriving channel counts from a connector-type table (xlr-aes=2, db25=8, madi=64) — nice-to-have default; v1 lets the user set `carries` explicitly, with sensible presets.

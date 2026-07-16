import { useMemo, useState } from "react";
import { useSchematicStore } from "../store";
import { useTheme } from "../hooks/useTheme";
import { detailLevelHint, detailLevelLabel } from "../plainLanguage";
import type { DetailLevel } from "../plainLanguage";
import { formatLengthMode } from "../lengthFormat";
import type { LengthUnitMode } from "../lengthFormat";
import { DEFAULT_SCROLL_CONFIG, DEFAULT_METRES_PER_PIXEL, PROJECT_STATUS_LABELS } from "../types";
import type {
  DeviceTemplate,
  LabelCaseMode,
  PanMode,
  ProjectStatus,
  ScrollAction,
  ScrollConfig,
  StubLabelPageMode,
} from "../types";

const AUTOROUTE_PREF_KEY = "easyschematic-autoroute-pref";

/** Mirror of the store-private `templateKey` (t.id ?? t.deviceType) so the owned-gear
 *  toggle can call removeOwnedGear with the exact key the store uses. */
const ownedKey = (t: DeviceTemplate): string => t.id ?? t.deviceType;

/** Whether the OS requests reduced motion. The store's `reduceMotion` flag ADDS to this —
 *  either source pausing is enough — so the OS asking wins over the app pref and the row
 *  below renders forced-on rather than letting the switch contradict what the app is doing.
 *  Read once, like the identical guard in OffsetEdge: the CSS media queries stay live either way. */
const PREFERS_REDUCED_MOTION =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Sample length behind the unit-mode preview — a plausible room-to-room run. */
const LENGTH_SAMPLE_M = 18;

/** Workspace accent swatches. Each row scopes itself with `data-workspace` and paints from
 *  `var(--color-accent)`, so the swatch IS the accent theme.css defines for that persona and
 *  follows the light/dark theme. The previous hand-copied hexes had drifted an entire design
 *  system out of date while claiming to be "the real per-view accents". */
const WORKSPACE_ACCENTS: { label: string; workspace: string }[] = [
  { label: "Schematic", workspace: "schematic" },
  { label: "Plan", workspace: "plan" },
  { label: "Schedule", workspace: "schedule" },
  { label: "Rack", workspace: "rack" },
];

/** Default drawing-scale presets, expressed as the document px↔metre ratio
 *  (gridSettings.metresPerPixel). Labelled "1 m = N px" to match how the Layout
 *  View Options surface its scale. */
const SCALE_PRESETS: { label: string; metresPerPixel: number }[] = [
  { label: "1 m = 200 px (fine)", metresPerPixel: 0.005 },
  { label: "1 m = 100 px (default)", metresPerPixel: DEFAULT_METRES_PER_PIXEL },
  { label: "1 m = 50 px", metresPerPixel: 0.02 },
  { label: "1 m = 20 px (coarse)", metresPerPixel: 0.05 },
];

/** Icons for the detail-level choices. Paired with the text label, never standing in for it. */
const PlainIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
    <path d="M4 7h16M4 12h11M4 17h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const TechnicalIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
    <path
      d="M8 6l-5 6 5 6M16 6l5 6-5 6"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const DETAIL_OPTIONS: { v: DetailLevel; label: string; icon: React.ReactNode }[] = [
  { v: "plain", label: detailLevelLabel("plain"), icon: <PlainIcon /> },
  { v: "technical", label: detailLevelLabel("technical"), icon: <TechnicalIcon /> },
];

const LENGTH_UNIT_OPTIONS: { v: LengthUnitMode; label: string }[] = [
  { v: "m", label: "Metric (m)" },
  { v: "ft", label: "Imperial (ft)" },
  { v: "both", label: "Both" },
];

/** The document's own unit (DistanceSettings.unit) — no "both": it is a value, not a rendering. */
const DISTANCE_UNIT_OPTIONS: { v: "m" | "ft"; label: string }[] = [
  { v: "m", label: "Metric (m)" },
  { v: "ft", label: "Imperial (ft)" },
];

const ACTION_LABELS: Record<ScrollAction, string> = {
  zoom: "Zoom",
  "pan-x": "Pan left / right",
  "pan-y": "Pan up / down",
};

const ACTION_OPTIONS: ScrollAction[] = ["zoom", "pan-x", "pan-y"];

const selectClass = "ui-input cursor-pointer w-[200px]";

type SectionId = "appearance" | "units" | "inventory" | "advanced" | "ai" | "account";

const NAV_ITEMS: { id: SectionId; label: string }[] = [
  { id: "appearance", label: "Appearance" },
  { id: "units", label: "Units & defaults" },
  { id: "inventory", label: "Inventory" },
  { id: "advanced", label: "Advanced" },
  { id: "ai", label: "AI (Beta)" },
  { id: "account", label: "Account" },
];

// ── Small presentational primitives ─────────────────────────────────────────

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <h2 className="text-[17px] font-semibold text-[var(--color-text-heading)] tracking-[-0.01em]">
        {title}
      </h2>
      <p className="text-xs text-[var(--color-text-muted)] mt-0.5 mb-5">{subtitle}</p>
    </>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-[var(--font-mono)] uppercase tracking-[0.13em] text-[var(--color-text-muted)] mb-2.5">
      {children}
    </div>
  );
}

/** A bordered surface card holding a labelled control + helper copy. */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg">
      {children}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative w-[38px] h-[21px] rounded-full shrink-0 transition-colors ${
        disabled ? "cursor-default opacity-70" : "cursor-pointer"
      } ${checked ? "bg-[var(--color-accent)]" : "bg-[var(--ui-border)]"}`}
    >
      <span
        className="absolute top-[2.5px] w-4 h-4 rounded-full bg-white transition-[left] duration-150"
        style={{ left: checked ? "19px" : "2.5px" }}
      />
    </button>
  );
}

/** Segmented picker for a small closed set of choices, shown under a FieldLabel. */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  width,
}: {
  options: { v: T; label: string; icon?: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  width: number;
}) {
  return (
    <div
      className="flex gap-0.5 p-[3px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg"
      style={{ width }}
    >
      {options.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.v)}
            className={`flex-1 flex items-center justify-center gap-1.5 h-[30px] rounded-md text-xs font-medium cursor-pointer transition-colors ${
              active
                ? "bg-[var(--color-surface-hover)] text-[var(--color-text-heading)]"
                : "bg-transparent text-[var(--color-text-muted)]"
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A labelled toggle row inside a Card (used for the preserved display prefs). */
function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Card>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs font-medium text-[var(--color-text-heading)]">{label}</span>
        {hint && <span className="text-[10.5px] text-[var(--color-text-muted)]">{hint}</span>}
      </div>
      <div className="ml-auto pl-3">
        <ToggleSwitch checked={checked} onChange={() => onChange(!checked)} />
      </div>
    </Card>
  );
}

/** A labelled <select> row inside a Card. */
function SelectRow({
  label,
  hint,
  value,
  onChange,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs font-medium text-[var(--color-text-heading)]">{label}</span>
        {hint && <span className="text-[10.5px] text-[var(--color-text-muted)]">{hint}</span>}
      </div>
      <select
        className={`${selectClass} ml-auto`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </Card>
  );
}

/** A label + slider row used by Advanced (sensitivity, hitbox). */
function SliderRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  hint?: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <Card>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs font-medium text-[var(--color-text-heading)]">{label}</span>
        {hint && <span className="text-[10.5px] text-[var(--color-text-muted)]">{hint}</span>}
      </div>
      <div className="flex items-center gap-2.5 ml-auto">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-[120px] accent-[var(--color-accent)] cursor-pointer"
        />
        <span className="text-xs text-[var(--color-text-muted)] w-[40px] text-right font-[var(--font-mono)]">
          {format(value)}
        </span>
      </div>
    </Card>
  );
}

const CheckIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="ml-auto">
    <path
      d="M5 12l5 5 9-11"
      stroke="var(--color-accent)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const MCP_STATUS_LABELS: Record<string, string> = {
  off: "Off",
  connecting: "Connecting…",
  connected: "Connected",
  error: "Not connected",
};

// ── Sections ─────────────────────────────────────────────────────────────────

function AppearanceSection() {
  const { isDark, toggle } = useTheme();

  const detailLevel = useSchematicStore((s) => s.detailLevel);
  const setDetailLevel = useSchematicStore((s) => s.setDetailLevel);
  const reduceMotion = useSchematicStore((s) => s.reduceMotion);
  const setReduceMotion = useSchematicStore((s) => s.setReduceMotion);
  const labelCase = useSchematicStore((s) => s.labelCase);
  const setLabelCase = useSchematicStore((s) => s.setLabelCase);
  const useShortNames = useSchematicStore((s) => s.useShortNames);
  const setUseShortNames = useSchematicStore((s) => s.setUseShortNames);
  const wrapDeviceLabels = useSchematicStore((s) => s.wrapDeviceLabels);
  const setWrapDeviceLabels = useSchematicStore((s) => s.setWrapDeviceLabels);
  const stubLabelShowPort = useSchematicStore((s) => s.stubLabelShowPort);
  const setStubLabelShowPort = useSchematicStore((s) => s.setStubLabelShowPort);
  const stubLabelShowRoom = useSchematicStore((s) => s.stubLabelShowRoom);
  const setStubLabelShowRoom = useSchematicStore((s) => s.setStubLabelShowRoom);
  const stubLabelPageMode = useSchematicStore((s) => s.stubLabelPageMode);
  const setStubLabelPageMode = useSchematicStore((s) => s.setStubLabelPageMode);

  const setTheme = (wantDark: boolean) => {
    if (wantDark !== isDark) toggle();
  };

  return (
    <>
      <SectionHeading
        title="Appearance"
        subtitle="How much detail the app spells out, plus theme, per-workspace accent colors, and label display."
      />

      {/* Detail level — first because it re-words the whole app, not just this section. */}
      <FieldLabel>Detail level</FieldLabel>
      <Segmented options={DETAIL_OPTIONS} value={detailLevel} onChange={setDetailLevel} width={340} />
      <p className="text-[11.5px] text-[var(--color-text)] mt-2.5 w-[400px]">
        {detailLevelHint(detailLevel)}.
      </p>
      <p className="text-[10.5px] text-[var(--color-text-muted)] mt-1 mb-6 w-[400px]">
        Applies everywhere — device and port labels, signal names, and validation messages. Wording
        only: lengths, counts, IDs, colours, and results are the same either way.
      </p>

      {/* Theme */}
      <FieldLabel>Theme</FieldLabel>
      <div className="flex gap-3 mb-6">
        <button
          type="button"
          onClick={() => setTheme(true)}
          className="flex-1 rounded-[10px] overflow-hidden cursor-pointer p-0 bg-transparent"
          style={{ border: `1.5px solid ${isDark ? "var(--color-accent)" : "var(--color-border)"}` }}
        >
          <div
            className="h-[74px] flex items-center justify-center"
            style={{
              background: "#071427",
              backgroundImage: "radial-gradient(circle at 1px 1px,rgba(80,170,225,.1) 1px,transparent 0)",
              backgroundSize: "12px 12px",
            }}
          >
            <span className="w-[60px] h-[34px] rounded-[5px]" style={{ background: "#0c2138", border: "1px solid #1d4b78" }} />
          </div>
          <div className="flex items-center gap-1.5 px-3 py-2.5 bg-[var(--color-surface)] border-t border-[var(--color-border)]">
            <span className="text-xs font-medium text-[var(--color-text-heading)]">Dark</span>
            {isDark && <CheckIcon />}
          </div>
        </button>
        <button
          type="button"
          onClick={() => setTheme(false)}
          className="flex-1 rounded-[10px] overflow-hidden cursor-pointer p-0 bg-transparent"
          style={{ border: `1.5px solid ${!isDark ? "var(--color-accent)" : "var(--color-border)"}` }}
        >
          <div
            className="h-[74px] flex items-center justify-center"
            style={{
              background: "#eaeef4",
              backgroundImage: "radial-gradient(circle at 1px 1px,rgba(20,35,70,.12) 1px,transparent 0)",
              backgroundSize: "12px 12px",
            }}
          >
            <span className="w-[60px] h-[34px] rounded-[5px]" style={{ background: "#fff", border: "1px solid #dce1ea" }} />
          </div>
          <div className="flex items-center gap-1.5 px-3 py-2.5 bg-[var(--color-surface)] border-t border-[var(--color-border)]">
            <span className="text-xs font-medium text-[var(--color-text-heading)]">Light</span>
            {!isDark && <CheckIcon />}
          </div>
        </button>
      </div>

      {/* Workspace accents */}
      <FieldLabel>Workspace accents</FieldLabel>
      <div className="flex flex-col gap-0.5 mb-3.5">
        {WORKSPACE_ACCENTS.map((a) => (
          <div
            key={a.label}
            data-workspace={a.workspace}
            className="flex items-center gap-3 px-3.5 py-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md"
          >
            <span
              className="w-[18px] h-[18px] rounded-[5px] shrink-0"
              style={{ background: "var(--color-accent)" }}
            />
            <span className="text-[12.5px] font-medium text-[var(--color-text-heading)]">{a.label}</span>
          </div>
        ))}
      </div>

      {/* Reduced motion — the app flag ADDS to the OS setting, so the system asking wins and
          the switch is pinned on (and locked) rather than offering an override it can't honour. */}
      <Card>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-[var(--color-text-heading)]">
            Reduced motion
            {PREFERS_REDUCED_MOTION && (
              <span className="ml-2 text-[9px] font-[var(--font-mono)] uppercase tracking-[0.13em] text-[var(--color-text-muted)]">
                Set by your system
              </span>
            )}
          </span>
          <span className="text-[10.5px] text-[var(--color-text-muted)]">
            {PREFERS_REDUCED_MOTION
              ? "Your system asks for reduced motion, so signal-flow animation and transitions stay paused. Turn “Reduce motion” off in your OS to control this here."
              : "Pause signal-flow animation and transitions. Adds to your system setting — it can only add calm, never remove it."}
          </span>
        </div>
        <div className="ml-auto pl-3">
          <ToggleSwitch
            checked={PREFERS_REDUCED_MOTION || reduceMotion}
            onChange={() => setReduceMotion(!reduceMotion)}
            disabled={PREFERS_REDUCED_MOTION}
          />
        </div>
      </Card>

      {/* Labels (preserved display prefs) */}
      <FieldLabel>
        <span className="mt-7 block">Labels</span>
      </FieldLabel>
      <div className="flex flex-col gap-2">
        <SelectRow
          label="Display label case"
          hint="Display style for device, port, slot, and card labels on the canvas and in exports. Doesn't modify your data."
          value={labelCase}
          onChange={(v) => setLabelCase(v as LabelCaseMode)}
        >
          <option value="as-typed">As-typed</option>
          <option value="uppercase">UPPERCASE</option>
          <option value="lowercase">lowercase</option>
          <option value="capitalize">Capitalize Words</option>
        </SelectRow>
        <ToggleRow
          label="Use short device names"
          hint="Render device labels using a compact identifier when available — short name, then model number, then full label."
          checked={useShortNames}
          onChange={setUseShortNames}
        />
        <ToggleRow
          label="Wrap device labels"
          hint="Allow long device labels to wrap onto a second line instead of truncating with an ellipsis."
          checked={wrapDeviceLabels}
          onChange={setWrapDeviceLabels}
        />
      </div>

      {/* Stub labels (preserved display prefs) */}
      <FieldLabel>
        <span className="mt-7 block">Stub labels</span>
      </FieldLabel>
      <div className="flex flex-col gap-2">
        <ToggleRow
          label="Show port name on stub labels"
          hint="Adds the destination port (e.g. [HDMI In 1]) after the device name on stubbed connections."
          checked={stubLabelShowPort}
          onChange={setStubLabelShowPort}
        />
        <ToggleRow
          label="Show room name on stub labels"
          hint="Adds the destination room (e.g. (Server Room)) after the device name on stubbed connections."
          checked={stubLabelShowRoom}
          onChange={setStubLabelShowRoom}
        />
        <SelectRow
          label="Page number on stub labels"
          hint="When to display the destination page. Cross-page only suppresses the tag when both ends share a printed page."
          value={stubLabelPageMode}
          onChange={(v) => setStubLabelPageMode(v as StubLabelPageMode)}
        >
          <option value="cross-page">Cross-page only</option>
          <option value="always">Always</option>
          <option value="never">Never</option>
        </SelectRow>
      </div>
    </>
  );
}

function UnitsSection() {
  const lengthUnitMode = useSchematicStore((s) => s.lengthUnitMode);
  const setLengthUnitMode = useSchematicStore((s) => s.setLengthUnitMode);
  const distanceSettings = useSchematicStore((s) => s.distanceSettings);
  const setDistanceSettings = useSchematicStore((s) => s.setDistanceSettings);
  const gridSettings = useSchematicStore((s) => s.gridSettings);
  const setGridSettings = useSchematicStore((s) => s.setGridSettings);
  const currency = useSchematicStore((s) => s.currency);
  const setCurrency = useSchematicStore((s) => s.setCurrency);
  const status = useSchematicStore((s) => s.status);
  const setProjectStatus = useSchematicStore((s) => s.setProjectStatus);

  const unit = distanceSettings?.unit ?? "ft";

  return (
    <>
      <SectionHeading title="Units & defaults" subtitle="Measurement system and new-project defaults." />

      {/* Length units → lengthUnitMode (how lengths READ; no maths involved) */}
      <FieldLabel>Length units</FieldLabel>
      <Segmented
        options={LENGTH_UNIT_OPTIONS}
        value={lengthUnitMode}
        onChange={setLengthUnitMode}
        width={300}
      />
      <p className="text-[10.5px] text-[var(--color-text-muted)] mt-2 w-[300px]">
        How lengths read in the Inspector, cable schedule, BOM, and on-canvas labels. Display only —
        it converts nothing and changes no saved value.
      </p>
      <p className="text-[10.5px] text-[var(--color-text-muted)] mt-1.5 mb-[18px]">
        <span className="font-[var(--font-mono)] text-[var(--color-text)]">
          {formatLengthMode(LENGTH_SAMPLE_M, lengthUnitMode)}
        </span>
      </p>

      {/* Project distance unit → distanceSettings.unit (document data: saved with the file) */}
      <FieldLabel>Project distance unit</FieldLabel>
      <Segmented
        options={DISTANCE_UNIT_OPTIONS}
        value={unit}
        onChange={(v) => setDistanceSettings({ unit: v })}
        width={260}
      />
      <p className="text-[10.5px] text-[var(--color-text-muted)] mt-2 mb-[18px] w-[300px]">
        The unit room-to-room distances and cable slack are entered in. Saved with the project, and
        used for the estimated-length maths behind the cable schedule.
      </p>

      {/* Default drawing scale → gridSettings.metresPerPixel */}
      <FieldLabel>Default drawing scale</FieldLabel>
      <select
        className="ui-input cursor-pointer w-[260px] mb-[18px] font-[var(--font-mono)]"
        value={String(gridSettings.metresPerPixel)}
        onChange={(e) => setGridSettings({ metresPerPixel: Number(e.target.value) })}
      >
        {SCALE_PRESETS.map((p) => (
          <option key={p.metresPerPixel} value={String(p.metresPerPixel)}>
            {p.label}
          </option>
        ))}
        {!SCALE_PRESETS.some((p) => p.metresPerPixel === gridSettings.metresPerPixel) && (
          <option value={String(gridSettings.metresPerPixel)}>
            {`Custom (1 m = ${Math.round(1 / gridSettings.metresPerPixel)} px)`}
          </option>
        )}
      </select>
      <p className="text-[10.5px] text-[var(--color-text-muted)] -mt-3 mb-[18px] w-[300px]">
        Real-world scale for the Layout view, rulers, and CAD export.
      </p>

      {/* Currency (preserved) */}
      <FieldLabel>Currency</FieldLabel>
      <select
        className={selectClass}
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        style={{ width: 260 }}
      >
        <option value="USD">USD — US Dollar ($)</option>
        <option value="GBP">GBP — British Pound (£)</option>
        <option value="EUR">EUR — Euro (€)</option>
        <option value="CAD">CAD — Canadian Dollar (CA$)</option>
        <option value="AUD">AUD — Australian Dollar (A$)</option>
        <option value="JPY">JPY — Japanese Yen (¥)</option>
        <option value="NZD">NZD — New Zealand Dollar (NZ$)</option>
        <option value="CHF">CHF — Swiss Franc (CHF)</option>
        <option value="SEK">SEK — Swedish Krona (kr)</option>
        <option value="NOK">NOK — Norwegian Krone (kr)</option>
        <option value="DKK">DKK — Danish Krone (kr.)</option>
        <option value="CNY">CNY — Chinese Yuan (¥)</option>
        <option value="INR">INR — Indian Rupee (₹)</option>
      </select>
      <p className="text-[10.5px] text-[var(--color-text-muted)] mt-2 w-[300px]">
        Symbol used for cost fields in reports. No conversion is applied.
      </p>

      {/* Project status — document metadata, saved with the file. */}
      <FieldLabel>
        <span className="mt-7 block">Project status</span>
      </FieldLabel>
      <select
        className={selectClass}
        value={status ?? ""}
        onChange={(e) =>
          setProjectStatus(e.target.value === "" ? undefined : (e.target.value as ProjectStatus))
        }
        style={{ width: 260 }}
      >
        <option value="">Active (default)</option>
        {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((key) => (
          <option key={key} value={key}>
            {PROJECT_STATUS_LABELS[key]}
          </option>
        ))}
      </select>
      <p className="text-[10.5px] text-[var(--color-text-muted)] mt-2 w-[300px]">
        Lifecycle status for this project. Stored in the file and shown in project metadata.
      </p>
    </>
  );
}

function InventorySection({ onClose }: { onClose: () => void }) {
  const ownedGear = useSchematicStore((s) => s.ownedGear);
  const removeOwnedGear = useSchematicStore((s) => s.removeOwnedGear);
  const setShowOwnedGearPane = useSchematicStore((s) => s.setShowOwnedGearPane);
  const setLibraryActiveTab = useSchematicStore((s) => s.setLibraryActiveTab);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ownedGear;
    return ownedGear.filter((item) => {
      const t = item.template;
      return (
        t.label.toLowerCase().includes(q) ||
        (t.manufacturer ?? "").toLowerCase().includes(q) ||
        (t.category ?? "").toLowerCase().includes(q) ||
        (t.deviceType ?? "").toLowerCase().includes(q)
      );
    });
  }, [ownedGear, query]);

  const openLibrary = () => {
    setLibraryActiveTab("owned");
    setShowOwnedGearPane(true);
    onClose();
  };

  return (
    <>
      <SectionHeading
        title="Inventory"
        subtitle="The gear you own. Active devices appear in My Devices in the library."
      />

      {/* Search */}
      <div className="flex items-center gap-2.5 h-[34px] px-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg mb-3.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
          <circle cx="11" cy="11" r="7" stroke="var(--color-text-muted)" strokeWidth="1.6" />
          <path d="M21 21l-4-4" stroke="var(--color-text-muted)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your inventory…"
          className="flex-1 bg-transparent border-none outline-none text-[11.5px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]"
        />
        <span className="ml-auto text-[10px] text-[var(--color-accent)] font-[var(--font-mono)] shrink-0">
          {ownedGear.length} active
        </span>
      </div>

      {/* Owned-gear list */}
      {ownedGear.length === 0 ? (
        <div className="px-4 py-8 text-center bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] rounded-lg">
          <p className="text-xs text-[var(--color-text-muted)]">
            No gear marked as owned yet. Open the device library and activate the gear you own.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {filtered.map((item) => {
            const t = item.template;
            const key = ownedKey(t);
            const cat = t.category ?? t.deviceType ?? "Device";
            const accent = t.color ?? "var(--color-accent)";
            return (
              <div
                key={key}
                className="flex items-center gap-3 px-3.5 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg"
              >
                <span
                  className="w-[26px] h-[26px] rounded-md flex items-center justify-center shrink-0 border border-[var(--color-border)] bg-[var(--color-bg)]"
                  style={{ color: accent }}
                >
                  <span className="w-[9px] h-[9px] rounded-[2px] bg-current" />
                </span>
                <div className="flex flex-col leading-[1.3] min-w-0">
                  <span className="text-xs font-medium text-[var(--color-text-heading)] truncate">{t.label}</span>
                  <span className="text-[9.5px] text-[var(--color-text-muted)] truncate">
                    {t.manufacturer ? `${t.manufacturer} · ${cat}` : cat}
                  </span>
                </div>
                <span className="ml-auto text-[10.5px] text-[var(--color-text-muted)] font-[var(--font-mono)]">
                  ×{item.quantity}
                </span>
                <ToggleSwitch checked onChange={() => removeOwnedGear(key)} />
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-1 py-3 text-[11px] text-[var(--color-text-muted)]">No owned gear matches “{query}”.</p>
          )}
        </div>
      )}

      <button type="button" onClick={openLibrary} className="ui-btn ui-btn-ghost mt-4 text-xs">
        Open device library to add gear →
      </button>
    </>
  );
}

function AdvancedSection() {
  const scrollConfig = useSchematicStore((s) => s.scrollConfig);
  const setScrollConfig = useSchematicStore((s) => s.setScrollConfig);
  const edgeHitboxSize = useSchematicStore((s) => s.edgeHitboxSize);
  const setEdgeHitboxSize = useSchematicStore((s) => s.setEdgeHitboxSize);
  const panMode = useSchematicStore((s) => s.panMode);
  const setPanMode = useSchematicStore((s) => s.setPanMode);

  const [autoRoutePref, setAutoRoutePref] = useState(
    () => localStorage.getItem(AUTOROUTE_PREF_KEY) ?? "ask",
  );

  const update = (patch: Partial<ScrollConfig>) => setScrollConfig({ ...scrollConfig, ...patch });

  const isDefault =
    scrollConfig.scroll === DEFAULT_SCROLL_CONFIG.scroll &&
    scrollConfig.shiftScroll === DEFAULT_SCROLL_CONFIG.shiftScroll &&
    scrollConfig.ctrlScroll === DEFAULT_SCROLL_CONFIG.ctrlScroll &&
    scrollConfig.zoomSpeed === DEFAULT_SCROLL_CONFIG.zoomSpeed &&
    scrollConfig.panSpeed === DEFAULT_SCROLL_CONFIG.panSpeed &&
    scrollConfig.trackpadEnabled === DEFAULT_SCROLL_CONFIG.trackpadEnabled &&
    edgeHitboxSize === 10 &&
    autoRoutePref === "ask" &&
    panMode === "select-first";

  const resetAll = () => {
    setScrollConfig({ ...DEFAULT_SCROLL_CONFIG });
    setEdgeHitboxSize(10);
    localStorage.removeItem(AUTOROUTE_PREF_KEY);
    setAutoRoutePref("ask");
    setPanMode("select-first");
  };

  return (
    <>
      <SectionHeading title="Advanced" subtitle="Canvas navigation, scroll, and interaction behaviour." />

      {/* Navigation */}
      <FieldLabel>Navigation</FieldLabel>
      <div className="flex flex-col gap-2 mb-6">
        <SelectRow label="Left drag" value={panMode} onChange={(v) => setPanMode(v as PanMode)}>
          <option value="select-first">Selection box</option>
          <option value="pan-first">Pan canvas</option>
        </SelectRow>
        <Card>
          <span className="text-xs text-[var(--color-text-heading)]">Shift + left drag</span>
          <span className="ml-auto text-xs text-[var(--color-text-muted)]">
            {panMode === "pan-first" ? "Selection box" : "Add to selection"}
          </span>
        </Card>
        <Card>
          <span className="text-xs text-[var(--color-text-heading)]">Middle drag</span>
          <span className="ml-auto text-xs text-[var(--color-text-muted)]">Pan canvas</span>
        </Card>
        <Card>
          <span className="text-xs text-[var(--color-text-heading)]">Space + drag</span>
          <span className="ml-auto text-xs text-[var(--color-text-muted)]">Pan canvas</span>
        </Card>
      </div>

      {/* Scroll wheel */}
      <FieldLabel>Scroll wheel</FieldLabel>
      <div className="flex flex-col gap-2 mb-6">
        <SelectRow label="Scroll" value={scrollConfig.scroll} onChange={(v) => update({ scroll: v as ScrollAction })}>
          {ACTION_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </SelectRow>
        <SelectRow
          label="Shift + Scroll"
          value={scrollConfig.shiftScroll}
          onChange={(v) => update({ shiftScroll: v as ScrollAction })}
        >
          {ACTION_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </SelectRow>
        <SelectRow
          label="Ctrl + Scroll"
          value={scrollConfig.ctrlScroll}
          onChange={(v) => update({ ctrlScroll: v as ScrollAction })}
        >
          {ACTION_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </SelectRow>
      </div>

      {/* Sensitivity */}
      <FieldLabel>Sensitivity</FieldLabel>
      <div className="flex flex-col gap-2 mb-6">
        <SliderRow
          label="Zoom speed"
          value={scrollConfig.zoomSpeed}
          min={0.25}
          max={3}
          step={0.25}
          format={(v) => `${v.toFixed(v % 1 === 0 ? 1 : 2)}x`}
          onChange={(v) => update({ zoomSpeed: v })}
        />
        <SliderRow
          label="Pan speed"
          value={scrollConfig.panSpeed}
          min={0.25}
          max={3}
          step={0.25}
          format={(v) => `${v.toFixed(v % 1 === 0 ? 1 : 2)}x`}
          onChange={(v) => update({ panSpeed: v })}
        />
      </div>

      {/* Trackpad */}
      <FieldLabel>Trackpad</FieldLabel>
      <div className="mb-6">
        <ToggleRow
          label="Auto-detect trackpad"
          hint="When off, all scroll input uses the scroll wheel settings above."
          checked={scrollConfig.trackpadEnabled}
          onChange={(v) => update({ trackpadEnabled: v })}
        />
      </div>

      {/* Edge interaction */}
      <FieldLabel>Connections</FieldLabel>
      <div className="mb-6">
        <SliderRow
          label="Connection hitbox width"
          hint="Smaller = easier to create new connections without selecting existing ones."
          value={edgeHitboxSize}
          min={4}
          max={20}
          step={2}
          format={(v) => `${v}px`}
          onChange={setEdgeHitboxSize}
        />
      </div>

      {/* Auto-route */}
      <FieldLabel>Auto-route</FieldLabel>
      <div className="mb-6">
        <SelectRow
          label="When disabling auto-route"
          hint="Choose whether to keep auto-routed paths or revert to your previous routing."
          value={autoRoutePref}
          onChange={(v) => {
            if (v === "ask") localStorage.removeItem(AUTOROUTE_PREF_KEY);
            else localStorage.setItem(AUTOROUTE_PREF_KEY, v);
            setAutoRoutePref(v);
          }}
        >
          <option value="ask">Ask me</option>
          <option value="keep">Always keep routes</option>
          <option value="revert">Always restore previous</option>
        </SelectRow>
      </div>

      {!isDefault && (
        <button type="button" onClick={resetAll} className="ui-btn ui-btn-ghost text-[11px]">
          Reset advanced settings to defaults
        </button>
      )}
    </>
  );
}

function AiSection() {
  const mcpEnabled = useSchematicStore((s) => s.mcpBridgeEnabled);
  const setMcpEnabled = useSchematicStore((s) => s.setMcpBridgeEnabled);
  const mcpToken = useSchematicStore((s) => s.mcpBridgeToken);
  const setMcpToken = useSchematicStore((s) => s.setMcpBridgeToken);
  const mcpPort = useSchematicStore((s) => s.mcpBridgePort);
  const setMcpPort = useSchematicStore((s) => s.setMcpBridgePort);
  const mcpStatus = useSchematicStore((s) => s.mcpBridgeStatus);
  const mcpStatusDetail = useSchematicStore((s) => s.mcpBridgeStatusDetail);

  return (
    <>
      <SectionHeading
        title="AI Assistant (MCP) — Beta"
        subtitle="Let an AI assistant read and edit this drawing while you watch. Early Beta — only a core set of actions is supported."
      />

      <div className="flex flex-col gap-2.5 max-w-[520px]">
        <ToggleRow
          label="Let Claude read & edit this schematic"
          hint="Connects this tab to the EasySchematic MCP server running on your computer, so an AI assistant (Claude) can add devices, set properties, and make connections live. Off by default; your drawing is only reachable while this is on."
          checked={mcpEnabled}
          onChange={setMcpEnabled}
        />

        <Card>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-xs font-medium text-[var(--color-text-heading)]">Pairing token</span>
            <span className="text-[10.5px] text-[var(--color-text-muted)]">
              Copy the token the MCP server prints on startup and paste it here. This stops other
              programs on your computer from reaching the bridge.
            </span>
          </div>
          <input
            type="password"
            value={mcpToken}
            onChange={(e) => setMcpToken(e.target.value)}
            placeholder="Paste from the server"
            className="ui-input ml-auto w-[180px] font-[var(--font-mono)]"
          />
        </Card>

        <Card>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-xs font-medium text-[var(--color-text-heading)]">Server port</span>
          </div>
          <input
            type="number"
            value={mcpPort}
            onChange={(e) => setMcpPort(Number(e.target.value) || mcpPort)}
            className="ui-input ml-auto w-[100px] font-[var(--font-mono)]"
          />
        </Card>

        <Card>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-xs font-medium text-[var(--color-text-heading)]">Status</span>
            {mcpStatusDetail && (
              <span className="text-[10.5px] text-[var(--color-text-muted)]">{mcpStatusDetail}</span>
            )}
          </div>
          <span
            className={`ml-auto text-xs font-medium ${
              mcpStatus === "connected"
                ? "text-[var(--color-success)]"
                : mcpStatus === "error"
                  ? "text-[var(--color-error)]"
                  : "text-[var(--color-text-muted)]"
            }`}
          >
            {MCP_STATUS_LABELS[mcpStatus] ?? mcpStatus}
          </span>
        </Card>
      </div>

      <p className="text-[10.5px] text-[var(--color-text-muted)] mt-3.5 max-w-[520px]">
        Setup help is in the docs under “AI Assistant (MCP)”.
      </p>
    </>
  );
}

function AccountSection() {
  return (
    <>
      <SectionHeading title="Account" subtitle="Profile and plan." />
      <div className="flex flex-col gap-3.5 max-w-[420px]">
        <label className="flex flex-col gap-1.5">
          <FieldLabel>Name</FieldLabel>
          <div className="h-[34px] flex items-center px-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[12.5px] text-[var(--color-text-heading)]">
            Glen Brown
          </div>
        </label>
        <label className="flex flex-col gap-1.5">
          <FieldLabel>Email</FieldLabel>
          <div className="h-[34px] flex items-center px-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[12.5px] text-[var(--color-text)]">
            glen@glenandrewbrown.com
          </div>
        </label>
        <div className="flex items-center gap-3 px-4 py-3.5 bg-[var(--color-surface-hover)] border border-[var(--color-accent)] rounded-[10px] mt-1.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-[12.5px] font-semibold text-[var(--color-text-heading)]">Pro plan</span>
            <span className="text-[10.5px] text-[var(--color-text-muted)]">
              Unlimited projects · PDF export · inventory
            </span>
          </div>
          <button type="button" className="ui-btn ui-btn-ghost ml-auto text-[11.5px]">
            Manage
          </button>
        </div>
      </div>
    </>
  );
}

// ── Shell ────────────────────────────────────────────────────────────────────

export default function PreferencesDialog({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<SectionId>("appearance");

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--color-bg)]">
      {/* Header */}
      <header className="h-[50px] shrink-0 flex items-center gap-3 px-4 bg-[var(--color-surface)] border-b border-[var(--ui-border)]">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 h-[30px] pl-2 pr-3 bg-transparent border border-[var(--ui-border)] rounded-lg cursor-pointer text-[11.5px] font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Editor
        </button>
        <span className="text-[13px] font-semibold text-[var(--color-text-heading)]">Settings</span>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Nav rail */}
        <aside className="w-[210px] shrink-0 border-r border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-3.5 flex flex-col gap-0.5">
          {NAV_ITEMS.map((n) => {
            const active = section === n.id;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setSection(n.id)}
                className={`flex items-center gap-2.5 h-[34px] px-3 rounded-lg cursor-pointer text-xs font-medium text-left transition-colors ${
                  active
                    ? "bg-[var(--color-surface-hover)] text-[var(--color-text-heading)]"
                    : "bg-transparent text-[var(--color-text)] hover:bg-[var(--color-surface)]"
                }`}
              >
                {n.label}
              </button>
            );
          })}
          {/* Pinned user chip */}
          <div className="mt-auto flex items-center gap-2.5 px-2 py-2.5 border-t border-[var(--color-border)]">
            <span className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[11px] font-semibold text-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] border border-[var(--color-accent)]">
              GB
            </span>
            <div className="flex flex-col leading-[1.3]">
              <span className="text-[11.5px] font-medium text-[var(--color-text-heading)]">Glen Brown</span>
              <span className="text-[9px] text-[var(--color-text-muted)]">Pro plan</span>
            </div>
          </div>
        </aside>

        {/* Content */}
        <div className="flex-1 overflow-auto px-[30px] py-6">
          <div className="max-w-[620px]">
            {section === "appearance" && <AppearanceSection />}
            {section === "units" && <UnitsSection />}
            {section === "inventory" && <InventorySection onClose={onClose} />}
            {section === "advanced" && <AdvancedSection />}
            {section === "ai" && <AiSection />}
            {section === "account" && <AccountSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSchematicStore } from "../store";
import type { DeviceData, SchematicNode } from "../types";
import { buildDeviceSuggestions } from "../deviceSuggestions";
import ArtworkChip from "./ArtworkChip";
import Combobox from "./ui/Combobox";
import TagInput from "./ui/TagInput";

/**
 * Full-page editor for a device's rare-edit identity + metadata fields. The everyday Inspector
 * leads with connections, layer and layout; the fields that change once in a device's life —
 * name, serial, make/model, category, tags, notes — live here on a roomy dedicated surface.
 *
 * Mounted alongside the app's other full-screen overlays (DeviceEditor / PreferencesDialog) and
 * driven by the store's `deviceDetailsPageId`; renders nothing when that id is null.
 */

/** Mono, uppercase, wide-tracked label — the engineering-instrument field-label style. */
const LABEL_STYLE = { fontFamily: "var(--font-mono)", letterSpacing: "0.1em" } as const;
const MONO_STYLE = { fontFamily: "var(--font-mono)" } as const;

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="block text-[10px] uppercase text-[var(--color-text-muted)] mb-1" style={LABEL_STYLE}>
      {children}
    </span>
  );
}

interface TextFieldProps {
  label: string;
  value: string | undefined;
  onCommit: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  hint?: string;
}

/** Roomy labelled text input. Commits on blur/Enter (one undo entry per commit). */
function TextField({ label, value, onCommit, placeholder, mono, hint }: TextFieldProps) {
  const [v, setV] = useState(value ?? "");
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input
        className="ui-input w-full text-sm h-9"
        style={mono ? MONO_STYLE : undefined}
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => onCommit(v)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      {hint && <span className="block text-[10px] text-[var(--color-text-muted)] mt-1 leading-relaxed">{hint}</span>}
    </label>
  );
}

interface ComboFieldProps {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
}

/** Labelled autocomplete field, wrapping the shared Combobox. */
function ComboField({ label, value, onCommit, suggestions, placeholder }: ComboFieldProps) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <Combobox value={value} onCommit={onCommit} suggestions={suggestions} placeholder={placeholder} />
    </label>
  );
}

/** A labelled group of fields, laid out as a titled block with a rule. */
function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-[11px] uppercase font-semibold text-[var(--color-text-muted)]" style={LABEL_STYLE}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function DetailsForm({ node }: { node: SchematicNode }) {
  const data = node.data as DeviceData;
  const updateDevice = useSchematicStore((s) => s.updateDevice);
  const closeDeviceDetailsPage = useSchematicStore((s) => s.closeDeviceDetailsPage);
  const allNodes = useSchematicStore((s) => s.nodes);
  const tagSuggestions = useSchematicStore((s) => s.tagSuggestions);
  const fieldSuggestions = useSchematicStore((s) => s.fieldSuggestions);
  const recordSuggestions = useSchematicStore((s) => s.recordSuggestions);

  const suggestions = useMemo(
    () => buildDeviceSuggestions(allNodes, { tagSuggestions, fieldSuggestions }),
    [allNodes, tagSuggestions, fieldSuggestions],
  );

  const patch = (p: Partial<DeviceData>) => updateDevice(node.id, { ...data, ...p });

  // Esc returns to the editor, matching the app's other full-screen overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDeviceDetailsPage();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeDeviceDetailsPage]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--color-bg)]" data-print-hide>
      {/* Header */}
      <header className="h-[50px] shrink-0 flex items-center gap-3 px-4 bg-[var(--color-surface)] border-b border-[var(--ui-border)]">
        <button
          type="button"
          onClick={closeDeviceDetailsPage}
          className="flex items-center gap-1.5 h-[30px] pl-2 pr-3 bg-transparent border border-[var(--ui-border)] rounded-lg cursor-pointer text-[11.5px] font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Editor
        </button>
        <span className="text-[13px] font-semibold text-[var(--color-text-heading)]">Device details</span>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto px-[30px] py-8">
        <div className="mx-auto max-w-[680px] flex flex-col gap-9">
          {/* Hero */}
          <div className="flex items-center gap-3.5">
            <ArtworkChip artworkAssetId={data.artworkAssetId} device={data} size={44} className="shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-lg font-semibold text-[var(--color-text-heading)] truncate">
                {data.label || "Untitled device"}
              </span>
              <span className="text-xs text-[var(--color-text-muted)] truncate">
                {data.deviceType || data.category || "Device"}
              </span>
            </div>
          </div>

          <FieldGroup title="Identity">
            <TextField
              label="Name"
              value={data.label}
              onCommit={(v) => patch({ label: v, baseLabel: undefined })}
              placeholder="Device name"
            />
            <TextField
              label="Short name"
              value={data.shortName}
              onCommit={(v) => patch({ shortName: v || undefined })}
              placeholder="e.g. 8040b"
              hint="A compact label used where space is tight, if the full name is long."
            />
            <div className="grid grid-cols-2 gap-4">
              <ComboField
                label="Type"
                value={data.deviceType ?? ""}
                suggestions={suggestions.deviceType}
                placeholder="speaker"
                onCommit={(v) => {
                  patch({ deviceType: v });
                  if (v) recordSuggestions({ deviceType: v });
                }}
              />
              <ComboField
                label="Category"
                value={data.category ?? ""}
                suggestions={suggestions.category}
                placeholder="audio"
                onCommit={(v) => {
                  patch({ category: v || undefined });
                  if (v) recordSuggestions({ category: v });
                }}
              />
            </div>
          </FieldGroup>

          <FieldGroup title="Make & model">
            <div className="grid grid-cols-2 gap-4">
              <ComboField
                label="Manufacturer"
                value={data.manufacturer ?? ""}
                suggestions={suggestions.manufacturer}
                placeholder="Genelec"
                onCommit={(v) => {
                  patch({ manufacturer: v || undefined });
                  if (v) recordSuggestions({ manufacturer: v });
                }}
              />
              <TextField
                label="Model number"
                value={data.modelNumber}
                onCommit={(v) => patch({ modelNumber: v || undefined })}
                placeholder="8040b"
                mono
              />
            </div>
            <TextField
              label="Serial number"
              value={data.serialNumber}
              onCommit={(v) => patch({ serialNumber: v || undefined })}
              placeholder="e.g. SN-00421"
              mono
              hint="The physical serial of this specific unit — carried into the pack list and device report."
            />
            <TextField
              label="Reference URL"
              value={data.referenceUrl}
              onCommit={(v) => patch({ referenceUrl: v || undefined })}
              placeholder="https://…"
              mono
              hint="Manufacturer spec sheet or product page for this device."
            />
          </FieldGroup>

          <FieldGroup title="Classification">
            <label className="block">
              <FieldLabel>Tags</FieldLabel>
              <TagInput
                tags={data.tags ?? []}
                suggestions={suggestions.tags}
                placeholder="Add tag…"
                onChange={(tags) => patch({ tags: tags.length > 0 ? tags : undefined })}
                onBlur={() => {
                  const tags = data.tags ?? [];
                  if (tags.length > 0) recordSuggestions({ tags });
                }}
              />
              <span className="block text-[10px] text-[var(--color-text-muted)] mt-1 leading-relaxed">
                Free classification (e.g. rental, FOH, spare) for filtering, search and reports.
              </span>
            </label>
          </FieldGroup>

          <FieldGroup title="Notes">
            <label className="block">
              <FieldLabel>Note</FieldLabel>
              <textarea
                key={`note-${node.id}`}
                className="ui-input w-full text-sm min-h-[96px] py-2 resize-y"
                defaultValue={data.note ?? ""}
                placeholder="Free-text note carried into the pack list and device report…"
                onBlur={(e) => patch({ note: e.target.value.trim() || undefined })}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </label>
          </FieldGroup>
        </div>
      </div>
    </div>
  );
}

/** Full-screen device details page — mounted with the app's other overlays; null when closed. */
export default function DeviceDetailsPage() {
  const deviceDetailsPageId = useSchematicStore((s) => s.deviceDetailsPageId);
  const node = useSchematicStore((s) =>
    s.nodes.find((n) => n.id === deviceDetailsPageId && n.type === "device"),
  );

  if (!deviceDetailsPageId || !node) return null;
  return <DetailsForm key={node.id} node={node} />;
}

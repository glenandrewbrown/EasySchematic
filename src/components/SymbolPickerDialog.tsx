import { useEffect, useMemo, useState } from "react";
import {
  searchSymbolLibrary,
  symbolCountByCategory,
  SYMBOL_CATEGORIES,
  SYMBOL_CATEGORY_LABELS,
  SYMBOL_LIBRARY_ATTRIBUTION,
  type SymbolCategory,
  type SymbolLibraryEntry,
} from "../symbolLibrary";

interface SymbolPickerDialogProps {
  /** Dialog heading (e.g. "Choose a device graphic"). */
  title?: string;
  /** Called with the chosen symbol; the caller registers/assigns it. */
  onPick: (entry: SymbolLibraryEntry) => void;
  onClose: () => void;
  /** When set, the footer shows "Upload SVG…" (board 3a) — the caller opens its upload flow. */
  onUpload?: () => void;
  /** When set, the footer shows "None" — clears the current assignment back to the class default. */
  onClear?: () => void;
}

/**
 * Searchable, categorised picker over the bundled SVG symbol library
 * (generic / audio / network / furniture). Used to assign a glyph to a device/object
 * graphic and to place library furniture as objects. Each glyph is app-bundled and
 * already sanitiser-verified, so it is injected directly like the furniture catalog.
 */
export default function SymbolPickerDialog({ title = "Symbol library", onPick, onClose, onUpload, onClear }: SymbolPickerDialogProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SymbolCategory | "all">("all");
  const counts = useMemo(() => symbolCountByCategory(), []);
  const results = useMemo(() => searchSymbolLibrary(query, category), [query, category]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="ui-dialog-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="symbol-picker-dialog-title"
        className="ui-dialog w-[600px] max-h-[86vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--ui-border)] flex items-center justify-between shrink-0">
          <h2 id="symbol-picker-dialog-title" className="text-sm font-semibold text-[var(--color-text-heading)]">{title}</h2>
          <button onClick={onClose} className="ui-btn ui-btn-ghost text-lg leading-none" aria-label="Close">
            &times;
          </button>
        </div>

        {/* Search + category tabs */}
        <div className="px-4 pt-3 pb-2 shrink-0 space-y-2 border-b border-[var(--ui-border)]">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbols — speaker, switch, table, arrow…"
            className="ui-input w-full text-sm"
          />
          <div className="flex flex-wrap gap-1">
            {(["all", ...SYMBOL_CATEGORIES] as const).map((cat) => {
              const active = category === cat;
              const label = cat === "all" ? "All" : SYMBOL_CATEGORY_LABELS[cat];
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-2.5 h-7 rounded-md text-[11.5px] font-medium border transition-colors cursor-pointer ${
                    active
                      ? "text-[var(--color-accent)] border-[var(--color-border)] bg-[var(--color-accent-soft)]"
                      : "text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text)]"
                  }`}
                >
                  {label}
                  <span className="ml-1 opacity-60 tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>
                    {counts[cat]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Glyph grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {results.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)] text-center py-8">
              No symbols match “{query}”.
            </p>
          ) : (
            <div className="grid grid-cols-6 gap-2">
              {results.map((entry) => (
                <button
                  key={`${entry.category}/${entry.id}`}
                  type="button"
                  onClick={() => onPick(entry)}
                  title={`${entry.name} · ${entry.category}`}
                  className="group flex flex-col items-center gap-1 p-1.5 rounded-md border border-[var(--ui-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] transition-colors cursor-pointer"
                >
                  <span
                    className="flex items-center justify-center w-9 h-9 text-[var(--color-text)] [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-full [&>svg]:max-h-full"
                    /* Safe: library SVGs are app-bundled and sanitiser-verified (same trust
                       level as the furniture catalog / src/symbols). */
                    dangerouslySetInnerHTML={{ __html: entry.svg }}
                  />
                  <span className="text-[8.5px] leading-tight text-center text-[var(--color-text-muted)] line-clamp-1 w-full truncate">
                    {entry.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer: actions + attribution */}
        {(onUpload || onClear) && (
          <div className="px-4 py-2 border-t border-[var(--ui-border)] shrink-0 flex items-center gap-3">
            {onUpload && (
              <button
                type="button"
                onClick={onUpload}
                className="text-[11.5px] font-medium text-[var(--color-accent)] hover:opacity-80 cursor-pointer"
              >
                ↥ Upload SVG…
              </button>
            )}
            {onClear && (
              <button
                type="button"
                onClick={onClear}
                className="text-[11.5px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
                title="Use the class-default symbol"
              >
                None
              </button>
            )}
            <button type="button" onClick={onClose} className="ml-auto ui-btn ui-btn-secondary h-[26px] text-[11px]">
              Cancel
            </button>
          </div>
        )}
        <div className="px-4 py-2 border-t border-[var(--ui-border)] shrink-0">
          <p className="text-[9.5px] leading-snug text-[var(--color-text-muted)]">{SYMBOL_LIBRARY_ATTRIBUTION}</p>
        </div>
      </div>
    </div>
  );
}

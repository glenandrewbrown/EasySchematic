import { useId, useMemo, useRef, useState } from "react";
import { filterSuggestions } from "../../comboboxFilter";

export interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** Fires when focus leaves the whole control (for one undo commit upstream). */
  onBlur?: () => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
}

const MAX_ROWS = 8;

/** Normalize a raw entry: trim + lowercase. Empty after trim => null (skip). */
function normalizeTag(raw: string): string | null {
  const cleaned = raw.trim().toLowerCase();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Multi-value tag chip input with autocomplete. Chips are dismissible; typing
 * filters suggestions (via `filterSuggestions`); Enter/comma adds the typed
 * tag; Backspace on an empty input removes the last chip. `onBlur` fires once
 * when focus leaves the whole control so the parent can batch a single undo
 * entry. No external dependencies; styling uses CSS var tokens.
 */
export default function TagInput({
  tags,
  onChange,
  onBlur,
  suggestions,
  placeholder,
  className,
}: TagInputProps) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reactId = useId();
  const listId = `${reactId}-listbox`;

  // Suggestions not already chosen, matched against the current draft.
  const filtered = useMemo(() => {
    const chosen = new Set(tags.map((t) => t.toLowerCase()));
    const available = suggestions.filter((s) => !chosen.has(s.toLowerCase()));
    return filterSuggestions(draft, available, { limit: MAX_ROWS });
  }, [draft, suggestions, tags]);

  function addTag(raw: string): void {
    const tag = normalizeTag(raw);
    setDraft("");
    setHighlight(-1);
    if (!tag) return;
    if (tags.some((t) => t.toLowerCase() === tag)) return; // dedupe
    onChange([...tags, tag]);
  }

  function removeTag(index: number): void {
    onChange(tags.filter((_, i) => i !== index));
  }

  function pick(suggestion: string): void {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    addTag(suggestion);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (open && highlight >= 0 && highlight < filtered.length) {
        addTag(filtered[highlight]);
      } else {
        addTag(draft);
      }
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      e.preventDefault();
      removeTag(tags.length - 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (filtered.length === 0 ? -1 : (h + 1) % filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (filtered.length === 0 ? -1 : (h - 1 + filtered.length) % filtered.length));
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setHighlight(-1);
    }
  }

  // Fire onBlur only when focus actually leaves the whole control, not when it
  // moves between the input and a chip button inside it.
  function handleBlurCapture(e: React.FocusEvent<HTMLDivElement>): void {
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    blurTimer.current = setTimeout(() => {
      setOpen(false);
      setHighlight(-1);
      onBlur?.();
    }, 120);
  }

  return (
    <div
      className={`relative ${className ?? ""}`}
      onBlurCapture={handleBlurCapture}
      onFocusCapture={() => {
        if (blurTimer.current) clearTimeout(blurTimer.current);
      }}
    >
      <div
        className="ui-input flex w-full flex-wrap items-center gap-1"
        style={{ minHeight: 30 }}
      >
        {tags.map((tag, i) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]"
            style={{
              background: "var(--color-surface-hover)",
              color: "var(--color-text)",
              border: "1px solid var(--ui-border)",
            }}
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              className="cursor-pointer leading-none"
              style={{ color: "var(--color-text-muted)" }}
              onClick={() => removeTag(i)}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          className="min-w-[60px] flex-1 bg-transparent text-xs outline-none"
          style={{ color: "var(--color-text)" }}
          value={draft}
          placeholder={tags.length === 0 ? placeholder : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
            setHighlight(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
      </div>
      {open && filtered.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto py-1"
          style={{
            background: "var(--color-surface-raised)",
            border: "1px solid var(--ui-border)",
            borderRadius: "var(--ui-radius-sm)",
            boxShadow: "var(--ui-shadow-menu)",
          }}
        >
          {filtered.map((suggestion, i) => (
            <li
              key={suggestion}
              role="option"
              aria-selected={i === highlight}
              className="cursor-pointer truncate px-2.5 py-1 text-xs"
              style={{
                color: "var(--color-text)",
                background: i === highlight ? "var(--color-surface-hover)" : "transparent",
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(suggestion);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

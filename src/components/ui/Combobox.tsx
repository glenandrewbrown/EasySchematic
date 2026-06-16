import { useId, useMemo, useRef, useState } from "react";
import { filterSuggestions } from "../../comboboxFilter";

export interface ComboboxProps {
  value: string;
  /** Called on blur or when a suggestion is selected. */
  onCommit: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  id?: string;
  /** Tighter style for the Inspector. */
  compact?: boolean;
}

const MAX_ROWS = 8;

/**
 * Controlled single-value combobox: a text input with a filtered, keyboard-
 * navigable suggestion dropdown. Commits the typed text on blur, or the chosen
 * suggestion on click / Enter. No external dependencies — matching logic lives
 * in `filterSuggestions`, styling uses the shared `.ui-input` + CSS var tokens.
 */
export default function Combobox({
  value,
  onCommit,
  suggestions,
  placeholder,
  className,
  id,
  compact,
}: ComboboxProps) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reactId = useId();
  const listId = `${id ?? reactId}-listbox`;

  const filtered = useMemo(
    () => filterSuggestions(draft, suggestions, { limit: MAX_ROWS }),
    [draft, suggestions],
  );

  // Keep the draft in sync if the committed value changes from outside while
  // the field is idle (not focused / not open).
  if (!open && draft !== value) {
    setDraft(value);
  }

  function commit(next: string): void {
    setOpen(false);
    setHighlight(-1);
    setDraft(next);
    if (next !== value) onCommit(next);
  }

  function pick(suggestion: string): void {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    commit(suggestion);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (filtered.length === 0 ? -1 : (h + 1) % filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (filtered.length === 0 ? -1 : (h - 1 + filtered.length) % filtered.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && highlight >= 0 && highlight < filtered.length) {
        commit(filtered[highlight]);
      } else {
        commit(draft);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setHighlight(-1);
      setDraft(value);
    }
  }

  function handleBlur(): void {
    // Defer so a click on a row (which blurs the input first) can run pick().
    blurTimer.current = setTimeout(() => {
      commit(draft);
    }, 120);
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        className="ui-input w-full"
        style={compact ? { padding: "3px 8px", fontSize: 11 } : undefined}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          setDraft(e.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
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
              // onMouseDown (not onClick) so it fires before the input's blur.
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

import { useEffect, useRef } from "react";

/** A named swatch offered in the layer colour picker. */
interface Swatch {
  name: string;
  hex: string;
}

/** Compact, curated palette — distinct hues that read well on light and dark. */
const SWATCHES: ReadonlyArray<Swatch> = [
  { name: "Red", hex: "#ef4444" },
  { name: "Orange", hex: "#f97316" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Yellow", hex: "#eab308" },
  { name: "Green", hex: "#22c55e" },
  { name: "Teal", hex: "#14b8a6" },
  { name: "Cyan", hex: "#06b6d4" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Indigo", hex: "#6366f1" },
  { name: "Violet", hex: "#8b5cf6" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Slate", hex: "#64748b" },
];

interface LayerColorPickerProps {
  /** Currently selected colour (hex), if any. */
  value?: string;
  /** Called with the chosen swatch hex. */
  onSelect: (color: string) => void;
  /** Called when the user clears the colour ("No colour"). */
  onClear: () => void;
  /** Called when the popover should dismiss (outside click / Escape). */
  onClose: () => void;
}

/**
 * Small floating swatch grid for assigning a layer's colour. Absolutely
 * positioned by its parent; dismisses on outside click and Escape.
 */
export default function LayerColorPicker({
  value,
  onSelect,
  onClear,
  onClose,
}: LayerColorPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const selected = value?.toLowerCase();

  return (
    <div
      ref={ref}
      className="absolute z-50 mt-1 p-2 rounded-md bg-[var(--color-surface-raised)] border border-[var(--ui-border-strong)] shadow-[var(--ui-shadow-raised)]"
      style={{ width: 132 }}
      role="dialog"
      aria-label="Layer colour"
    >
      <div className="grid grid-cols-6 gap-1">
        {SWATCHES.map((s) => {
          const isCurrent = selected === s.hex.toLowerCase();
          return (
            <button
              key={s.hex}
              onClick={() => onSelect(s.hex)}
              className={`w-4 h-4 rounded-full cursor-pointer transition-transform hover:scale-110 ${
                isCurrent
                  ? "ring-2 ring-offset-1 ring-[var(--color-accent)] ring-offset-[var(--color-surface-raised)]"
                  : "border border-black/10"
              }`}
              style={{ background: s.hex }}
              title={s.name}
              aria-label={s.name}
              aria-pressed={isCurrent}
            />
          );
        })}
      </div>
      <button
        onClick={onClear}
        className={`mt-2 w-full text-[10px] cursor-pointer rounded px-1.5 py-1 text-left hover:bg-[var(--color-surface-hover)] ${
          !value
            ? "text-[var(--color-text)]"
            : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        }`}
      >
        No colour
      </button>
    </div>
  );
}

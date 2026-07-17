import { useRef } from "react";
import { useSchematicStore } from "../store";
import { LAYPAL_COLORS } from "../laypal";

interface ColorSwatchRowProps {
  /** Palette to show; defaults to LAYPAL. */
  colors?: readonly string[];
  /** Currently applied colour (any case), or undefined. */
  value?: string;
  onPick: (hex: string) => void;
  /** Swatch size in px (default 20). */
  size?: number;
  /** Omit the per-document recent-colours segment (e.g. ultra-compact rows). */
  hideRecents?: boolean;
  ariaLabel?: string;
}

/**
 * A colour swatch row that ALWAYS ends with a ＋ custom chip → the native OS colour
 * picker (input[type=color]) — boards 1b/5c. Colours picked through the chip join a
 * per-document recent-colours segment shared by every row (inspector, context menu,
 * layers, sheet).
 */
export default function ColorSwatchRow({
  colors = LAYPAL_COLORS,
  value,
  onPick,
  size = 20,
  hideRecents = false,
  ariaLabel = "Colour",
}: ColorSwatchRowProps) {
  const recents = useSchematicStore((s) => s.recentCustomColors);
  const pushRecent = useSchematicStore((s) => s.pushRecentCustomColor);
  const inputRef = useRef<HTMLInputElement>(null);

  const active = value?.toLowerCase();
  const paletteSet = new Set(colors.map((c) => c.toLowerCase()));
  const visibleRecents = hideRecents ? [] : recents.filter((c) => !paletteSet.has(c.toLowerCase())).slice(0, 4);

  const swatch = (hex: string, key: string) => {
    const isActive = active === hex.toLowerCase();
    return (
      <button
        key={key}
        type="button"
        onClick={() => onPick(hex)}
        aria-label={`${ariaLabel}: ${hex}`}
        aria-pressed={isActive}
        title={hex}
        className="rounded-[6px] shrink-0 cursor-pointer transition-shadow"
        style={{
          width: size,
          height: size,
          background: hex,
          boxShadow: isActive
            ? "0 0 0 2px var(--color-surface), 0 0 0 3.5px var(--color-accent)"
            : "inset 0 0 0 1px rgba(0,0,0,.12)",
        }}
      />
    );
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label={ariaLabel}>
      {colors.map((c, i) => swatch(c, `p-${i}`))}
      {visibleRecents.map((c, i) => swatch(c, `r-${i}`))}
      {/* ＋ custom chip → native OS colour picker. The input is visually hidden but kept
          in-flow (1px) so the browser anchors the picker near the chip. */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label={`${ariaLabel}: custom…`}
        title="Custom colour…"
        className="shrink-0 rounded-[6px] inline-flex items-center justify-center cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
        style={{
          width: size,
          height: size,
          background:
            "conic-gradient(#e5645f, #e0a345, #46c89a, #3d8bfd, #c879e8, #e5645f)",
        }}
      >
        <span
          className="inline-flex items-center justify-center rounded-[4px] bg-[var(--color-surface)] font-semibold leading-none"
          style={{ width: size - 6, height: size - 6, fontSize: size * 0.6 }}
          aria-hidden
        >
          +
        </span>
      </button>
      <input
        ref={inputRef}
        type="color"
        defaultValue={active && /^#[0-9a-f]{6}$/.test(active) ? active : "#3d8bfd"}
        className="w-px h-px opacity-0 border-0 p-0"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const hex = e.target.value;
          pushRecent(hex);
          onPick(hex);
        }}
      />
    </div>
  );
}

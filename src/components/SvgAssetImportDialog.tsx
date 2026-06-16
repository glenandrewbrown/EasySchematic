import { useState, useRef, useCallback } from "react";
import { useSchematicStore } from "../store";
import { sanitizeSvg } from "../svgSanitizer";

interface SvgAssetImportDialogProps {
  onPicked: (assetId: string) => void;
  onClose: () => void;
}

/** Reject inputs over this size before we even read them (defensive guard). */
const MAX_SVG_BYTES = 512 * 1024;

export default function SvgAssetImportDialog({ onPicked, onClose }: SvgAssetImportDialogProps) {
  const svgAssets = useSchematicStore((s) => s.svgAssets);
  const addSvgAsset = useSchematicStore((s) => s.addSvgAsset);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sanitized, setSanitized] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const existing = Object.entries(svgAssets);

  const handleChoose = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSanitized(null);
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;

    if (file.size > MAX_SVG_BYTES) {
      setError("This SVG is too large (max 512 KB). Please use a smaller file.");
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setError("Couldn't read that file. Please try again.");
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const clean = sanitizeSvg(text);
      if (clean === null) {
        setError("This SVG couldn't be loaded — it may use unsupported features.");
        return;
      }
      setSanitized(clean);
    };
    reader.readAsText(file);
  }, []);

  const handleUse = useCallback(() => {
    if (!sanitized) return;
    const id = addSvgAsset(sanitized);
    onPicked(id);
    onClose();
  }, [sanitized, addSvgAsset, onPicked, onClose]);

  const handleReuse = useCallback(
    (id: string) => {
      onPicked(id);
      onClose();
    },
    [onPicked, onClose],
  );

  return (
    <div className="ui-dialog-backdrop" onClick={onClose}>
      <div
        className="ui-dialog w-[460px] max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--ui-border)] flex items-center justify-between shrink-0">
          <h2 className="text-sm font-semibold text-[var(--color-text-heading)]">
            Custom SVG graphic
          </h2>
          <button onClick={onClose} className="ui-btn ui-btn-ghost text-lg leading-none">
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={handleChoose} className="ui-btn ui-btn-secondary">
              Choose SVG file…
            </button>
            <span className="text-[11px] text-[var(--color-text-muted)]">Max 512 KB</span>
          </div>

          {error && (
            <p className="text-xs text-[var(--color-danger,#dc2626)]" role="alert">
              {error}
            </p>
          )}

          {sanitized && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                Preview
              </div>
              {/* Safe: sanitizeSvg already stripped <script>, on* handlers, javascript:/
                  external refs, and <foreignObject> down to an allowlisted SVG subset. */}
              <div
                className="w-full h-40 border border-[var(--ui-border)] rounded bg-[var(--color-surface)] flex items-center justify-center overflow-hidden [&>svg]:max-w-full [&>svg]:max-h-full"
                dangerouslySetInnerHTML={{ __html: sanitized }}
              />
            </div>
          )}

          {existing.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                Reuse an imported graphic
              </div>
              <div className="grid grid-cols-4 gap-2">
                {existing.map(([id, markup]) => (
                  <button
                    key={id}
                    onClick={() => handleReuse(id)}
                    title="Use this graphic"
                    className="aspect-square border border-[var(--ui-border)] rounded bg-[var(--color-surface)] flex items-center justify-center overflow-hidden cursor-pointer hover:border-[var(--color-accent)] transition-colors p-1 [&>svg]:max-w-full [&>svg]:max-h-full"
                    /* Safe: stored markup was sanitized by sanitizeSvg at the store boundary. */
                    dangerouslySetInnerHTML={{ __html: markup }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--ui-border)] flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="ui-btn ui-btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleUse}
            disabled={!sanitized}
            className="ui-btn ui-btn-primary"
          >
            Use graphic
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/svg+xml,.svg"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}

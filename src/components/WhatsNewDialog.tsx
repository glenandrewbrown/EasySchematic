interface WhatsNewDialogProps {
  open: boolean;
  onClose: () => void;
}

const FEATURES: { title: string; where: string; how: string }[] = [
  {
    title: "Layers",
    where: "Right edge of the canvas — the Layers panel",
    how: "Photoshop-style: eye toggles visibility, padlock locks a layer, double-click to rename, + New Layer to add. Select items on the canvas, hover a layer, click the arrow to move them there.",
  },
  {
    title: "Device icons",
    where: "Double-click any device → Icon",
    how: "Pick a glyph (camera, mic, speaker, computer…) and it shows before the device name on the canvas.",
  },
  {
    title: "Cable inventory",
    where: "View menu → Cable Inventory…",
    how: "Enter the exact cables you own: label, length in meters/feet, quantity. The Free column shows what is not yet assigned.",
  },
  {
    title: "Assign & chain cables",
    where: "Right-click any connection → Assign Cables…",
    how: "Cover a run with your real cables. Chain several (10 m + 5 m) through couplers. The verdict tells you Too short / Fits / Wastefully long, and Suggest best fit picks from your stock. The total flows into the cable schedule.",
  },
  {
    title: "Room dimensions",
    where: "Double-click a room → Real Dimensions",
    how: "Width × depth × ceiling height in meters. Shown on the room and used to estimate cable runs between devices inside it.",
  },
  {
    title: "Custom room shapes",
    where: "Right-click a room → Edit Shape",
    how: "Drag corners, click the small squares to add corners, double-click a corner to remove it. Every wall shows its real length live. Reset to Rectangle is in the same menu.",
  },
  {
    title: "Software inside computers",
    where: "Right-click a device → Run Inside (Software)",
    how: "Mark a device (vMix, Dante Virtual Soundcard, OBS…) as running on a computer on your canvas. It gets a 'runs on' badge. Detach from Host undoes it.",
  },
];

/** One-time feature tour, reopenable from Help → What's New. */
export default function WhatsNewDialog({ open, onClose }: WhatsNewDialogProps) {
  if (!open) return null;

  return (
    <div className="ui-dialog-backdrop" data-print-hide onClick={onClose}>
      <div className="ui-dialog w-[560px] max-w-[94vw]" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-[var(--ui-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text-heading)]">
            What&apos;s New in EasySchematic
          </h2>
          <button className="ui-btn ui-btn-ghost px-2 py-1" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        <div className="px-4 py-3 overflow-y-auto flex-1 min-h-0 space-y-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="border-t border-[var(--ui-border)] first:border-t-0 pt-3 first:pt-0">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-xs font-semibold text-[var(--color-text-heading)]">{f.title}</h3>
                <span className="text-[10px] text-[var(--color-accent)] text-right shrink-0">{f.where}</span>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed mt-0.5">{f.how}</p>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-[var(--ui-border)] flex items-center justify-between">
          <span className="text-[10px] text-[var(--color-text-muted)]">
            Reopen anytime via Help → What&apos;s New
          </span>
          <button className="ui-btn ui-btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

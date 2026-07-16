interface WhatsNewDialogProps {
  open: boolean;
  onClose: () => void;
}

const FEATURES: { title: string; where: string; how: string }[] = [
  {
    title: "Guided Venue Setup",
    where: "Help menu → Guided Venue Setup",
    how: "A step-by-step coach for venue work: calibrate a room, place your speakers, see their coverage, then review the cable BOM. Steps tick off as you go, and you can reopen it anytime from Help.",
  },
  {
    title: "To-scale Layout view",
    where: "Top-center — Schematic / Layout toggle",
    how: "Flip from the signal-flow schematic to a top-down, to-scale floor plan. Devices become footprints sized from their real dimensions, inside rooms you've given a real width and depth.",
  },
  {
    title: "Speaker coverage",
    where: "Layout view → Coverage toggle",
    how: "Each loudspeaker casts a nominal coverage wedge (on-axis, direct-field) aimed along its rotation, so you can see what it covers. Set sensitivity, power and angle when you edit the device.",
  },
  {
    title: "Rotate & aim devices",
    where: "Layout view → right-click a device → Rotate",
    how: "Aim speakers and orient gear: rotate 90° either way, 180°, or reset to 0°. The footprint, symbol and coverage wedge all turn together.",
  },
  {
    title: "Cable BOM & run warnings",
    where: "Reports menu → Cable BOM",
    how: "A bill of materials grouped by cable type with total lengths, plus warnings when a run exceeds the cable's safe maximum length. Export to CSV or PDF.",
  },
  {
    title: "Layers & Groups",
    where: "Right edge of the canvas — the Layers & Groups panel",
    how: "The panel is now a Layer → Group → Device tree. Eye and padlock on every row, Solo a layer, expand/collapse, and click any row to select it on the canvas. Group selected devices with Ctrl/Cmd+G.",
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
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-dialog-title"
        className="ui-dialog w-[560px] max-w-[94vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-[var(--ui-border)] flex items-center justify-between">
          <h2 id="whats-new-dialog-title" className="text-sm font-semibold text-[var(--color-text-heading)]">
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

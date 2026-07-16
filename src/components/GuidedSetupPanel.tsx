import { useMemo, useState } from "react";
import { Panel } from "@xyflow/react";
import { useSchematicStore } from "../store";
import type { DeviceData, RoomData } from "../types";
import {
  GUIDED_STEPS,
  evaluateGuidedSteps,
  activeStepIndex,
  isGuidedSetupComplete,
  type GuidedRoomInput,
  type GuidedDeviceInput,
} from "../guidedSetup";

/**
 * Guided venue-setup coach — a non-modal panel that walks the user through the
 * to-scale workflow (calibrate a room → place speakers → view coverage → cable
 * BOM). Steps tick off automatically from live canvas state; two steps offer a
 * one-click action (Show coverage, Open Cable BOM).
 *
 * Rendered inside the React Flow canvas as a top-left Panel so it sits beside
 * the view-mode toggle it references; visible only when `guidedSetupOpen` is set.
 */
export default function GuidedSetupPanel() {
  const open = useSchematicStore((s) => s.guidedSetupOpen);
  const setOpen = useSchematicStore((s) => s.setGuidedSetupOpen);
  const nodes = useSchematicStore((s) => s.nodes);
  const canvasViewMode = useSchematicStore((s) => s.canvasViewMode);
  const coverageVisible = useSchematicStore((s) => s.coverageVisible);
  const setCanvasViewMode = useSchematicStore((s) => s.setCanvasViewMode);
  const setCoverageVisible = useSchematicStore((s) => s.setCoverageVisible);

  // Opening the Cable BOM is an action, not canvas state — track it locally.
  const [cableBomOpened, setCableBomOpened] = useState(false);

  const { rooms, devices } = useMemo(() => {
    const rooms: GuidedRoomInput[] = [];
    const devices: GuidedDeviceInput[] = [];
    if (!open) return { rooms, devices };
    for (const n of nodes) {
      if (n.type === "room") {
        rooms.push({ widthM: (n.data as RoomData).widthM });
      } else if (n.type === "device") {
        const d = n.data as DeviceData;
        devices.push({ deviceType: d.deviceType, ports: d.ports });
      }
    }
    return { rooms, devices };
  }, [open, nodes]);

  const completed = useMemo(
    () =>
      evaluateGuidedSteps({
        rooms,
        devices,
        canvasViewMode,
        coverageVisible,
        cableBomOpened,
      }),
    [rooms, devices, canvasViewMode, coverageVisible, cableBomOpened],
  );

  if (!open) return null;

  const active = activeStepIndex(completed);
  const done = isGuidedSetupComplete(completed);
  const doneCount = completed.filter(Boolean).length;

  const showCoverage = () => {
    setCanvasViewMode("layout");
    setCoverageVisible(true);
  };

  const openCableBom = () => {
    window.dispatchEvent(new CustomEvent("easyschematic:open-cable-bom"));
    setCableBomOpened(true);
  };

  return (
    <Panel position="top-left" data-print-hide>
      <div
        className="w-[300px] max-w-[80vw] rounded-lg border border-[var(--ui-border)] bg-[var(--color-surface)] shadow-xl"
        role="region"
        aria-label="Guided venue setup"
      >
        {/* Header */}
        <div className="px-3 py-2 border-b border-[var(--ui-border)] flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold text-[var(--color-text-heading)]">
            Guided Venue Setup
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums">
              {doneCount}/{GUIDED_STEPS.length}
            </span>
            <button
              className="ui-btn ui-btn-ghost px-1.5 py-0.5 text-xs"
              onClick={() => setOpen(false)}
              title="Close guided setup"
              aria-label="Close guided setup"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Steps */}
        <div className="px-3 py-2 space-y-1.5 max-h-[60vh] overflow-y-auto">
          {GUIDED_STEPS.map((step, i) => {
            const isDone = completed[i];
            const isActive = i === active;
            return (
              <div
                key={step.id}
                className={`rounded-md border px-2.5 py-2 transition-colors ${
                  isActive
                    ? "border-[var(--color-accent)] bg-[var(--color-surface-hover)]"
                    : "border-[var(--ui-border)]"
                } ${isDone && !isActive ? "opacity-70" : ""}`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 w-4 h-4 shrink-0 rounded-full text-[9px] font-bold flex items-center justify-center ${
                      isDone
                        ? "bg-green-500 text-white"
                        : isActive
                          ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                          : "bg-[var(--ui-border)] text-[var(--color-text-muted)]"
                    }`}
                  >
                    {isDone ? "✓" : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-[var(--color-text-heading)]">
                      {step.title}
                    </div>
                    <div className="text-[10px] text-[var(--color-accent)] mt-0.5 leading-snug">
                      {step.where}
                    </div>
                    {!isDone && (
                      <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed mt-0.5">
                        {step.how}
                      </p>
                    )}
                    {step.id === "coverage" && !isDone && (
                      <button
                        className="ui-btn ui-btn-secondary mt-1.5 px-2 py-0.5 text-[10px]"
                        onClick={showCoverage}
                      >
                        Show coverage
                      </button>
                    )}
                    {step.id === "cables" && (
                      <button
                        className="ui-btn ui-btn-secondary mt-1.5 px-2 py-0.5 text-[10px]"
                        onClick={openCableBom}
                      >
                        Open Cable BOM
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-[var(--ui-border)]">
          {done ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-green-600 font-medium">
                All set — your venue is mapped! 🎉
              </span>
              <button
                className="ui-btn ui-btn-primary px-2 py-0.5 text-[10px]"
                onClick={() => setOpen(false)}
              >
                Done
              </button>
            </div>
          ) : (
            <span className="text-[10px] text-[var(--color-text-muted)] leading-snug">
              Steps tick off as you go. Reopen via Help → Guided Venue Setup.
            </span>
          )}
        </div>
      </div>
    </Panel>
  );
}

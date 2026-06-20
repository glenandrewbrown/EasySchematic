import { useSyncExternalStore } from "react";
import { getLiveControlState, subscribeLiveControl, type LiveControlPhase } from "../liveControl/client";

const PHASE_COLOR: Record<Exclude<LiveControlPhase, "disabled">, string> = {
  connecting: "#d97706",
  connected: "#16a34a",
  disconnected: "#dc2626",
};

function phaseLabel(phase: LiveControlPhase, error?: string): string {
  switch (phase) {
    case "connecting":
      return "Connecting to Claude…";
    case "connected":
      return "Claude live control connected";
    case "disconnected":
      return error ? `Claude live control: ${error}` : "Claude live control disconnected";
    default:
      return "";
  }
}

/**
 * Tiny fixed-corner badge shown only when live control is enabled, so the user
 * can see whether the Claude bridge actually connected. Hidden entirely when
 * live control is off, so it never intrudes on normal use.
 */
export default function LiveControlIndicator() {
  const state = useSyncExternalStore(subscribeLiveControl, getLiveControlState, getLiveControlState);
  if (state.phase === "disabled") return null;

  const color = PHASE_COLOR[state.phase];
  const label = phaseLabel(state.phase, state.error);

  return (
    <div
      title={label}
      style={{
        position: "fixed",
        bottom: 10,
        left: 10,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 9px",
        borderRadius: 999,
        background: "color-mix(in srgb, var(--color-bg, #0b1220) 78%, transparent)",
        border: "1px solid color-mix(in srgb, var(--color-border, #ffffff) 18%, transparent)",
        color: "var(--color-text, #f8fafc)",
        font: "11px var(--font-mono, ui-monospace, monospace)",
        pointerEvents: "none",
        backdropFilter: "blur(6px)",
      }}
    >
      <style>{"@keyframes esLiveControlPulse{0%,100%{opacity:1}50%{opacity:.35}}"}</style>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 7px ${color}`,
          animation: state.phase === "connecting" ? "esLiveControlPulse 1.1s ease-in-out infinite" : undefined,
        }}
      />
      <span>{label}</span>
    </div>
  );
}

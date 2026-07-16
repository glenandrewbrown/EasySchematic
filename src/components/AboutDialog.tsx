import { useState } from "react";
import { DEVICE_TEMPLATES } from "../deviceLibrary";
import { forceFullReset } from "../sw-register";

declare const __APP_VERSION__: string;
declare const __BUILD_HASH__: string;

type Env = "prod" | "beta" | "dev";

function detectEnv(): Env {
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  if (host === "easyschematic.live" || host === "www.easyschematic.live") return "prod";
  if (host.startsWith("beta.")) return "beta";
  return "dev";
}

export default function AboutDialog({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [resetting, setResetting] = useState(false);

  const version = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
  const hash = typeof __BUILD_HASH__ !== "undefined" ? __BUILD_HASH__ : "local";
  const shortHash = hash.length > 7 ? hash.slice(0, 7) : hash;
  const env = detectEnv();

  const copyDebugInfo = async () => {
    const info = [
      `EasySchematic v${version} (${shortHash}) \u00b7 ${env}`,
      `UA: ${navigator.userAgent}`,
      `Viewport: ${window.innerWidth}\u00d7${window.innerHeight}`,
      `Date: ${new Date().toISOString().split("T")[0]}`,
    ].join("\n");
    await navigator.clipboard.writeText(info);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleForceUpdate = async () => {
    if (resetting) return;
    const ok = window.confirm(
      "Force update: this unregisters the service worker and clears the app cache, then reloads. " +
        "Your saved schematics (in browser storage) are NOT affected. Continue?",
    );
    if (!ok) return;
    setResetting(true);
    await forceFullReset();
  };

  return (
    <div
      className="ui-dialog-backdrop"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-dialog-title"
        className="ui-dialog w-[420px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--ui-border)]">
          <span id="about-dialog-title" className="text-sm font-semibold text-[var(--color-text-heading)]">
            About EasySchematic
          </span>
          <button
            onClick={onClose}
            className="ui-btn ui-btn-ghost text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 flex flex-col items-center text-center gap-4">
          <img src="/favicon.svg" alt="" className="w-12 h-12" />
          <div>
            <div className="text-base font-semibold text-[var(--color-text-heading)]">
              EasySchematic
            </div>
            <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Version {version} ({shortHash}) ·{" "}
              <span
                className="inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide font-semibold"
                style={{
                  backgroundColor: env === "prod" ? "#dcfce7" : env === "beta" ? "#fef3c7" : "#e5e7eb",
                  color: env === "prod" ? "#166534" : env === "beta" ? "#92400e" : "#374151",
                }}
              >
                {env}
              </span>
            </div>
          </div>

          <p className="text-xs text-[var(--color-text)] leading-relaxed max-w-[320px]">
            AV signal flow diagram tool for broadcast, live production, and AV
            integration
          </p>

          <div className="flex flex-col gap-1 text-xs text-[var(--color-text)]">
            <span>{Math.floor(DEVICE_TEMPLATES.length / 10) * 10}+ bundled device templates</span>
            <span>2,000+ in the community library</span>
            <span>68 signal types</span>
          </div>

          <div className="w-full h-px bg-[var(--ui-border)]" />

          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
            {[
              { label: "Website", href: "https://easyschematic.live" },
              { label: "Docs", href: "https://docs.easyschematic.live" },
              { label: "GitHub", href: "https://github.com/duremovich/EasySchematic" },
              { label: "Device Database", href: "https://devices.easyschematic.live" },
              { label: "Support", href: "mailto:support@easyschematic.live" },
              { label: "Report a Bug", href: "https://github.com/duremovich/EasySchematic/issues" },
              { label: "Discord", href: "https://discord.gg/dxXn3Jk2a6" },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-accent)] hover:underline"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="w-full h-px bg-[var(--ui-border)]" />

          <div className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
            <div>AGPL-3.0 &middot; &copy; 2025–2026 EasySchematic</div>
            <div className="mt-0.5">Built with React, React Flow, and Zustand</div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--ui-border)] flex items-center justify-between gap-2">
          <button
            onClick={handleForceUpdate}
            disabled={resetting}
            title="Unregister the service worker, clear app cache, and reload. Schematic data is preserved."
            className="ui-btn ui-btn-secondary disabled:opacity-50 disabled:cursor-wait"
          >
            {resetting ? "Reloading…" : "Force Update"}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={copyDebugInfo}
              className="ui-btn ui-btn-secondary"
            >
              {copied ? "Copied!" : "Copy Debug Info"}
            </button>
            <button
              onClick={onClose}
              className="ui-btn ui-btn-primary"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

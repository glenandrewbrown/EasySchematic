/**
 * Resolves live-control connection settings at runtime so the SAME built bundle
 * (dev server, desktop app, or beta deployment) can opt into Claude live control
 * without a rebuild. Resolution priority, highest first:
 *
 *   1. URL query     — ?liveControl=1&liveControlToken=…&liveControlUrl=…
 *   2. localStorage  — easys.liveControl.{enabled,token,url}
 *   3. build env     — VITE_LIVE_CONTROL_{ENABLED,TOKEN,URL}
 *
 * The query form is consumed once into localStorage and stripped from the URL so
 * the shared token is not left in the address bar or browser history.
 */

export interface LiveControlConfig {
  enabled: boolean;
  token?: string;
  url: string;
}

export const DEFAULT_LIVE_CONTROL_URL = "ws://127.0.0.1:39887/app";

const LS_ENABLED = "easys.liveControl.enabled";
const LS_TOKEN = "easys.liveControl.token";
const LS_URL = "easys.liveControl.url";

function readLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode, blocked cookies) — non-fatal.
  }
}

function readEnv(key: string): string | undefined {
  const value = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isTruthy(value: string): boolean {
  return value === "1" || value.toLowerCase() === "true";
}

/**
 * Applies any `?liveControl…` query params to localStorage and removes them from
 * the visible URL. Safe to call once on startup; a no-op when none are present.
 */
export function consumeQueryConfig(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  let touched = false;

  const enabled = params.get("liveControl");
  if (enabled !== null) {
    writeLocalStorage(LS_ENABLED, isTruthy(enabled) ? "true" : "false");
    params.delete("liveControl");
    touched = true;
  }
  const token = params.get("liveControlToken");
  if (token !== null) {
    writeLocalStorage(LS_TOKEN, token);
    params.delete("liveControlToken");
    touched = true;
  }
  const url = params.get("liveControlUrl");
  if (url !== null) {
    writeLocalStorage(LS_URL, url);
    params.delete("liveControlUrl");
    touched = true;
  }

  if (touched) {
    const search = params.toString();
    const next = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", next);
  }
}

export function resolveLiveControlConfig(): LiveControlConfig {
  const storedEnabled = readLocalStorage(LS_ENABLED);
  const enabled = storedEnabled !== null
    ? storedEnabled === "true"
    : readEnv("VITE_LIVE_CONTROL_ENABLED") === "true";
  const token = readLocalStorage(LS_TOKEN) ?? readEnv("VITE_LIVE_CONTROL_TOKEN");
  const url = readLocalStorage(LS_URL) ?? readEnv("VITE_LIVE_CONTROL_URL") ?? DEFAULT_LIVE_CONTROL_URL;
  return { enabled, token: token || undefined, url };
}

export function setLiveControlEnabled(enabled: boolean): void {
  writeLocalStorage(LS_ENABLED, enabled ? "true" : "false");
}

export function setLiveControlToken(token: string | null): void {
  writeLocalStorage(LS_TOKEN, token);
}

export function setLiveControlUrl(url: string | null): void {
  writeLocalStorage(LS_URL, url);
}
